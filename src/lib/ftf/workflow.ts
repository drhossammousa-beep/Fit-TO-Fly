// Workflow integrity rules: retrieval prerequisites, clearance readiness, approval
// invalidation on material change, certificate versioning and follow-up reconciliation.
// Pure functions — the store calls them so the UI cannot bypass them.
import type { CertificateVersion, ClinicalFinding, FindingKey, FtfCase, FollowUp } from "./types";
import { activeFindings, bestFinding, cdiIssues, riskIndicators } from "./rules";
import { addDays, isISODate, todayISO, uid } from "./dates";

// ---------- registration / identity / consent ----------

export function registrationMissing(c: FtfCase): string[] {
  const p = c.patient;
  const m: string[] = [];
  if (!p.fullName.trim()) m.push("Patient full name");
  if (!p.dob) m.push("Date of birth");
  if (!p.sex) m.push("Sex");
  if (!p.nationality.trim()) m.push("Nationality");
  if (!p.passportNo.trim()) m.push("Passport number");
  if (!p.phone.trim() && !p.email.trim()) m.push("Phone or email for follow-up");
  if (!c.request.requestDate) m.push("Request date");
  if (!c.request.requestedBy) m.push("Requested by");
  return m;
}

export function consentMissing(c: FtfCase): string[] {
  const m: string[] = [];
  if (!c.request.consentData) m.push("Consent to data processing");
  if (!c.request.consentRecords) m.push("Consent to retrieve medical records");
  return m;
}

export function travelMissing(c: FtfCase): string[] {
  const t = c.travel;
  const m: string[] = [];
  if (!t.departureDate) m.push("Departure date");
  if (!t.origin.trim()) m.push("Origin");
  if (!t.destination.trim()) m.push("Destination");
  if (!t.airline.trim()) m.push("Airline");
  if (t.durationHours === undefined) m.push("Total flight duration");
  if (!t.airlineForm) m.push("Airline medical form requirement");
  return m;
}

export interface Check {
  id: string;
  label: string;
  ok: boolean;
  /** What remains / what to do when not ok. */
  action: string;
}

export function retrievalReadiness(c: FtfCase): { ok: boolean; checks: Check[]; missing: string[] } {
  const reg = registrationMissing(c);
  const cons = consentMissing(c);
  const checks: Check[] = [
    { id: "registration", label: "Registration complete", ok: reg.length === 0, action: `Complete in Step 1: ${reg.join(", ")}` },
    { id: "identity", label: "Identity verified", ok: !!c.identity.verifiedAt, action: "Verify the patient's identity document in Step 1" },
    { id: "consent", label: "Consent recorded", ok: cons.length === 0, action: `Record in Step 1: ${cons.join(", ")}` },
  ];
  const missing = checks.filter((x) => !x.ok).map((x) => x.label);
  return { ok: missing.length === 0, checks, missing };
}

export class WorkflowBlocked extends Error {
  constructor(message: string, public readonly missing: string[]) {
    super(message);
    this.name = "WorkflowBlocked";
  }
}

// ---------- material inputs & invalidation ----------

const GROUP: Record<FindingKey, string> = {
  diagnosis: "Cardiac diagnosis",
  procedure_type: "Procedure",
  procedure_date: "Procedure date",
  lvef: "Investigation: LVEF",
  ecg: "Investigation: ECG",
  hb: "Investigation: haemoglobin",
  inr: "Investigation: INR",
  creatinine: "Investigation: creatinine",
  troponin: "Investigation: troponin",
  cxr: "Investigation: chest X-ray",
  anticoagulant: "Medications",
  antiplatelet: "Medications",
  medication: "Medications",
  comorbidity: "Risk factors / comorbidities",
  complication: "Complications",
  nyha: "NYHA class (record)",
  symptom: "Documented symptoms",
  follow_up: "Follow-up recommendations",
};

