// SMART App Launch — future interfaces only. NO OAuth, PKCE, token exchange or session is implemented.
// Tokens must be held by a future backend, never in the browser.
export type SmartLaunchType = "ehr" | "standalone";
export interface SmartLaunchContext { launchType: SmartLaunchType; iss?: string | undefined; launch?: string | undefined; patient?: string | undefined; encounter?: string | undefined; fhirUser?: string | undefined }
export interface SmartScopes { requested: string[]; granted: string[] }
export type SmartAuthState =
  | { status: "not_implemented" }
  // Future states (defined for design; unreachable today):
  | { status: "authorizing"; launch: SmartLaunchContext; pkceMethod: "S256" }
  | { status: "authorized"; launch: SmartLaunchContext; scopes: SmartScopes; expiresAt: string }
  | { status: "expired"; launch: SmartLaunchContext }
  | { status: "error"; error: string; description?: string | undefined };

export const PLANNED_SCOPES = ["launch", "launch/patient", "openid", "fhirUser", "patient/Patient.read", "patient/Condition.read", "patient/Observation.read", "patient/MedicationStatement.read", "patient/Procedure.read", "patient/DocumentReference.read", "patient/AllergyIntolerance.read", "patient/Encounter.read"];

/** Future SMART client contract. */
export interface SmartClient {
  state(): SmartAuthState;
  beginLaunch(ctx: SmartLaunchContext): Promise<SmartAuthState>;
}
