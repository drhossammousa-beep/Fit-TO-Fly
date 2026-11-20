import type { FtfCase } from "./types";
import { bestFinding, CARDIAC_SURGERY, activeFindings } from "./rules";

export const CONDITION_OPTIONS = [
  "In-flight supplemental oxygen (2 L/min)",
  "Wheelchair assistance at airports",
  "Travel with a companion",
  "Aisle seat; walk every 1–2 hours",
  "Graduated compression stockings",
  "Carry all medication in hand luggage",
  "Do not lift heavy luggage (sternal precautions)",
  "Carry device ID card for security screening",
  "Repeat assessment if symptoms change before departure",
];

export interface EducationTopic {
  id: string;
  title: string;
  body: string;
}

export function educationTopics(c: FtfCase): EducationTopic[] {
  const proc = bestFinding(c, "procedure_type")?.value ?? "";
  const topics: EducationTopic[] = [
    { id: "warning", title: "Warning signs during or after travel", body: "Seek urgent help for chest pain, severe breathlessness, fainting, palpitations, or calf pain and swelling." },
    { id: "meds", title: "Medication in hand luggage", body: "Keep all medicines and a medication list with you. Take doses at your usual interval and adjust to local time with your doctor's plan." },
    { id: "vte", title: "Preventing blood clots", body: "Drink water, avoid alcohol and sleeping tablets, flex your ankles regularly and walk the aisle when safe." },
  ];
  if (CARDIAC_SURGERY.includes(proc))
    topics.push({ id: "sternal", title: "Protecting your chest wound", body: "Do not lift, push or pull more than 4–5 kg for six weeks. Ask staff to lift luggage. Keep the wound dry and check it daily." });
  if (proc.includes("PCI") || proc === "Diagnostic angiography")
    topics.push({ id: "access", title: "Catheter access site", body: "Avoid strain on the wrist or groin used for the procedure. Report swelling, bleeding or numbness." });
  if (proc === "Pacemaker / ICD implant")
    topics.push({ id: "device", title: "Your heart device and security", body: "Show your device card at security. Walk-through scanners are usually safe; avoid hand-held wands held over the device." });
  if (activeFindings(c, "antiplatelet").length || activeFindings(c, "anticoagulant").length)
    topics.push({ id: "antithrombotic", title: "Blood-thinning medicines", body: "Do not stop your blood thinners or antiplatelet tablets. Missing doses can be dangerous after heart procedures." });
  if (c.decision.conditions.some((x) => x.includes("oxygen")))
    topics.push({ id: "oxygen", title: "Oxygen on board", body: "Your airline must arrange approved in-flight oxygen in advance. Personal cylinders are usually not allowed." });
  return topics;
}

/** Contextual examination prompts (Step 5). */
export function examPrompts(c: FtfCase): string[] {
  const proc = bestFinding(c, "procedure_type")?.value ?? "";
  const p: string[] = ["Ask about chest pain, breathlessness and palpitations since discharge.", "Record resting SpO₂ on room air."];
  if (CARDIAC_SURGERY.includes(proc)) p.push("Inspect sternotomy wound and harvest sites.", "Auscultate for pericardial rub and reduced basal air entry (effusion).");
  if (proc.includes("PCI") || proc === "Diagnostic angiography") p.push("Check vascular access site for haematoma or bruit.");
  if (proc === "Pacemaker / ICD implant") p.push("Inspect device pocket; confirm post-implant CXR excludes pneumothorax.");
  if (bestFinding(c, "ecg") && /fibrillation|flutter/i.test(bestFinding(c, "ecg")!.value)) p.push("Assess rate control (resting HR).");
  if (activeFindings(c, "anticoagulant").length) p.push("Look for bleeding signs; confirm adherence to anticoagulant.");
  p.push("Assess for calf tenderness or swelling.");
  return p;
}
