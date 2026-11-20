// Provenance metadata for clinical facts. Derived from what the case actually records — nothing is invented.
import type { ClinicalFinding, FactProvenance } from "@/lib/ftf/types";

export type { FactProvenance };
export type ProvenanceSourceType = FactProvenance["sourceType"];

const VERIFIED = new Set(["verified", "corrected"]);

/**
 * Provenance for a finding. Uses explicit `provenance` when present (e.g. future FHIR import),
 * otherwise derives it from existing fields. Simulated records are labelled simulated, never "EHR".
 */
export function provenanceOf(f: ClinicalFinding): FactProvenance {
  const sourceType: ProvenanceSourceType =
    f.provenance?.sourceType ?? (f.extraction === "manual" ? "manual" : f.extraction === "nlp" ? "ai_extracted" : "simulated");
  return {
    ...f.provenance,
    sourceType,
    sourceSystem: f.provenance?.sourceSystem ?? (sourceType === "simulated" ? `${f.source} (simulated)` : f.source),
    sourceDocumentId: f.provenance?.sourceDocumentId ?? f.sourceDocId,
    originalValue: f.provenance?.originalValue ?? f.aiValue ?? f.originalValue ?? f.value,
    verificationStatus: f.review,
    physicianVerified: VERIFIED.has(f.review),
    verifiedBy: VERIFIED.has(f.review) ? f.reviewedBy : undefined,
    verifiedAt: VERIFIED.has(f.review) ? f.reviewedAt : undefined,
  };
}