/** Every input that can affect the assessment or the risk rules, as comparable strings. */
export function materialInputs(c: FtfCase): Record<string, string> {
  const r: Record<string, string> = {
    "Departure date": c.travel.departureDate,
    "Flight duration (h)": c.travel.durationHours === undefined ? "" : String(c.travel.durationHours),
    "Flight legs": String(c.travel.legs ?? 1),
  };
  const groups: Record<string, string[]> = {};
  for (const f of c.clinical.findings) {
    if (f.review === "rejected" || f.review === "not_documented") continue;
    (groups[GROUP[f.key]] ??= []).push(`${f.value}${f.unit ? ` ${f.unit}` : ""}`);
  }
  for (const g of new Set(Object.values(GROUP))) r[g] = (groups[g] ?? []).sort().join(" | ");
  const s = c.exam.symptoms;
  r["Examination symptoms"] = (Object.keys(s) as (keyof typeof s)[]).filter((k) => s[k]).sort().join(", ");
  r["NYHA class (exam)"] = c.exam.nyha ? String(c.exam.nyha) : "";
  const v = c.exam.vitals;
  r["Vital signs"] = (["hr", "sbp", "dbp", "rr", "spo2", "temp", "weight"] as const).map((k) => `${k}=${v[k] ?? "—"}`).join(" ");
  r["Examination signature"] = c.exam.signedAt ? "signed" : "withdrawn";
  r["Clinical review sign-off"] = c.clinical.reviewCompletedAt ? "signed off" : "withdrawn";
  return r;
}

export function materialChanges(before: Record<string, string>, after: Record<string, string>): string[] {
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  const out: string[] = [];
  const cut = (x: string) => (x.length > 70 ? `${x.slice(0, 67)}…` : x || "—");
  for (const k of keys) if ((before[k] ?? "") !== (after[k] ?? "")) out.push(`${k}: ${cut(before[k] ?? "")} → ${cut(after[k] ?? "")}`);
  return out;
}

export function currentCertificate(c: FtfCase): CertificateVersion | undefined {
  return c.certificates.find((x) => x.status === "current");
}

/** A valid current clearance exists only with a current, non-deferral certificate and no pending reassessment. */
export function hasValidClearance(c: FtfCase): boolean {
  const cur = currentCertificate(c);
  return !!cur && cur.outcome !== "deferred" && !!c.decision.approvedAt && !c.reassessment.required;
}

/** Mutates draft: supersede the current certificate and require reassessment. */
export function invalidateApproval(d: FtfCase, reasons: string[], at = new Date().toISOString()) {
  const cur = currentCertificate(d);
  if (cur) {
    cur.status = "superseded";
    cur.supersededAt = at;
    cur.supersededReason = reasons.join("; ");
  }
  d.decision.approvedAt = undefined;
  d.decision.approvedBy = undefined;
  d.decision.attested = false;
  d.risk.reviewedAt = undefined;
  d.risk.reviewedBy = undefined;
  d.reassessment = { required: true, reasons, triggeredAt: at };
}

/** Called by the store after every mutation. Returns audit messages for automatic transitions. */
export function enforceInvariants(prev: FtfCase, d: FtfCase, at: string): string[] {
  const notes: string[] = [];

  // Identity verification is tied to the identifying data it checked.
  if (prev.identity.verifiedAt && (prev.patient.fullName !== d.patient.fullName || prev.patient.dob !== d.patient.dob || prev.patient.passportNo !== d.patient.passportNo) && d.identity.verifiedAt === prev.identity.verifiedAt) {
    d.identity.verifiedAt = undefined;
    d.identity.verifiedBy = undefined;
    notes.push("Identity verification reset — identifying details changed");
  }

  // Registration status.
  const regDone = registrationMissing(d).length === 0;
  if (regDone && !d.registration.completedAt) { d.registration.completedAt = at; notes.push("Registration completed"); }
  if (!regDone && d.registration.completedAt) { d.registration.completedAt = undefined; notes.push("Registration incomplete again"); }

  // Retrieval gate (cannot be bypassed via a direct update).
  if (!prev.clinical.retrievedAt && d.clinical.retrievedAt) {
    const r = retrievalReadiness(d);
    if (!r.ok) throw new WorkflowBlocked(`Retrieval blocked: ${r.missing.join(", ")}`, r.missing);
  }

  // Approval gate.
  if (!prev.decision.approvedAt && d.decision.approvedAt) {
    const r = clearanceReadiness(d);
    if (!r.ready) throw new WorkflowBlocked(`Approval blocked: ${r.blocking.map((b) => b.label).join(", ")}`, r.blocking.map((b) => b.label));
  }

  // Material change after approval invalidates it.
  const cur = currentCertificate(d);
  if (d.decision.approvedAt && cur) {
    const ch = materialChanges(cur.inputs, materialInputs(d));
    if (ch.length) {
      invalidateApproval(d, ch, at);
      notes.push(`Approval v${cur.version} invalidated — reassessment required (${ch.join("; ")})`);
    }
  }

  // Date changes reconcile pending follow-ups.
  if (d.outcome.followUps.length && (prev.travel.departureDate !== d.travel.departureDate || prev.outcome.actualTravelDate !== d.outcome.actualTravelDate || prev.outcome.traveled !== d.outcome.traveled)) {
    const n = reconcileFollowUps(d);
    if (n) notes.push(`Follow-up schedule reconciled (${n} pending task(s) updated)`);
  }
  return notes;
}

