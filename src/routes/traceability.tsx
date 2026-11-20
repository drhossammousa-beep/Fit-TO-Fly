import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/traceability")({
  head: () => ({
    meta: [
      { title: "Traceability matrix — Fit-to-Fly" },
      { name: "description", content: "Mapping of every implemented function to its process step and requirement." },
      { property: "og:title", content: "Traceability matrix — Fit-to-Fly" },
      { property: "og:description", content: "Every function mapped to its process step and requirement." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Page,
});

type Row = [string, string, string, string, "Implemented" | "Simulated" | "Enhancement"];
const ROWS: Row[] = [
  ["S1", "Register request, unique case reference", "§2 Step 1", "New request → FTF-YYYY-NNNN", "Implemented"],
  ["S1", "Identity, request date, consent capture + validation", "§2 Step 1, §8", "Step 1 form, missing-info panel, consent audit", "Implemented"],
  ["S2", "Departure, duration, destination, itinerary, airline form", "§2 Step 2", "Step 2 form", "Implemented"],
  ["S2", "Missing travel info + validation flags", "§2 Step 2", "Missing panel, rule-based flags", "Implemented"],
  ["S3", "Retrieve HIS/EMR/LIS/PACS records", "§2 Step 3, §4", "Retrieve records (synthetic source data)", "Simulated"],
  ["S3", "Structured + unstructured extraction with source & date", "§2 Step 3, §3", "Pattern-based NLP with evidence highlighting", "Simulated"],
  ["S4", "Missing/conflicting documentation (CDI)", "§2 Step 4, §3", "CDI checks: conflict, missing, stale", "Implemented"],
  ["S4", "Clinician verify / correct / reject findings", "§2 Step 4, §8", "Per-finding review with original value kept", "Implemented"],
  ["S5", "Symptoms, vitals, examination findings", "§2 Step 5", "Step 5 form", "Implemented"],
  ["S5", "Optional speech-to-text", "§2 Step 5, §3", "Chrome speech recognition", "Enhancement"],
  ["S5", "Documentation assist from dictation", "§3", "Vitals suggested from dictation; accept to apply", "Simulated"],
  ["S5", "Clinical prompts; physician signature", "§2 Step 5", "Contextual prompts; sign / amend", "Implemented"],
  ["S6", "Approved clinical rules + alerts with rationale", "§2 Step 6", "Rule set v0.1-demo (needs governance approval)", "Implemented"],
  ["S6", "Exploratory ML", "§2 Step 6, §8", "k-means + nearest neighbours on synthetic cohort", "Simulated"],
  ["S6", "No automatic fitness determination", "§2 Step 6, §8", "Indicators only; physician acknowledges", "Implemented"],
  ["S7", "Clear / conditional / defer + rationale", "§2 Step 7, §8", "Physician-only decision with attestation", "Implemented"],
  ["S7", "Draft certificate / deferral letter", "§2 Step 7", "Printable preview with DRAFT watermark", "Implemented"],
  ["S7", "Patient education", "§2 Step 7", "Topics tailored to procedure", "Implemented"],
  ["S8", "Did patient travel; follow-up reminders", "§2 Step 8", "Travel status; Day 1/7/30 reminders", "Simulated"],
  ["S8", "Symptoms/complications/feedback; escalation", "§2 Step 8, §3", "Response form, concern screening, escalation review", "Implemented"],
  ["S8", "Verified vs unknown outcomes", "§2 Step 8, §8", "Outcome classification; no data = unknown", "Implemented"],
  ["All", "Case summary, save/reopen, stage status", "§6", "Dashboard, step rail, in-browser storage", "Implemented"],
  ["All", "Access control & audit trail", "§8", "Role switcher (physician/coordinator), audit log", "Simulated"],
  ["S1", "Identity verification before retrieval", "Review P2", "Method + document match, timestamped; resets if identity data changes", "Implemented"],
  ["S3", "Retrieval gated on registration, identity, consent", "Review P2", "Enforced in store action and update gate; refused attempts logged", "Implemented"],
  ["S3–4", "AI fact extraction with source quotation & physician verification", "Review P5", "Rule-based extractor (SIMULATED AI); accept / edit / reject / uncertain / not documented; provenance kept", "Simulated"],
  ["S7", "Unified clearance readiness checks", "Review P3", "Approval refused unless every check passes; blocking reasons shown", "Implemented"],
  ["S7", "Approval invalidation on material change", "Review P1", "Clinical/travel inputs compared to approval snapshot; reassessment required", "Implemented"],
  ["S7", "Immutable certificate versions", "Review P1", "v1, v2… per case; superseded versions preserved with reason", "Implemented"],
  ["S8", "Follow-up reconciliation & response states", "Review P6", "Pending tasks re-dated, no duplicates, completed kept; no response = unknown", "Implemented"],
];

function Page() {
  return (
    <main className="mx-auto max-w-7xl px-4 py-8">
      <div className="eyebrow text-muted-foreground">Development principle §10</div>
      <h1 className="font-display text-5xl">Traceability matrix</h1>
      <div className="mt-6 overflow-x-auto rounded-xl border bg-card shadow-card">
        <table className="w-full text-sm">
          <thead><tr className="border-b text-left eyebrow text-muted-foreground"><th className="p-3">Step</th><th>Function</th><th>Requirement</th><th>Implementation</th><th className="pr-3">Status</th></tr></thead>
          <tbody>{ROWS.map((r, i) => (
            <tr key={i} className="border-b last:border-0"><td className="p-3 font-mono font-bold">{r[0]}</td><td className="pr-3">{r[1]}</td><td className="pr-3 font-mono text-xs">{r[2]}</td><td className="pr-3 text-muted-foreground">{r[3]}</td>
              <td className="pr-3"><span className={`rounded px-1.5 py-0.5 text-xs font-semibold ${r[4] === "Implemented" ? "bg-success-soft text-success" : r[4] === "Simulated" ? "bg-sim-soft text-sim" : "bg-brand-soft text-brand"}`}>{r[4]}</span></td></tr>
          ))}</tbody>
        </table>
      </div>
    </main>
  );
}
