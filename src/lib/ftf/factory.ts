import type { ClinicalFinding, FtfCase, SourceRecords } from "./types";
import { extractFindings } from "./nlp";
import { todayISO, uid } from "./dates";

export const USERS = {
  coordinator: { name: "Sara Adel", title: "International Patient Office coordinator" },
  physician: { name: "Dr. Mona El-Sayed", title: "Consultant Cardiologist", license: "EMS-48213" },
} as const;

export function blankCase(ref: string): FtfCase {
  const now = new Date().toISOString();
  return {
    id: uid("case"),
    ref,
    demo: false,
    specialty: "Cardiology",
    createdAt: now,
    updatedAt: now,
    patient: { fullName: "", dob: "", sex: "", nationality: "", passportNo: "", mrn: "", language: "", phone: "", email: "" },
    registration: {},
    identity: { method: "", documentNo: "" },
    blockedRetrievals: [],
    request: { requestDate: todayISO(), requestedBy: "", reason: "", consentData: false, consentRecords: false, consentDate: "" },
    travel: {
      departureDate: "",
      origin: "Cairo (CAI)",
      destination: "",
      airline: "",
      flightNumber: "",
      durationHours: undefined,
      legs: 1,
      itinerary: "",
      airlineForm: "",
      assistance: { wheelchair: false, oxygen: false, extraLegroom: false, companion: false },
      notes: "",
    },
    sourceRecords: { structured: [], documents: [] },
    clinical: { findings: [], documents: [], cdiAcknowledged: {} },
    exam: {
      date: todayISO(),
      symptoms: { chestPain: false, dyspneaRest: false, dyspneaExertion: false, palpitations: false, syncope: false, fever: false, legSwelling: false, woundConcern: false },
      vitals: {},
      findings: "",
      dictation: "",
    },
    risk: { acknowledged: [], physicianNotes: "", mlViewed: false },
    decision: {
      conditions: [],
      earliestTravelDate: "",
      validUntil: "",
      rationale: "",
      education: [],
      physicianName: USERS.physician.name,
      physicianLicense: USERS.physician.license,
      attested: false,
    },
    outcome: { traveled: "unknown", actualTravelDate: "", followUps: [], responses: [], escalation: { status: "none", note: "" } },
    reassessment: { required: false, reasons: [] },
    certificates: [],
    audit: [{ at: now, actor: "System", role: "system", step: 1, action: `Case ${ref} created` }],
  };
}

/** SIMULATED retrieval from HIS/EMR/LIS/PACS: structured items + NLP over documents. */
export function retrieveFromSources(records: SourceRecords): { findings: ClinicalFinding[]; documents: SourceRecords["documents"] } {
  const structured: ClinicalFinding[] = records.structured.map((s) => ({ ...s, id: uid("f"), extraction: "structured", review: "unverified" }));
  const nlp = records.documents.flatMap((d) => extractFindings(d));
  return { findings: [...structured, ...nlp], documents: records.documents };
}

export function nextRef(existing: FtfCase[], year = new Date().getFullYear()): string {
  const nums = existing.map((c) => Number(c.ref.split("-").at(-1))).filter((n) => !Number.isNaN(n));
  const n = Math.max(140, ...nums) + 1;
  return `FTF-${year}-${String(n).padStart(4, "0")}`;
}
