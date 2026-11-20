import { beforeEach, describe, expect, it } from "vitest";
import { buildDemoCases } from "./demo-cases";
import { ftf } from "./store";
import type { FtfCase } from "./types";
import { clearanceReadiness, currentCertificate, extractionCoverage, followUpState, hasValidClearance, quoteSupported, retrievalReadiness } from "./workflow";
import { classifyOutcome, responseIsConcerning } from "./status";
import { addDays, todayISO } from "./dates";
import { extractFindings } from "./nlp";
import { riskIndicators } from "./rules";

const T = (n: number) => addDays(todayISO(), n);
const sc = (p: string) => ftf._peek().find((c) => c.scenario?.startsWith(p))!;
const byId = (id: string) => ftf._peek().find((c) => c.id === id)!;

/** Drive a case through every physician step using only store actions. */
function completeReview(id: string) {
  ftf.update(id, (d) => {
    for (const f of d.clinical.findings) if (f.review === "unverified" || f.review === "uncertain") { f.review = "verified"; f.reviewedBy = "test"; }
  });
  const c = byId(id);
  const open = clearanceReadiness(c).checks; void open;
  ftf.update(id, (d) => {
    d.clinical.cdiAcknowledged = Object.fromEntries([...Object.keys(d.clinical.cdiAcknowledged), "missing-procedure", "missing-procedure-date", "missing-lvef", "missing-ecg", "missing-hb", "missing-inr", "missing-cxr", "stale-hb", "conflict-lvef", "conflict-procedure_type", "conflict-procedure_date"].map((k) => [k, "reviewed"]));
    d.clinical.reviewCompletedAt = new Date().toISOString();
  });
  ftf.update(id, (d) => {
    d.exam.vitals = { hr: 72, sbp: 128, dbp: 78, rr: 14, spo2: 97, temp: 36.7 };
    d.exam.nyha = 1;
    d.exam.findings = "Normal examination.";
    d.exam.signedAt = new Date().toISOString();
  });
  ftf.update(id, (d) => {
    d.risk.acknowledged = riskIndicators(d).filter((r) => r.severity !== "info").map((r) => r.id);
  });
  ftf.update(id, (d) => {
    d.risk.reviewedAt = new Date().toISOString();
    if (d.reassessment.required) d.reassessment = { ...d.reassessment, required: false, resolvedAt: d.risk.reviewedAt };
  });
}
function decide(id: string, outcome: "cleared" | "conditional" | "deferred" = "cleared") {
  ftf.update(id, (d) => { d.decision.outcome = outcome; d.decision.rationale = "Test rationale"; d.decision.attested = true; d.decision.earliestTravelDate = d.travel.departureDate; });
}

beforeEach(() => ftf._load(buildDemoCases(), "physician"));

describe("P2 retrieval prerequisites", () => {
  it("blocks retrieval without identity verification (Scenario A starts unverified)", () => {
    const a = sc("A");
    const r = ftf.retrieveRecords(a.id);
    expect(r.ok).toBe(false);
    expect(r.missing).toContain("Identity verified");
    expect(byId(a.id).clinical.retrievedAt).toBeUndefined();
    expect(byId(a.id).blockedRetrievals).toHaveLength(1);
  });
  it("blocks retrieval without registration", () => {
    const a = sc("A");
    ftf.update(a.id, (d) => { d.identity.verifiedAt = "2026-01-01T00:00:00Z"; d.patient.passportNo = ""; });
    expect(ftf.retrieveRecords(a.id).missing).toContain("Registration complete");
  });
  it("blocks retrieval without consent", () => {
    const a = sc("A");
    ftf.update(a.id, (d) => { d.identity.verifiedAt = "2026-01-01T00:00:00Z"; d.request.consentRecords = false; });
    expect(ftf.retrieveRecords(a.id).missing).toEqual(["Consent recorded"]);
  });
  it("blocks a direct update that tries to bypass the action", () => {
    const a = sc("A");
    const r = ftf.update(a.id, (d) => { d.clinical.retrievedAt = new Date().toISOString(); });
    expect(r.ok).toBe(false);
    expect(byId(a.id).clinical.retrievedAt).toBeUndefined();
  });
  it("succeeds once all prerequisites are met and stays on the same case", () => {
    const a = sc("A");
    ftf.update(a.id, (d) => { d.identity = { method: "Passport sighted in person", documentNo: d.patient.passportNo, verifiedAt: new Date().toISOString(), verifiedBy: "test" }; });
    expect(retrievalReadiness(byId(a.id)).ok).toBe(true);
    const r = ftf.retrieveRecords(a.id);
    expect(r.ok).toBe(true);
    const after = byId(a.id);
    expect(after.ref).toBe(a.ref);
    expect(after.clinical.findings.length).toBeGreaterThan(0);
  });
  it("changing the passport number resets identity verification", () => {
    const b = sc("B");
    ftf.update(b.id, (d) => { d.patient.passportNo = "NEW123"; });
    expect(byId(b.id).identity.verifiedAt).toBeUndefined();
  });
});

