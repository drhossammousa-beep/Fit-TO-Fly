// SIMULATED clinical NLP. Pattern-based extraction that stands in for a validated clinical NLP
// service. Every output is "unverified" and must be reviewed by a clinician in Step 4.
import type { ClinicalDocument, ClinicalFinding, FindingKey, Vitals } from "./types";
import { uid } from "./dates";

type Draft = Omit<ClinicalFinding, "id" | "review">;

const PROCEDURES: { re: RegExp; value: string }[] = [
  { re: /\b(CABG|coronary artery bypass graft(?:ing)?)\b/i, value: "CABG" },
  { re: /\b(aortic valve replacement|mitral valve (?:repair|replacement)|AVR|MVR)\b/i, value: "Open valve surgery" },
  { re: /\b(TAVI|TAVR|transcatheter aortic valve)\b/i, value: "TAVI" },
  { re: /\b(primary PCI|primary angioplasty)\b/i, value: "Primary PCI (STEMI)" },
  { re: /\b(pacemaker|ICD|defibrillator) (?:implant|insertion)/i, value: "Pacemaker / ICD implant" },
  { re: /\b(catheter )?ablation\b/i, value: "Catheter ablation" },
  { re: /\b(elective PCI|PCI|drug[- ]eluting stent|DES)\b/i, value: "Elective PCI" },
];

const ANTICOAG = /\b(apixaban|rivaroxaban|edoxaban|dabigatran|warfarin|enoxaparin)\b[^.;\n]{0,30}/gi;
const ANTIPLATELET = /\b(aspirin|clopidogrel|ticagrelor|prasugrel)\b[^.;\n]{0,25}/gi;
const COMPLICATIONS = [
  /post[- ]?op(?:erative)? atrial fibrillation[^.;,\n]{0,40}/i,
  /pleural effusion[^.;,\n]{0,40}/i,
  /pneumothorax[^.;\n]{0,50}/i,
  /pericardial effusion[^.;,\n]{0,40}/i,
  /wound infection[^.;,\n]{0,40}/i,
  /access[- ]site ha?ematoma[^.;,\n]{0,40}/i,
  /acute kidney injury[^.;,\n]{0,40}/i,
];
const COMORBID = /\b(type 2 diabetes|diabetes mellitus|hypertension|COPD|chronic kidney disease|obesity|asthma|hyperlipidaemia|dyslipidemia)\b/gi;

function negated(text: string, index: number): boolean {
  const before = text.slice(Math.max(0, index - 22), index).toLowerCase();
  return /\b(no|without|negative for|denies|ruled out)\b[^.]*$/.test(before);
}

function base(doc: ClinicalDocument, key: FindingKey, label: string, value: string | undefined, evidence: string | undefined, confidence: number, unit?: string): Draft {
  return {
    key,
    label,
    value: value ?? "",
    ...(unit ? { unit } : {}),
    date: doc.date,
    source: "Clinical note (NLP)",
    sourceRef: `${doc.title} (${doc.source}, ${doc.date})`,
    extraction: "nlp",
    evidence: (evidence ?? "").trim(),
    confidence,
    sourceDocId: doc.id,
    aiValue: value ?? "",
  };
}

