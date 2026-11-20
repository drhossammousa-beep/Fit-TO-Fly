// Internal FitToFly model -> FHIR R4 mapping layer (ARCHITECTURE PREPARED, not a compliance claim).
// Mapping is NOT clinical verification: review states are carried into FHIR status fields, never upgraded.
import type { ClinicalFinding, FindingKey, FtfCase, ReviewState } from "@/lib/ftf/types";
import { cdiIssues } from "@/lib/ftf/rules";
import { provenanceOf } from "../provenance";
import type {
  CodeableConcept, Extension, FhirBundle, FhirCondition, FhirDocumentReference, FhirEncounter, FhirMedicationStatement,
  FhirObservation, FhirPatient, FhirPractitioner, FhirProcedure, FhirResource, FhirResourceType,
} from "./types";

export const EXT = {
  review: "urn:fittofly:extension:review-state",
  provenance: "urn:fittofly:extension:source-type",
  conflict: "urn:fittofly:extension:conflict",
  originalValue: "urn:fittofly:extension:original-value",
} as const;
const LOINC = "http://loinc.org";

export interface MappingEntry { internal: string; fhir: FhirResourceType | null; status: "mapped" | "partial" | "unmapped"; note: string }

/** Structured mapping registry (source of truth for the UI and docs). */
export const MAPPING_REGISTRY: MappingEntry[] = [
  { internal: "patient (name, DOB, sex, passport, MRN, phone, email, language)", fhir: "Patient", status: "mapped", note: "Nationality has no core R4 element; left unmapped." },
  { internal: "findings: diagnosis, comorbidity, complication", fhir: "Condition", status: "mapped", note: "Review state -> verificationStatus (unconfirmed / confirmed / refuted)." },
  { internal: "findings: anticoagulant, antiplatelet, medication", fhir: "MedicationStatement", status: "partial", note: "Free text only; no RxNorm/ATC coding in source data." },
  { internal: "exam.vitals (HR, BP, RR, SpO2, temp, weight)", fhir: "Observation", status: "mapped", note: "LOINC vital-sign codes; missing vitals are omitted, never defaulted." },
  { internal: "findings: lvef, hb, inr, creatinine, troponin, ecg, cxr", fhir: "Observation", status: "mapped", note: "Value kept as recorded text when not numeric; troponin assay unknown (text only)." },
  { internal: "findings: procedure_type + procedure_date", fhir: "Procedure", status: "mapped", note: "No SNOMED coding in source data." },
  { internal: "clinical.documents", fhir: "DocumentReference", status: "mapped", note: "Inline text attachment of the synthetic document." },
  { internal: "decision.physicianName / license", fhir: "Practitioner", status: "mapped", note: "License number kept as identifier value; issuing system unknown." },
  { internal: "exam (date, signer)", fhir: "Encounter", status: "partial", note: "Encounter class assumed ambulatory; no location data." },
  { internal: "allergies", fhir: "AllergyIntolerance", status: "unmapped", note: "FitToFly does not capture allergies; nothing is generated." },
  { internal: "exam.nyha, exam.symptoms; findings: symptom, nyha, follow_up", fhir: null, status: "unmapped", note: "Candidate Observation targets need agreed codes; not mapped in this phase." },
  { internal: "travel, request, consent, identity verification", fhir: null, status: "unmapped", note: "Workflow data with no appropriate core resource in this phase (Consent resource is future work)." },
  { internal: "risk indicators, decision, certificates", fhir: null, status: "unmapped", note: "Clinical decision artefacts stay internal; not exported." },
  { internal: "nationality", fhir: null, status: "unmapped", note: "No core R4 Patient element." },
];

const KEY_RESOURCE: Partial<Record<FindingKey, "Condition" | "MedicationStatement" | "Observation" | "Procedure">> = {
  diagnosis: "Condition", comorbidity: "Condition", complication: "Condition",
  anticoagulant: "MedicationStatement", antiplatelet: "MedicationStatement", medication: "MedicationStatement",
  lvef: "Observation", hb: "Observation", inr: "Observation", creatinine: "Observation", troponin: "Observation", ecg: "Observation", cxr: "Observation",
  procedure_type: "Procedure",
};
/** Finding keys with no mapping target in this phase. */
export const UNMAPPED_FINDING_KEYS: FindingKey[] = ["procedure_date", "nyha", "symptom", "follow_up"];