// ---------- clearance readiness ----------

export interface Readiness {
  ready: boolean;
  checks: Check[];
  blocking: Check[];
}

export function clearanceReadiness(c: FtfCase): Readiness {
  const outcome = c.decision.outcome;
  const clearing = outcome === "cleared" || outcome === "conditional";
  const ret = retrievalReadiness(c);
  const tr = travelMissing(c);
  const pending = c.clinical.findings.filter((f) => f.review === "unverified" || f.review === "uncertain");
  const openCdi = cdiIssues(c).filter((i) => !(i.id in c.clinical.cdiAcknowledged));
  const risks = riskIndicators(c);
  const highUnack = risks.filter((r) => r.severity === "high" && !c.risk.acknowledged.includes(r.id));
  const checks: Check[] = [...ret.checks];
  const add = (id: string, label: string, ok: boolean, action: string) => checks.push({ id, label, ok, action });

  add("travel", "Travel details complete", tr.length === 0, `Complete in Step 2: ${tr.join(", ")}`);
  add("retrieved", "Clinical records retrieved", !!c.clinical.retrievedAt, "Retrieve records in Step 3");
  if (clearing) {
    add("facts", "All extracted facts physician-verified", pending.length === 0, `Verify ${pending.length} fact(s) awaiting verification or marked uncertain in Step 4`);
    add("cdi", "Missing / conflicting documentation addressed", openCdi.length === 0, `Address in Step 4: ${openCdi.map((i) => i.message).join(" ")}`);
    add("review", "Clinical review signed off", !!c.clinical.reviewCompletedAt, "Sign off the verified record in Step 4");
  }
  add("exam", "Examination signed", !!c.exam.signedAt, "Sign the examination in Step 5");
  if (clearing) {
    add("high", "High-severity indicators reviewed", highUnack.length === 0, `Acknowledge in Step 6: ${highUnack.map((r) => r.title).join("; ")}`);
    add("risk", "Risk review completed", !!c.risk.reviewedAt, "Complete the risk review in Step 6");
    const r1 = risks.find((r) => r.id === "R1-interval");
    const belowMin = !!r1 && r1.severity === "high" && !!r1.indicativeDate && isISODate(c.travel.departureDate) && c.travel.departureDate < r1.indicativeDate;
    add("deferral", "Departure meets indicative recovery interval", !belowMin, `Departure is before the indicative earliest date (${r1?.indicativeDate ?? ""}). Defer, or rebook on/after that date and reassess.`);
  }
  add("current", "Assessment current (no reassessment pending)", !c.reassessment.required, `Reassessment required: ${c.reassessment.reasons.join("; ")}. Re-review risk in Step 6.`);
  add("decision", "Decision selected", !!outcome, "Choose clear / conditional / defer");
  add("rationale", "Decision rationale written", !!c.decision.rationale.trim(), "Write the rationale");
  if (outcome === "conditional") add("conditions", "Travel conditions selected", c.decision.conditions.length > 0, "Select at least one condition");
  add("attest", "Physician attestation", c.decision.attested, "Tick the physician attestation");
  const blocking = checks.filter((x) => !x.ok);
  return { ready: blocking.length === 0, checks, blocking };
}

// ---------- certificate issue ----------

