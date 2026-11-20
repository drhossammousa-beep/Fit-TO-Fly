// Core data model for a Fit-to-Fly case. One case = one patient journey through the 8 steps.

export type StepId = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
export type StepStatus = "not_started" | "incomplete" | "pending_review" | "completed";
export type Role = "coordinator" | "physician";

export type SourceSystem =
  | "Patient"
  | "Coordinator"
  | "HIS"
  | "EMR"
  | "LIS"
  | "PACS"
  | "Clinical note (NLP)"
  | "Physician";

export type FindingKey =
  | "diagnosis"
  | "procedure_type"
  | "procedure_date"
  | "lvef"
  | "ecg"
  | "hb"
  | "inr"
  | "creatinine"
  | "troponin"
  | "cxr"
  | "anticoagulant"
  | "antiplatelet"
  | "medication"
  | "comorbidity"
  | "complication"
  | "nyha"
  | "symptom"
  | "follow_up";

/** "uncertain" and "not_documented" are physician verification outcomes; neither counts as confirmed. */
export type ReviewState = "unverified" | "verified" | "corrected" | "rejected" | "uncertain" | "not_documented";

export interface ClinicalFinding {
  id: string;
  key: FindingKey;
  label: string;
  value: string;
  unit?: string | undefined;
  /** Clinical date of the observation (ISO yyyy-mm-dd). */
  date?: string | undefined;
  source: SourceSystem;
  /** Human-readable pointer to the source record, e.g. "EMR discharge summary". */
  sourceRef: string;
  extraction: "structured" | "nlp" | "manual";
  /** Text span from the source document (NLP findings). */
  evidence?: string | undefined;
  /** NLP confidence 0–1 (simulated / heuristic). */
  confidence?: number | undefined;
  /** Source document id for document-derived (AI/NLP) facts. */
  sourceDocId?: string | undefined;
  /** Original AI output, preserved even after physician edits. */
  aiValue?: string | undefined;
  review: ReviewState;
  /** Optional provenance (e.g. future FHIR import). Never implies physician verification. */
  provenance?: FactProvenance | undefined;
  originalValue?: string | undefined;
  reviewNote?: string | undefined;
  reviewedBy?: string | undefined;
  reviewedAt?: string | undefined;
}

/** Provenance metadata for a clinical fact (interoperability readiness). */
export interface FactProvenance {
  sourceType: "manual" | "simulated" | "fhir_import" | "ai_extracted";
  sourceSystem?: string | undefined;
  sourceDocumentId?: string | undefined;
  fhirResourceType?: string | undefined;
  fhirResourceId?: string | undefined;
  importedAt?: string | undefined;
  originalValue?: string | undefined;
  verificationStatus?: ReviewState | undefined;
  physicianVerified?: boolean | undefined;
  verifiedBy?: string | undefined;
  verifiedAt?: string | undefined;
}

export interface ClinicalDocument {
  id: string;
  title: string;
  source: SourceSystem;
  date: string;
  author?: string | undefined;
  text: string;
}

/** What the simulated HIS/EMR/LIS/PACS would return for this patient. */
export interface SourceRecords {
  structured: Omit<ClinicalFinding, "id" | "review" | "extraction">[];
  documents: ClinicalDocument[];
}

export interface ExamSymptoms {
  chestPain: boolean;
  dyspneaRest: boolean;
  dyspneaExertion: boolean;
  palpitations: boolean;
  syncope: boolean;
  fever: boolean;
  legSwelling: boolean;
  woundConcern: boolean;
}

export interface Vitals {
  hr?: number | undefined;
  sbp?: number | undefined;
  dbp?: number | undefined;
  rr?: number | undefined;
  spo2?: number | undefined;
  temp?: number | undefined;
  weight?: number | undefined;
}

export type DecisionOutcome = "cleared" | "conditional" | "deferred";

export interface FollowUp {
  id: string;
  label: string;
  dueDate: string;
  channel: "Phone" | "SMS" | "Email" | "Patient portal";
  status: "scheduled" | "sent" | "responded" | "no_response";
}

export interface FollowUpResponse {
  id: string;
  followUpId?: string | undefined;
  date: string;
  symptoms: {
    chestPain: boolean;
    breathlessness: boolean;
    legSwelling: boolean;
    bleeding: boolean;
    dizziness: boolean;
    hospitalVisit: boolean;
  };
  complications: string;
  feedback: string;
  satisfaction?: number | undefined;
  verification: "patient_reported" | "clinician_verified";
}

