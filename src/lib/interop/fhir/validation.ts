// Structural checks on mapped resources (not a FHIR validator; no profile conformance claimed).
import type { FhirBundle, FhirResource } from "./types";

export const SUPPORTED_TYPES = ["Patient", "Condition", "MedicationStatement", "Observation", "Procedure", "DocumentReference", "Practitioner", "Encounter", "AllergyIntolerance"] as const;

export function validateResource(r: unknown): string[] {
  const errs: string[] = [];
  if (!r || typeof r !== "object") return ["Resource is not an object"];
  const res = r as Partial<FhirResource> & Record<string, unknown>;
  if (typeof res.resourceType !== "string") return ["Missing resourceType"];
  if (!(SUPPORTED_TYPES as readonly string[]).includes(res.resourceType)) errs.push(`Unsupported resourceType: ${res.resourceType}`);
  if (["Condition", "MedicationStatement", "Observation", "Procedure", "DocumentReference", "Encounter"].includes(res.resourceType) && !(res["subject"] as { reference?: string } | undefined)?.reference) errs.push(`${res.resourceType}: missing subject reference`);
  if (res.resourceType === "Observation") {
    if (!res["status"]) errs.push("Observation: missing status");
    if (!res["code"]) errs.push("Observation: missing code");
    if (res["valueQuantity"] === undefined && res["valueString"] === undefined && res["dataAbsentReason"] === undefined) errs.push("Observation: no value and no dataAbsentReason");
  }
  if (res.resourceType === "Condition" && !res["verificationStatus"]) errs.push("Condition: missing verificationStatus");
  return errs;
}

export function validateBundle(b: FhirBundle): { ok: boolean; errors: string[] } {
  const errors = b.entry.flatMap((e, i) => validateResource(e.resource).map((m) => `entry[${i}] ${m}`));
  return { ok: errors.length === 0, errors };
}
