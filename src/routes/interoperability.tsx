import { createFileRoute } from "@tanstack/react-router";
import { interopStatus } from "@/lib/interop/config";
import { MAPPING_REGISTRY } from "@/lib/interop/fhir/mappings";
import { PLANNED_SCOPES } from "@/lib/interop/smart/types";

export const Route = createFileRoute("/interoperability")({
  head: () => ({
    meta: [
      { title: "FHIR & SMART on FHIR readiness — Fit-to-Fly" },
      { name: "description", content: "Architecture prepared for future FHIR R4 and SMART on FHIR integration. Not connected; data is simulated." },
      { property: "og:title", content: "FHIR & SMART on FHIR readiness — Fit-to-Fly" },
      { property: "og:description", content: "Prepared FHIR R4 mappings and SMART launch design. No external connection." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Page,
});

const tone: Record<string, string> = { mapped: "text-success", partial: "text-sim", unmapped: "text-muted-foreground" };

function Page() {
  const st = interopStatus();
  const rows: [string, string][] = [
    ["FHIR mapping", st.fhirMapping], ["FHIR version baseline", st.fhirVersion], ["FHIR server", st.fhirServer],
    ["External EHR", st.externalEhr], ["SMART authorization", st.smartAuthorization], ["EHR launch", st.ehrLaunch],
    ["Patient context", st.patientContext], ["Current clinical data source", "SIMULATED DATA"],
  ];
  return (
    <main className="mx-auto max-w-7xl space-y-8 px-4 py-8">
      <div><div className="eyebrow text-muted-foreground">Architecture prepared · simulated · not connected</div><h1 className="font-display text-5xl">FHIR & SMART on FHIR</h1>
        <p className="mt-2 max-w-3xl text-muted-foreground">The app is structured so a FHIR R4 server or SMART-enabled EHR could be added later. Nothing is connected today, and this is not a claim of FHIR or SMART compliance. Imported data would still need physician verification.</p></div>
      <section className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border-2 border-sim/40 bg-card p-5 shadow-card"><h2 className="font-display text-2xl">Status</h2>
          <dl className="mt-3 divide-y text-sm">{rows.map(([k, v]) => <div key={k} className="flex justify-between py-1.5"><dt>{k}</dt><dd className="eyebrow text-sim">{v}</dd></div>)}</dl></div>
        <div className="rounded-xl border bg-card p-5 shadow-card"><h2 className="font-display text-2xl">FHIR server configuration</h2>
          <p className="mt-1 text-xs eyebrow text-sim">Not implemented</p>
          <label className="mt-3 block text-sm">Base URL<input disabled placeholder="Not configured" className="mt-1 w-full rounded-md border bg-muted px-2 py-1.5 text-sm" /></label>
          <label className="mt-3 block text-sm">FHIR version<input disabled value="R4" className="mt-1 w-full rounded-md border bg-muted px-2 py-1.5 text-sm" /></label>
          <p className="mt-3 text-xs text-muted-foreground">Configuration, authorization and token storage belong to a future secure backend. There is no connect button because no connection exists.</p></div>
      </section>
      <section className="rounded-xl border bg-card p-5 shadow-card"><h2 className="font-display text-2xl">Resource mapping overview</h2>
        <table className="mt-3 w-full text-left text-sm"><thead><tr className="border-b eyebrow text-muted-foreground"><th className="py-1">FitToFly data</th><th>FHIR R4 resource</th><th>Status</th><th>Note</th></tr></thead><tbody>
          {MAPPING_REGISTRY.map((m) => <tr key={m.internal} className="border-b align-top last:border-0"><td className="py-1.5 pr-3">{m.internal}</td><td className="pr-3 font-semibold">{m.fhir ?? "—"}</td><td className={`pr-3 eyebrow ${tone[m.status]}`}>{m.status}</td><td className="text-muted-foreground">{m.note}</td></tr>)}
        </tbody></table></section>
      <section className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border bg-card p-5 text-sm shadow-card"><h2 className="font-display text-2xl">SMART on FHIR (future)</h2>
          <p className="mt-1 eyebrow text-sim">Architecture prepared · authorization not implemented</p>
          <ul className="mt-2 space-y-1"><li>• EHR launch and standalone launch</li><li>• OAuth 2.0 authorization code with PKCE, OpenID Connect for user identity</li><li>• Tokens held only by a future backend</li><li>• Launch patient context never skips identity check or consent</li></ul>
          <p className="mt-3 eyebrow text-muted-foreground">Planned scopes</p><p className="mt-1 font-mono text-xs">{PLANNED_SCOPES.join("  ")}</p></div>
        <div className="rounded-xl border bg-card p-5 text-sm shadow-card"><h2 className="font-display text-2xl">Safety rules</h2>
          <ul className="mt-2 space-y-1"><li>• Imported facts arrive unverified and block clearance until a physician verifies them.</li><li>• Missing values are left out, never filled with normal values.</li><li>• Conflicts and verification states are carried into the mapped data.</li><li>• Original source values are kept when facts are edited.</li><li>• Only the physician approves; mapping changes no clinical rule.</li></ul></div>
      </section>
    </main>
  );
}
