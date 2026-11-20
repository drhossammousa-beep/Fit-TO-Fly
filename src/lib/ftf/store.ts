// Local, in-browser persistence for the prototype (synthetic data only). In the target
// architecture this is replaced by the hospital integration backbone with access control.
// Every mutation goes through ftf.update, which enforces the workflow invariants in
// workflow.ts (retrieval/approval gates, invalidation on material change, follow-up reconciliation).
import { useSyncExternalStore } from "react";
import type { FtfCase, Role, StepId } from "./types";
import { buildDemoCases } from "./demo-cases";
import { blankCase, nextRef, retrieveFromSources, USERS } from "./factory";
import { clearanceReadiness, enforceInvariants, invalidateApproval, issueCertificate, retrievalReadiness, WorkflowBlocked } from "./workflow";

const KEY = "ftf.cases.v3";
const ROLE_KEY = "ftf.role.v1";

export interface FtfState {
  cases: FtfCase[];
  role: Role;
}

export interface Result { ok: boolean; error?: string | undefined; missing?: string[] | undefined }

let state: FtfState | null = null;
const listeners = new Set<() => void>();

/** Fill fields added after a case was first saved. */
export function normalizeCase(c: FtfCase): FtfCase {
  c.registration ??= {};
  c.identity ??= { method: "", documentNo: "" };
  c.blockedRetrievals ??= [];
  c.reassessment ??= { required: false, reasons: [] };
  c.certificates ??= [];
  return c;
}

function storage(): Storage | null {
  try { return typeof window === "undefined" ? null : window.localStorage; } catch { return null; }
}

function init(): FtfState {
  if (state) return state;
  const ls = storage();
  let cases: FtfCase[] | null = null;
  try {
    const raw = ls?.getItem(KEY);
    if (raw) cases = (JSON.parse(raw) as FtfCase[]).map(normalizeCase);
  } catch {
    cases = null;
  }
  if (!cases) {
    cases = buildDemoCases();
    ls?.setItem(KEY, JSON.stringify(cases));
  }
  const role = (ls?.getItem(ROLE_KEY) as Role | null) ?? "physician";
  state = { cases, role };
  return state;
}

function commit(next: FtfState) {
  state = next;
  const ls = storage();
  ls?.setItem(KEY, JSON.stringify(next.cases));
  ls?.setItem(ROLE_KEY, next.role);
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function useFtf(): FtfState | null {
  return useSyncExternalStore(subscribe, init, () => null);
}

export function useCase(id: string): { ready: boolean; c?: FtfCase | undefined; role: Role } {
  const s = useFtf();
  return { ready: !!s, c: s?.cases.find((x) => x.id === id), role: s?.role ?? "physician" };
}

export function currentActor(role: Role = init().role) {
  return role === "physician" ? USERS.physician.name : USERS.coordinator.name;
}

function getCase(id: string) {
  return init().cases.find((c) => c.id === id);
}

export const ftf = {
  setRole(role: Role) {
    const s = init();
    commit({ ...s, role });
  },
  createCase(): FtfCase {
    const s = init();
    const c = blankCase(nextRef(s.cases));
    c.audit[0]!.actor = currentActor(s.role);
    c.audit[0]!.role = s.role;
    commit({ ...s, cases: [c, ...s.cases] });
    return c;
  },
  /**
   * Mutate a deep copy of the case, enforce workflow invariants and append audit entries.
   * Returns ok:false (and changes nothing) when a workflow gate refuses the change.
   */
  update(id: string, recipe: (draft: FtfCase) => void, audit?: { action: string; step?: StepId }): Result {
    const s = init();
    const prev = s.cases.find((c) => c.id === id);
    if (!prev) return { ok: false, error: "Case not found" };
    const draft = structuredClone(prev);
    recipe(draft);
    const at = new Date().toISOString();
    let notes: string[];
    try {
      notes = enforceInvariants(prev, draft, at);
    } catch (e) {
      if (e instanceof WorkflowBlocked) return { ok: false, error: e.message, missing: e.missing };
      throw e;
    }
    draft.updatedAt = at;
    const actor = currentActor(s.role);
    if (audit) draft.audit = [...draft.audit, { at, actor, role: s.role, step: audit.step, action: audit.action }];
    for (const n of notes) draft.audit.push({ at, actor: "System (workflow rule)", role: "system", action: n });
    commit({ ...s, cases: s.cases.map((c) => (c.id === id ? draft : c)) });
    return { ok: true };
  },
  /** SIMULATED retrieval. Refused (and the attempt logged) unless registration, identity and consent are complete. */
  retrieveRecords(id: string): Result & { findings?: number; documents?: number } {
    const c = getCase(id);
    if (!c) return { ok: false, error: "Case not found" };
    const ready = retrievalReadiness(c);
    if (!ready.ok) {
      ftf.update(id, (d) => { d.blockedRetrievals.push({ at: new Date().toISOString(), missing: ready.missing }); }, { step: 3, action: `Retrieval refused — missing: ${ready.missing.join(", ")}` });
      return { ok: false, error: `Retrieval blocked: ${ready.missing.join(", ")}`, missing: ready.missing };
    }
    const r = retrieveFromSources(c.sourceRecords);
    const res = ftf.update(id, (d) => {
      const kept = d.clinical.findings.filter((f) => f.extraction === "manual");
      d.clinical.findings = [...r.findings, ...kept];
      d.clinical.documents = r.documents;
      d.clinical.retrievedAt = new Date().toISOString();
      d.clinical.reviewCompletedAt = undefined;
    }, { step: 3, action: `Records retrieved (simulated) for ${c.ref}: ${r.findings.length} findings from ${r.documents.length} documents` });
    return { ...res, findings: r.findings.length, documents: r.documents.length };
  },
  /** Physician approval: refused unless every clearance readiness check passes; issues a new certificate version. */
  approve(id: string): Result {
    const s = init();
    const c = getCase(id);
    if (!c) return { ok: false, error: "Case not found" };
    if (s.role !== "physician") return { ok: false, error: "Only the physician can approve (simulated role check)" };
    const r = clearanceReadiness(c);
    if (!r.ready) return { ok: false, error: "Clearance blocked", missing: r.blocking.map((b) => b.label) };
    return ftf.update(id, (d) => { issueCertificate(d, USERS.physician.name, new Date().toISOString()); }, { step: 7, action: `Decision approved: ${c.decision.outcome} — document v${c.certificates.reduce((m, x) => Math.max(m, x.version), 0) + 1} issued` });
  },
  /** Physician reopens an approved decision: current version superseded, reassessment required. */
  reopen(id: string): Result {
    return ftf.update(id, (d) => invalidateApproval(d, ["Physician reopened the approved decision for amendment"]), { step: 7, action: "Approved decision reopened — current document superseded" });
  },
  remove(id: string) {
    const s = init();
    commit({ ...s, cases: s.cases.filter((c) => c.id !== id) });
  },
  resetDemo() {
    const s = init();
    commit({ ...s, cases: buildDemoCases() });
  },
  /** Test helper: read current cases. */
  _peek(): FtfCase[] {
    return init().cases;
  },
  /** Test helper: replace in-memory state without touching storage listeners. */
  _load(cases: FtfCase[], role: Role = "physician") {
    state = { cases: cases.map(normalizeCase), role };
  },
};
