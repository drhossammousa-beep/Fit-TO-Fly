import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { FtfCase, Role, ClinicalFinding } from "@/lib/ftf/types";
import { ftf } from "@/lib/ftf/store";
import { Field, inputCls, Section, SimBadge, PhysicianOnly } from "./bits";
import { extractFindings } from "@/lib/ftf/nlp";
import { cdiIssues } from "@/lib/ftf/rules";
import { AI_PENDING_LABEL, extractionCoverage, quoteSupported, registrationMissing, retrievalReadiness } from "@/lib/ftf/workflow";
import { currentActor } from "@/lib/ftf/store";
import { fmtDate, fmtDateTime, todayISO, uid } from "@/lib/ftf/dates";
import { Check, Database, Pencil, X, FileText, Loader2, HelpCircle, FileX, ShieldCheck, Lock } from "lucide-react";

export interface StepProps { c: FtfCase; role: Role }

function useSet(c: FtfCase) {
  return (recipe: (d: FtfCase) => void) => ftf.update(c.id, recipe);
}

// ---------------- Step 1 ----------------
export function Step1({ c }: StepProps) {
  const set = useSet(c);
  const p = c.patient;
  const txt = (k: keyof FtfCase["patient"], label: string, req = false, type = "text") => (
    <Field label={label} required={req}>
      <input type={type} className={inputCls} value={p[k] as string} onChange={(e) => set((d) => { (d.patient[k] as string) = e.target.value; })} />
    </Field>
  );
  return (
    <div className="space-y-5">
      <Section title="Patient identity" eyebrow={<>Case reference <span className="font-mono text-foreground">{c.ref}</span></>}>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {txt("fullName", "Full name (as on passport)", true)}
          {txt("dob", "Date of birth", true, "date")}
          <Field label="Sex" required>
            <select className={inputCls} value={p.sex} onChange={(e) => set((d) => { d.patient.sex = e.target.value as FtfCase["patient"]["sex"]; })}>
              <option value="">Select…</option><option>Female</option><option>Male</option>
            </select>
          </Field>
          {txt("nationality", "Nationality", true)}
          {txt("passportNo", "Passport number", true)}
          {txt("mrn", "Hospital MRN")}
          {txt("language", "Preferred language")}
          {txt("phone", "Phone (for follow-up)")}
          {txt("email", "Email (for follow-up)", false, "email")}
        </div>
      </Section>
      <Section title="Request & consent">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Request date" required>
            <input type="date" className={inputCls} value={c.request.requestDate} onChange={(e) => set((d) => { d.request.requestDate = e.target.value; })} />
          </Field>
          <Field label="Requested by" required>
            <select className={inputCls} value={c.request.requestedBy} onChange={(e) => set((d) => { d.request.requestedBy = e.target.value as FtfCase["request"]["requestedBy"]; })}>
              <option value="">Select…</option><option>Patient</option><option>Family member</option><option>Medical facilitator</option><option>Treating physician</option>
            </select>
          </Field>
          <div className="sm:col-span-2">
            <Field label="Reason for request">
              <textarea rows={2} className={inputCls} value={c.request.reason} onChange={(e) => set((d) => { d.request.reason = e.target.value; })} />
            </Field>
          </div>
        </div>
        <div className="mt-4 space-y-2 rounded-lg border bg-muted/50 p-3 text-sm">
          {([["consentData", "Patient consents to processing of personal and health data for Fit-to-Fly assessment."], ["consentRecords", "Patient consents to retrieval of medical records from hospital systems (HIS/EMR/LIS/PACS)."]] as const).map(([k, label]) => (
            <label key={k} className="flex items-start gap-2">
              <input type="checkbox" className="mt-1 accent-[var(--brand)]" checked={c.request[k]} onChange={(e) => ftf.update(c.id, (d) => { d.request[k] = e.target.checked; if (e.target.checked && !d.request.consentDate) d.request.consentDate = todayISO(); }, { step: 1, action: `${label.slice(0, 40)}… ${e.target.checked ? "granted" : "withdrawn"}` })} />
              <span>{label}</span>
            </label>
          ))}
          {c.request.consentDate && <p className="text-xs text-muted-foreground">Consent recorded {fmtDate(c.request.consentDate)}</p>}
        </div>
      </Section>
      <IdentitySection c={c} />
      <Section title="Workflow status" eyebrow={<>Case <span className="font-mono text-foreground">{c.ref}</span></>}>
        <RetrievalChecklist c={c} />
      </Section>
    </div>
  );
}

