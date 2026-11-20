// Demonstration clinical rule set (v0.1-demo). Derived from published fitness-to-fly guidance
// for cardiology (BCS 2010, UK CAA medical guidance, BTS air-travel guidance) purely for
// prototype purposes. It must be approved by hospital clinical governance before any real use.
// These rules produce RISK INDICATORS only — they never decide fitness to fly.
import type { ClinicalFinding, FindingKey, FtfCase } from "./types";
import { addDays, daysBetween, isISODate } from "./dates";

export const RULESET_VERSION = "v0.1-demo";

export type Severity = "info" | "caution" | "high";

export interface RiskIndicator {
  id: string;
  title: string;
  severity: Severity;
  rationale: string;
  guidance: string;
  basedOn: string[];
  /** True when any input datum has not been clinician-verified. */
  usesUnverifiedData: boolean;
  /** Indicative earliest date from this rule (never a decision). */
  indicativeDate?: string | undefined;
  suggestion?: string | undefined;
}

// ---------- finding helpers ----------

export function activeFindings(c: FtfCase, key: FindingKey): ClinicalFinding[] {
  return c.clinical.findings.filter((f) => f.key === key && f.review !== "rejected" && f.review !== "not_documented");
}

/** Best single value: clinician-verified/corrected first, then most recent. */
export function bestFinding(c: FtfCase, key: FindingKey): ClinicalFinding | undefined {
  const list = activeFindings(c, key);
  if (!list.length) return undefined;
  const rank = (f: ClinicalFinding) => (f.review === "verified" || f.review === "corrected" ? 1 : 0);
  return [...list].sort((a, b) => rank(b) - rank(a) || (b.date ?? "").localeCompare(a.date ?? ""))[0];
}

const isVerified = (f?: ClinicalFinding) => !!f && (f.review === "verified" || f.review === "corrected");
const num = (f?: ClinicalFinding) => (f ? Number.parseFloat(f.value) : Number.NaN);

// ---------- procedure intervals ----------

export const PROCEDURE_TYPES = [
  "Elective PCI",
  "Primary PCI (STEMI)",
  "ACS – medical management",
  "CABG",
  "Open valve surgery",
  "TAVI",
  "Pacemaker / ICD implant",
  "Catheter ablation",
  "Diagnostic angiography",
  "Heart failure admission",
] as const;

export const CARDIAC_SURGERY = ["CABG", "Open valve surgery"];

interface IntervalResult {
  days: number | null;
  basis: string;
  guidance: string;
}

/** Minimum indicative interval (days) between procedure and flight. null = no fixed interval. */
export function minimumInterval(procedure: string, lvef: number | undefined, hasComplication: boolean): IntervalResult {
  switch (procedure) {
    case "Elective PCI":
      return { days: 2, basis: "Uncomplicated elective PCI", guidance: "BCS 2010 fitness-to-fly" };
    case "Primary PCI (STEMI)":
    case "ACS – medical management": {
      if (lvef !== undefined && lvef < 40)
        return { days: null, basis: "High-risk ACS (LVEF < 40%) — defer until stabilised", guidance: "BCS 2010 ACS risk tiers" };
      if (lvef !== undefined && lvef >= 45 && !hasComplication)
        return { days: 3, basis: "Low-risk ACS (LVEF ≥ 45%, no complications)", guidance: "BCS 2010 ACS risk tiers" };
      return { days: 10, basis: "Medium-risk ACS (LVEF 40–44% or complications / LVEF unknown)", guidance: "BCS 2010 ACS risk tiers" };
    }
    case "CABG":
    case "Open valve surgery":
      return { days: 10, basis: "Open chest surgery — risk of retained intrathoracic air", guidance: "BCS 2010 / UK CAA" };
    case "TAVI":
      return { days: 5, basis: "No specific published interval — local protocol placeholder", guidance: "Local protocol (to be approved)" };
    case "Pacemaker / ICD implant":
      return { days: 2, basis: "Device implant, pneumothorax excluded", guidance: "BCS 2010 fitness-to-fly" };
    case "Catheter ablation":
      return { days: 2, basis: "Uncomplicated ablation", guidance: "BCS 2010 fitness-to-fly" };
    case "Diagnostic angiography":
      return { days: 1, basis: "Diagnostic catheterisation", guidance: "Local protocol (to be approved)" };
    default:
      return { days: null, basis: "No fixed interval — assess clinical stability", guidance: "BCS 2010 heart failure" };
  }
}

// ---------- CDI / completeness (Step 4) ----------

export interface CdiIssue {
  id: string;
  kind: "missing" | "conflict" | "stale" | "unverified";
  message: string;
}

