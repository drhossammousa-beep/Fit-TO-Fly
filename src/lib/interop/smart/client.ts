import type { SmartAuthState, SmartClient, SmartLaunchContext } from "./types";

/** Placeholder SMART client: always NOT IMPLEMENTED. Never fabricates a successful authorization. */
export class NotImplementedSmartClient implements SmartClient {
  state(): SmartAuthState { return { status: "not_implemented" }; }
  async beginLaunch(_ctx: SmartLaunchContext): Promise<SmartAuthState> {
    return { status: "error", error: "not_implemented", description: "SMART on FHIR authorization is not implemented (EHR LAUNCH: NOT CONNECTED)" };
  }
}
