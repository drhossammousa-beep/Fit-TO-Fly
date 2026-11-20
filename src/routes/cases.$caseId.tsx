import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ftf, useCase } from "@/lib/ftf/store";
import { missingFor, STEPS, stepStatus, caseProgress } from "@/lib/ftf/status";
import { bestFinding } from "@/lib/ftf/rules";
import type { StepId } from "@/lib/ftf/types";
import { MissingPanel, StatusPill, SimBadge } from "@/components/ftf/bits";
import { Step1, Step2, Step3, Step4 } from "@/components/ftf/steps-a";
import { Step5, Step6, Step7, Step8 } from "@/components/ftf/steps-b";
import { ageFrom, daysBetween, fmtDate, fmtDateTime, isISODate } from "@/lib/ftf/dates";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/cases/$caseId")({
  validateSearch: (s: Record<string, unknown>): { step: StepId } => {
    const n = Number(s["step"]);
    return { step: (n >= 1 && n <= 8 ? n : 1) as StepId };
  },
  head: () => ({
    meta: [
      { title: "Case workspace — Fit-to-Fly" },
      { name: "description", content: "Eight-step Fit-to-Fly assessment workspace for a single patient case." },
      { property: "og:title", content: "Case workspace — Fit-to-Fly" },
      { property: "og:description", content: "Eight-step Fit-to-Fly assessment workspace." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: CaseWorkspace,
});

const VIEWS = { 1: Step1, 2: Step2, 3: Step3, 4: Step4, 5: Step5, 6: Step6, 7: Step7, 8: Step8 };

function CaseWorkspace() {
  const { caseId } = Route.useParams();
  const { step } = Route.useSearch();
  const navigate = Route.useNavigate();
  const { ready, c, role } = useCase(caseId);
  if (!ready) return <div className="p-10 text-center text-muted-foreground">Loading case…</div>;
  if (!c) return <div className="p-10 text-center"><p className="text-muted-foreground">Case not found.</p><Link to="/" className="text-brand underline">Back to cases</Link></div>;

  const meta = STEPS[step - 1]!;
  const View = VIEWS[step];
  const { completed } = caseProgress(c);
  const proc = bestFinding(c, "procedure_type")?.value;
  const pd = bestFinding(c, "procedure_date")?.value;
  const go = (s: number) => navigate({ search: { step: s as StepId } });

  return (
    <main className="mx-auto max-w-7xl px-4 py-6">
      {/* Boarding-pass style banner */}
      <div className="flex overflow-hidden rounded-xl border bg-card shadow-card">
        <div className="flex-1 p-4">
          <div className="flex items-center gap-2 font-mono text-xs text-muted-foreground"><Link to="/" className="hover:text-foreground">Cases</Link> / {c.ref}</div>
          <div className="mt-1 flex flex-wrap items-baseline gap-x-4">
            <h1 className="font-display text-4xl">{c.patient.fullName || "New request"}</h1>
            <span className="text-sm text-muted-foreground">{[c.patient.sex, ageFrom(c.patient.dob) !== undefined && `${ageFrom(c.patient.dob)} y`, c.patient.nationality, c.patient.mrn].filter(Boolean).join(" · ")}</span>
          </div>
          <div className="mt-1 text-sm">{proc ?? "Procedure pending retrieval"}{pd && ` · ${fmtDate(pd)}`}{pd && isISODate(c.travel.departureDate) && <b> · day {daysBetween(pd, c.travel.departureDate)} post-procedure at departure</b>}</div>
        </div>
        <div className="perforation w-4 bg-border/40" />
        <div className="hidden min-w-64 bg-muted/50 p-4 sm:block">
          <div className="eyebrow text-muted-foreground">Flight</div>
          <div className="font-mono text-xl font-bold">{c.travel.origin.match(/\((\w+)\)/)?.[1] ?? "—"} → {c.travel.destination.match(/\((\w+)\)/)?.[1] ?? (c.travel.destination || "—")}</div>
          <div className="text-xs text-muted-foreground">{c.travel.airline} {c.travel.flightNumber} · {fmtDate(c.travel.departureDate)}</div>
          <div className="mt-2 eyebrow text-muted-foreground">{completed}/8 steps complete</div>
        </div>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[250px_1fr]">
        <aside className="space-y-1 lg:sticky lg:top-24 lg:self-start">
          {STEPS.map((s) => {
            const st = stepStatus(c, s.id);
            return (
              <button key={s.id} onClick={() => go(s.id)} className={cn("flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-left transition", step === s.id ? "border-primary bg-primary text-primary-foreground" : "border-transparent hover:bg-card")}>
                <span className={cn("grid size-7 shrink-0 place-items-center rounded-full font-mono text-xs font-bold", st === "completed" ? "bg-success text-success-foreground" : st === "pending_review" ? "bg-brand text-brand-foreground" : st === "incomplete" ? "bg-caution text-caution-foreground" : "bg-muted text-muted-foreground")}>{s.id}</span>
                <span className="min-w-0"><span className="block truncate text-sm font-semibold">{s.title}</span><span className={cn("block text-[11px]", step === s.id ? "opacity-70" : "text-muted-foreground")}>{st.replace("_", " ")}</span></span>
              </button>
            );
          })}
          <details className="mt-4 rounded-lg border bg-card p-3 text-xs">
            <summary className="cursor-pointer font-semibold">Audit trail ({c.audit.length})</summary>
            <ul className="mt-2 max-h-72 space-y-2 overflow-auto">{[...c.audit].reverse().map((a, i) => <li key={i}><div className="font-mono text-muted-foreground">{fmtDateTime(a.at)}{a.step && ` · S${a.step}`}</div><div>{a.action}</div><div className="text-muted-foreground">{a.actor}</div></li>)}</ul>
          </details>
          <Button variant="ghost" size="sm" className="mt-2 w-full text-danger" onClick={() => { if (confirm(`Delete case ${c.ref}?`)) { ftf.remove(c.id); navigate({ to: "/" }); } }}><Trash2 /> Delete case</Button>
        </aside>

        <section className="min-w-0 space-y-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="eyebrow text-muted-foreground">Step {meta.id} of 8 · System of {meta.layer}</div>
              <h2 className="font-display text-4xl">{meta.title}</h2>
              <p className="text-sm text-muted-foreground">Output: {meta.output}{meta.ai && <> · AI support: {meta.ai} <SimBadge className="ml-1" /></>}</p>
            </div>
            <StatusPill status={stepStatus(c, step)} />
          </div>
          {c.reassessment.required && step !== 6 && step !== 7 && <div className="rounded-lg border-2 border-danger bg-danger-soft px-3 py-2 text-sm font-semibold text-danger">Reassessment required — the previous approval is no longer valid. <button className="underline" onClick={() => go(6)}>Go to Step 6</button></div>}
          <MissingPanel items={missingFor(c, step)} />
          <View c={c} role={role} />
          <div className="flex justify-between border-t pt-4">
            <Button variant="outline" disabled={step === 1} onClick={() => go(step - 1)}><ArrowLeft /> Previous</Button>
            <Button disabled={step === 8} onClick={() => go(step + 1)}>Next step <ArrowRight /></Button>
          </div>
        </section>
      </div>
    </main>
  );
}