export function issueCertificate(d: FtfCase, approvedBy: string, at: string): CertificateVersion {
  for (const x of d.certificates) if (x.status === "current") { x.status = "superseded"; x.supersededAt ??= at; x.supersededReason ??= "Replaced by a newer approved version"; }
  const version = d.certificates.reduce((m, x) => Math.max(m, x.version), 0) + 1;
  const dec = d.decision;
  const cert: CertificateVersion = {
    version,
    status: "current",
    outcome: dec.outcome!,
    approvedAt: at,
    approvedBy,
    physicianLicense: dec.physicianLicense,
    snapshot: {
      patientName: d.patient.fullName,
      passportNo: d.patient.passportNo,
      dob: d.patient.dob,
      airline: d.travel.airline,
      flightNumber: d.travel.flightNumber,
      origin: d.travel.origin,
      destination: d.travel.destination,
      departureDate: d.travel.departureDate,
      procedure: bestFinding(d, "procedure_type")?.value ?? "",
      procedureDate: bestFinding(d, "procedure_date")?.value ?? "",
      earliestTravelDate: dec.earliestTravelDate,
      validUntil: dec.validUntil,
      conditions: [...dec.conditions],
      rationale: dec.rationale,
      education: [...dec.education],
    },
    inputs: materialInputs(d),
  };
  d.certificates.push(cert);
  dec.approvedAt = at;
  dec.approvedBy = approvedBy;
  reconcileFollowUps(d);
  return cert;
}

// ---------- follow-ups ----------

export const FOLLOW_UP_DAYS = [1, 7, 30] as const;
const isPending = (f: FollowUp) => f.status === "scheduled" || f.status === "sent";

/** Align pending follow-ups with the current travel date; completed ones are never touched. Returns number of changes. */
export function reconcileFollowUps(d: FtfCase): number {
  const base = d.outcome.traveled === "yes" && isISODate(d.outcome.actualTravelDate) ? d.outcome.actualTravelDate : d.travel.departureDate;
  let changes = 0;
  if (d.decision.outcome === "deferred" || d.outcome.traveled === "no") {
    const before = d.outcome.followUps.length;
    d.outcome.followUps = d.outcome.followUps.filter((f) => f.status !== "scheduled");
    return before - d.outcome.followUps.length;
  }
  if (!isISODate(base)) return 0;
  for (const n of FOLLOW_UP_DAYS) {
    const label = `Day ${n} after flight`;
    const due = addDays(base, n);
    const same = d.outcome.followUps.filter((f) => f.label === label);
    const done = same.filter((f) => !isPending(f));
    const pend = same.filter(isPending);
    // drop duplicate pending tasks
    if (done.length || pend.length > 1) {
      const drop = new Set((done.length ? pend : pend.slice(1)).map((f) => f.id));
      if (drop.size) { d.outcome.followUps = d.outcome.followUps.filter((f) => !drop.has(f.id)); changes += drop.size; }
    }
    if (done.length) continue;
    const keep = pend[0];
    if (!keep) { d.outcome.followUps.push({ id: uid("fu"), label, dueDate: due, channel: "Phone", status: "scheduled" }); changes++; }
    else if (keep.dueDate !== due) { keep.dueDate = due; changes++; }
  }
  d.outcome.followUps.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  return changes;
}

export type FollowUpState = "pending" | "awaiting_overdue" | "responded_no_symptoms" | "responded_symptoms" | "no_response";
export const FOLLOW_UP_STATE_LABEL: Record<FollowUpState, string> = {
  pending: "Follow-up pending",
  awaiting_overdue: "Due — awaiting response (outcome unknown)",
  responded_no_symptoms: "Responded — no symptoms",
  responded_symptoms: "Responded — symptoms reported",
  no_response: "No response (outcome unknown)",
};

export function followUpState(c: FtfCase, f: FollowUp, today = todayISO(), concerning: (r: FtfCase["outcome"]["responses"][number]) => boolean): FollowUpState {
  const r = c.outcome.responses.filter((x) => x.followUpId === f.id);
  if (r.length) return r.some(concerning) ? "responded_symptoms" : "responded_no_symptoms";
  if (f.status === "no_response") return "no_response";
  return f.dueDate < today ? "awaiting_overdue" : "pending";
}

