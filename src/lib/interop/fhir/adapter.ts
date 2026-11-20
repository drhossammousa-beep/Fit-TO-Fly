// FHIR adapter interface for a future client, plus the only implementation today: a local, simulated adapter.
// SimulatedFhirAdapter performs NO network calls and never reports a connection.
import type { ClinicalFinding, FtfCase } from "@/lib/ftf/types";
import { uid } from "@/lib/ftf/dates";
import { INTEROP_CONFIG, type FhirVersion, type InteropConfig } from "../config";
import { caseToFhir, type MappingResult } from "./mappings";
import type { FhirObservation, FhirResource, FhirResourceType } from "./types";
import { SUPPORTED_TYPES, validateResource } from "./validation";

export class FhirNotConnectedError extends Error {
  constructor(op: string) { super(`${op}: FHIR SERVER NOT CONFIGURED — EXTERNAL CONNECTION NOT CONNECTED`); this.name = "FhirNotConnectedError"; }
}

export interface ImportResult { findings: ClinicalFinding[]; rejected: { resource: unknown; reason: string }[] }

export interface FhirAdapter {
  readonly baseUrl: string | undefined;
  readonly version: FhirVersion;
  readonly connected: boolean;
  readonly dataSource: "SIMULATED" | "FHIR_SERVER";
  capabilities(): Promise<{ resourceTypes: readonly string[] }>;
  read(type: FhirResourceType, id: string): Promise<FhirResource>;
  search(type: FhirResourceType, params: Record<string, string>): Promise<FhirResource[]>;
  patientContext(): Promise<{ fhirPatientId: string } | null>;
  /** Map external resources to unverified internal findings. Never marks anything physician-verified. */
  importResources(resources: unknown[], at?: string): ImportResult;
  toFhir(c: FtfCase): MappingResult;
}

/** Map one external Observation to an internal finding (unverified, with FHIR provenance). */
export function observationToFinding(o: FhirObservation, at: string): ClinicalFinding {
  const value = o.valueQuantity ? String(o.valueQuantity.value) : o.valueString ?? "";
  return {
    id: uid("f"), key: "follow_up", // caller sets the mapped key
    label: o.code.text ?? o.code.coding?.[0]?.display ?? "Observation",
    value, unit: o.valueQuantity?.unit, date: o.effectiveDateTime?.slice(0, 10),
    source: "EMR", sourceRef: `FHIR Observation/${o.id ?? "?"}`, extraction: "structured",
    review: "unverified", originalValue: value,
    provenance: { sourceType: "fhir_import", sourceSystem: "Future FHIR server", fhirResourceType: "Observation", fhirResourceId: o.id, importedAt: at, originalValue: value, verificationStatus: "unverified", physicianVerified: false },
  };
}

const LOINC_KEY: Record<string, ClinicalFinding["key"]> = { "10230-1": "lvef", "718-7": "hb", "6301-6": "inr", "2160-0": "creatinine" };

export class SimulatedFhirAdapter implements FhirAdapter {
  readonly baseUrl: string | undefined;
  readonly version: FhirVersion;
  readonly connected = false as const;
  readonly dataSource = "SIMULATED" as const;
  constructor(cfg: InteropConfig = INTEROP_CONFIG) { this.baseUrl = cfg.fhirBaseUrl; this.version = cfg.fhirVersion; }
  async capabilities() { return { resourceTypes: SUPPORTED_TYPES }; }
  async read(type: FhirResourceType, id: string): Promise<FhirResource> { throw new FhirNotConnectedError(`read ${type}/${id}`); }
  async search(type: FhirResourceType, _params: Record<string, string> = {}): Promise<FhirResource[]> { throw new FhirNotConnectedError(`search ${type}`); }
  async patientContext() { return null; }
  toFhir(c: FtfCase) { return caseToFhir(c); }
  importResources(resources: unknown[], at = new Date().toISOString()): ImportResult {
    const findings: ClinicalFinding[] = [];
    const rejected: ImportResult["rejected"] = [];
    for (const r of resources) {
      const errs = validateResource(r);
      if (errs.length) { rejected.push({ resource: r, reason: errs.join("; ") }); continue; }
      const res = r as FhirResource;
      if (res.resourceType !== "Observation") { rejected.push({ resource: r, reason: `Import of ${res.resourceType} not implemented` }); continue; }
      const key = LOINC_KEY[res.code.coding?.[0]?.code ?? ""];
      if (!key) { rejected.push({ resource: r, reason: "Observation code not mapped to a FitToFly finding" }); continue; }
      findings.push({ ...observationToFinding(res, at), key });
    }
    return { findings, rejected };
  }
}
