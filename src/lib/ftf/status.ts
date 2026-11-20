import type { FtfCase, StepId, StepStatus } from "./types";
import { cdiIssues } from "./rules";
import { concerningPhrases } from "./nlp";
import { consentMissing, registrationMissing, travelMissing } from "./workflow";

export interface StepMeta {
  id: StepId;
  title: string;
  short: string;
  output: string;
  layer: "Engagement" | "Record" | "Intelligence";
  ai?: string;
}

export const STEPS: StepMeta[] = [
  { id: 1, title: "Patient Request", short: "Request", output: "Registered case with intake status", layer: "Engagement" },
  { id: 2, title: "Travel Details", short: "Travel", output: "Travel profile and validation flags", layer: "Engagement" },
  { id: 3, title: "Clinical Retrieval", short: "Retrieval", output: "Traceable clinical summary", layer: "Record", ai: "Clinical NLP extraction" },
  { id: 4, title: "Clinical Review", short: "Review", output: "Clinician-verified clinical record", layer: "Intelligence", ai: "Completeness & consistency (CDI)" },
  { id: 5, title: "Physician Examination", short: "Exam", output: "Verified examination record", layer: "Engagement", ai: "Speech-to-text & documentation assist" },
  { id: 6, title: "Recovery & Risk Assessment", short: "Risk", output: "Risk indicators supporting physician assessment", layer: "Intelligence", ai: "Clinical rules & exploratory ML" },
  { id: 7, title: "Decision & Patient Education", short: "Decision", output: "Physician-approved decision and documentation", layer: "Engagement" },
  { id: 8, title: "Post-Flight Outcomes", short: "Outcomes", output: "Outcome records supporting quality improvement", layer: "Intelligence", ai: "Follow-up analysis" },
];

export function missingFor(c: FtfCase, step: StepId): string[] {
  const m: string[] = [];
  switch (step) {
    case 1:
      m.push(...registrationMissing(c));
      if (!c.identity.verifiedAt) m.push("Identity verification");
      m.push(...consentMissing(c));
      break;
    case 2:
      m.push(...travelMissing(c));
      break;
    case 3:
      if (!c.clinical.retrievedAt) m.push("Clinical records not yet retrieved");
      if (c.clinical.retrievedAt && c.clinical.findings.length === 0) m.push("No clinical findings captured");
      break;
    case 4: {
      const unv = c.clinical.findings.filter((f) => f.review === "unverified" || f.review === "uncertain").length;
      if (unv) m.push(`${unv} finding(s) awaiting physician verification or marked uncertain`);
      const open = cdiIssues(c).filter((i) => !(i.id in c.clinical.cdiAcknowledged)).length;
      if (open) m.push(`${open} documentation issue(s) not addressed`);
      if (!c.clinical.reviewCompletedAt) m.push("Clinical review not signed off");
      break;
    }
    case 5: {
      const v = c.exam.vitals;
      if (v.hr === undefined) m.push("Heart rate");
      if (v.sbp === undefined || v.dbp === undefined) m.push("Blood pressure");
      if (v.spo2 === undefined) m.push("SpO₂");
      if (!c.exam.nyha) m.push("NYHA class");
      if (!c.exam.findings.trim()) m.push("Examination findings");
      if (!c.exam.signedAt) m.push("Physician signature");
      break;
    }
    case 6:
      if (c.reassessment.required) m.push(`Reassessment required: ${c.reassessment.reasons.join("; ")}`);
      if (!c.risk.reviewedAt) m.push("Physician review of risk indicators");
      break;
    case 7:
      if (c.reassessment.required) m.push("Previous approval invalidated — reassessment and fresh approval required");
      if (!c.decision.outcome) m.push("Decision (clear / conditional / defer)");
      if (!c.decision.rationale.trim()) m.push("Decision rationale");
      if (c.decision.outcome === "conditional" && c.decision.conditions.length === 0) m.push("Travel conditions");
      if (!c.decision.approvedAt) m.push("Physician approval");
      break;
    case 8:
      if (c.outcome.traveled === "unknown") m.push("Travel status");
      if (c.outcome.traveled === "yes" && c.outcome.responses.length === 0) m.push("Post-flight follow-up response");
      if (c.outcome.escalation.status === "open") m.push("Open escalation needs review");
      break;
  }
  return m;
}

