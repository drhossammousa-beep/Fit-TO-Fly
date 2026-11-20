// ARCHITECTURE PREPARED / SIMULATED / NOT CONNECTED.
// Interoperability configuration placeholder. No server, credentials or tokens are configured.
export const FHIR_VERSION = "R4" as const;
export type FhirVersion = typeof FHIR_VERSION;

export interface InteropConfig {
  fhirVersion: FhirVersion;
  /** Future FHIR server base URL. Always undefined in this prototype. */
  fhirBaseUrl?: string | undefined;
  /** Network access is disabled; adapters must never call fetch. */
  networkEnabled: false;
}

export const INTEROP_CONFIG: InteropConfig = { fhirVersion: FHIR_VERSION, fhirBaseUrl: undefined, networkEnabled: false };

/** Status strings shown in the UI. Derived from config so they cannot claim a connection that does not exist. */
export function interopStatus(cfg: InteropConfig = INTEROP_CONFIG) {
  return {
    fhirMapping: "PREPARED",
    fhirVersion: cfg.fhirVersion,
    fhirServer: cfg.fhirBaseUrl ? "CONFIGURED (NOT CONNECTED)" : "NOT CONFIGURED",
    externalConnection: "NOT CONNECTED",
    externalEhr: "NOT CONNECTED",
    dataSource: "SIMULATED",
    smartStatus: "ARCHITECTURE PREPARED",
    smartAuthorization: "NOT IMPLEMENTED",
    ehrLaunch: "NOT CONNECTED",
    patientContext: "SIMULATED / NONE",
  } as const;
}