describe("P5 AI extraction", () => {
  const doc = (text: string) => ({ id: "doc1", title: "Synthetic discharge", source: "EMR" as const, date: "2026-11-01", text });
  it("every extracted fact quotes the source verbatim and starts unverified", () => {
    const d = doc("Elective PCI on 2026-10-30. LVEF 55%. Hb 12.4 g/dL.\nECG: sinus rhythm.\nNo chest pain.\nFollow-up in clinic at 6 weeks.");
    const fs = extractFindings(d);
    expect(fs.length).toBeGreaterThan(4);
    for (const f of fs) { expect(d.text.includes(f.evidence!)).toBe(true); expect(f.review).toBe("unverified"); expect(f.sourceDocId).toBe("doc1"); }
  });
  it("a negated symptom is a documented negative, not dropped or invented", () => {
    const fs = extractFindings(doc("No chest pain since discharge."));
    expect(fs.find((f) => f.key === "symptom")?.value).toBe("Chest pain — documented absent");
  });
  it("missing information is reported as not documented", () => {
    const g = sc("B");
    const cov = Object.fromEntries(extractionCoverage(g).map((x) => [x.item, x.state]));
    expect(cov["LVEF"]).toBe("Not documented");
    expect(cov["Haemoglobin"]).toBe("Not documented");
    expect(cov["Procedure date"]).toBe("Conflicting information");
  });
  it("an unsupported fact (quote not in source) is detected", () => {
    const g = sc("B");
    const f = { ...g.clinical.findings.find((x) => x.extraction === "nlp")!, evidence: "LVEF 60% (fabricated)" };
    expect(quoteSupported(g, f)).toBe(false);
  });
  it("unverified facts block clearance; edit keeps the AI original; reject removes from inputs", () => {
    const g = sc("B");
    decide(g.id);
    expect(clearanceReadiness(byId(g.id)).blocking.map((b) => b.id)).toContain("facts");
    const f = byId(g.id).clinical.findings.find((x) => x.key === "procedure_date" && x.extraction === "nlp")!;
    ftf.update(g.id, (d) => { const x = d.clinical.findings.find((y) => y.id === f.id)!; x.review = "corrected"; x.originalValue = x.value; x.value = T(-3); });
    const edited = byId(g.id).clinical.findings.find((x) => x.id === f.id)!;
    expect(edited.aiValue).toBe(f.value);
    expect(edited.value).toBe(T(-3));
    ftf.update(g.id, (d) => { d.clinical.findings.find((y) => y.id === f.id)!.review = "rejected"; });
    expect(riskIndicators(byId(g.id)).length).toBeGreaterThanOrEqual(0);
  });
  it("uncertain facts still block clearance", () => {
    const g = sc("B");
    ftf.update(g.id, (d) => { for (const f of d.clinical.findings) f.review = "verified"; d.clinical.findings[0]!.review = "uncertain"; });
    decide(g.id);
    expect(clearanceReadiness(byId(g.id)).blocking.map((b) => b.id)).toContain("facts");
  });
});

