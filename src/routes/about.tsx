import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/about")({
  head: () => ({
    meta: [
      { title: "Documentation — Fit-to-Fly" },
      { name: "description", content: "What is implemented, simulated and planned in the Fit-to-Fly prototype." },
      { property: "og:title", content: "Documentation — Fit-to-Fly" },
      { property: "og:description", content: "Implemented, simulated and future capabilities." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Page,
});

const LAYERS = [
  { t: "Systems of Record", items: ["HIS / EMR", "LIS / PACS", "Clinical documents & verified records"], note: "Simulated with synthetic source data" },
  { t: "Systems of Engagement", items: ["Intake & follow-up", "Physician workspace", "Certificate & education"], note: "Implemented in this prototype" },
  { t: "Systems of Intelligence", items: ["Clinical NLP", "Completeness checks", "Clinical rules", "Exploratory ML", "Follow-up analytics"], note: "Rules implemented; NLP & ML simulated" },
];
const COLS = [
  { t: "Implemented", cls: "border-success/40", items: ["8-step workflow with status tracking", "Case save / reopen in the browser", "Validation & missing-information panels", "CDI checks and clinician verification", "Demonstration rule set with rationale", "Physician-only decision, attestation, approval", "Certificate / deferral preview and print", "Follow-up responses, escalation, outcome classification", "Audit trail per case", "Retrieval gated on registration, identity verification and consent", "Unified clearance readiness checks", "Approval invalidation on material change + reassessment", "Immutable certificate versions (v1, v2…)", "Follow-up reconciliation and response states"] },
  { t: "Simulated", cls: "border-sim/40", items: ["HIS/EMR/LIS/PACS retrieval", "AI fact extraction (rule-based stand-in, with source quotations)", "Dictation documentation assist", "Exploratory ML on 180 synthetic records", "Reminder messaging", "Role-based access (role switcher)"] },
  { t: "Future", cls: "border-border", items: ["FHIR R4 mapping layer, simulated adapter and SMART launch design are prepared (not connected) — see FHIR page", "Real FHIR server / EHR connection and SMART authorization", "Validated clinical NLP service", "Governance-approved rule set", "Real authentication & server-enforced access control",  "Shared database and n8n workflow integration (Phase 2)", "Patient portal / SMS follow-up", "Additional specialties beyond cardiology"] },
];

function Page() {
  return (
    <main className="mx-auto max-w-7xl space-y-8 px-4 py-8">
      <div><div className="eyebrow text-muted-foreground">Deliverable 8</div><h1 className="font-display text-5xl">Documentation</h1>
        <p className="mt-2 max-w-3xl text-muted-foreground">A clinical decision support prototype. Only an authorised physician can clear, condition or defer travel. All patients are fictional.</p></div>
      <section className="grid gap-4 md:grid-cols-3">{LAYERS.map((l) => (
        <div key={l.t} className="rounded-xl border bg-card p-5 shadow-card"><h2 className="font-display text-2xl">{l.t}</h2><ul className="mt-2 space-y-1 text-sm">{l.items.map((i) => <li key={i}>• {i}</li>)}</ul><p className="mt-3 eyebrow text-muted-foreground">{l.note}</p></div>
      ))}</section>
      <section className="grid gap-4 md:grid-cols-3">{COLS.map((c) => (
        <div key={c.t} className={`rounded-xl border-2 bg-card p-5 ${c.cls}`}><h2 className="font-display text-2xl">{c.t}</h2><ul className="mt-2 space-y-1 text-sm">{c.items.map((i) => <li key={i}>• {i}</li>)}</ul></div>
      ))}</section>
      <section className="rounded-xl border-2 border-sim/40 bg-card p-5 text-sm shadow-card"><h2 className="font-display text-2xl">Roles and permissions (simulated)</h2>
        <p className="mt-2 text-muted-foreground">There is no sign-in. The role selector in the header only changes which buttons the browser shows. Anyone can switch roles, so these restrictions are <b>not secure access control</b>.</p>
        <table className="mt-3 w-full text-left"><thead><tr className="border-b eyebrow text-muted-foreground"><th className="py-1">Action</th><th>Coordinator</th><th>Physician</th><th>Enforced by</th></tr></thead><tbody>
          {[["Register request, travel details, identity check, retrieval", "Yes", "Yes", "Browser only"], ["Verify / edit / reject extracted facts", "No", "Yes", "Browser only"], ["Sign examination, complete risk review", "No", "Yes", "Browser only"], ["Approve decision / issue document", "No", "Yes", "Browser only (role check in store)"], ["Review escalations", "No", "Yes", "Browser only"]].map((r) => <tr key={r[0]} className="border-b last:border-0"><td className="py-1">{r[0]}</td><td>{r[1]}</td><td>{r[2]}</td><td className="text-sim">{r[3]}</td></tr>)}
        </tbody></table>
        <p className="mt-2 text-xs text-muted-foreground">Production requires real accounts, server-side authorisation and database access policies (planned for Phase 2).</p></section>
      <section className="rounded-xl border bg-card p-5 text-sm shadow-card"><h2 className="font-display text-2xl">Safety rules</h2>
        <ul className="mt-2 space-y-1"><li>• Risk indicators never decide fitness to fly.</li><li>• Every finding keeps its source, date and review status.</li><li>• Missing follow-up counts as an unknown outcome, never as safe.</li><li>• A change to any clinically material input after approval invalidates it; the old document is kept as a superseded version.</li><li>• Only physician-verified facts count as confirmed; missing data is never read as normal.</li><li>• Exploratory ML clusters are never clearance criteria.</li><li>• The rule set needs approval from hospital clinical governance before real use.</li></ul></section>
    </main>
  );
}