// ---------- AI extraction support ----------

export const AI_PENDING_LABEL = "AI-EXTRACTED — AWAITING PHYSICIAN VERIFICATION";

/** True when the fact's quotation is found verbatim in its source document. */
export function quoteSupported(c: FtfCase, f: ClinicalFinding): boolean {
  if (f.extraction !== "nlp") return true;
  const doc = c.clinical.documents.find((d) => d.id === f.sourceDocId) ?? c.clinical.documents.find((d) => f.sourceRef.startsWith(d.title));
  return !!doc && !!f.evidence && doc.text.includes(f.evidence);
}

export type CoverageState = "Documented — verified" | "Pending verification" | "Not documented" | "Conflicting information";
const COVERAGE: [string, FindingKey[]][] = [
  ["Cardiac diagnosis", ["diagnosis"]],
  ["Procedure / intervention", ["procedure_type"]],
  ["Procedure date", ["procedure_date"]],
  ["LVEF", ["lvef"]],
  ["ECG", ["ecg"]],
  ["Haemoglobin", ["hb"]],
  ["Medications", ["anticoagulant", "antiplatelet", "medication"]],
  ["Documented symptoms", ["symptom"]],
  ["Follow-up recommendations", ["follow_up"]],
];

export function extractionCoverage(c: FtfCase): { item: string; state: CoverageState }[] {
  const conflicts = new Set(cdiIssues(c).filter((i) => i.kind === "conflict").map((i) => i.id));
  return COVERAGE.map(([item, keys]) => {
    const fs = keys.flatMap((k) => activeFindings(c, k));
    const conflict = keys.some((k) => conflicts.has(`conflict-${k}`));
    const state: CoverageState = conflict ? "Conflicting information" : !fs.length ? "Not documented" : fs.some((f) => f.review === "unverified" || f.review === "uncertain") ? "Pending verification" : "Documented — verified";
    return { item, state };
  });
}

export type InputState = "Positive" | "Negative" | "Documented" | "Missing" | "Pending verification" | "Not applicable" | "Unknown";

/** Distinguishes missing / negative / positive / N/A / pending for key assessment inputs. Missing is never treated as normal. */
export function inputStates(c: FtfCase): { label: string; state: InputState; detail: string }[] {
  const out: { label: string; state: InputState; detail: string }[] = [];
  const fact = (label: string, key: FindingKey, applicable = true): void => {
    if (!applicable) { out.push({ label, state: "Not applicable", detail: "Not required for this patient" }); return; }
    const f = bestFinding(c, key);
    if (!f) { out.push({ label, state: "Missing", detail: "Not documented — not assumed normal" }); return; }
    const pend = f.review === "unverified" || f.review === "uncertain";
    out.push({ label, state: pend ? "Pending verification" : "Documented", detail: `${f.value}${f.unit ? ` ${f.unit}` : ""}` });
  };
  const proc = bestFinding(c, "procedure_type")?.value ?? "";
  fact("Procedure", "procedure_type");
  fact("Procedure date", "procedure_date");
  fact("LVEF", "lvef");
  fact("ECG", "ecg");
  fact("Haemoglobin", "hb");
  fact("INR", "inr", activeFindings(c, "anticoagulant").some((f) => /warfarin/i.test(f.value)));
  fact("Chest X-ray", "cxr", ["CABG", "Open valve surgery", "Pacemaker / ICD implant"].includes(proc));
  const comps = activeFindings(c, "complication");
  out.push(comps.length
    ? { label: "Complications", state: comps.some((f) => f.review === "unverified" || f.review === "uncertain") ? "Pending verification" : "Positive", detail: comps.map((f) => f.value).join("; ") }
    : { label: "Complications", state: c.clinical.retrievedAt ? "Unknown" : "Missing", detail: "None documented — not confirmed absent" });
  const s = c.exam.symptoms;
  const any = Object.values(s).some(Boolean);
  out.push({ label: "Examination symptoms", state: any ? "Positive" : c.exam.signedAt ? "Negative" : "Pending verification", detail: any ? Object.entries(s).filter(([, v]) => v).map(([k]) => k).join(", ") : c.exam.signedAt ? "None reported on signed examination" : "Examination not signed" });
  return out;
}