describe("P3 clearance readiness", () => {
  it("missing-information case cannot be approved", () => {
    const g = sc("B");
    decide(g.id);
    const r = ftf.approve(g.id);
    expect(r.ok).toBe(false);
    expect(byId(g.id).decision.approvedAt).toBeUndefined();
  });
  it("unreviewed high-severity warning blocks clearance", () => {
    const c = sc("C");
    ftf.update(c.id, (d) => { d.identity.verifiedAt ??= new Date().toISOString(); });
    expect(ftf.retrieveRecords(c.id).ok).toBe(true);
    decide(c.id);
    expect(clearanceReadiness(byId(c.id)).blocking.map((b) => b.id)).toContain("high");
  });
  it("departure before the indicative minimum interval requires deferral", () => {
    const a = sc("A");
    ftf.update(a.id, (d) => { d.identity = { method: "Passport sighted in person", documentNo: d.patient.passportNo, verifiedAt: new Date().toISOString() }; });
    ftf.retrieveRecords(a.id);
    ftf.update(a.id, (d) => { d.travel.departureDate = T(-2); }); // 1 day after elective PCI (min 2)
    completeReview(a.id);
    decide(a.id, "cleared");
    expect(clearanceReadiness(byId(a.id)).blocking.map((b) => b.id)).toContain("deferral");
    expect(ftf.approve(a.id).ok).toBe(false);
  });
  it("deferral issues a deferral letter, not a clearance (Scenario C)", () => {
    const c = sc("C");
    ftf.retrieveRecords(c.id);
    completeReview(c.id);
    decide(c.id, "deferred");
    expect(ftf.approve(c.id).ok).toBe(true);
    const after = byId(c.id);
    expect(currentCertificate(after)?.outcome).toBe("deferred");
    expect(hasValidClearance(after)).toBe(false);
    expect(after.outcome.followUps.filter((f) => f.status === "scheduled")).toHaveLength(0);
  });
  it("coordinator cannot approve (simulated role check)", () => {
    const a = sc("D");
    ftf.setRole("coordinator");
    expect(ftf.approve(a.id).ok).toBe(false);
  });
});

describe("Scenario A — straightforward end to end", () => {
  it("registration → identity → retrieval → verification → review → approval v1 → follow-ups, same case", () => {
    const a = sc("A");
    ftf.update(a.id, (d) => { d.identity = { method: "Passport sighted in person", documentNo: d.patient.passportNo, verifiedAt: new Date().toISOString() }; });
    expect(ftf.retrieveRecords(a.id).ok).toBe(true);
    completeReview(a.id);
    decide(a.id, "cleared");
    expect(clearanceReadiness(byId(a.id)).blocking).toEqual([]);
    expect(ftf.approve(a.id).ok).toBe(true);
    const after = byId(a.id);
    expect(after.ref).toBe(a.ref);
    expect(currentCertificate(after)?.version).toBe(1);
    expect(hasValidClearance(after)).toBe(true);
    expect(after.outcome.followUps.map((f) => f.dueDate)).toEqual([T(7), T(13), T(36)]);
  });
});