const LAB_LOINC: Partial<Record<FindingKey, string>> = { lvef: "10230-1", hb: "718-7", inr: "6301-6", creatinine: "2160-0" };
const VITALS: { key: keyof FtfCase["exam"]["vitals"]; code: string; display: string; unit: string }[] = [
  { key: "hr", code: "8867-4", display: "Heart rate", unit: "/min" },
  { key: "sbp", code: "8480-6", display: "Systolic blood pressure", unit: "mm[Hg]" },
  { key: "dbp", code: "8462-4", display: "Diastolic blood pressure", unit: "mm[Hg]" },
  { key: "rr", code: "9279-1", display: "Respiratory rate", unit: "/min" },
  { key: "spo2", code: "59408-5", display: "Oxygen saturation (pulse oximetry)", unit: "%" },
  { key: "temp", code: "8310-5", display: "Body temperature", unit: "Cel" },
  { key: "weight", code: "29463-7", display: "Body weight", unit: "kg" },
];

export function observationStatus(r: ReviewState): FhirObservation["status"] {
  return r === "verified" ? "final" : r === "corrected" ? "amended" : r === "rejected" ? "entered-in-error" : r === "not_documented" ? "unknown" : "preliminary";
}
export function conditionVerification(r: ReviewState): CodeableConcept {
  const code = r === "verified" || r === "corrected" ? "confirmed" : r === "rejected" ? "refuted" : r === "not_documented" ? "unconfirmed" : "unconfirmed";
  return { coding: [{ system: "http://terminology.hl7.org/CodeSystem/condition-ver-status", code }] };
}

function conflictKeys(c: FtfCase): Set<string> {
  return new Set(cdiIssues(c).filter((i) => i.kind === "conflict").map((i) => i.id.replace(/^conflict-/, "")));
}

function factExtensions(f: ClinicalFinding, conflicts: Set<string>): Extension[] {
  const p = provenanceOf(f);
  const ext: Extension[] = [{ url: EXT.review, valueString: f.review }, { url: EXT.provenance, valueString: p.sourceType }];
  if (p.originalValue && p.originalValue !== f.value) ext.push({ url: EXT.originalValue, valueString: p.originalValue });
  if (conflicts.has(f.key) || (f.key === "procedure_type" && conflicts.has("procedure_date"))) ext.push({ url: EXT.conflict, valueString: "Conflicting information in source records" });
  return ext;
}

export interface MappingResult {
  bundle: FhirBundle;
  /** Internal fields present on the case that were deliberately not mapped. */
  unmapped: string[];
}

