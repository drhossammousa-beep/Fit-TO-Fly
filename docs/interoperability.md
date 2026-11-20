# FHIR & SMART on FHIR — architecture readiness

Status: **ARCHITECTURE PREPARED / SIMULATED / NOT CONNECTED.** Not a FHIR or SMART compliance claim.

## Current architecture
```text
FitToFly UI
  -> Internal clinical model (src/lib/ftf, unchanged rules and workflow gates)
  -> FHIR mapping layer (src/lib/interop/fhir/mappings.ts)
  -> Future FHIR adapter (src/lib/interop/fhir/adapter.ts: interface + SimulatedFhirAdapter)
  -> Future FHIR server / EHR (none configured)
SMART launch/authorization: separate layer (src/lib/interop/smart), not implemented.
```

## Modules
- `config.ts` — FHIR version (R4), base URL (unset), `networkEnabled: false`, UI status strings.
- `fhir/types.ts` — minimal R4 resource shapes.
- `fhir/mappings.ts` — `MAPPING_REGISTRY`, `caseToFhir()` producing a collection Bundle plus a list of unmapped fields.
- `fhir/validation.ts` — structural checks (not profile validation).
- `fhir/adapter.ts` — `FhirAdapter` interface; `SimulatedFhirAdapter` (no network; read/search throw `FhirNotConnectedError`; imports become **unverified** findings).
- `smart/types.ts`, `smart/client.ts` — launch context, scopes, auth states; client always returns not implemented.
- `context.ts` — patient context (none / manual / future EHR launch / future FHIR import); external contexts refused; retrieval gate unchanged.
- `provenance.ts` — `provenanceOf()` derives source type, system, document, original value and verification from existing fields; optional `ClinicalFinding.provenance` for future imports.

## Mappings (R4)
See `MAPPING_REGISTRY` (also shown on the FHIR page). Review state mapping: verified -> final/confirmed, corrected -> amended/confirmed, unverified/uncertain -> preliminary/unconfirmed, rejected -> entered-in-error/refuted, not documented -> unknown. Extensions (`urn:fittofly:extension:*`) carry review state, source type, original value and conflict flag.

## Unmapped
Allergies (not captured), nationality, travel, request/consent, identity verification, risk indicators, decision, certificates, NYHA/symptom/follow-up findings. No coding (SNOMED/RxNorm) exists in source data; troponin assay is unknown. Conflicting procedure dates leave `performedDateTime` empty.

## Requirements for a real integration
Secure backend holding SMART client config and tokens; registered SMART client per EHR; PKCE + state validation; CapabilityStatement discovery; terminology binding; Consent resource design; audit of imports; clinical governance sign-off; real authentication and server-side authorization (Phase 2).
