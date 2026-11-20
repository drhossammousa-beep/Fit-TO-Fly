import { Link } from "@tanstack/react-router";
import { Plane } from "lucide-react";
import { ftf, useFtf } from "@/lib/ftf/store";
import { USERS } from "@/lib/ftf/factory";

export function AppHeader() {
  const s = useFtf();
  const link = "rounded-md px-3 py-1.5 text-sm font-semibold text-ink-foreground/70 hover:text-ink-foreground";
  return (
    <header className="sticky top-0 z-30 bg-ink-gradient text-ink-foreground print:hidden">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-4 px-4 py-3">
        <Link to="/" className="flex items-center gap-2">
          <span className="grid size-8 place-items-center rounded-md bg-brand text-brand-foreground"><Plane className="size-4 -rotate-45" /></span>
          <span className="font-display text-2xl leading-none">Fit-to-Fly</span>
          <span className="hidden eyebrow opacity-60 sm:inline">Clinical decision support</span>
        </Link>
        <nav className="flex gap-1">
          <Link to="/" className={link} activeOptions={{ exact: true }} activeProps={{ className: "bg-ink-foreground/10 !text-ink-foreground" }}>Cases</Link>
          <Link to="/traceability" className={link} activeProps={{ className: "bg-ink-foreground/10 !text-ink-foreground" }}>Traceability</Link>
          <Link to="/about" className={link} activeProps={{ className: "bg-ink-foreground/10 !text-ink-foreground" }}>Documentation</Link>
          <Link to="/interoperability" className={link} activeProps={{ className: "bg-ink-foreground/10 !text-ink-foreground" }}>FHIR</Link>
        </nav>
        <div className="ml-auto flex items-center gap-2 text-xs">
          <span className="rounded border border-sim/40 bg-sim-soft px-1.5 py-0.5 eyebrow text-sim" title="Role switching is a demonstration only. Restrictions are applied in the browser and are not secure access control.">Simulated role · not access control</span>
          <span className="eyebrow opacity-60">Acting as</span>
          <select aria-label="Simulated role" className="rounded-md border border-ink-foreground/20 bg-ink px-2 py-1 text-ink-foreground" value={s?.role ?? "physician"} onChange={(e) => ftf.setRole(e.target.value as "physician" | "coordinator")}>
            <option value="physician">{USERS.physician.name} — Physician</option>
            <option value="coordinator">{USERS.coordinator.name} — Coordinator</option>
          </select>
        </div>
      </div>
      <div className="bg-sim-soft bg-hatch-sim py-1 text-center text-[11px] font-semibold text-sim">Prototype with synthetic patients · hospital integrations and AI are simulated · not for clinical use</div>
    </header>
  );
}
