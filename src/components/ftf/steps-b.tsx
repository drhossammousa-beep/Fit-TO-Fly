import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { CartesianGrid, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis } from "recharts";
import { Button } from "@/components/ui/button";
import type { FtfCase, Vitals, DecisionOutcome } from "@/lib/ftf/types";
import { ftf } from "@/lib/ftf/store";
import { USERS } from "@/lib/ftf/factory";
import { Field, inputCls, Section, SimBadge, SeverityTag, PhysicianOnly, EnhBadge } from "./bits";
import type { StepProps } from "./steps-a";
import { suggestVitalsFromDictation, concerningPhrases } from "@/lib/ftf/nlp";
import { examPrompts, educationTopics, CONDITION_OPTIONS } from "@/lib/ftf/education";
import { riskIndicators, severityCounts, RULESET_VERSION, bestFinding } from "@/lib/ftf/rules";
import { exploreSimilar, syntheticCohort } from "@/lib/ftf/cohort";
import { classifyOutcome, OUTCOME_LABEL, responseIsConcerning } from "@/lib/ftf/status";
import { ageFrom, fmtDate, fmtDateTime, todayISO, uid } from "@/lib/ftf/dates";
import { clearanceReadiness, currentCertificate, followUpState, FOLLOW_UP_STATE_LABEL, hasValidClearance, inputStates } from "@/lib/ftf/workflow";
import type { CertificateVersion } from "@/lib/ftf/types";
import { Mic, MicOff, Printer, ShieldCheck, Sparkles, AlertTriangle } from "lucide-react";

// ---------------- Step 5 ----------------
const SYMPTOMS: [keyof FtfCase["exam"]["symptoms"], string][] = [
  ["chestPain", "Chest pain"], ["dyspneaRest", "Breathless at rest"], ["dyspneaExertion", "Breathless on exertion"], ["palpitations", "Palpitations"],
  ["syncope", "Syncope / pre-syncope"], ["fever", "Fever"], ["legSwelling", "Leg swelling"], ["woundConcern", "Wound concern"],
];
const VITALS: [keyof Vitals, string, string][] = [["hr", "Heart rate", "bpm"], ["sbp", "Systolic BP", "mmHg"], ["dbp", "Diastolic BP", "mmHg"], ["rr", "Resp. rate", "/min"], ["spo2", "SpO₂ (room air)", "%"], ["temp", "Temperature", "°C"], ["weight", "Weight", "kg"]];

type SR = { start: () => void; stop: () => void; continuous: boolean; interimResults: boolean; lang: string; onresult: (e: { results: ArrayLike<{ 0: { transcript: string }; isFinal: boolean }>; resultIndex: number }) => void; onend: () => void; onerror: () => void };