export function cdiIssues(c: FtfCase): CdiIssue[] {
  const issues: CdiIssue[] = [];
  const proc = bestFinding(c, "procedure_type")?.value;

  // conflicts between sources
  const lvefs = activeFindings(c, "lvef");
  const lvVals = lvefs.map((f) => Number.parseFloat(f.value)).filter((n) => !Number.isNaN(n));
  if (lvVals.length > 1 && Math.max(...lvVals) - Math.min(...lvVals) >= 5) {
    issues.push({
      id: "conflict-lvef",
      kind: "conflict",
      message: `LVEF differs between sources (${lvefs.map((f) => `${f.value}% — ${f.source}`).join(" vs ")}). Confirm the current value.`,
    });
  }
  for (const key of ["procedure_type", "procedure_date"] as FindingKey[]) {
    const vals = Array.from(new Set(activeFindings(c, key).map((f) => f.value)));
    if (vals.length > 1) issues.push({ id: `conflict-${key}`, kind: "conflict", message: `${key === "procedure_type" ? "Procedure" : "Procedure date"} conflicts between sources: ${vals.join(" vs ")}.` });
  }

  // missing documentation
  if (!proc) issues.push({ id: "missing-procedure", kind: "missing", message: "Procedure type not documented." });
  if (!bestFinding(c, "procedure_date")) issues.push({ id: "missing-procedure-date", kind: "missing", message: "Procedure date not documented — recovery interval cannot be calculated." });
  if (!bestFinding(c, "lvef")) issues.push({ id: "missing-lvef", kind: "missing", message: "No LVEF / echocardiogram result found." });
  if (!bestFinding(c, "ecg")) issues.push({ id: "missing-ecg", kind: "missing", message: "No post-procedure ECG found." });
  if (!bestFinding(c, "hb")) issues.push({ id: "missing-hb", kind: "missing", message: "No recent haemoglobin result." });
  const anticoag = activeFindings(c, "anticoagulant").map((f) => f.value.toLowerCase());
  if (anticoag.some((v) => v.includes("warfarin")) && !bestFinding(c, "inr"))
    issues.push({ id: "missing-inr", kind: "missing", message: "Patient on warfarin but no INR result found." });
  if (proc && (CARDIAC_SURGERY.includes(proc) || proc === "Pacemaker / ICD implant") && !bestFinding(c, "cxr"))
    issues.push({ id: "missing-cxr", kind: "missing", message: "No post-procedure chest X-ray to exclude pneumothorax / effusion." });

  // stale labs
  const hb = bestFinding(c, "hb");
  if (hb?.date && isISODate(c.travel.departureDate) && daysBetween(hb.date, c.travel.departureDate) > 14)
    issues.push({ id: "stale-hb", kind: "stale", message: `Haemoglobin is ${daysBetween(hb.date, c.travel.departureDate)} days old at departure.` });

  return issues;
}

// ---------- Risk indicators (Step 6) ----------

