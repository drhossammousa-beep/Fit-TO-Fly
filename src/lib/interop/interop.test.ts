import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildDemoCases } from "@/lib/ftf/demo-cases";
import { ftf } from "@/lib/ftf/store";
import { retrievalReadiness, clearanceReadiness } from "@/lib/ftf/workflow";
import type { ClinicalFinding, FtfCase } from "@/lib/ftf/types";
import { caseToFhir, EXT, MAPPING_REGISTRY } from "./fhir/mappings";
import { validateBundle, validateResource } from "./fhir/validation";
import { FhirNotConnectedError, SimulatedFhirAdapter } from "./fhir/adapter";
import { NotImplementedSmartClient } from "./smart/client";
import { acceptContext, contextRetrievalGate } from "./context";
import { interopStatus } from "./config";
import { provenanceOf } from "./provenance";

const sc = (p: string) => buildDemoCases().find((c) => c.scenario?.startsWith(p))!;
const ext = (r: { extension?: { url: string; valueString?: string | undefined }[] | undefined }, url: string) => r.extension?.find((e) => e.url === url)?.valueString;
const finding = (o: Partial<ClinicalFinding>): ClinicalFinding => ({ id: "f1", key: "hb", label: "Haemoglobin", value: "12.1", unit: "g/dL", source: "LIS", sourceRef: "LIS", extraction: "structured", review: "unverified", ...o });

describe("FHIR mapping", () => {
  it("registry covers all ten requested resource types and flags allergies as unmapped", () => {
    const types = new Set(MAPPING_REGISTRY.map((m) => m.fhir));
    for (const t of ["Patient", "Condition", "MedicationStatement", "Observation", "Procedure", "DocumentReference", "Practitioner", "Encounter", "AllergyIntolerance"]) expect(types.has(t as never)).toBe(true);
    expect(MAPPING_REGISTRY.find((m) => m.fhir === "AllergyIntolerance")!.status).toBe("unmapped");
  });
  it("maps every demo case to a structurally valid bundle with no allergies invented", () => {
    for (const c of buildDemoCases()) {
      const { bundle, unmapped } = caseToFhir(c);
      expect(validateBundle(bundle).errors).toEqual([]);
      expect(bundle.entry.some((e) => e.resource.resourceType === "AllergyIntolerance")).toBe(false);
      expect(unmapped).toContain("allergies (not captured)");
    }
  });
  it("copies patient values verbatim and omits missing ones", () => {
    const c = sc("D");
    const p = caseToFhir(c).bundle.entry[0]!.resource;
    expect(p.resourceType).toBe("Patient");
    if (p.resourceType === "Patient") { expect(p.name?.[0]?.text).toBe(c.patient.fullName); expect(p.birthDate).toBe(c.patient.dob); }
    const blank = { ...c, patient: { ...c.patient, dob: "", sex: "" as const, phone: "", email: "" } };
    const bp = caseToFhir(blank).bundle.entry[0]!.resource;
    if (bp.resourceType === "Patient") { expect(bp.birthDate).toBeUndefined(); expect(bp.gender).toBe("unknown"); expect(bp.telecom).toBeUndefined(); }
  });
  it("missing vitals produce no Observation (never defaulted to normal)", () => {
    const c: FtfCase = { ...sc("D"), exam: { ...sc("D").exam, vitals: { hr: 80 } } };
    const vit = caseToFhir(c).bundle.entry.filter((e) => e.resource.id?.includes("-vital-"));
    expect(vit.map((e) => e.resource.id)).toEqual([`${c.id}-vital-hr`]);
  });
  it("unverified facts stay preliminary/unconfirmed; rejected become entered-in-error; never upgraded", () => {
    const c = sc("D");
    const cases = [["unverified", "preliminary"], ["uncertain", "preliminary"], ["verified", "final"], ["rejected", "entered-in-error"], ["not_documented", "unknown"]] as const;
    for (const [review, status] of cases) {
      const r = caseToFhir({ ...c, clinical: { ...c.clinical, findings: [finding({ review })] } }).bundle.entry.find((e) => e.resource.id === "f1")!.resource;
      expect(r.resourceType === "Observation" && r.status).toBe(status);
      expect(ext(r, EXT.review)).toBe(review);
    }
    const cond = caseToFhir({ ...c, clinical: { ...c.clinical, findings: [finding({ key: "diagnosis", value: "NSTEMI" })] } }).bundle.entry.find((e) => e.resource.id === "f1")!.resource;
    expect(cond.resourceType === "Condition" && cond.verificationStatus.coding?.[0]?.code).toBe("unconfirmed");
  });
  it("conflicting information stays visible in the mapped resource", () => {
    const b = sc("B");
    const out = caseToFhir(b).bundle.entry.filter((e) => ext(e.resource, EXT.conflict));
    expect(out.length).toBeGreaterThan(0);
    const proc = caseToFhir(b).bundle.entry.filter((e) => e.resource.resourceType === "Procedure");
    for (const e of proc) expect(e.resource.resourceType === "Procedure" && e.resource.performedDateTime).toBeUndefined();
  });
  it("keeps the original AI value when the physician corrected it", () => {
    const c = sc("D");
    const r = caseToFhir({ ...c, clinical: { ...c.clinical, findings: [finding({ extraction: "nlp", value: "11.8", aiValue: "12.1", review: "corrected" })] } }).bundle.entry.find((e) => e.resource.id === "f1")!.resource;
    expect(ext(r, EXT.originalValue)).toBe("12.1");
    expect(r.resourceType === "Observation" && r.valueQuantity?.value).toBe(11.8);
  });
  it("validation rejects malformed resources", () => {
    expect(validateResource(null)).toEqual(["Resource is not an object"]);
    expect(validateResource({ resourceType: "Basic" })[0]).toMatch(/Unsupported/);
    expect(validateResource({ resourceType: "Observation", status: "final", code: {}, subject: { reference: "Patient/1" } })).toContain("Observation: no value and no dataAbsentReason");
  });
});