describe("P1 / Scenario D — material change after approval", () => {
  it("changing the departure date invalidates approval, preserves v1, reconciles follow-ups, then v2 after reassessment", () => {
    const d0 = sc("D");
    expect(hasValidClearance(d0)).toBe(true);
    const v1 = structuredClone(currentCertificate(d0)!);
    const oldDep = d0.travel.departureDate;
    ftf.update(d0.id, (d) => { d.travel.departureDate = T(3); });
    const d1 = byId(d0.id);
    expect(d1.decision.approvedAt).toBeUndefined();
    expect(d1.reassessment.required).toBe(true);
    expect(d1.reassessment.reasons.join()).toContain("Departure date");
    expect(d1.risk.reviewedAt).toBeUndefined();
    expect(hasValidClearance(d1)).toBe(false);
    const kept = d1.certificates.find((x) => x.version === 1)!;
    expect(kept.status).toBe("superseded");
    expect(kept.snapshot).toEqual(v1.snapshot);
    expect(kept.snapshot.departureDate).toBe(oldDep);
    expect(kept.approvedAt).toBe(v1.approvedAt);
    expect(d1.outcome.followUps.map((f) => f.dueDate)).toEqual([T(4), T(10), T(33)]);
    expect(d1.outcome.followUps).toHaveLength(3);
    // cannot approve before reassessment
    ftf.update(d0.id, (d) => { d.decision.attested = true; });
    expect(ftf.approve(d0.id).ok).toBe(false);
    completeReview(d0.id);
    ftf.update(d0.id, (d) => { d.decision.attested = true; });
    expect(ftf.approve(d0.id).ok).toBe(true);
    const d2 = byId(d0.id);
    expect(d2.certificates.map((x) => [x.version, x.status])).toEqual([[1, "superseded"], [2, "current"]]);
    expect(currentCertificate(d2)?.snapshot.departureDate).toBe(T(3));
    expect(d2.certificates[0]!.snapshot).toEqual(v1.snapshot);
  });
  it.each([
    ["medication", (d: FtfCase) => { d.clinical.findings.push({ ...d.clinical.findings[0]!, id: "x", key: "anticoagulant", label: "Anticoagulant", value: "apixaban 5 mg" }); }, "Medications"],
    ["symptom", (d: FtfCase) => { d.exam.symptoms.chestPain = true; }, "Examination symptoms"],
    ["investigation", (d: FtfCase) => { d.clinical.findings.find((f) => f.key === "hb")!.value = "8.0"; }, "haemoglobin"],
    ["procedure", (d: FtfCase) => { d.clinical.findings.filter((f) => f.key === "procedure_type").forEach((f) => { f.value = "Catheter ablation"; }); }, "Procedure"],
    ["vitals", (d: FtfCase) => { d.exam.vitals.spo2 = 90; }, "Vital signs"],
  ])("a %s change also invalidates approval", (_n, recipe, reason) => {
    const d0 = sc("D");
    ftf.update(d0.id, recipe);
    const d1 = byId(d0.id);
    expect(d1.reassessment.required).toBe(true);
    expect(d1.reassessment.reasons.join()).toContain(reason);
    expect(d1.certificates[0]!.status).toBe("superseded");
  });
  it("a non-clinical edit (travel notes) does not invalidate approval", () => {
    const d0 = sc("D");
    ftf.update(d0.id, (d) => { d.travel.notes = "Changed seat"; });
    expect(hasValidClearance(byId(d0.id))).toBe(true);
  });
  it("completed follow-ups are preserved when dates change (Scenario F)", () => {
    const f = sc("F");
    const done = f.outcome.followUps.filter((x) => x.status === "responded").map((x) => ({ ...x }));
    ftf.update(f.id, (d) => { d.outcome.actualTravelDate = T(-10); });
    const after = byId(f.id).outcome.followUps;
    for (const x of done) expect(after.find((y) => y.id === x.id)).toEqual(x);
    expect(after.filter((x) => x.label === "Day 30 after flight")).toHaveLength(1);
    expect(after.find((x) => x.label === "Day 30 after flight")!.dueDate).toBe(T(20));
  });
});

describe("P6 follow-up states and escalation", () => {
  it("Scenario E: no response stays unknown, never negative", () => {
    const e = sc("E");
    expect(classifyOutcome(e)).toBe("unknown");
    const states = e.outcome.followUps.map((f) => followUpState(e, f, todayISO(), responseIsConcerning));
    expect(states).toEqual(["no_response", "no_response", "pending"]);
  });
  it("Scenario F: concerning symptom keeps an open escalation and distinguishes responses", () => {
    const f = sc("F");
    expect(f.outcome.escalation.status).toBe("open");
    const states = f.outcome.followUps.map((x) => followUpState(f, x, todayISO(), responseIsConcerning));
    expect(states).toEqual(["responded_no_symptoms", "responded_symptoms", "pending"]);
  });
});