export function riskIndicators(c: FtfCase): RiskIndicator[] {
  const out: RiskIndicator[] = [];
  const dep = c.travel.departureDate;
  const procF = bestFinding(c, "procedure_type");
  const dateF = bestFinding(c, "procedure_date");
  const lvefF = bestFinding(c, "lvef");
  const lvef = Number.isNaN(num(lvefF)) ? undefined : num(lvefF);
  const complications = activeFindings(c, "complication");
  const activeComplications = complications.filter((f) => !/resolved/i.test(f.value));

  // R1 recovery interval
  if (procF && dateF && isISODate(dateF.value)) {
    const iv = minimumInterval(procF.value, lvef, activeComplications.length > 0);
    const unverified = !isVerified(procF) || !isVerified(dateF) || (lvefF ? !isVerified(lvefF) : false);
    if (iv.days === null) {
      out.push({
        id: "R1-interval",
        title: "Recovery interval: no fixed minimum applies",
        severity: "high",
        rationale: iv.basis,
        guidance: iv.guidance,
        basedOn: ["Procedure", "Procedure date", "LVEF"],
        usesUnverifiedData: unverified,
        suggestion: "Physician to judge clinical stability; consider deferral.",
      });
    } else {
      const earliest = addDays(dateF.value, iv.days);
      const atDep = isISODate(dep) ? daysBetween(dateF.value, dep) : undefined;
      const ok = atDep !== undefined && atDep >= iv.days;
      out.push({
        id: "R1-interval",
        title: ok
          ? `Recovery interval met (${atDep} days post-procedure at departure; indicative minimum ${iv.days})`
          : atDep === undefined
            ? `Indicative minimum interval: ${iv.days} days`
            : `Departure is ${atDep} days post-procedure — below indicative minimum of ${iv.days} days`,
        severity: ok ? "info" : atDep === undefined ? "caution" : "high",
        rationale: iv.basis,
        guidance: iv.guidance,
        basedOn: ["Procedure", "Procedure date", ...(lvefF ? ["LVEF"] : []), "Departure date"],
        usesUnverifiedData: unverified,
        indicativeDate: earliest,
      });
    }
  }

  // R2 LV function
  if (lvef !== undefined) {
    if (lvef < 30)
      out.push(ind("R2-lvef", "Severely reduced LV function", "high", `LVEF ${lvef}% (< 30%).`, "BCS 2010 heart failure", ["LVEF"], lvefF, "Consider in-flight oxygen and specialist review."));
    else if (lvef < 40)
      out.push(ind("R2-lvef", "Reduced LV function", "caution", `LVEF ${lvef}% (< 40%).`, "BCS 2010", ["LVEF"], lvefF));
  }

  // R3 oxygenation
  const spo2 = c.exam.vitals.spo2;
  if (spo2 !== undefined) {
    if (spo2 < 92)
      out.push(ind("R3-spo2", "Resting SpO₂ below 92%", "high", `SpO₂ ${spo2}% on room air.`, "BTS air-travel guidance", ["Exam: SpO₂"], undefined, "In-flight oxygen likely required; further assessment advised.", !c.exam.signedAt));
    else if (spo2 < 95)
      out.push(ind("R3-spo2", "Borderline resting SpO₂", "caution", `SpO₂ ${spo2}% with cardiac disease.`, "BTS air-travel guidance", ["Exam: SpO₂"], undefined, "Consider hypoxic challenge test or in-flight oxygen.", !c.exam.signedAt));
  }

  // R4 NYHA
  const nyha = c.exam.nyha ?? (bestFinding(c, "nyha") ? Number(bestFinding(c, "nyha")!.value) : undefined);
  if (nyha === 4) out.push(ind("R4-nyha", "NYHA class IV symptoms", "high", "Symptoms at rest.", "BCS 2010 heart failure", ["NYHA"], undefined, "Air travel generally not advised; if essential, oxygen and medical escort.", !c.exam.signedAt));
  else if (nyha === 3) out.push(ind("R4-nyha", "NYHA class III symptoms", "caution", "Symptoms on minimal exertion.", "BCS 2010 heart failure", ["NYHA"], undefined, "Consider in-flight oxygen and airport assistance.", !c.exam.signedAt));

  // R5 red-flag symptoms
  const s = c.exam.symptoms;
  const red = [s.chestPain && "chest pain", s.dyspneaRest && "breathlessness at rest", s.syncope && "syncope", s.fever && "fever"].filter(Boolean) as string[];
  if (red.length)
    out.push(ind("R5-symptoms", "Red-flag symptoms on examination", "high", `Reported: ${red.join(", ")}.`, "General aviation medicine principles", ["Exam: symptoms"], undefined, "Investigate before travel.", !c.exam.signedAt));

  // R6 rhythm
  const ecg = bestFinding(c, "ecg");
  const hr = c.exam.vitals.hr;
  if (ecg && /fibrillation|flutter/i.test(ecg.value) && hr !== undefined && hr > 110)
    out.push(ind("R6-rhythm", "Atrial arrhythmia with uncontrolled rate", "caution", `${ecg.value}; HR ${hr} bpm.`, "BCS 2010 arrhythmia", ["ECG", "Exam: HR"], ecg, "Optimise rate control before travel."));
  else if (hr !== undefined && hr > 120)
    out.push(ind("R6-rhythm", "Resting tachycardia", "caution", `HR ${hr} bpm.`, "General principles", ["Exam: HR"], undefined, undefined, !c.exam.signedAt));

  // R7 pneumothorax
  for (const f of complications.filter((x) => /pneumothorax/i.test(x.value) && !/\b(no|without)\s+pneumothorax/i.test(x.value))) {
    if (/resolved/i.test(f.value))
      out.push(ind("R7-ptx", "Pneumothorax reported as resolved", "caution", f.value, "BTS air-travel guidance", ["Complication"], f, "Confirm ≥ 7 days since radiographic resolution."));
    else out.push(ind("R7-ptx", "Pneumothorax — not documented as resolved", "high", f.value, "BTS / UK CAA", ["Complication"], f, "Air travel contraindicated until radiographic resolution."));
  }
  const proc = procF?.value;
  if (proc && (CARDIAC_SURGERY.includes(proc) || proc === "Pacemaker / ICD implant") && !bestFinding(c, "cxr"))
    out.push(ind("R7-cxr", "No post-procedure chest X-ray on file", "caution", "Pneumothorax / effusion not excluded.", "BCS 2010", ["Procedure", "CXR"], procF));

  // R8 anaemia
  const hbF = bestFinding(c, "hb");
  const hb = num(hbF);
  if (!Number.isNaN(hb)) {
    if (hb < 7.5) out.push(ind("R8-hb", "Severe anaemia", "high", `Hb ${hb} g/dL.`, "UK CAA", ["Haemoglobin"], hbF));
    else if (hb < 8.5) out.push(ind("R8-hb", "Anaemia below 8.5 g/dL", "caution", `Hb ${hb} g/dL.`, "UK CAA", ["Haemoglobin"], hbF, "Consider correction or in-flight oxygen."));
    else if (hb < 10) out.push(ind("R8-hb", "Mild anaemia with cardiac disease", "info", `Hb ${hb} g/dL.`, "UK CAA", ["Haemoglobin"], hbF));
  }

  // R9 VTE
  const hours = c.travel.durationHours;
  const recentSurgery = dateF && isISODate(dateF.value) && isISODate(dep) && daysBetween(dateF.value, dep) <= 28;
  if (hours !== undefined && hours >= 4 && recentSurgery) {
    const onAC = activeFindings(c, "anticoagulant").length > 0;
    out.push(ind(
      "R9-vte",
      onAC ? "Long-haul flight after recent procedure — anticoagulated" : "VTE risk: long-haul flight within 4 weeks of procedure",
      onAC ? "info" : "caution",
      `${hours} h flight, ${daysBetween(dateF!.value, dep)} days post-procedure.`,
      "NICE / ASH travel-related VTE guidance",
      ["Flight duration", "Procedure date", "Anticoagulant"],
      dateF,
      onAC ? "Confirm anticoagulant doses timed across time zones." : "Assess thromboprophylaxis; compression stockings; aisle seat and mobilisation.",
    ));
  }

  // R10 anticoagulation control
  const ac = activeFindings(c, "anticoagulant");
  if (ac.some((f) => /warfarin/i.test(f.value))) {
    const inrF = bestFinding(c, "inr");
    const inr = num(inrF);
    if (Number.isNaN(inr)) out.push(ind("R10-inr", "Warfarin without recent INR", "caution", "INR not available.", "Local anticoagulation protocol", ["Anticoagulant", "INR"], ac[0]));
    else if (inr < 2 || inr > 3.5) out.push(ind("R10-inr", "INR outside therapeutic range", "caution", `INR ${inr}.`, "Local anticoagulation protocol", ["INR"], inrF));
  }

  // R11 blood pressure
  const sbp = c.exam.vitals.sbp;
  if (sbp !== undefined) {
    if (sbp >= 180) out.push(ind("R11-bp", "Severely raised blood pressure", "caution", `SBP ${sbp} mmHg.`, "General principles", ["Exam: BP"], undefined, undefined, !c.exam.signedAt));
    else if (sbp < 90) out.push(ind("R11-bp", "Hypotension", "high", `SBP ${sbp} mmHg.`, "General principles", ["Exam: BP"], undefined, undefined, !c.exam.signedAt));
  }

  // R12 wound / active complications
  if (s.woundConcern) out.push(ind("R12-wound", "Wound concern on examination", "caution", "Wound issue documented.", "General surgical principles", ["Exam"], undefined, "Review before travel.", !c.exam.signedAt));
  for (const f of activeComplications.filter((x) => !/pneumothorax/i.test(x.value)))
    out.push(ind(`R12-${f.id}`, "Active post-procedure complication", "caution", f.value, "Clinical judgement", ["Complication"], f));

  // R13 itinerary
  if ((c.travel.legs ?? 1) > 1) out.push(ind("R13-legs", "Multi-leg itinerary", "info", `${c.travel.legs} flight legs.`, "Travel medicine practice", ["Itinerary"], undefined, "Plan medication timing and assistance at transit airports.", false));

  return out;
}

function ind(
  id: string,
  title: string,
  severity: Severity,
  rationale: string,
  guidance: string,
  basedOn: string[],
  finding?: ClinicalFinding,
  suggestion?: string,
  unverifiedOverride?: boolean,
): RiskIndicator {
  return {
    id,
    title,
    severity,
    rationale,
    guidance,
    basedOn,
    suggestion,
    usesUnverifiedData: unverifiedOverride ?? (finding ? !isVerified(finding) : false),
  };
}

export function severityCounts(list: RiskIndicator[]) {
  return {
    high: list.filter((r) => r.severity === "high").length,
    caution: list.filter((r) => r.severity === "caution").length,
    info: list.filter((r) => r.severity === "info").length,
  };
}