function IdentitySection({ c }: { c: FtfCase }) {
  const id = c.identity;
  const regMissing = registrationMissing(c);
  const canVerify = regMissing.length === 0 && !!id.method && id.documentNo.trim() !== "" && id.documentNo.trim().toUpperCase() === c.patient.passportNo.trim().toUpperCase();
  return (
    <Section title="Identity verification" eyebrow="Required before any records are retrieved">
      {id.verifiedAt ? (
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span className="flex items-center gap-2 text-success"><ShieldCheck className="size-4" /> Verified — {id.method} · {id.documentNo} · by {id.verifiedBy} · {fmtDateTime(id.verifiedAt)}</span>
          <Button size="sm" variant="ghost" onClick={() => ftf.update(c.id, (d) => { d.identity.verifiedAt = undefined; d.identity.verifiedBy = undefined; }, { step: 1, action: "Identity verification withdrawn" })}>Withdraw</Button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <Field label="Verification method" required>
            <select className={inputCls} value={id.method} onChange={(e) => ftf.update(c.id, (d) => { d.identity.method = e.target.value as FtfCase["identity"]["method"]; })}>
              <option value="">Select…</option><option>Passport sighted in person</option><option>Passport copy matched to booking</option><option>National ID sighted</option>
            </select>
          </Field>
          <Field label="Document number checked" required hint="Must match the passport number entered above.">
            <input className={inputCls} value={id.documentNo} onChange={(e) => ftf.update(c.id, (d) => { d.identity.documentNo = e.target.value; })} />
          </Field>
          <Button disabled={!canVerify} onClick={() => ftf.update(c.id, (d) => { d.identity.verifiedAt = new Date().toISOString(); d.identity.verifiedBy = currentActor(); }, { step: 1, action: `Identity verified (${id.method})` })}><ShieldCheck /> Mark identity verified</Button>
          {!canVerify && <p className="text-xs text-muted-foreground sm:col-span-3">{regMissing.length ? `Complete registration first: ${regMissing.join(", ")}.` : "Choose a method and enter the document number exactly as on the passport."}</p>}
        </div>
      )}
    </Section>
  );
}

export function RetrievalChecklist({ c }: { c: FtfCase }) {
  const r = retrievalReadiness(c);
  const rows = [
    ...r.checks.map((x) => ({ label: x.label, ok: x.ok, detail: x.ok ? (x.id === "registration" ? fmtDateTime(c.registration.completedAt) : x.id === "identity" ? fmtDateTime(c.identity.verifiedAt) : `Recorded ${fmtDate(c.request.consentDate)}`) : x.action })),
    { label: "Ready for retrieval", ok: r.ok, detail: r.ok ? "All prerequisites met" : `Waiting on: ${r.missing.join(", ")}` },
    { label: "Retrieval completed", ok: !!c.clinical.retrievedAt, detail: c.clinical.retrievedAt ? fmtDateTime(c.clinical.retrievedAt) : "Not yet retrieved" },
  ];
  return (
    <ul className="grid gap-2 text-sm sm:grid-cols-2">
      {rows.map((x) => (
        <li key={x.label} className={`flex items-start gap-2 rounded-md border px-3 py-2 ${x.ok ? "border-success/30 bg-success-soft" : "bg-paper"}`}>
          {x.ok ? <Check className="mt-0.5 size-4 shrink-0 text-success" /> : <Lock className="mt-0.5 size-4 shrink-0 text-muted-foreground" />}
          <span><b>{x.label}</b><br /><span className="text-xs text-muted-foreground">{x.detail}</span></span>
        </li>
      ))}
    </ul>
  );
}