export function Step5({ c, role }: StepProps) {
  const isDoc = role === "physician";
  const signed = !!c.exam.signedAt;
  const lock = signed || !isDoc;
  const set = (r: (d: FtfCase) => void) => ftf.update(c.id, r);
  const [listening, setListening] = useState(false);
  const [supported, setSupported] = useState(false);
  const recRef = useRef<SR | null>(null);
  useEffect(() => { setSupported(typeof window !== "undefined" && ("webkitSpeechRecognition" in window || "SpeechRecognition" in window)); }, []);
  const suggestion = suggestVitalsFromDictation(c.exam.dictation);
  const hasSuggestion = Object.keys(suggestion).length > 0;

  const toggleMic = () => {
    if (listening) { recRef.current?.stop(); return; }
    const W = window as unknown as Record<string, (new () => SR) | undefined>;
    const Ctor = W["SpeechRecognition"] ?? W["webkitSpeechRecognition"];
    if (!Ctor) return;
    const rec = new Ctor();
    rec.continuous = true; rec.interimResults = false; rec.lang = "en-GB";
    rec.onresult = (e) => {
      let txt = "";
      for (let i = e.resultIndex; i < e.results.length; i++) { const res = e.results[i]; if (res?.isFinal) txt += res[0].transcript + " "; }
      if (txt) ftf.update(c.id, (d) => { d.exam.dictation = `${d.exam.dictation} ${txt}`.trim(); });
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => { setListening(false); toast.error("Microphone unavailable"); };
    recRef.current = rec; rec.start(); setListening(true);
  };

  return (
    <div className="space-y-5">
      <Section title="Clinical prompts" eyebrow="Contextual, based on verified record">
        <ul className="grid gap-1.5 text-sm sm:grid-cols-2">{examPrompts(c).map((p) => <li key={p} className="flex gap-2"><span className="text-brand">▸</span>{p}</li>)}</ul>
      </Section>
      <Section title="Current symptoms & function">
        <div className="grid gap-2 text-sm sm:grid-cols-4">
          {SYMPTOMS.map(([k, l]) => (
            <label key={k} className={`flex items-center gap-2 rounded-md border px-2 py-1.5 ${c.exam.symptoms[k] ? "border-danger/40 bg-danger-soft" : "bg-paper"}`}>
              <input type="checkbox" disabled={lock} checked={c.exam.symptoms[k]} onChange={(e) => set((d) => { d.exam.symptoms[k] = e.target.checked; })} />{l}
            </label>
          ))}
        </div>
        <div className="mt-4 max-w-xs">
          <Field label="NYHA functional class" required>
            <select className={inputCls} disabled={lock} value={c.exam.nyha ?? ""} onChange={(e) => set((d) => { d.exam.nyha = e.target.value ? (Number(e.target.value) as 1 | 2 | 3 | 4) : undefined; })}>
              <option value="">Select…</option><option value="1">I — no limitation</option><option value="2">II — slight limitation</option><option value="3">III — marked limitation</option><option value="4">IV — symptoms at rest</option>
            </select>
          </Field>
        </div>
      </Section>
      <Section title="Vital signs">
        <div className="grid gap-3 sm:grid-cols-4 lg:grid-cols-7">
          {VITALS.map(([k, l, u]) => (
            <Field key={k} label={`${l} (${u})`}>
              <input type="number" step="0.1" disabled={lock} className={`${inputCls} font-mono`} value={c.exam.vitals[k] ?? ""} onChange={(e) => set((d) => { d.exam.vitals[k] = e.target.value === "" ? undefined : Number(e.target.value); })} />
            </Field>
          ))}
        </div>
      </Section>
      <Section title="Examination findings" eyebrow={<>Speech-to-text <EnhBadge /> uses Chrome's built-in recognition · <SimBadge label="Documentation assist" /></>}
        actions={supported && !lock ? <Button variant={listening ? "destructive" : "outline"} size="sm" onClick={toggleMic}>{listening ? <><MicOff /> Stop dictation</> : <><Mic /> Dictate</>}</Button> : undefined}>
        <div className="grid gap-4 lg:grid-cols-2">
          <Field label="Dictation transcript" hint={supported ? "Review the transcript — speech recognition can mishear clinical terms." : "Speech recognition isn't available in this browser; type instead."}>
            <textarea rows={5} disabled={lock} className={inputCls} placeholder="e.g. BP 124 over 76, heart rate 84, sats 96 percent. Sternotomy healing…" value={c.exam.dictation} onChange={(e) => set((d) => { d.exam.dictation = e.target.value; })} />
          </Field>
          <Field label="Examination findings (signed record)" required>
            <textarea rows={5} disabled={lock} className={inputCls} value={c.exam.findings} onChange={(e) => set((d) => { d.exam.findings = e.target.value; })} />
          </Field>
        </div>
        {hasSuggestion && !lock && (
          <div className="mt-3 flex flex-wrap items-center gap-3 rounded-lg border border-sim/30 bg-sim-soft bg-hatch-sim px-3 py-2 text-sm">
            <Sparkles className="size-4 text-sim" /> Suggested from dictation: <span className="font-mono">{Object.entries(suggestion).map(([k, v]) => `${k.toUpperCase()} ${v}`).join(" · ")}</span>
            <Button size="sm" variant="outline" onClick={() => ftf.update(c.id, (d) => { Object.assign(d.exam.vitals, suggestion); }, { step: 5, action: "Accepted vitals suggested from dictation" })}>Accept into vitals</Button>
          </div>
        )}
      </Section>
      <Section title="Physician signature">
        {signed ? (
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span className="flex items-center gap-2 text-success"><ShieldCheck className="size-4" /> Signed by {c.exam.signedBy} · {fmtDateTime(c.exam.signedAt)}</span>
            {isDoc && <Button size="sm" variant="ghost" onClick={() => ftf.update(c.id, (d) => { d.exam.signedAt = undefined; d.exam.signedBy = undefined; d.risk.reviewedAt = undefined; }, { step: 5, action: "Examination signature withdrawn for amendment" })}>Amend</Button>}
          </div>
        ) : !isDoc ? <PhysicianOnly>Only the physician can sign the examination.</PhysicianOnly> : (
          <Button disabled={c.exam.vitals.hr === undefined || c.exam.vitals.spo2 === undefined || c.exam.vitals.sbp === undefined || !c.exam.nyha || !c.exam.findings.trim()}
            onClick={() => ftf.update(c.id, (d) => { d.exam.signedAt = new Date().toISOString(); d.exam.signedBy = USERS.physician.name; }, { step: 5, action: "Examination signed" })}>
            <ShieldCheck /> Review & sign examination
          </Button>
        )}
      </Section>
    </div>
  );
}

// ---------------- Step 6 ----------------
export function Step6({ c, role }: StepProps) {
  const isDoc = role === "physician";
  const risks = riskIndicators(c);
  const counts = severityCounts(risks);
  const [showMl, setShowMl] = useState(c.risk.mlViewed);
  const order = { high: 0, caution: 1, info: 2 };
  const sorted = [...risks].sort((a, b) => order[a.severity] - order[b.severity]);
  const highUnack = risks.filter((r) => r.severity === "high" && !c.risk.acknowledged.includes(r.id));
  return (
    <div className="space-y-5">
      <ReassessmentBanner c={c} />
      <Section title="Status of key inputs" eyebrow="Missing ≠ negative · unverified ≠ confirmed">
        <ul className="grid gap-2 text-sm sm:grid-cols-3">
          {inputStates(c).map((x) => (
            <li key={x.label} className={`rounded-md border px-3 py-2 ${x.state === "Missing" || x.state === "Unknown" ? "border-caution/50 bg-caution-soft" : x.state === "Positive" ? "border-danger/30 bg-danger-soft" : x.state === "Pending verification" ? "border-brand/30 bg-brand-soft" : "bg-paper"}`}>
              <div className="flex justify-between gap-2"><b>{x.label}</b><span className="eyebrow">{x.state}</span></div>
              <div className="text-xs text-muted-foreground">{x.detail}</div>
            </li>
          ))}
        </ul>
      </Section>
      <div className="rounded-xl border border-ink bg-ink-gradient p-5 text-ink-foreground shadow-lift">
        <div className="eyebrow opacity-70">Decision support · not a decision</div>
        <p className="mt-1 text-sm">These indicators come from a demonstration rule set ({RULESET_VERSION}) based on published guidance. They support — and never replace — the physician's assessment. The system does not determine fitness to fly.</p>
        <div className="mt-4 flex gap-6 font-mono">
          <div><div className="text-3xl font-bold">{counts.high}</div><div className="eyebrow opacity-70">High</div></div>
          <div><div className="text-3xl font-bold">{counts.caution}</div><div className="eyebrow opacity-70">Caution</div></div>
          <div><div className="text-3xl font-bold">{counts.info}</div><div className="eyebrow opacity-70">Info</div></div>
        </div>
      </div>

      <Section title="Risk indicators" eyebrow="Approved-rule engine (demo rule set)">
        {sorted.length === 0 ? <p className="text-sm text-muted-foreground">No indicators fired. Missing data can hide risks — check Steps 3–5.</p> : (
          <ul className="space-y-3">
            {sorted.map((r) => {
              const ack = c.risk.acknowledged.includes(r.id);
              return (
                <li key={r.id} className="rounded-lg border bg-paper p-3">
                  <div className="flex flex-wrap items-center gap-2"><SeverityTag s={r.severity} /><span className="font-semibold">{r.title}</span>
                    {r.usesUnverifiedData && <span className="rounded bg-caution-soft px-1.5 py-0.5 text-xs text-caution-foreground">uses unverified data</span>}</div>
                  <p className="mt-1 text-sm">{r.rationale}</p>
                  {r.suggestion && <p className="mt-1 text-sm text-muted-foreground">Consider: {r.suggestion}</p>}
                  <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                    <span>Basis: {r.basedOn.join(", ")} · Guidance: {r.guidance}{r.indicativeDate && ` · Indicative earliest date: ${fmtDate(r.indicativeDate)}`}</span>
                    {isDoc && r.severity !== "info" && (
                      <label className="flex items-center gap-1.5"><input type="checkbox" checked={ack} onChange={(e) => ftf.update(c.id, (d) => { d.risk.acknowledged = e.target.checked ? [...d.risk.acknowledged, r.id] : d.risk.acknowledged.filter((x) => x !== r.id); d.risk.reviewedAt = undefined; }, { step: 6, action: `${e.target.checked ? "Acknowledged" : "Un-acknowledged"} indicator: ${r.title}` })} /> Physician reviewed</label>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Section>

      <Section title="Exploratory similar-case analysis" eyebrow={<><SimBadge label="Exploratory ML · synthetic cohort" /></>}
        actions={!showMl ? <Button variant="outline" size="sm" onClick={() => { setShowMl(true); ftf.update(c.id, (d) => { d.risk.mlViewed = true; }, { step: 6, action: "Exploratory ML viewed" }); }}>Run exploration</Button> : undefined}>
        <div className="mb-3 flex gap-2 rounded-lg border border-danger/30 bg-danger-soft px-3 py-2 text-xs text-danger"><AlertTriangle className="size-4 shrink-0" /> Not validated. Clusters and neighbours come from 180 synthetic records and must not be used as flight-clearance criteria.</div>
        {showMl && <MlPanel c={c} />}
      </Section>

      <Section title="Physician review of indicators">
        <textarea rows={3} disabled={!isDoc} className={inputCls} placeholder="Clinical interpretation of the indicators…" value={c.risk.physicianNotes} onChange={(e) => ftf.update(c.id, (d) => { d.risk.physicianNotes = e.target.value; })} />
        <div className="mt-3">
          {c.risk.reviewedAt ? <p className="text-sm text-success">Reviewed by {c.risk.reviewedBy} · {fmtDateTime(c.risk.reviewedAt)}</p> : !isDoc ? <PhysicianOnly>Only the physician can complete the risk review.</PhysicianOnly> : (
            <div className="flex flex-wrap items-center gap-3">
              <Button disabled={highUnack.length > 0} onClick={() => ftf.update(c.id, (d) => { const at = new Date().toISOString(); d.risk.reviewedAt = at; d.risk.reviewedBy = USERS.physician.name; if (d.reassessment.required) d.reassessment = { ...d.reassessment, required: false, resolvedAt: at }; }, { step: 6, action: c.reassessment.required ? "Reassessment completed — risk indicators re-reviewed" : "Risk indicators reviewed" })}>{c.reassessment.required ? "Complete reassessment" : "Mark risk review complete"}</Button>
              {highUnack.length > 0 && <span className="text-xs text-muted-foreground">Acknowledge all high-severity indicators first.</span>}
            </div>
          )}
        </div>
      </Section>
    </div>
  );
}

function MlPanel({ c }: { c: FtfCase }) {
  const r = exploreSimilar(c);
  if (!r.ok) return <p className="text-sm text-muted-foreground">Insufficient data: missing {r.missing.join(", ")}.</p>;
  const pts = syntheticCohort().points;
  const nIds = new Set(r.neighbours.map((n) => n.id));
  const o = r.neighbourOutcomes;
  return (
    <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
      <div className="h-64 rounded-lg border bg-paper p-2">
        <ResponsiveContainer>
          <ScatterChart margin={{ top: 8, right: 8, bottom: 16, left: 0 }}>
            <CartesianGrid stroke="var(--border)" />
            <XAxis type="number" dataKey="daysPost" name="Days post-procedure" tick={{ fontSize: 10 }} label={{ value: "Days post-procedure", position: "insideBottom", offset: -8, fontSize: 10 }} />
            <YAxis type="number" dataKey="lvef" name="LVEF" unit="%" tick={{ fontSize: 10 }} />
            <ZAxis range={[24, 24]} />
            <Tooltip cursor={false} />
            <Scatter data={pts.filter((p) => !nIds.has(p.id))} fill="var(--chart-5)" fillOpacity={0.35} />
            <Scatter data={r.neighbours} fill="var(--chart-1)" />
            <Scatter data={[{ daysPost: r.features.daysPost, lvef: r.features.lvef }]} fill="var(--danger)" shape="star" />
          </ScatterChart>
        </ResponsiveContainer>
      </div>
      <div className="space-y-2 text-sm">
        <p>Nearest cluster: <b>#{r.cluster + 1}</b> ({r.profile.size} synthetic records; mean LVEF {r.profile.meanLvef}%, {r.profile.meanDaysPost} days post-procedure).</p>
        <p className="font-semibold">12 nearest synthetic neighbours:</p>
        <ul className="font-mono text-xs">
          <li>Uneventful: {o.uneventful}</li><li>Minor event: {o.minor_event}</li><li>Serious event: {o.serious_event}</li><li>Unknown outcome: {o.unknown} <span className="font-sans text-muted-foreground">(not counted as safe)</span></li>
        </ul>
        <p className="text-xs text-muted-foreground">Red star = this patient · blue = neighbours · grey = rest of cohort.</p>
      </div>
    </div>
  );
}

// ---------------- Step 7 ----------------
const OUTCOMES: { v: DecisionOutcome; label: string; cls: string }[] = [
  { v: "cleared", label: "Fit to fly", cls: "border-success bg-success-soft text-success" },
  { v: "conditional", label: "Fit to fly with conditions", cls: "border-caution bg-caution-soft text-caution-foreground" },
  { v: "deferred", label: "Deferred — not fit at this time", cls: "border-danger bg-danger-soft text-danger" },
];

export function Step7({ c, role }: StepProps) {
  const isDoc = role === "physician";
  const dec = c.decision;
  const approved = !!dec.approvedAt;
  const lock = approved || !isDoc;
  const set = (r: (d: FtfCase) => void, action?: string) => ftf.update(c.id, r, action ? { step: 7, action } : undefined);
  const topics = educationTopics(c);
  const readiness = clearanceReadiness(c);
  const canApprove = isDoc && readiness.ready;
  return (
    <div className="space-y-5">
      <ReassessmentBanner c={c} />
      <ApprovalStatus c={c} />
      <Section title="Physician decision" eyebrow="Recorded by the authorised physician only">
        {!isDoc && <div className="mb-3"><PhysicianOnly>The decision can only be recorded by the physician.</PhysicianOnly></div>}
        <div className="grid gap-3 sm:grid-cols-3">
          {OUTCOMES.map((o) => (
            <button key={o.v} disabled={lock} onClick={() => set((d) => { d.decision.outcome = o.v; }, `Decision drafted: ${o.label}`)}
              className={`rounded-lg border-2 p-3 text-left text-sm font-semibold transition disabled:cursor-not-allowed ${dec.outcome === o.v ? o.cls : "border-border bg-paper hover:border-ring"}`}>{o.label}</button>
          ))}
        </div>
        {dec.outcome === "conditional" && (
          <div className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
            {CONDITION_OPTIONS.map((opt) => (
              <label key={opt} className="flex items-center gap-2"><input type="checkbox" disabled={lock} checked={dec.conditions.includes(opt)} onChange={(e) => set((d) => { d.decision.conditions = e.target.checked ? [...d.decision.conditions, opt] : d.decision.conditions.filter((x) => x !== opt); })} />{opt}</label>
            ))}
          </div>
        )}
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label={dec.outcome === "deferred" ? "Earliest re-assessment date" : "Earliest travel date"}><input type="date" disabled={lock} className={inputCls} value={dec.earliestTravelDate} onChange={(e) => set((d) => { d.decision.earliestTravelDate = e.target.value; })} /></Field>
          <Field label="Certificate valid until"><input type="date" disabled={lock} className={inputCls} value={dec.validUntil} onChange={(e) => set((d) => { d.decision.validUntil = e.target.value; })} /></Field>
          <div className="sm:col-span-2"><Field label="Decision rationale" required><textarea rows={3} disabled={lock} className={inputCls} value={dec.rationale} onChange={(e) => set((d) => { d.decision.rationale = e.target.value; })} /></Field></div>
        </div>
      </Section>

      <Section title="Patient education & travel instructions" eyebrow="Tailored to procedure and decision">
        <div className="grid gap-3 sm:grid-cols-2">
          {topics.map((t) => (
            <label key={t.id} className="flex gap-2 rounded-lg border bg-paper p-3 text-sm">
              <input type="checkbox" disabled={lock} className="mt-1" checked={dec.education.includes(t.id)} onChange={(e) => set((d) => { d.decision.education = e.target.checked ? [...d.decision.education, t.id] : d.decision.education.filter((x) => x !== t.id); })} />
              <span><b>{t.title}</b><br /><span className="text-muted-foreground">{t.body}</span></span>
            </label>
          ))}
        </div>
      </Section>

      <Certificate c={c} />
      <CertificateHistory c={c} />

      {!approved && (
        <Section title="Clearance readiness" eyebrow={readiness.ready ? "All checks passed — physician may approve" : `${readiness.blocking.length} check(s) blocking approval`}>
          <ul className="grid gap-1.5 text-sm sm:grid-cols-2">
            {readiness.checks.map((x) => (
              <li key={x.id} className={`rounded-md border px-3 py-1.5 ${x.ok ? "border-success/30 bg-success-soft" : "border-danger/30 bg-danger-soft"}`}>
                <span className={x.ok ? "text-success" : "font-semibold text-danger"}>{x.ok ? "✓" : "✗"} {x.label}</span>
                {!x.ok && <div className="text-xs text-foreground">{x.action}</div>}
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section title="Approval">
        {approved ? (
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span className="flex items-center gap-2 text-success"><ShieldCheck className="size-4" /> Approved by {dec.approvedBy} · {fmtDateTime(dec.approvedAt)}</span>
            {isDoc && <Button size="sm" variant="ghost" onClick={() => ftf.reopen(c.id)}>Reopen & amend</Button>}
          </div>
        ) : (
          <div className="space-y-3">
            <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" disabled={!isDoc} checked={dec.attested} onChange={(e) => set((d) => { d.decision.attested = e.target.checked; })} />
              I, {dec.physicianName} ({dec.physicianLicense}), have personally assessed this patient and take responsibility for this decision. Decision support outputs were reviewed but did not determine it.</label>
            <Button disabled={!canApprove} onClick={() => { const r = ftf.approve(c.id); if (!r.ok) toast.error(`${r.error}${r.missing ? `: ${r.missing.join(", ")}` : ""}`); else toast.success("Approved — new document version issued"); }}>
              <ShieldCheck /> Approve & finalise
            </Button>
          </div>
        )}
      </Section>
    </div>
  );
}

function ReassessmentBanner({ c }: { c: FtfCase }) {
  if (!c.reassessment.required) return null;
  return (
    <div className="rounded-xl border-2 border-danger bg-danger-soft p-4 text-sm text-danger">
      <div className="flex items-center gap-2 font-bold"><AlertTriangle className="size-4" /> Reassessment required — no valid current clearance</div>
      <p className="mt-1 text-foreground">Triggered {fmtDateTime(c.reassessment.triggeredAt)} because:</p>
      <ul className="ml-5 mt-1 list-disc text-foreground">{c.reassessment.reasons.map((r) => <li key={r}>{r}</li>)}</ul>
      <p className="mt-2 text-xs text-foreground">The previous document is kept unchanged as a superseded version. Re-review the risk indicators (Step 6), then record a fresh physician approval.</p>
    </div>
  );
}

function ApprovalStatus({ c }: { c: FtfCase }) {
  const cur = currentCertificate(c);
  const valid = hasValidClearance(c);
  const items = [
    ["Approval", c.decision.approvedAt ? `Approved v${cur?.version ?? "?"} · ${fmtDateTime(c.decision.approvedAt)}` : c.certificates.length ? "Invalidated / not approved" : "Not approved"],
    ["Reassessment", c.reassessment.required ? "Required" : c.reassessment.resolvedAt ? `Completed ${fmtDateTime(c.reassessment.resolvedAt)}` : "Not required"],
    ["Valid current clearance", valid ? "Yes" : cur?.outcome === "deferred" && c.decision.approvedAt ? "No — deferral issued" : "No"],
    ["Document versions", String(c.certificates.length)],
  ];
  return (
    <div className="grid gap-2 sm:grid-cols-4">
      {items.map(([k, v]) => <div key={k} className="rounded-lg border bg-card px-3 py-2 shadow-card"><div className="eyebrow text-muted-foreground">{k}</div><div className={`text-sm font-semibold ${k === "Valid current clearance" ? (valid ? "text-success" : "text-danger") : ""}`}>{v}</div></div>)}
    </div>
  );
}

function CertificateHistory({ c }: { c: FtfCase }) {
  const list = [...c.certificates].sort((a, b) => b.version - a.version);
  if (!list.length) return null;
  return (
    <Section title="Document versions" eyebrow="Approved versions are immutable and never overwritten">
      <ul className="space-y-2">{list.map((v) => <VersionRow key={v.version} v={v} c={c} />)}</ul>
    </Section>
  );
}

function VersionRow({ v, c }: { v: CertificateVersion; c: FtfCase }) {
  const [open, setOpen] = useState(false);
  const cur = v.status === "current" && !!c.decision.approvedAt;
  return (
    <li className={`rounded-lg border p-3 text-sm ${cur ? "border-success/40 bg-success-soft" : "bg-paper"}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span><b className="font-mono">v{v.version}</b> · {v.outcome === "deferred" ? "Deferral letter" : v.outcome === "conditional" ? "Fit to fly with conditions" : "Fit to fly"} · departure {fmtDate(v.snapshot.departureDate)}</span>
        <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${cur ? "bg-success text-success-foreground" : "bg-muted text-muted-foreground"}`}>{cur ? "CURRENT" : "SUPERSEDED — historical"}</span>
      </div>
      <div className="mt-1 text-xs text-muted-foreground">Signed by {v.approvedBy} (Reg. {v.physicianLicense}) · {fmtDateTime(v.approvedAt)}{v.supersededAt && ` · superseded ${fmtDateTime(v.supersededAt)}`}</div>
      {v.supersededReason && <div className="mt-1 text-xs">Reason: {v.supersededReason}</div>}
      <button className="mt-1 text-xs font-semibold text-brand underline" onClick={() => setOpen(!open)}>{open ? "Hide" : "View"} preserved snapshot</button>
      {open && (
        <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 rounded border bg-card p-2 text-xs">
          <dt>Patient</dt><dd>{v.snapshot.patientName} · {v.snapshot.passportNo}</dd>
          <dt>Flight</dt><dd>{v.snapshot.airline} {v.snapshot.flightNumber} · {v.snapshot.origin} → {v.snapshot.destination} · {fmtDate(v.snapshot.departureDate)}</dd>
          <dt>Procedure</dt><dd>{v.snapshot.procedure || "—"} {v.snapshot.procedureDate && `on ${fmtDate(v.snapshot.procedureDate)}`}</dd>
          <dt>Valid</dt><dd>{fmtDate(v.snapshot.earliestTravelDate)} – {fmtDate(v.snapshot.validUntil)}</dd>
          <dt>Conditions</dt><dd>{v.snapshot.conditions.join("; ") || "—"}</dd>
          <dt>Rationale</dt><dd>{v.snapshot.rationale}</dd>
        </dl>
      )}
    </li>
  );
}

function Certificate({ c }: { c: FtfCase }) {
  const dec = c.decision;
  const approved = !!dec.approvedAt;
  const cur = currentCertificate(c);
  const proc = bestFinding(c, "procedure_type")?.value ?? "—";
  const pdate = bestFinding(c, "procedure_date")?.value;
  const deferred = dec.outcome === "deferred";
  const topics = educationTopics(c).filter((t) => dec.education.includes(t.id));
  return (
    <Section title="Document preview" eyebrow={approved ? `Final · version ${cur?.version ?? 1} (current)` : c.reassessment.required ? "NOT VALID — reassessment required" : "Draft — not valid until approved"} actions={<Button variant="outline" size="sm" onClick={() => window.print()}><Printer /> Print</Button>}>
      <div className="print-area relative mx-auto max-w-2xl overflow-hidden rounded-lg border bg-paper p-8 text-sm shadow-card">
        {!approved && <div className="pointer-events-none absolute inset-0 flex items-center justify-center"><span className="-rotate-12 font-display text-7xl text-danger/15">{c.reassessment.required ? "NOT VALID" : "DRAFT"}</span></div>}
        <div className="flex items-start justify-between border-b pb-4">
          <div><div className="eyebrow text-muted-foreground">Cairo Medical Centre · International Patient Office</div><h4 className="font-display text-3xl">{deferred ? "Medical Deferral Letter" : "Fit-to-Fly Certificate"}</h4></div>
          <div className="text-right font-mono text-xs">{c.ref}{approved && cur && ` · v${cur.version}`}<br />Issued {fmtDate(dec.approvedAt?.slice(0, 10) ?? todayISO())}</div>
        </div>
        <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2">
          <div><dt className="eyebrow text-muted-foreground">Patient</dt><dd className="font-semibold">{c.patient.fullName || "—"}</dd></div>
          <div><dt className="eyebrow text-muted-foreground">Passport</dt><dd className="font-mono">{c.patient.passportNo || "—"}</dd></div>
          <div><dt className="eyebrow text-muted-foreground">Date of birth / age</dt><dd>{fmtDate(c.patient.dob)} ({ageFrom(c.patient.dob) ?? "—"})</dd></div>
          <div><dt className="eyebrow text-muted-foreground">Flight</dt><dd>{c.travel.airline} {c.travel.flightNumber} · {c.travel.origin} → {c.travel.destination} · {fmtDate(c.travel.departureDate)}</dd></div>
          <div className="col-span-2"><dt className="eyebrow text-muted-foreground">Procedure</dt><dd>{proc}{pdate && ` on ${fmtDate(pdate)}`}</dd></div>
        </dl>
        <div className={`mt-5 rounded-md border-2 p-3 font-semibold ${dec.outcome === "cleared" ? "border-success text-success" : dec.outcome === "conditional" ? "border-caution text-caution-foreground" : dec.outcome === "deferred" ? "border-danger text-danger" : "border-dashed text-muted-foreground"}`}>
          {dec.outcome === "cleared" && "The above patient has been assessed and is medically fit to travel by commercial air."}
          {dec.outcome === "conditional" && "The above patient has been assessed and is medically fit to travel by commercial air, subject to the conditions below."}
          {deferred && `Air travel is not advised at present. Re-assessment recommended on or after ${fmtDate(dec.earliestTravelDate)}.`}
          {!dec.outcome && "No decision recorded."}
        </div>
        {dec.conditions.length > 0 && !deferred && <ul className="mt-3 list-disc pl-5">{dec.conditions.map((x) => <li key={x}>{x}</li>)}</ul>}
        {!deferred && dec.validUntil && <p className="mt-3 text-xs">Valid for travel from {fmtDate(dec.earliestTravelDate)} until {fmtDate(dec.validUntil)}.</p>}
        {topics.length > 0 && <div className="mt-4 border-t pt-3"><div className="eyebrow mb-1 text-muted-foreground">Patient instructions</div><ul className="space-y-1 text-xs">{topics.map((t) => <li key={t.id}><b>{t.title}.</b> {t.body}</li>)}</ul></div>}
        <div className="mt-6 flex items-end justify-between border-t pt-3 text-xs">
          <div>{approved ? <span className="font-display text-xl">{dec.approvedBy}</span> : <span className="text-muted-foreground">Awaiting physician signature</span>}<br />{dec.physicianName}, {USERS.physician.title} · Reg. {dec.physicianLicense}</div>
          <div className="text-right text-muted-foreground">Prototype — synthetic data<br />not a valid medical document</div>
        </div>
      </div>
    </Section>
  );
}

// ---------------- Step 8 ----------------
const blankResp = () => ({ chestPain: false, breathlessness: false, legSwelling: false, bleeding: false, dizziness: false, hospitalVisit: false });

export function Step8({ c, role }: StepProps) {
  const isDoc = role === "physician";
  const o = c.outcome;
  const cls = classifyOutcome(c);
  const [form, setForm] = useState({ followUpId: "", symptoms: blankResp(), complications: "", feedback: "", satisfaction: 5, verification: "patient_reported" as const as "patient_reported" | "clinician_verified" });
  const [escNote, setEscNote] = useState("");
  const phrases = concerningPhrases(`${form.complications} ${form.feedback}`);

  if (!c.decision.approvedAt && !c.certificates.length) return <Section title="Post-flight outcomes"><p className="text-sm text-muted-foreground">Available once the decision is approved in Step 7.</p></Section>;
  const today = todayISO();
  const states = o.followUps.map((f) => followUpState(c, f, today, responseIsConcerning));

  const submit = () => {
    const resp = { id: uid("r"), date: todayISO(), ...form, followUpId: form.followUpId || undefined };
    const concerning = responseIsConcerning(resp);
    ftf.update(c.id, (d) => {
      d.outcome.responses.push(resp);
      if (resp.followUpId) { const f = d.outcome.followUps.find((x) => x.id === resp.followUpId); if (f) f.status = "responded"; }
      if (d.outcome.traveled === "unknown") d.outcome.traveled = "yes";
      if (concerning) d.outcome.escalation = { status: "open", note: `Concerning response on ${fmtDate(resp.date)}${phrases.length ? `: ${phrases.join(", ")}` : ""}` };
    }, { step: 8, action: `Follow-up response recorded${concerning ? " — ESCALATED" : ""}` });
    if (concerning) toast.warning("Concerning response — escalated for clinician review");
    setForm({ ...form, symptoms: blankResp(), complications: "", feedback: "" });
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3 rounded-xl border bg-card p-4 shadow-card">
        <div className="eyebrow text-muted-foreground">Outcome classification</div>
        <span className={`rounded-full px-3 py-1 text-sm font-bold ${cls === "unknown" ? "bg-muted text-foreground" : cls === "complication_reported" ? "bg-danger-soft text-danger" : cls.includes("uneventful") ? "bg-success-soft text-success" : "bg-brand-soft text-brand"}`}>{OUTCOME_LABEL[cls]}</span>
        {cls === "unknown" && <span className="text-xs text-muted-foreground">No follow-up data — this is not evidence that the flight was safe.</span>}
      </div>

      {!c.decision.approvedAt && <div className="rounded-lg border border-danger/40 bg-danger-soft px-3 py-2 text-sm text-danger">The approval is not currently valid (reassessment required). Follow-up records below stay linked to case {c.ref}.</div>}
      <div className="grid gap-2 sm:grid-cols-5">
        {(Object.keys(FOLLOW_UP_STATE_LABEL) as (keyof typeof FOLLOW_UP_STATE_LABEL)[]).map((k) => (
          <div key={k} className="rounded-lg border bg-card px-3 py-2 shadow-card"><div className="font-mono text-xl font-bold">{states.filter((x) => x === k).length}</div><div className="text-[11px] text-muted-foreground">{FOLLOW_UP_STATE_LABEL[k]}</div></div>
        ))}
      </div>
      {o.escalation.status !== "none" && (
        <Section title="Escalation" eyebrow={o.escalation.status === "open" ? "Open — needs clinician review" : "Reviewed"} className={o.escalation.status === "open" ? "border-danger/50" : ""}>
          <p className="text-sm">{o.escalation.note}</p>
          {o.escalation.status === "open" ? (isDoc ? (
            <div className="mt-3 flex gap-2">
              <input className={inputCls} placeholder="Review outcome (e.g. advised local Doppler; DVT excluded)" value={escNote} onChange={(e) => setEscNote(e.target.value)} />
              <Button disabled={!escNote.trim()} onClick={() => ftf.update(c.id, (d) => { d.outcome.escalation = { ...d.outcome.escalation, status: "reviewed", note: `${d.outcome.escalation.note}\nReview: ${escNote}`, reviewedBy: USERS.physician.name, reviewedAt: new Date().toISOString() }; }, { step: 8, action: "Escalation reviewed" })}>Mark reviewed</Button>
            </div>
          ) : <div className="mt-3"><PhysicianOnly>Escalations are reviewed by the physician.</PhysicianOnly></div>) : <p className="mt-2 text-xs text-muted-foreground">Reviewed by {o.escalation.reviewedBy} · {fmtDateTime(o.escalation.reviewedAt)}</p>}
        </Section>
      )}

      <Section title="Did the patient travel?">
        <div className="flex flex-wrap items-end gap-3">
          {(["unknown", "yes", "no", "postponed"] as const).map((v) => (
            <button key={v} onClick={() => ftf.update(c.id, (d) => { d.outcome.traveled = v; if (v === "yes" && !d.outcome.actualTravelDate) d.outcome.actualTravelDate = d.travel.departureDate; }, { step: 8, action: `Travel status: ${v}` })}
              className={`rounded-md border px-3 py-1.5 text-sm font-semibold capitalize ${o.traveled === v ? "border-primary bg-primary text-primary-foreground" : "bg-paper"}`}>{v === "unknown" ? "Not confirmed" : v}</button>
          ))}
          {o.traveled === "yes" && <Field label="Actual travel date"><input type="date" className={inputCls} value={o.actualTravelDate} onChange={(e) => ftf.update(c.id, (d) => { d.outcome.actualTravelDate = e.target.value; })} /></Field>}
        </div>
      </Section>

      <Section title="Follow-up reminders" eyebrow={<SimBadge label="Simulated messaging" />}>
        <table className="w-full text-sm">
          <thead><tr className="border-b text-left eyebrow text-muted-foreground"><th className="py-2">Contact</th><th>Due</th><th>Channel</th><th>Status</th><th>Outcome state</th><th /></tr></thead>
          <tbody>{o.followUps.map((f, i) => (
            <tr key={f.id} className="border-b last:border-0">
              <td className="py-2 font-semibold">{f.label}</td><td className="font-mono text-xs">{fmtDate(f.dueDate)}</td><td>{f.channel}</td>
              <td><span className={`rounded px-1.5 py-0.5 text-xs font-semibold ${f.status === "responded" ? "bg-success-soft text-success" : f.status === "no_response" ? "bg-danger-soft text-danger" : "bg-muted"}`}>{f.status.replace("_", " ")}</span></td>
              <td className="text-xs">{FOLLOW_UP_STATE_LABEL[states[i]!]}</td>
              <td className="text-right">{f.status === "scheduled" && <span className="flex justify-end gap-1"><Button size="sm" variant="ghost" onClick={() => ftf.update(c.id, (d) => { d.outcome.followUps.find((x) => x.id === f.id)!.status = "sent"; }, { step: 8, action: `Reminder sent (simulated): ${f.label}` })}>Send</Button></span>}
                {(f.status === "sent" || f.status === "scheduled") && <Button size="sm" variant="ghost" onClick={() => ftf.update(c.id, (d) => { d.outcome.followUps.find((x) => x.id === f.id)!.status = "no_response"; }, { step: 8, action: `No response: ${f.label}` })}>No response</Button>}</td>
            </tr>
          ))}</tbody>
        </table>
      </Section>

      <Section title="Record a follow-up response" eyebrow="Rule-based screening flags concerning answers">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Linked reminder"><select className={inputCls} value={form.followUpId} onChange={(e) => setForm({ ...form, followUpId: e.target.value })}><option value="">Ad-hoc</option>{o.followUps.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}</select></Field>
          <Field label="Source"><select className={inputCls} value={form.verification} onChange={(e) => setForm({ ...form, verification: e.target.value as typeof form.verification })}><option value="patient_reported">Patient-reported</option><option value="clinician_verified">Clinician-verified</option></select></Field>
        </div>
        <div className="mt-3 grid gap-2 text-sm sm:grid-cols-3">
          {(Object.keys(form.symptoms) as (keyof typeof form.symptoms)[]).map((k) => (
            <label key={k} className="flex items-center gap-2"><input type="checkbox" checked={form.symptoms[k]} onChange={(e) => setForm({ ...form, symptoms: { ...form.symptoms, [k]: e.target.checked } })} />{{ chestPain: "Chest pain", breathlessness: "Breathlessness", legSwelling: "Leg swelling", bleeding: "Bleeding", dizziness: "Dizziness / fainting", hospitalVisit: "Hospital / ER visit" }[k]}</label>
          ))}
        </div>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <Field label="Complications"><textarea rows={2} className={inputCls} value={form.complications} onChange={(e) => setForm({ ...form, complications: e.target.value })} /></Field>
          <Field label="Feedback"><textarea rows={2} className={inputCls} value={form.feedback} onChange={(e) => setForm({ ...form, feedback: e.target.value })} /></Field>
        </div>
        {phrases.length > 0 && <p className="mt-2 text-xs text-danger">Concerning phrases detected: {phrases.join(", ")}</p>}
        <div className="mt-3 flex justify-end"><Button onClick={submit}>Save response</Button></div>
      </Section>

      {o.responses.length > 0 && (
        <Section title="Responses on record">
          <ul className="space-y-2 text-sm">{o.responses.map((r) => (
            <li key={r.id} className={`rounded-lg border p-3 ${responseIsConcerning(r) ? "border-danger/40 bg-danger-soft" : "bg-paper"}`}>
              <div className="flex justify-between text-xs"><span className="font-mono">{fmtDate(r.date)}</span><span>{r.verification === "clinician_verified" ? "Clinician-verified" : "Patient-reported"}</span></div>
              <div>Symptoms: {Object.entries(r.symptoms).filter(([, v]) => v).map(([k]) => k).join(", ") || "none"}</div>
              {r.complications && <div>Complications: {r.complications}</div>}
              {r.feedback && <div className="text-muted-foreground">“{r.feedback}”</div>}
            </li>
          ))}</ul>
        </Section>
      )}
    </div>
  );
}