/** Map a case to an R4 collection Bundle. Values are copied verbatim; nothing is inferred or invented. */
export function caseToFhir(c: FtfCase): MappingResult {
  const subject = { reference: `Patient/${c.id}` };
  const out: FhirResource[] = [];
  const unmapped = new Set<string>();
  const conflicts = conflictKeys(c);
  const p = c.patient;

  const patient: FhirPatient = { resourceType: "Patient", id: c.id };
  const ids = [
    p.mrn ? { system: "urn:fittofly:mrn", value: p.mrn } : null,
    p.passportNo ? { system: "urn:fittofly:passport", value: p.passportNo, type: { text: "Passport" } } : null,
  ].filter((x): x is NonNullable<typeof x> => !!x);
  if (ids.length) patient.identifier = ids;
  if (p.fullName) patient.name = [{ text: p.fullName }];
  patient.gender = p.sex === "Female" ? "female" : p.sex === "Male" ? "male" : "unknown";
  if (p.dob) patient.birthDate = p.dob;
  const tel = [p.phone ? { system: "phone" as const, value: p.phone } : null, p.email ? { system: "email" as const, value: p.email } : null].filter((x): x is NonNullable<typeof x> => !!x);
  if (tel.length) patient.telecom = tel;
  if (p.language) patient.communication = [{ language: { text: p.language } }];
  if (p.nationality) unmapped.add("patient.nationality");
  out.push(patient);

  for (const f of c.clinical.findings) {
    const target = KEY_RESOURCE[f.key];
    if (!target) { unmapped.add(`finding:${f.key}`); continue; }
    const extension = factExtensions(f, conflicts);
    if (target === "Condition") {
      const r: FhirCondition = { resourceType: "Condition", id: f.id, subject, code: { text: f.value }, verificationStatus: conditionVerification(f.review), category: [{ text: f.key }], recordedDate: f.date, extension };
      out.push(r);
    } else if (target === "MedicationStatement") {
      const r: FhirMedicationStatement = { resourceType: "MedicationStatement", id: f.id, subject, status: f.review === "rejected" ? "entered-in-error" : f.review === "verified" || f.review === "corrected" ? "active" : "unknown", medicationCodeableConcept: { text: f.value }, extension };
      out.push(r);
    } else if (target === "Procedure") {
      // Conflicting procedure dates are not resolved here: no date is chosen, and the conflict extension stays.
      const dates = [...new Set(c.clinical.findings.filter((x) => x.key === "procedure_date" && x.review !== "rejected" && x.review !== "not_documented").map((x) => x.value))];
      const date = dates.length === 1 ? dates[0] : undefined;
      const r: FhirProcedure = { resourceType: "Procedure", id: f.id, subject, status: f.review === "rejected" ? "entered-in-error" : f.review === "verified" || f.review === "corrected" ? "completed" : "unknown", code: { text: f.value }, performedDateTime: date, extension };
      out.push(r);
    } else {
      const loinc = LAB_LOINC[f.key];
      const num = Number(f.value);
      const r: FhirObservation = {
        resourceType: "Observation", id: f.id, status: observationStatus(f.review), subject, effectiveDateTime: f.date,
        category: [{ text: f.key === "ecg" || f.key === "cxr" ? "imaging" : "laboratory" }],
        code: loinc ? { coding: [{ system: LOINC, code: loinc, display: f.label }], text: f.label } : { text: f.label },
        extension,
      };
      if (f.value !== "" && !Number.isNaN(num)) r.valueQuantity = { value: num, unit: f.unit };
      else r.valueString = f.value;
      out.push(r);
    }
  }

  for (const v of VITALS) {
    const val = c.exam.vitals[v.key];
    if (val === undefined || val === null || Number.isNaN(val)) continue; // missing stays missing
    out.push({ resourceType: "Observation", id: `${c.id}-vital-${v.key}`, status: c.exam.signedAt ? "final" : "preliminary", subject, effectiveDateTime: c.exam.date || undefined, category: [{ text: "vital-signs" }], code: { coding: [{ system: LOINC, code: v.code, display: v.display }], text: v.display }, valueQuantity: { value: val, unit: v.unit } });
  }

  for (const d of c.clinical.documents) {
    const r: FhirDocumentReference = { resourceType: "DocumentReference", id: d.id, status: "current", subject, type: { text: d.title }, date: d.date, description: `${d.source} (simulated)`, content: [{ attachment: { contentType: "text/plain", title: d.title } }] };
    if (d.author) r.author = [{ display: d.author }];
    out.push(r);
  }

  let practitionerRef: string | undefined;
  if (c.decision.physicianName) {
    const pr: FhirPractitioner = { resourceType: "Practitioner", id: `${c.id}-physician`, name: [{ text: c.decision.physicianName }] };
    if (c.decision.physicianLicense) pr.identifier = [{ value: c.decision.physicianLicense }];
    practitionerRef = `Practitioner/${pr.id}`;
    out.push(pr);
  }
  if (c.exam.signedAt || c.exam.findings) {
    const e: FhirEncounter = { resourceType: "Encounter", id: `${c.id}-exam`, status: c.exam.signedAt ? "finished" : "in-progress", class: { system: "http://terminology.hl7.org/CodeSystem/v3-ActCode", code: "AMB" }, subject };
    if (c.exam.date) e.period = { start: c.exam.date };
    if (practitionerRef) e.participant = [{ individual: { reference: practitionerRef } }];
    out.push(e);
  }
  // AllergyIntolerance: FitToFly captures no allergy data, so none is produced.
  unmapped.add("allergies (not captured)");
  for (const k of ["travel", "request/consent", "identity", "risk", "decision", "certificates"]) unmapped.add(k);

  return { bundle: { resourceType: "Bundle", type: "collection", entry: out.map((resource) => ({ resource })) }, unmapped: [...unmapped] };
}