// ---------------- Step 2 ----------------
export function Step2({ c }: StepProps) {
  const set = useSet(c);
  const t = c.travel;
  const flags: string[] = [];
  if (t.departureDate && t.departureDate < todayISO() && c.outcome.traveled === "unknown" && !c.decision.approvedAt) flags.push("Departure date is in the past.");
  if (t.durationHours !== undefined && t.durationHours >= 4) flags.push(`Long-haul segment (${t.durationHours} h) — VTE considerations apply.`);
  if ((t.legs ?? 1) > 1) flags.push("Multi-leg itinerary — check transit assistance.");
  if (t.airlineForm === "MEDIF") flags.push("Airline requires MEDIF — physician section needed at Step 7.");
  return (
    <div className="space-y-5">
      <Section title="Flight itinerary">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Departure date" required><input type="date" className={inputCls} value={t.departureDate} onChange={(e) => set((d) => { d.travel.departureDate = e.target.value; })} /></Field>
          <Field label="Origin" required><input className={inputCls} value={t.origin} onChange={(e) => set((d) => { d.travel.origin = e.target.value; })} /></Field>
          <Field label="Destination" required><input className={inputCls} value={t.destination} onChange={(e) => set((d) => { d.travel.destination = e.target.value; })} /></Field>
          <Field label="Airline" required><input className={inputCls} value={t.airline} onChange={(e) => set((d) => { d.travel.airline = e.target.value; })} /></Field>
          <Field label="Flight number"><input className={inputCls} value={t.flightNumber} onChange={(e) => set((d) => { d.travel.flightNumber = e.target.value; })} /></Field>
          <Field label="Total flight time (hours)" required><input type="number" step="0.1" min="0" className={inputCls} value={t.durationHours ?? ""} onChange={(e) => set((d) => { d.travel.durationHours = e.target.value === "" ? undefined : Number(e.target.value); })} /></Field>
          <Field label="Number of legs"><input type="number" min="1" className={inputCls} value={t.legs ?? 1} onChange={(e) => set((d) => { d.travel.legs = Number(e.target.value) || 1; })} /></Field>
          <div className="sm:col-span-2"><Field label="Itinerary"><input className={inputCls} value={t.itinerary} onChange={(e) => set((d) => { d.travel.itinerary = e.target.value; })} /></Field></div>
        </div>
      </Section>
      <Section title="Airline requirements & assistance">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Airline medical form" required>
            <select className={inputCls} value={t.airlineForm} onChange={(e) => set((d) => { d.travel.airlineForm = e.target.value as FtfCase["travel"]["airlineForm"]; })}>
              <option value="">Select…</option><option>None required</option><option>MEDIF</option><option>Airline-specific form</option>
            </select>
          </Field>
          <div className="flex flex-wrap items-end gap-4 text-sm">
            {(["wheelchair", "oxygen", "extraLegroom", "companion"] as const).map((k) => (
              <label key={k} className="flex items-center gap-2">
                <input type="checkbox" checked={t.assistance[k]} onChange={(e) => set((d) => { d.travel.assistance[k] = e.target.checked; })} />
                {{ wheelchair: "Wheelchair", oxygen: "Oxygen requested", extraLegroom: "Extra legroom", companion: "Companion" }[k]}
              </label>
            ))}
          </div>
          <div className="sm:col-span-2"><Field label="Notes"><textarea rows={2} className={inputCls} value={t.notes} onChange={(e) => set((d) => { d.travel.notes = e.target.value; })} /></Field></div>
        </div>
      </Section>
      {flags.length > 0 && (
        <Section title="Validation flags" eyebrow="Rule-based">
          <ul className="space-y-1 text-sm">{flags.map((f) => <li key={f}>• {f}</li>)}</ul>
        </Section>
      )}
    </div>
  );
}

// ---------------- Step 3 ----------------
const SOURCES = [
  { k: "HIS", d: "Admissions, procedures" },
  { k: "EMR", d: "Clinical notes, discharge summaries" },
  { k: "LIS", d: "Laboratory results" },
  { k: "PACS", d: "Echo, X-ray reports" },
] as const;