/** Immutable record of one physician-approved certificate / deferral letter. */
export interface CertificateVersion {
  version: number;
  status: "current" | "superseded";
  outcome: DecisionOutcome;
  approvedAt: string;
  approvedBy: string;
  physicianLicense: string;
  snapshot: {
    patientName: string;
    passportNo: string;
    dob: string;
    airline: string;
    flightNumber: string;
    origin: string;
    destination: string;
    departureDate: string;
    procedure: string;
    procedureDate: string;
    earliestTravelDate: string;
    validUntil: string;
    conditions: string[];
    rationale: string;
    education: string[];
  };
  /** Clinically material inputs at approval time (used to detect later changes). */
  inputs: Record<string, string>;
  supersededAt?: string | undefined;
  supersededReason?: string | undefined;
}

export interface AuditEntry {
  at: string;
  actor: string;
  role: Role | "system";
  step?: StepId | undefined;
  action: string;
}

export interface FtfCase {
  id: string;
  ref: string;
  demo: boolean;
  /** Demonstration scenario label (A–F) for synthetic cases. */
  scenario?: string | undefined;
  specialty: "Cardiology";
  createdAt: string;
  updatedAt: string;

  // Step 1
  patient: {
    fullName: string;
    dob: string;
    sex: "" | "Female" | "Male";
    nationality: string;
    passportNo: string;
    mrn: string;
    language: string;
    phone: string;
    email: string;
  };
  request: {
    requestDate: string;
    requestedBy: "" | "Patient" | "Family member" | "Medical facilitator" | "Treating physician";
    reason: string;
    consentData: boolean;
    consentRecords: boolean;
    consentDate: string;
  };

  registration: { completedAt?: string | undefined };
  identity: {
    method: "" | "Passport sighted in person" | "Passport copy matched to booking" | "National ID sighted";
    documentNo: string;
    verifiedBy?: string | undefined;
    verifiedAt?: string | undefined;
  };
  /** Retrieval attempts refused because prerequisites were missing. */
  blockedRetrievals: { at: string; missing: string[] }[];

  // Step 2
  travel: {
    departureDate: string;
    origin: string;
    destination: string;
    airline: string;
    flightNumber: string;
    durationHours?: number | undefined;
    legs?: number | undefined;
    itinerary: string;
    airlineForm: "" | "None required" | "MEDIF" | "Airline-specific form";
    assistance: { wheelchair: boolean; oxygen: boolean; extraLegroom: boolean; companion: boolean };
    notes: string;
  };

  // Step 3–4
  sourceRecords: SourceRecords;
  clinical: {
    retrievedAt?: string | undefined;
    findings: ClinicalFinding[];
    documents: ClinicalDocument[];
    cdiAcknowledged: Record<string, string>;
    reviewCompletedBy?: string | undefined;
    reviewCompletedAt?: string | undefined;
  };

  // Step 5
  exam: {
    date: string;
    symptoms: ExamSymptoms;
    nyha?: 1 | 2 | 3 | 4 | undefined;
    vitals: Vitals;
    findings: string;
    dictation: string;
    signedBy?: string | undefined;
    signedAt?: string | undefined;
  };

  // Step 6
  risk: {
    acknowledged: string[];
    physicianNotes: string;
    mlViewed: boolean;
    reviewedBy?: string | undefined;
    reviewedAt?: string | undefined;
  };

  // Step 7
  decision: {
    outcome?: DecisionOutcome | undefined;
    conditions: string[];
    earliestTravelDate: string;
    validUntil: string;
    rationale: string;
    education: string[];
    physicianName: string;
    physicianLicense: string;
    attested: boolean;
    approvedBy?: string | undefined;
    approvedAt?: string | undefined;
  };

  // Step 8
  outcome: {
    traveled: "unknown" | "yes" | "no" | "postponed";
    actualTravelDate: string;
    followUps: FollowUp[];
    responses: FollowUpResponse[];
    escalation: { status: "none" | "open" | "reviewed"; note: string; reviewedBy?: string | undefined; reviewedAt?: string | undefined };
  };

  // Approval lifecycle
  reassessment: { required: boolean; reasons: string[]; triggeredAt?: string | undefined; resolvedAt?: string | undefined };
  certificates: CertificateVersion[];

  audit: AuditEntry[];
}
