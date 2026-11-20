// Patient-context abstraction. A future EHR/FHIR context NEVER bypasses FitToFly identity or consent checks.
import type { FtfCase } from "@/lib/ftf/types";
import { retrievalReadiness } from "@/lib/ftf/workflow";

export type PatientContext =
  | { kind: "none" }
  | { kind: "manual"; caseId: string }
  /** Future: supplied by SMART EHR launch. Not available in this prototype. */
  | { kind: "ehr_launch"; fhirPatientId: string; issuer: string }
  /** Future: resolved from a FHIR server search. Not available in this prototype. */
  | { kind: "fhir_import"; fhirPatientId: string; serverBaseUrl: string };

export function contextLabel(ctx: PatientContext): string {
  switch (ctx.kind) {
    case "none": return "NONE";
    case "manual": return "SELECTED IN FITTOFLY (SIMULATED DATA)";
    case "ehr_launch": return "EHR LAUNCH (FUTURE — NOT CONNECTED)";
    case "fhir_import": return "FHIR IMPORT (FUTURE — NOT CONNECTED)";
  }
}

/** Only manual and none contexts can exist today; external contexts are rejected. */
export function acceptContext(ctx: PatientContext): { ok: boolean; reason?: string } {
  if (ctx.kind === "ehr_launch" || ctx.kind === "fhir_import") return { ok: false, reason: "External patient context is not implemented (NOT CONNECTED)" };
  return { ok: true };
}

/** Whatever the context source, retrieval still requires registration, identity verification and consent. */
export function contextRetrievalGate(c: FtfCase, _ctx: PatientContext) {
  return retrievalReadiness(c);
}