describe("Provenance", () => {
  it("labels simulated, AI and manual facts without inventing an EHR source", () => {
    expect(provenanceOf(finding({})).sourceType).toBe("simulated");
    expect(provenanceOf(finding({})).sourceSystem).toBe("LIS (simulated)");
    expect(provenanceOf(finding({ extraction: "nlp" })).sourceType).toBe("ai_extracted");
    expect(provenanceOf(finding({ extraction: "manual" })).sourceType).toBe("manual");
  });
  it("only verified/corrected facts are physician-verified", () => {
    expect(provenanceOf(finding({ review: "unverified" })).physicianVerified).toBe(false);
    expect(provenanceOf(finding({ review: "uncertain" })).physicianVerified).toBe(false);
    expect(provenanceOf(finding({ review: "verified", reviewedBy: "Dr X" })).verifiedBy).toBe("Dr X");
  });
});

describe("Simulated adapter", () => {
  let fetchSpy: ReturnType<typeof vi.fn>;
  beforeEach(() => { fetchSpy = vi.fn(); vi.stubGlobal("fetch", fetchSpy); });
  afterEach(() => vi.unstubAllGlobals());
  it("reports not connected, simulated data and no server", () => {
    const a = new SimulatedFhirAdapter();
    expect(a.connected).toBe(false);
    expect(a.dataSource).toBe("SIMULATED");
    expect(a.baseUrl).toBeUndefined();
    expect(a.version).toBe("R4");
  });
  it("read and search refuse with NOT CONNECTED and never touch the network", async () => {
    const a = new SimulatedFhirAdapter();
    await expect(a.read("Patient", "1")).rejects.toBeInstanceOf(FhirNotConnectedError);
    await expect(a.search("Observation", {})).rejects.toBeInstanceOf(FhirNotConnectedError);
    expect(await a.patientContext()).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
  it("imported observations arrive unverified with FHIR provenance; bad resources are rejected", () => {
    const a = new SimulatedFhirAdapter();
    const r = a.importResources([
      { resourceType: "Observation", id: "o1", status: "final", subject: { reference: "Patient/x" }, code: { coding: [{ system: "http://loinc.org", code: "718-7" }], text: "Hb" }, valueQuantity: { value: 13.2, unit: "g/dL" } },
      { resourceType: "Observation", id: "o2", status: "final", code: {} },
      { resourceType: "Basic" },
    ], "2026-01-01T00:00:00Z");
    expect(r.findings).toHaveLength(1);
    const f = r.findings[0]!;
    expect(f.key).toBe("hb");
    expect(f.review).toBe("unverified");
    expect(f.provenance).toMatchObject({ sourceType: "fhir_import", fhirResourceId: "o1", physicianVerified: false, originalValue: "13.2" });
    expect(r.rejected).toHaveLength(2);
  });
});

describe("SMART and status", () => {
  it("never fabricates authorization", async () => {
    const s = new NotImplementedSmartClient();
    expect(s.state().status).toBe("not_implemented");
    expect((await s.beginLaunch({ launchType: "ehr" })).status).toBe("error");
  });
  it("UI status claims no connection", () => {
    const st = interopStatus();
    expect(st.fhirServer).toBe("NOT CONFIGURED");
    expect(st.externalEhr).toBe("NOT CONNECTED");
    expect(st.smartAuthorization).toBe("NOT IMPLEMENTED");
    expect(st.dataSource).toBe("SIMULATED");
  });
});

describe("Patient context does not bypass existing gates", () => {
  it("external contexts are refused", () => {
    expect(acceptContext({ kind: "ehr_launch", fhirPatientId: "p", issuer: "https://x" }).ok).toBe(false);
    expect(acceptContext({ kind: "manual", caseId: "c" }).ok).toBe(true);
  });
  it("an EHR context still requires identity verification and consent", () => {
    const a = sc("A");
    const g = contextRetrievalGate(a, { kind: "ehr_launch", fhirPatientId: "p", issuer: "https://x" });
    expect(g.ok).toBe(false);
    expect(g).toEqual(retrievalReadiness(a));
  });
  it("imported unverified facts block clearance like any unverified fact", () => {
    ftf._load(buildDemoCases());
    const d = ftf._peek().find((c) => c.scenario?.startsWith("D"))!;
    const imported = new SimulatedFhirAdapter().importResources([{ resourceType: "Observation", id: "o1", status: "final", subject: { reference: "Patient/x" }, code: { coding: [{ code: "6301-6" }] }, valueQuantity: { value: 1.1 } }]).findings;
    ftf.update(d.id, (x) => { x.clinical.findings.push(...imported); });
    const after = ftf._peek().find((c) => c.id === d.id)!;
    expect(clearanceReadiness(after).ready).toBe(false);
  });
});
