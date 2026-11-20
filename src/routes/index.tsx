import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Plus, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ftf, useFtf } from "@/lib/ftf/store";
import { caseProgress, caseStage, classifyOutcome, OUTCOME_LABEL, STEPS } from "@/lib/ftf/status";
import { bestFinding, riskIndicators } from "@/lib/ftf/rules";
import { hasValidClearance } from "@/lib/ftf/workflow";
import { StatusDot } from "@/components/ftf/bits";
import { daysBetween, fmtDate, isISODate } from "@/lib/ftf/dates";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Cases — Fit-to-Fly Clinical Decision Support" },
      { name: "description", content: "Track Fit-to-Fly requests for international patients across the eight-step clinical journey." },
      { property: "og:title", content: "Cases — Fit-to-Fly" },
      { property: "og:description", content: "Track Fit-to-Fly requests across the eight-step clinical journey." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const s = useFtf();
  const navigate = useNavigate();
  if (!s) return <div className="p-10 text-center text-muted-foreground">Loading cases…</div>;
  const cases = s.cases;
  const stats = [
    { label: "Active cases", v: cases.filter((c) => !c.decision.approvedAt).length },
    { label: "Awaiting physician", v: cases.filter((c) => caseProgress(c).statuses.includes("pending_review")).length },
    { label: "Valid clearance", v: cases.filter((c) => hasValidClearance(c)).length },
    { label: "Open escalations", v: cases.filter((c) => c.outcome.escalation.status === "open").length },
    { label: "Unknown outcomes", v: cases.filter((c) => classifyOutcome(c) === "unknown").length },
  ];
  return (
    <main className="mx-auto max-w-7xl px-4 py-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="eyebrow text-muted-foreground">Pilot · post-treatment cardiology</div>
          <h1 className="font-display text-5xl">Fit-to-Fly cases</h1>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => { if (confirm("Restore the demo scenario cases? Your own cases will be removed.")) ftf.resetDemo(); }}><RotateCcw /> Restore demo cases</Button>
          <Button onClick={() => { const c = ftf.createCase(); navigate({ to: "/cases/$caseId", params: { caseId: c.id }, search: { step: 1 } }); }}><Plus /> New request</Button>
        </div>
      </div>
      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-5">
        {stats.map((x) => (
          <div key={x.label} className="rounded-xl border bg-card p-4 shadow-card"><div className="font-mono text-3xl font-bold">{x.v}</div><div className="eyebrow text-muted-foreground">{x.label}</div></div>
        ))}
      </div>
      <div className="mt-6 space-y-3">
        {cases.length === 0 && <p className="rounded-xl border border-dashed p-10 text-center text-muted-foreground">No cases. Create a new request or restore the demo cases.</p>}
        {cases.map((c) => {
          const { statuses, current } = caseProgress(c);
          const proc = bestFinding(c, "procedure_type")?.value;
          const pd = bestFinding(c, "procedure_date")?.value;
          const high = riskIndicators(c).filter((r) => r.severity === "high").length;
          const oc = classifyOutcome(c);
          return (
            <Link key={c.id} to="/cases/$caseId" params={{ caseId: c.id }} search={{ step: current }} className="group grid gap-4 rounded-xl border bg-card p-4 shadow-card transition hover:border-ring hover:shadow-lift md:grid-cols-[1.4fr_1fr_1.2fr]">
              <div>
                <div className="flex items-center gap-2 font-mono text-xs text-muted-foreground">{c.ref}{c.demo && <span className="rounded bg-muted px-1">demo</span>}{c.scenario && <span className="rounded bg-brand-soft px-1 font-sans font-semibold text-brand">Scenario {c.scenario}</span>}</div>
                <div className="text-lg font-bold">{c.patient.fullName || "Unnamed request"}</div>
                <div className="text-sm text-muted-foreground">{c.patient.nationality || "—"} · {proc ?? "Procedure not yet retrieved"}{pd && isISODate(c.travel.departureDate) && ` · day ${daysBetween(pd, c.travel.departureDate)} at departure`}</div>
              </div>
              <div className="text-sm">
                <div className="font-mono font-semibold">{c.travel.origin.split(" ")[0] || "—"} → {c.travel.destination || "—"}</div>
                <div className="text-muted-foreground">{fmtDate(c.travel.departureDate)}{c.travel.durationHours ? ` · ${c.travel.durationHours} h` : ""}</div>
                {high > 0 && !c.decision.approvedAt && <div className="mt-1 text-xs font-semibold text-danger">{high} high-severity indicator(s)</div>}
              </div>
              <div>
                <div className="flex items-center justify-between text-sm"><span className="font-semibold">{caseStage(c)}</span>{oc !== "not_applicable" && <span className="text-xs text-muted-foreground">{OUTCOME_LABEL[oc]}</span>}</div>
                <div className="mt-2 flex gap-1">{STEPS.map((st) => <StatusDot key={st.id} status={statuses[st.id - 1]!} />)}</div>
                <div className="mt-1 flex justify-between eyebrow text-muted-foreground"><span>1 Request</span><span>8 Outcomes</span></div>
              </div>
            </Link>
          );
        })}
      </div>
    </main>
  );
}
