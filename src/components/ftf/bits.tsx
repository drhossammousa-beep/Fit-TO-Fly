import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { StepStatus } from "@/lib/ftf/types";
import type { Severity } from "@/lib/ftf/rules";
import { AlertTriangle, CheckCircle2, Circle, Clock, FlaskConical, Info, OctagonAlert } from "lucide-react";

export function SimBadge({ label = "Simulated", className }: { label?: string; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1 rounded border border-sim/40 bg-sim-soft bg-hatch-sim px-1.5 py-0.5 eyebrow text-sim", className)}>
      <FlaskConical className="size-3" /> {label}
    </span>
  );
}

export function EnhBadge() {
  return <span className="rounded border border-brand/40 bg-brand-soft px-1.5 py-0.5 eyebrow text-brand">Enhancement</span>;
}

const STATUS: Record<StepStatus, { label: string; cls: string; Icon: typeof Circle }> = {
  not_started: { label: "Not started", cls: "text-muted-foreground bg-muted border-border", Icon: Circle },
  incomplete: { label: "Incomplete", cls: "text-caution-foreground bg-caution-soft border-caution/40", Icon: Clock },
  pending_review: { label: "Pending review", cls: "text-brand bg-brand-soft border-brand/40", Icon: Clock },
  completed: { label: "Completed", cls: "text-success bg-success-soft border-success/40", Icon: CheckCircle2 },
};

export function StatusPill({ status }: { status: StepStatus }) {
  const s = STATUS[status];
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold", s.cls)}>
      <s.Icon className="size-3" /> {s.label}
    </span>
  );
}

export function StatusDot({ status }: { status: StepStatus }) {
  const c = { not_started: "bg-border", incomplete: "bg-caution", pending_review: "bg-brand", completed: "bg-success" }[status];
  return <span className={cn("block h-1.5 flex-1 rounded-full", c)} />;
}

const SEV: Record<Severity, { cls: string; Icon: typeof Info; label: string }> = {
  high: { cls: "border-danger/40 bg-danger-soft text-danger", Icon: OctagonAlert, label: "High" },
  caution: { cls: "border-caution/50 bg-caution-soft text-caution-foreground", Icon: AlertTriangle, label: "Caution" },
  info: { cls: "border-brand/30 bg-brand-soft text-brand", Icon: Info, label: "Info" },
};
export function SeverityTag({ s }: { s: Severity }) {
  const v = SEV[s];
  return (
    <span className={cn("inline-flex items-center gap-1 rounded border px-1.5 py-0.5 eyebrow", v.cls)}>
      <v.Icon className="size-3" /> {v.label}
    </span>
  );
}

export function Section({ title, eyebrow, actions, children, className }: { title: string; eyebrow?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn("rounded-xl border bg-card p-5 shadow-card", className)}>
      <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          {eyebrow && <div className="mb-1 flex flex-wrap items-center gap-2 eyebrow text-muted-foreground">{eyebrow}</div>}
          <h3 className="text-base font-bold tracking-tight">{title}</h3>
        </div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </header>
      {children}
    </section>
  );
}

export function Field({ label, children, hint, required }: { label: string; children: ReactNode; hint?: string; required?: boolean }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-semibold text-muted-foreground">
        {label} {required && <span className="text-danger">*</span>}
      </span>
      {children}
      {hint && <span className="block text-xs text-muted-foreground">{hint}</span>}
    </label>
  );
}

export function MissingPanel({ items }: { items: string[] }) {
  if (!items.length)
    return (
      <div className="flex items-center gap-2 rounded-lg border border-success/30 bg-success-soft px-3 py-2 text-sm text-success">
        <CheckCircle2 className="size-4" /> All required information for this step is present.
      </div>
    );
  return (
    <div className="rounded-lg border border-caution/50 bg-caution-soft px-3 py-2 text-sm text-caution-foreground">
      <div className="mb-1 flex items-center gap-2 font-semibold">
        <AlertTriangle className="size-4" /> Missing or outstanding ({items.length})
      </div>
      <ul className="ml-6 list-disc space-y-0.5">
        {items.map((m) => (
          <li key={m}>{m}</li>
        ))}
      </ul>
    </div>
  );
}

export function PhysicianOnly({ children }: { children: ReactNode }) {
  return <div className="rounded-lg border border-dashed border-border bg-muted px-3 py-2 text-xs text-muted-foreground">{children}</div>;
}

export const inputCls =
  "w-full rounded-md border border-input bg-paper px-3 py-2 text-sm outline-none transition focus:border-ring focus:ring-2 focus:ring-ring/30 disabled:opacity-60";