export function extractFromDocument(doc: ClinicalDocument): Draft[] {
  const t = doc.text;
  const out: Draft[] = [];

  const ef = t.match(/\b(LVEF|EF|ejection fraction)\b[^0-9%]{0,25}(\d{2})(?:\s*[-–]\s*(\d{2}))?\s*%/i);
  if (ef) {
    const v = ef[3] ? Math.round((Number(ef[2]) + Number(ef[3])) / 2) : Number(ef[2]);
    out.push(base(doc, "lvef", "LVEF", String(v), ef[0], 0.92, "%"));
  }

  for (const p of PROCEDURES) {
    const m = t.match(p.re);
    if (m && m.index !== undefined && !negated(t, m.index)) {
      out.push(base(doc, "procedure_type", "Procedure", p.value, t.slice(m.index, m.index + 70).split(/[.\n]/)[0], 0.8));
      const near = t.slice(m.index, m.index + 120).match(/(\d{4}-\d{2}-\d{2})/);
      if (near) out.push(base(doc, "procedure_date", "Procedure date", near[1], t.slice(m.index, m.index + 120).split("\n")[0], 0.74));
      break;
    }
  }

  const hb = t.match(/\b(Hb|ha?emoglobin)\b[^0-9]{0,12}(\d{1,2}(?:\.\d)?)\s*g\/dL/i);
  if (hb) out.push(base(doc, "hb", "Haemoglobin", hb[2], hb[0], 0.9, "g/dL"));

  const inr = t.match(/\bINR\b[^0-9]{0,8}(\d(?:\.\d{1,2})?)/i);
  if (inr) out.push(base(doc, "inr", "INR", inr[1], inr[0], 0.88));

  const nyha = t.match(/\bNYHA(?: class)?\s*(IV|III|II|I|[1-4])\b/i);
  if (nyha) {
    const map: Record<string, string> = { I: "1", II: "2", III: "3", IV: "4" };
    out.push(base(doc, "nyha", "NYHA class", map[nyha[1]!.toUpperCase()] ?? nyha[1], nyha[0], 0.85));
  }

  const rhythm = t.match(/\bECG\b[^.\n]{0,60}?\b(sinus rhythm|atrial fibrillation|atrial flutter|paced rhythm)\b[^.;\n]{0,30}/i);
  if (rhythm) {
    const at = rhythm[0].toLowerCase().indexOf(rhythm[1]!.toLowerCase());
    const value = rhythm[0].slice(at).replace(/\s+/g, " ").trim();
    out.push(base(doc, "ecg", "ECG", value.replace(/^./, (ch) => ch.toUpperCase()), rhythm[0], 0.8));
  }

  for (const m of t.matchAll(ANTICOAG)) {
    if (m.index !== undefined && !negated(t, m.index)) out.push(base(doc, "anticoagulant", "Anticoagulant", m[0].trim(), m[0], 0.86));
  }
  for (const m of t.matchAll(ANTIPLATELET)) {
    if (m.index !== undefined && !negated(t, m.index)) out.push(base(doc, "antiplatelet", "Antiplatelet", m[0].trim(), m[0], 0.86));
  }
  for (const re of COMPLICATIONS) {
    const m = t.match(re);
    if (m && m.index !== undefined && !negated(t, m.index)) {
      const value = m[0].trim().replace(/^./, (c) => c.toUpperCase());
      out.push(base(doc, "complication", "Complication", value, m[0], 0.72));
    }
  }
  // documented symptoms — negated mentions are kept as documented NEGATIVES, never dropped
  for (const m of t.matchAll(/\b(chest pain|palpitations|syncope|breathlessness|dyspno?ea)\b/gi)) {
    if (m.index === undefined) continue;
    const name = m[1]!.toLowerCase();
    const neg = negated(t, m.index);
    const line = t.slice(t.lastIndexOf("\n", m.index) + 1, t.indexOf("\n", m.index) === -1 ? undefined : t.indexOf("\n", m.index));
    out.push(base(doc, "symptom", "Documented symptom", `${name.replace(/^./, (ch) => ch.toUpperCase())} — ${neg ? "documented absent" : "documented present"}`, line, 0.7));
  }
  const fu = t.match(/\b(?:follow[- ]up|review)\b[^.\n]{3,90}/i);
  if (fu) out.push(base(doc, "follow_up", "Follow-up recommendation", fu[0].trim().replace(/^./, (ch) => ch.toUpperCase()), fu[0], 0.7));

  const seen = new Set<string>();
  for (const m of t.matchAll(COMORBID)) {
    const v = m[1]!.toLowerCase();
    if (seen.has(v) || (m.index !== undefined && negated(t, m.index))) continue;
    seen.add(v);
    out.push(base(doc, "comorbidity", "Comorbidity", m[1]!.replace(/^./, (c) => c.toUpperCase()), m[0], 0.8));
  }
  return out;
}

export function extractFindings(doc: ClinicalDocument): ClinicalFinding[] {
  return extractFromDocument(doc).map((d) => ({ ...d, id: uid("f"), review: "unverified" as const }));
}

/** SIMULATED documentation assistant: suggests vitals from free dictation. */
export function suggestVitalsFromDictation(text: string): Partial<Vitals> {
  const v: Partial<Vitals> = {};
  const bp = text.match(/\b(?:BP|blood pressure)\D{0,6}(\d{2,3})\s*(?:\/|over)\s*(\d{2,3})/i);
  if (bp) {
    v.sbp = Number(bp[1]);
    v.dbp = Number(bp[2]);
  }
  const hr = text.match(/\b(?:HR|heart rate|pulse)\D{0,6}(\d{2,3})/i);
  if (hr) v.hr = Number(hr[1]);
  const sp = text.match(/\b(?:SpO2|sats?|saturation|oxygen saturation)\D{0,10}(\d{2,3})/i);
  if (sp) v.spo2 = Number(sp[1]);
  const rr = text.match(/\b(?:RR|resp(?:iratory)? rate)\D{0,6}(\d{1,2})/i);
  if (rr) v.rr = Number(rr[1]);
  const temp = text.match(/\b(?:temp(?:erature)?)\D{0,6}(\d{2}(?:\.\d)?)/i);
  if (temp) v.temp = Number(temp[1]);
  return v;
}

/** Rule-based screening of free-text follow-up feedback for concerning phrases. */
const CONCERN = /\b(chest pain|tight(?:ness)?|breathless|short of breath|can'?t breathe|swollen|swelling|bleed(?:ing)?|faint(?:ed)?|dizzy|palpitations?|hospital|emergency|A&E|ER)\b/gi;
export function concerningPhrases(text: string): string[] {
  return Array.from(new Set(Array.from(text.matchAll(CONCERN)).map((m) => m[0].toLowerCase())));
}