export function stepStatus(c: FtfCase, step: StepId): StepStatus {
  const missing = missingFor(c, step);
  switch (step) {
    case 1:
    case 2: {
      if (missing.length === 0) return "completed";
      const touched = step === 1 ? !!c.patient.fullName : !!(c.travel.departureDate || c.travel.destination);
      return touched ? "incomplete" : "not_started";
    }
    case 3:
      if (!c.clinical.retrievedAt) return "not_started";
      return c.clinical.findings.length ? "completed" : "incomplete";
    case 4:
      if (!c.clinical.retrievedAt) return "not_started";
      return c.clinical.reviewCompletedAt && missing.length === 0 ? "completed" : "pending_review";
    case 5: {
      if (c.exam.signedAt) return "completed";
      const v = c.exam.vitals;
      const any = Object.values(v).some((x) => x !== undefined) || !!c.exam.findings || !!c.exam.nyha;
      if (!any) return "not_started";
      return missing.length === 1 ? "pending_review" : "incomplete";
    }
    case 6:
      if (c.risk.reviewedAt) return "completed";
      return c.clinical.retrievedAt || c.reassessment.required ? "pending_review" : "not_started";
    case 7:
      if (c.decision.approvedAt) return "completed";
      if (!c.decision.outcome) return "not_started";
      return "pending_review";
    case 8: {
      if (c.outcome.escalation.status === "open") return "pending_review";
      if (c.outcome.traveled === "no" || c.outcome.traveled === "postponed") return "completed";
      if (c.outcome.traveled === "yes") return c.outcome.responses.length ? "completed" : "incomplete";
      return c.decision.approvedAt || c.certificates.length ? "incomplete" : "not_started";
    }
  }
}

export function caseProgress(c: FtfCase) {
  const statuses = STEPS.map((s) => stepStatus(c, s.id));
  const completed = statuses.filter((s) => s === "completed").length;
  const current = (STEPS.find((s) => statuses[s.id - 1] !== "completed")?.id ?? 8) as StepId;
  return { statuses, completed, current };
}

export function caseStage(c: FtfCase): string {
  if (c.outcome.escalation.status === "open") return "Escalated — review";
  if (c.reassessment.required) return "Reassessment required";
  if (c.decision.approvedAt) {
    if (c.outcome.traveled === "yes") return "Post-flight follow-up";
    return c.decision.outcome === "deferred" ? "Deferred" : "Cleared — awaiting travel";
  }
  const { current, statuses } = caseProgress(c);
  const s = STEPS[current - 1]!;
  return statuses[current - 1] === "pending_review" ? `${s.short}: pending review` : `${s.short}: in progress`;
}

// ---------- Step 8 outcome logic ----------

export type OutcomeClass =
  | "not_applicable"
  | "unknown"
  | "patient_reported_uneventful"
  | "verified_uneventful"
  | "complication_reported"
  | "did_not_travel";

/** Missing follow-up is always UNKNOWN — never evidence of safety. */
export function classifyOutcome(c: FtfCase): OutcomeClass {
  const o = c.outcome;
  if (o.traveled === "no" || o.traveled === "postponed") return "did_not_travel";
  if (o.traveled === "unknown") return (c.decision.approvedAt || c.certificates.some((x) => x.outcome !== "deferred")) && c.decision.outcome !== "deferred" ? "unknown" : "not_applicable";
  if (o.responses.length === 0) return "unknown";
  if (o.responses.some(responseIsConcerning)) return "complication_reported";
  return o.responses.some((r) => r.verification === "clinician_verified") ? "verified_uneventful" : "patient_reported_uneventful";
}

export const OUTCOME_LABEL: Record<OutcomeClass, string> = {
  not_applicable: "Not applicable yet",
  unknown: "Unknown outcome",
  patient_reported_uneventful: "Patient-reported: uneventful",
  verified_uneventful: "Verified: uneventful",
  complication_reported: "Complication / concern reported",
  did_not_travel: "Did not travel",
};

export function responseIsConcerning(r: FtfCase["outcome"]["responses"][number]): boolean {
  const s = r.symptoms;
  if (s.chestPain || s.breathlessness || s.legSwelling || s.bleeding || s.dizziness || s.hospitalVisit) return true;
  return concerningPhrases(`${r.complications} ${r.feedback}`).length > 0;
}