export function Step3({ c }: StepProps) {
  const [busy, setBusy] = useState<number>(-1);
  const [note, setNote] = useState("");
  const ready = retrievalReadiness(c);
  const retrieve = async () => {
    if (!ready.ok) { ftf.retrieveRecords(c.id); toast.error(`Retrieval blocked: ${ready.missing.join(", ")}`); return; }
    for (let i = 0; i < SOURCES.length; i++) {
      setBusy(i);
      await new Promise((r) => setTimeout(r, 450));
    }
    setBusy(-1);
    const r = ftf.retrieveRecords(c.id);
    if (!r.ok) { toast.error(r.error ?? "Retrieval blocked"); return; }
    toast.success(r.findings ? `${r.findings} findings retrieved — awaiting physician verification` : "No records found in sources for this patient");
  };
  const extractNote = () => {
    if (!note.trim()) return;
    if (!ready.ok) { toast.error(`Blocked: ${ready.missing.join(", ")}`); return; }
    const doc = { id: uid("d"), title: "Pasted clinical note", source: "EMR" as const, date: todayISO(), text: note };
    const found = extractFindings(doc);
    const res = ftf.update(c.id, (d) => {
      d.clinical.documents.push(doc);
      d.clinical.findings.push(...found);
      d.clinical.retrievedAt ??= new Date().toISOString();
      d.clinical.reviewCompletedAt = undefined;
    }, { step: 3, action: `NLP extraction on pasted note: ${found.length} findings` });
    if (!res.ok) { toast.error(res.error ?? "Blocked"); return; }
    setNote("");
    toast(found.length ? `${found.length} findings extracted — verify them in Step 4` : "Nothing recognised in that note");
  };
  return (
    <div className="space-y-5">
      <Section title="Systems of record" eyebrow={<><SimBadge label="Simulated integration" /> No live hospital connection</>}
        actions={<Button onClick={retrieve} disabled={busy >= 0 || !ready.ok}>{busy >= 0 ? <Loader2 className="animate-spin" /> : <Database />}{c.clinical.retrievedAt ? "Re-retrieve" : "Retrieve records"}</Button>}>
        <div className="grid gap-3 sm:grid-cols-4">
          {SOURCES.map((s, i) => (
            <div key={s.k} className="relative overflow-hidden rounded-lg border bg-paper p-3">
              {busy === i && <span className="absolute inset-y-0 left-0 w-1/3 bg-brand/15 animate-scan" />}
              <div className="font-mono text-sm font-bold">{s.k}</div>
              <div className="text-xs text-muted-foreground">{s.d}</div>
              <div className="mt-2 text-xs">{busy === i ? "Querying…" : c.clinical.retrievedAt ? <span className="text-success">Retrieved</span> : "Not queried"}</div>
            </div>
          ))}
        </div>
        {c.clinical.retrievedAt && <p className="mt-3 text-xs text-muted-foreground">Last retrieval {fmtDateTime(c.clinical.retrievedAt)} · linked to case {c.ref}</p>}
        {!ready.ok && (
          <div className="mt-3 rounded-lg border border-danger/40 bg-danger-soft p-3 text-sm text-danger">
            <div className="flex items-center gap-2 font-semibold"><Lock className="size-4" /> Retrieval blocked until all prerequisites are complete</div>
            <ul className="ml-6 mt-1 list-disc">{ready.checks.filter((x) => !x.ok).map((x) => <li key={x.id}><b>{x.label}:</b> {x.action}</li>)}</ul>
          </div>
        )}
        {c.blockedRetrievals.length > 0 && <p className="mt-2 text-xs text-muted-foreground">{c.blockedRetrievals.length} refused retrieval attempt(s) logged in the audit trail.</p>}
      </Section>

      {c.clinical.retrievedAt && (
        <Section title="Extraction coverage" eyebrow={<><SimBadge label="AI extraction — simulated (rule-based)" /> Missing is never read as normal</>}>
          <ul className="grid gap-2 text-sm sm:grid-cols-3">
            {extractionCoverage(c).map((x) => (
              <li key={x.item} className={`rounded-md border px-3 py-2 ${x.state === "Documented — verified" ? "border-success/30 bg-success-soft" : x.state === "Conflicting information" ? "border-danger/40 bg-danger-soft" : x.state === "Not documented" ? "border-caution/50 bg-caution-soft" : "bg-paper"}`}>
                <b>{x.item}</b><br /><span className="text-xs">{x.state}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {c.clinical.findings.length > 0 && (
        <Section title="Traceable clinical summary" eyebrow="Every item shows its source and date">
          <FindingsTable c={c} findings={c.clinical.findings} />
        </Section>
      )}

      {c.clinical.documents.length > 0 && (
        <Section title="Unstructured documents" eyebrow={<><SimBadge label="Simulated NLP" /> Highlighted text = extracted evidence</>}>
          <div className="space-y-3">
            {c.clinical.documents.map((doc) => (
              <details key={doc.id} className="rounded-lg border bg-paper p-3">
                <summary className="flex cursor-pointer items-center gap-2 text-sm font-semibold"><FileText className="size-4" /> {doc.title} <span className="font-mono text-xs text-muted-foreground">{doc.source} · {fmtDate(doc.date)}</span></summary>
                <Highlighted text={doc.text} spans={c.clinical.findings.filter((f) => f.extraction === "nlp" && f.sourceRef.startsWith(doc.title)).map((f) => f.evidence ?? "")} />
              </details>
            ))}
          </div>
        </Section>
      )}

      <Section title="Add an unstructured note" eyebrow={<SimBadge label="Simulated NLP" />}>
        <textarea rows={4} className={inputCls} placeholder="Paste a referral letter or discharge note, e.g. 'Elective PCI on 2026-11-02. LVEF 50%. Hb 12.1 g/dL. On apixaban 5 mg…'" value={note} onChange={(e) => setNote(e.target.value)} />
        <div className="mt-2 flex justify-end"><Button variant="outline" onClick={extractNote} disabled={!note.trim() || !ready.ok}>Extract findings</Button></div>
      </Section>
    </div>
  );
}

function Highlighted({ text, spans }: { text: string; spans: string[] }) {
  const valid = spans.filter((s) => s && text.includes(s)).sort((a, b) => b.length - a.length);
  if (!valid.length) return <pre className="mt-2 whitespace-pre-wrap font-mono text-xs leading-relaxed">{text}</pre>;
  const re = new RegExp(`(${valid.map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "g");
  return (
    <pre className="mt-2 whitespace-pre-wrap font-mono text-xs leading-relaxed">
      {text.split(re).map((part, i) => (valid.includes(part) ? <mark key={i} className="rounded bg-sim-soft px-0.5 text-sim">{part}</mark> : <span key={i}>{part}</span>))}
    </pre>
  );
}

const REVIEW_CLS: Record<ClinicalFinding["review"], string> = {
  unverified: "text-caution-foreground bg-caution-soft",
  verified: "text-success bg-success-soft",
  corrected: "text-brand bg-brand-soft",
  rejected: "text-muted-foreground bg-muted line-through",
  uncertain: "text-caution-foreground bg-caution-soft",
  not_documented: "text-muted-foreground bg-muted",
};
const REVIEW_LABEL: Record<ClinicalFinding["review"], string> = {
  unverified: "awaiting verification",
  verified: "physician-verified",
  corrected: "physician-edited",
  rejected: "rejected",
  uncertain: "uncertain — not confirmed",
  not_documented: "not documented in source",
};

function FindingsTable({ c, findings, onAction }: { c: FtfCase; findings: ClinicalFinding[]; onAction?: ((f: ClinicalFinding) => React.ReactNode) | undefined }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead><tr className="border-b text-left eyebrow text-muted-foreground"><th className="py-2 pr-3">Finding</th><th className="pr-3">Value</th><th className="pr-3">Source</th><th className="pr-3">Date</th><th className="pr-3">Status</th>{onAction && <th />}</tr></thead>
        <tbody>
          {findings.map((f) => (
            <tr key={f.id} className="border-b align-top last:border-0">
              <td className="py-2 pr-3 font-semibold">{f.label}</td>
              <td className="py-2 pr-3">
                <span className={f.review === "rejected" ? "line-through text-muted-foreground" : ""}>{f.value}{f.unit && ` ${f.unit}`}</span>
                {f.originalValue && <div className="text-xs text-muted-foreground">was: {f.originalValue}</div>}
                {f.extraction === "nlp" && f.evidence && <div className="mt-1 border-l-2 border-sim/50 pl-2 text-xs italic text-muted-foreground">“{f.evidence}”</div>}
                {f.extraction === "nlp" && !quoteSupported(c, f) && <div className="mt-1 text-xs font-semibold text-danger">Quotation not found in source document — unsupported fact</div>}
                {f.reviewNote && <div className="text-xs italic text-muted-foreground">{f.reviewNote}</div>}
              </td>
              <td className="py-2 pr-3 text-xs">
                <div className="font-mono">{f.source}</div>
                <div className="text-muted-foreground">{f.sourceRef}</div>
                {f.extraction === "nlp" && <div className="mt-1 flex items-center gap-1"><SimBadge label={`NLP ${Math.round((f.confidence ?? 0) * 100)}%`} /></div>}
              </td>
              <td className="py-2 pr-3 font-mono text-xs">{fmtDate(f.date)}</td>
              <td className="py-2 pr-3"><span className={`rounded px-1.5 py-0.5 text-xs font-semibold ${REVIEW_CLS[f.review]}`}>{REVIEW_LABEL[f.review]}</span>
                {f.extraction === "nlp" && f.review === "unverified" && <div className="mt-1 max-w-40 text-[10px] font-bold leading-tight text-sim">{AI_PENDING_LABEL}</div>}
                {f.reviewedBy && f.review !== "unverified" && <div className="mt-1 text-[10px] text-muted-foreground">{f.reviewedBy} · {fmtDateTime(f.reviewedAt)}</div>}</td>
              {onAction && <td className="py-2">{onAction(f)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------------- Step 4 ----------------
export function Step4({ c, role }: StepProps) {
  const isDoc = role === "physician";
  const [editing, setEditing] = useState<string | null>(null);
  const [val, setVal] = useState("");
  const [ackNote, setAckNote] = useState<Record<string, string>>({});
  const issues = cdiIssues(c);
  const unverified = c.clinical.findings.filter((f) => f.review === "unverified" || f.review === "uncertain").length;
  const openIssues = issues.filter((i) => !(i.id in c.clinical.cdiAcknowledged));

  if (!c.clinical.retrievedAt) return <Section title="Clinical review"><p className="text-sm text-muted-foreground">Retrieve clinical records in Step 3 first.</p></Section>;

  const review = (f: ClinicalFinding, review: ClinicalFinding["review"], patch: Partial<ClinicalFinding> = {}) =>
    ftf.update(c.id, (d) => {
      const x = d.clinical.findings.find((y) => y.id === f.id)!;
      Object.assign(x, { review, reviewedAt: new Date().toISOString(), reviewedBy: currentActor(), ...patch });
      d.clinical.reviewCompletedAt = undefined;
    }, { step: 4, action: `${f.label} ${review}${patch.value ? ` → ${patch.value}` : ""}` });

  return (
    <div className="space-y-5">
      <Section title="Documentation completeness & consistency" eyebrow={<><SimBadge label="CDI checks · rule-based" /></>}>
        {issues.length === 0 ? <p className="text-sm text-success">No missing or conflicting documentation detected.</p> : (
          <ul className="space-y-2">
            {issues.map((i) => {
              const ack = c.clinical.cdiAcknowledged[i.id];
              return (
                <li key={i.id} className={`rounded-lg border p-3 text-sm ${ack !== undefined ? "bg-muted/60" : i.kind === "conflict" ? "border-danger/40 bg-danger-soft" : "border-caution/50 bg-caution-soft"}`}>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div><span className="mr-2 eyebrow">{i.kind}</span>{i.message}</div>
                    {ack !== undefined && <span className="text-xs text-success">Addressed: {ack || "acknowledged"}</span>}
                  </div>
                  {ack === undefined && isDoc && (
                    <div className="mt-2 flex gap-2">
                      <input className={inputCls} placeholder="Resolution note (e.g. requested from ward, accepted TTE value)" value={ackNote[i.id] ?? ""} onChange={(e) => setAckNote({ ...ackNote, [i.id]: e.target.value })} />
                      <Button size="sm" variant="outline" onClick={() => ftf.update(c.id, (d) => { d.clinical.cdiAcknowledged[i.id] = ackNote[i.id] ?? ""; }, { step: 4, action: `CDI issue addressed: ${i.message.slice(0, 60)}` })}>Address</Button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Section>

      <Section title="Verify extracted findings" eyebrow={`${unverified} awaiting verification`}>
        {!isDoc && <div className="mb-3"><PhysicianOnly>Switch to the physician role to verify, correct or reject findings.</PhysicianOnly></div>}
        <p className="mb-3 text-xs text-muted-foreground">Only physician-verified or physician-edited facts count as confirmed inputs. Unverified and uncertain facts are flagged in the risk indicators and block clearance. AI extraction is assistance only — it is separate from the rule-based assessment and the physician's decision.</p>
        <FindingsTable c={c} findings={c.clinical.findings} onAction={isDoc ? (f) => editing === f.id ? (
          <div className="flex gap-1">
            <input className={`${inputCls} w-28 py-1`} value={val} onChange={(e) => setVal(e.target.value)} />
            <Button size="icon" variant="outline" onClick={() => { review(f, "corrected", { value: val, originalValue: f.originalValue ?? f.value }); setEditing(null); }}><Check /></Button>
          </div>
        ) : (
          <div className="flex gap-1">
            <Button size="icon" variant="ghost" title="Accept" aria-label={`Accept ${f.label}`} disabled={!quoteSupported(c, f)} onClick={() => review(f, "verified")}><Check /></Button>
            <Button size="icon" variant="ghost" title="Edit" aria-label={`Edit ${f.label}`} onClick={() => { setEditing(f.id); setVal(f.value); }}><Pencil /></Button>
            <Button size="icon" variant="ghost" title="Reject" aria-label={`Reject ${f.label}`} onClick={() => review(f, "rejected")}><X /></Button>
            <Button size="icon" variant="ghost" title="Mark uncertain" aria-label={`Mark ${f.label} uncertain`} onClick={() => review(f, "uncertain")}><HelpCircle /></Button>
            <Button size="icon" variant="ghost" title="Mark not documented" aria-label={`Mark ${f.label} not documented`} onClick={() => review(f, "not_documented")}><FileX /></Button>
          </div>
        ) : undefined} />
        <AddManualFinding c={c} disabled={!isDoc} />
      </Section>

      <Section title="Sign off clinical review">
        {c.clinical.reviewCompletedAt ? <p className="text-sm text-success">Signed off by {c.clinical.reviewCompletedBy} · {fmtDateTime(c.clinical.reviewCompletedAt)}</p> : (
          <div className="flex flex-wrap items-center gap-3">
            <Button disabled={!isDoc || unverified > 0 || openIssues.length > 0} onClick={() => ftf.update(c.id, (d) => { d.clinical.reviewCompletedAt = new Date().toISOString(); d.clinical.reviewCompletedBy = currentActor(); }, { step: 4, action: "Clinical review signed off" })}>Sign off verified record</Button>
            {(unverified > 0 || openIssues.length > 0) && <span className="text-xs text-muted-foreground">Verify all findings and address all issues first.</span>}
          </div>
        )}
      </Section>
    </div>
  );
}

function AddManualFinding({ c, disabled }: { c: FtfCase; disabled: boolean }) {
  const [key, setKey] = useState<ClinicalFinding["key"]>("cxr");
  const [value, setValue] = useState("");
  const LABELS: Partial<Record<ClinicalFinding["key"], string>> = { procedure_type: "Procedure", procedure_date: "Procedure date (yyyy-mm-dd)", lvef: "LVEF (%)", ecg: "ECG", hb: "Haemoglobin (g/dL)", inr: "INR", cxr: "Chest X-ray", anticoagulant: "Anticoagulant", antiplatelet: "Antiplatelet", complication: "Complication", comorbidity: "Comorbidity", diagnosis: "Diagnosis" };
  return (
    <div className="mt-4 flex flex-wrap items-end gap-2 border-t pt-4">
      <Field label="Add finding manually"><select className={inputCls} value={key} onChange={(e) => setKey(e.target.value as ClinicalFinding["key"])} disabled={disabled}>{Object.entries(LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
      <div className="min-w-48 flex-1"><Field label="Value"><input className={inputCls} value={value} onChange={(e) => setValue(e.target.value)} disabled={disabled} /></Field></div>
      <Button variant="outline" disabled={disabled || !value.trim()} onClick={() => {
        ftf.update(c.id, (d) => { d.clinical.findings.push({ id: uid("f"), key, label: (LABELS[key] ?? key).replace(/ \(.*\)/, ""), value: value.trim(), unit: key === "lvef" ? "%" : key === "hb" ? "g/dL" : undefined, date: todayISO(), source: "Physician", sourceRef: "Entered during clinical review", extraction: "manual", review: "verified", reviewedAt: new Date().toISOString(), reviewedBy: currentActor() }); d.clinical.reviewCompletedAt = undefined; }, { step: 4, action: `Manual finding added: ${key} = ${value}` });
        setValue("");
      }}>Add</Button>
    </div>
  );
}
