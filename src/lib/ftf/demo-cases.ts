// SYNTHETIC demonstration cases. All names, identifiers and clinical data are fictional.
import type { ClinicalFinding, FtfCase, SourceRecords } from "./types";
import { addDays, todayISO, uid } from "./dates";
import { blankCase, retrieveFromSources, USERS } from "./factory";
import { issueCertificate } from "./workflow";

type S = SourceRecords["structured"][number];
const s = (key: S["key"], label: string, value: string, source: S["source"], sourceRef: string, date: string, unit?: string): S => ({
  key, label, value, source, sourceRef, date, unit,
});

const DOC = USERS.physician.name;
const COORD = USERS.coordinator.name;

function stamp(dayIso: string, hour = 10): string {
  return new Date(`${dayIso}T${String(hour).padStart(2, "0")}:15:00`).toISOString();
}

function reviewAll(findings: ClinicalFinding[], at: string, overrides: (f: ClinicalFinding) => Partial<ClinicalFinding> | undefined = () => undefined) {
  return findings.map((f) => ({ ...f, review: "verified" as const, reviewedBy: DOC, reviewedAt: at, ...overrides(f) }));
}

export function buildDemoCases(today = todayISO()): FtfCase[] {
  const T = (n: number) => addDays(today, n);
  const year = Number(today.slice(0, 4));
  const ref = (n: number) => `FTF-${year}-${String(n).padStart(4, "0")}`;

  // ---------- Case A: Elective PCI, travelled, escalation open ----------
  const a = blankCase(ref(141));
  a.demo = true;
  a.createdAt = stamp(T(-23));
  a.patient = { fullName: "Joseph Mwangi Kamau", dob: "1965-03-14", sex: "Male", nationality: "Kenyan", passportNo: "AK0417723", mrn: "CMC-0098812", language: "English, Swahili", phone: "+254 712 555 019", email: "j.kamau@example.com" };
  a.request = { requestDate: T(-23), requestedBy: "Medical facilitator", reason: "Return home after elective coronary stenting.", consentData: true, consentRecords: true, consentDate: T(-23) };
  a.travel = { ...a.travel, departureDate: T(-18), origin: "Cairo (CAI)", destination: "Nairobi (NBO)", airline: "Kenya Airways", flightNumber: "KQ 311", durationHours: 4.7, legs: 1, itinerary: "CAI → NBO direct", airlineForm: "None required", assistance: { wheelchair: false, oxygen: false, extraLegroom: true, companion: true }, notes: "Travelling with spouse." };
  a.sourceRecords = {
    structured: [
      s("diagnosis", "Diagnosis", "Stable angina, single-vessel CAD (proximal LAD)", "HIS", "Admission record", T(-25)),
      s("procedure_type", "Procedure", "Elective PCI", "HIS", "Procedure log", T(-24)),
      s("procedure_date", "Procedure date", T(-24), "HIS", "Procedure log", T(-24)),
      s("lvef", "LVEF", "55", "PACS", "Transthoracic echo report", T(-25), "%"),
      s("hb", "Haemoglobin", "13.4", "LIS", "Full blood count", T(-23), "g/dL"),
      s("creatinine", "Creatinine", "0.9", "LIS", "Renal profile", T(-23), "mg/dL"),
    ],
    documents: [
      { id: uid("d"), title: "Discharge summary", source: "EMR", date: T(-23), author: DOC, text: `Elective PCI to proximal LAD on ${T(-24)} with one drug-eluting stent via right radial access. Uncomplicated.\nECG: sinus rhythm, no acute changes.\nDischarge medication: aspirin 75 mg daily, ticagrelor 90 mg twice daily, atorvastatin 80 mg.\nBackground: hypertension, type 2 diabetes.` },
    ],
  };
  {
    const r = retrieveFromSources(a.sourceRecords);
    a.clinical = { retrievedAt: stamp(T(-23), 11), findings: reviewAll(r.findings, stamp(T(-22))), documents: r.documents, cdiAcknowledged: {}, reviewCompletedBy: DOC, reviewCompletedAt: stamp(T(-22)) };
  }
  a.exam = { ...a.exam, date: T(-21), nyha: 1, vitals: { hr: 68, sbp: 132, dbp: 78, rr: 14, spo2: 98, temp: 36.6, weight: 81 }, findings: "Radial access site healed, no haematoma. Heart sounds normal. Chest clear. No calf tenderness.", dictation: "", signedBy: DOC, signedAt: stamp(T(-21), 12) };
  a.risk = { acknowledged: ["R9-vte"], physicianNotes: "Advised compression stockings and mobilisation in flight.", mlViewed: true, reviewedBy: DOC, reviewedAt: stamp(T(-21), 13) };
  a.decision = { ...a.decision, outcome: "cleared", conditions: ["Graduated compression stockings", "Aisle seat; walk every 1–2 hours", "Carry all medication in hand luggage"], earliestTravelDate: T(-22), validUntil: T(-14), rationale: "Uncomplicated elective PCI, preserved LV function, asymptomatic, stable observations. Indicative interval met.", education: ["warning", "meds", "vte", "access", "antithrombotic"], attested: true, approvedBy: DOC, approvedAt: stamp(T(-21), 14) };
  a.outcome = {
    traveled: "yes",
    actualTravelDate: T(-18),
    followUps: [
      { id: "fa1", label: "Day 1 after flight", dueDate: T(-17), channel: "SMS", status: "responded" },
      { id: "fa2", label: "Day 7 after flight", dueDate: T(-11), channel: "Phone", status: "responded" },
      { id: "fa3", label: "Day 30 after flight", dueDate: T(12), channel: "Patient portal", status: "scheduled" },
    ],
    responses: [
      { id: uid("r"), followUpId: "fa1", date: T(-17), symptoms: { chestPain: false, breathlessness: false, legSwelling: false, bleeding: false, dizziness: false, hospitalVisit: false }, complications: "", feedback: "Arrived well, a little tired.", satisfaction: 5, verification: "patient_reported" },
      { id: uid("r"), followUpId: "fa2", date: T(-11), symptoms: { chestPain: false, breathlessness: false, legSwelling: true, bleeding: false, dizziness: false, hospitalVisit: false }, complications: "Right calf slightly swollen and aching since day 4.", feedback: "", satisfaction: 4, verification: "patient_reported" },
    ],
    escalation: { status: "open", note: "Day-7 response reports right calf swelling — possible DVT. Needs clinician review." },
  };
  a.audit = [
    { at: stamp(T(-23), 9), actor: COORD, role: "coordinator", step: 1, action: "Case registered; consent recorded" },
    { at: stamp(T(-23), 11), actor: "Integration (simulated)", role: "system", step: 3, action: "Records retrieved from HIS, EMR, LIS, PACS" },
    { at: stamp(T(-22)), actor: DOC, role: "physician", step: 4, action: "Clinical review signed off" },
    { at: stamp(T(-21), 12), actor: DOC, role: "physician", step: 5, action: "Examination signed" },
    { at: stamp(T(-21), 14), actor: DOC, role: "physician", step: 7, action: "Decision approved: Cleared" },
    { at: stamp(T(-11), 16), actor: "System", role: "system", step: 8, action: "Escalation raised from day-7 follow-up response" },
  ];

  // ---------- Case B: CABG, exam awaiting signature ----------
  const b = blankCase(ref(147));
  b.demo = true;
  b.createdAt = stamp(T(-3));
  b.patient = { fullName: "Khalid Al-Mansouri", dob: "1968-07-02", sex: "Male", nationality: "Saudi", passportNo: "S93810457", mrn: "CMC-0101377", language: "Arabic", phone: "+966 50 555 0142", email: "k.almansouri@example.com" };
  b.request = { requestDate: T(-3), requestedBy: "Family member", reason: "Return to Riyadh after coronary bypass surgery.", consentData: true, consentRecords: true, consentDate: T(-3) };
  b.travel = { ...b.travel, departureDate: T(3), origin: "Cairo (CAI)", destination: "Riyadh (RUH)", airline: "Saudia", flightNumber: "SV 306", durationHours: 2.3, legs: 1, itinerary: "CAI → RUH direct", airlineForm: "MEDIF", assistance: { wheelchair: true, oxygen: false, extraLegroom: false, companion: true }, notes: "Son travelling as companion. MEDIF part 2 to be completed by physician." };
  b.sourceRecords = {
    structured: [
      s("diagnosis", "Diagnosis", "Triple-vessel coronary artery disease", "HIS", "Admission record", T(-11)),
      s("procedure_type", "Procedure", "CABG", "HIS", "Theatre log", T(-8)),
      s("procedure_date", "Procedure date", T(-8), "HIS", "Theatre log", T(-8)),
      s("lvef", "LVEF", "50", "PACS", "Post-op transthoracic echo", T(-2), "%"),
      s("cxr", "Chest X-ray", "Small left pleural effusion; no pneumothorax", "PACS", "CXR PA", T(-2)),
      s("hb", "Haemoglobin", "10.6", "LIS", "Full blood count", T(-2), "g/dL"),
      s("creatinine", "Creatinine", "1.0", "LIS", "Renal profile", T(-2), "mg/dL"),
    ],
    documents: [
      { id: uid("d"), title: "Discharge summary", source: "EMR", date: T(-3), author: "Cardiac surgery team", text: `Coronary artery bypass grafting x3 (LIMA-LAD, SVG-OM, SVG-RCA) on ${T(-8)}.\nPost-operative atrial fibrillation on day 2, resolved with amiodarone; sinus rhythm since day 4.\nCXR: small left pleural effusion, no pneumothorax.\nEstimated LVEF 40-45% on intra-operative TOE.\nECG: sinus rhythm, rate 82.\nMedication: aspirin 75 mg, apixaban 5 mg twice daily (3 months), bisoprolol 2.5 mg, atorvastatin 80 mg.\nBackground: type 2 diabetes, hypertension, obesity.` },
    ],
  };
  {
    const r = retrieveFromSources(b.sourceRecords);
    const reviewed = reviewAll(r.findings, stamp(T(-2), 15), (f) =>
      f.key === "lvef" && f.extraction === "nlp"
        ? { review: "rejected", reviewNote: "Intra-operative TOE estimate superseded by formal post-op TTE (50%, PACS)." }
        : undefined,
    );
    b.clinical = { retrievedAt: stamp(T(-3), 12), findings: reviewed, documents: r.documents, cdiAcknowledged: { "conflict-lvef": "Formal post-op TTE (50%) accepted as current value." }, reviewCompletedBy: DOC, reviewCompletedAt: stamp(T(-2), 15) };
  }
  b.exam = { ...b.exam, date: today, nyha: 2, vitals: { hr: 84, sbp: 124, dbp: 76, rr: 16, spo2: 96, temp: 36.8, weight: 94 }, findings: "Sternotomy wound healing, no discharge. Reduced air entry left base, consistent with small effusion. Regular rhythm. No calf tenderness.", dictation: "" };
  b.audit = [
    { at: stamp(T(-3), 9), actor: COORD, role: "coordinator", step: 1, action: "Case registered; consent recorded" },
    { at: stamp(T(-3), 12), actor: "Integration (simulated)", role: "system", step: 3, action: "Records retrieved from HIS, EMR, LIS, PACS" },
    { at: stamp(T(-2), 15), actor: DOC, role: "physician", step: 4, action: "LVEF conflict resolved; clinical review signed off" },
    { at: stamp(today, 9), actor: DOC, role: "physician", step: 5, action: "Examination drafted (unsigned)" },
  ];

  // ---------- Case C: STEMI, records not yet retrieved ----------
  const c = blankCase(ref(152));
  c.demo = true;
  c.createdAt = stamp(T(-1));
  c.patient = { fullName: "Chiamaka Okafor", dob: "1971-11-20", sex: "Female", nationality: "Nigerian", passportNo: "A10928374", mrn: "CMC-0102544", language: "English, Igbo", phone: "+234 803 555 2210", email: "c.okafor@example.com" };
  c.request = { requestDate: T(-1), requestedBy: "Patient", reason: "Wishes to fly home to Lagos after heart attack treatment.", consentData: true, consentRecords: true, consentDate: T(-1) };
  c.travel = { ...c.travel, departureDate: T(2), origin: "Cairo (CAI)", destination: "Lagos (LOS)", airline: "EgyptAir", flightNumber: "MS 875", durationHours: 5.5, legs: 1, itinerary: "CAI → LOS direct", airlineForm: "MEDIF", assistance: { wheelchair: true, oxygen: false, extraLegroom: false, companion: true }, notes: "Sister will accompany." };
  c.sourceRecords = {
    structured: [
      s("diagnosis", "Diagnosis", "Anterior STEMI", "HIS", "Emergency admission", T(-5)),
      s("procedure_type", "Procedure", "Primary PCI (STEMI)", "HIS", "Cath lab log", T(-5)),
      s("procedure_date", "Procedure date", T(-5), "HIS", "Cath lab log", T(-5)),
      s("hb", "Haemoglobin", "9.8", "LIS", "Full blood count", T(-1), "g/dL"),
      s("troponin", "hs-Troponin T", "412", "LIS", "Cardiac markers", T(-1), "ng/L"),
      s("creatinine", "Creatinine", "1.1", "LIS", "Renal profile", T(-1), "mg/dL"),
    ],
    documents: [
      { id: uid("d"), title: "Echocardiogram report", source: "PACS", date: T(-2), author: "Echo lab", text: `Transthoracic echo: anterior and apical hypokinesia. LVEF 35-40%. Mild mitral regurgitation. No LV thrombus. No pericardial effusion.` },
      { id: uid("d"), title: "Discharge summary (draft)", source: "EMR", date: T(-1), author: "Cardiology ward", text: `Primary PCI to LAD on ${T(-5)} for anterior STEMI, door-to-balloon 74 min.\nNYHA class III on exertion at discharge assessment.\nECG: sinus rhythm with anterior Q waves.\nMedication: aspirin 75 mg, ticagrelor 90 mg twice daily, ramipril 2.5 mg, bisoprolol 1.25 mg, eplerenone 25 mg.\nBackground: hypertension, type 2 diabetes.` },
    ],
  };
  c.audit = [{ at: stamp(T(-1), 10), actor: COORD, role: "coordinator", step: 1, action: "Case registered; consent recorded" }, { at: stamp(T(-1), 11), actor: COORD, role: "coordinator", step: 2, action: "Travel details captured" }];

  // ---------- Case D: Pacemaker, decision drafted ----------
  const d = blankCase(ref(155));
  d.demo = true;
  d.createdAt = stamp(T(-4));
  d.patient = { fullName: "Margaret Ellison", dob: "1953-04-09", sex: "Female", nationality: "British", passportNo: "548201936", mrn: "CMC-0102710", language: "English", phone: "+44 7700 900461", email: "m.ellison@example.com" };
  d.request = { requestDate: T(-4), requestedBy: "Treating physician", reason: "Return to London after pacemaker implantation during holiday.", consentData: true, consentRecords: true, consentDate: T(-4) };
  d.travel = { ...d.travel, departureDate: T(5), origin: "Cairo (CAI)", destination: "London Heathrow (LHR)", airline: "British Airways", flightNumber: "BA 154", durationHours: 5.3, legs: 1, itinerary: "CAI → LHR direct", airlineForm: "Airline-specific form", assistance: { wheelchair: true, oxygen: false, extraLegroom: false, companion: false }, notes: "Travel insurer requests copy of certificate." };
  d.sourceRecords = {
    structured: [
      s("diagnosis", "Diagnosis", "Complete heart block", "HIS", "Admission record", T(-6)),
      s("procedure_type", "Procedure", "Pacemaker / ICD implant", "HIS", "Cath lab log", T(-5)),
      s("procedure_date", "Procedure date", T(-5), "HIS", "Cath lab log", T(-5)),
      s("lvef", "LVEF", "60", "PACS", "Transthoracic echo", T(-6), "%"),
      s("cxr", "Chest X-ray", "Repeat CXR: left apical pneumothorax resolved; leads in satisfactory position", "PACS", "CXR PA (repeat)", T(-2)),
      s("hb", "Haemoglobin", "12.1", "LIS", "Full blood count", T(-2), "g/dL"),
      s("inr", "INR", "2.4", "LIS", "Coagulation", T(-1)),
    ],
    documents: [
      { id: uid("d"), title: "Device implant note", source: "EMR", date: T(-4), author: "Electrophysiology", text: `Dual-chamber pacemaker implantation via left cephalic vein on ${T(-5)}.\nDay-1 CXR: small left apical pneumothorax, managed conservatively; resolved on repeat CXR ${T(-2)}.\nECG: paced rhythm, 70 bpm.\nWarfarin restarted for paroxysmal AF, target INR 2-3.\nBackground: hypertension.` },
    ],
  };
  {
    const r = retrieveFromSources(d.sourceRecords);
    d.clinical = { retrievedAt: stamp(T(-4), 11), findings: reviewAll(r.findings, stamp(T(-3)), (f) => (f.key === "complication" && /pneumothorax/i.test(f.value) ? { review: "corrected", originalValue: f.value, value: `Small left apical pneumothorax — resolved on CXR ${T(-2)}` } : undefined)), documents: r.documents, cdiAcknowledged: {}, reviewCompletedBy: DOC, reviewCompletedAt: stamp(T(-3)) };
  }
  d.exam = { ...d.exam, date: T(-1), nyha: 1, vitals: { hr: 70, sbp: 138, dbp: 80, rr: 15, spo2: 97, temp: 36.5, weight: 66 }, findings: "Device pocket clean and dry, no haematoma. Chest clear bilaterally. Paced rhythm. No calf tenderness.", dictation: "", signedBy: DOC, signedAt: stamp(T(-1), 11) };
  d.risk = { acknowledged: ["R7-ptx", "R9-vte"], physicianNotes: "Pneumothorax resolved; flight will be 7 days after radiographic resolution.", mlViewed: false, reviewedBy: DOC, reviewedAt: stamp(T(-1), 12) };
  d.decision = { ...d.decision, outcome: "conditional", conditions: ["Carry device ID card for security screening", "Wheelchair assistance at airports", "Aisle seat; walk every 1–2 hours"], earliestTravelDate: T(5), validUntil: T(12), rationale: "Pacemaker implant with resolved small pneumothorax; at departure ≥ 7 days post-resolution. Anticoagulated, INR therapeutic. Asymptomatic.", education: ["warning", "meds", "vte", "device", "antithrombotic"], attested: true, approvedBy: DOC, approvedAt: stamp(T(-1), 15) };
  d.audit = [
    { at: stamp(T(-4), 9), actor: COORD, role: "coordinator", step: 1, action: "Case registered; consent recorded" },
    { at: stamp(T(-4), 11), actor: "Integration (simulated)", role: "system", step: 3, action: "Records retrieved" },
    { at: stamp(T(-3)), actor: DOC, role: "physician", step: 4, action: "Pneumothorax finding corrected; review signed off" },
    { at: stamp(T(-1), 11), actor: DOC, role: "physician", step: 5, action: "Examination signed" },
    { at: stamp(T(-1), 12), actor: DOC, role: "physician", step: 6, action: "Risk indicators reviewed" },
    { at: stamp(T(-1), 15), actor: DOC, role: "physician", step: 7, action: "Decision approved: Conditional clearance — document v1 issued" },
  ];

  // ---------- Case E: Valve surgery, unknown outcome ----------
  const e = blankCase(ref(138));
  e.demo = true;
  e.createdAt = stamp(T(-28));
  e.patient = { fullName: "Dmitri Volkov", dob: "1958-01-27", sex: "Male", nationality: "Russian", passportNo: "72 4419083", mrn: "CMC-0099120", language: "Russian", phone: "+7 916 555 0377", email: "" };
  e.request = { requestDate: T(-28), requestedBy: "Medical facilitator", reason: "Return to Moscow after aortic valve replacement.", consentData: true, consentRecords: true, consentDate: T(-28) };
  e.travel = { ...e.travel, departureDate: T(-24), origin: "Cairo (CAI)", destination: "Moscow (SVO)", airline: "Aeroflot", flightNumber: "SU 403", durationHours: 4.3, legs: 1, itinerary: "CAI → SVO direct", airlineForm: "MEDIF", assistance: { wheelchair: true, oxygen: false, extraLegroom: false, companion: false }, notes: "" };
  e.sourceRecords = {
    structured: [
      s("diagnosis", "Diagnosis", "Severe aortic stenosis", "HIS", "Admission record", T(-40)),
      s("procedure_type", "Procedure", "Open valve surgery", "HIS", "Theatre log", T(-38)),
      s("procedure_date", "Procedure date", T(-38), "HIS", "Theatre log", T(-38)),
      s("lvef", "LVEF", "55", "PACS", "Post-op echo", T(-30), "%"),
      s("cxr", "Chest X-ray", "Clear lung fields, sternal wires intact", "PACS", "CXR PA", T(-30)),
      s("hb", "Haemoglobin", "11.8", "LIS", "Full blood count", T(-28), "g/dL"),
      s("inr", "INR", "2.6", "LIS", "Coagulation", T(-27)),
    ],
    documents: [
      { id: uid("d"), title: "Discharge summary", source: "EMR", date: T(-30), author: "Cardiac surgery team", text: `Mechanical aortic valve replacement on ${T(-38)}. Uneventful recovery.\nECG: sinus rhythm, first-degree AV block.\nMedication: warfarin (target INR 2.5-3.5), bisoprolol 2.5 mg, furosemide 20 mg.\nBackground: hypertension.` },
    ],
  };
  {
    const r = retrieveFromSources(e.sourceRecords);
    e.clinical = { retrievedAt: stamp(T(-28), 11), findings: reviewAll(r.findings, stamp(T(-27))), documents: r.documents, cdiAcknowledged: {}, reviewCompletedBy: DOC, reviewCompletedAt: stamp(T(-27)) };
  }
  e.exam = { ...e.exam, date: T(-26), nyha: 1, vitals: { hr: 72, sbp: 128, dbp: 74, rr: 14, spo2: 97, temp: 36.7, weight: 88 }, findings: "Sternal wound healed. Crisp mechanical valve click. Chest clear.", dictation: "", signedBy: DOC, signedAt: stamp(T(-26), 12) };
  e.risk = { acknowledged: [], physicianNotes: "", mlViewed: false, reviewedBy: DOC, reviewedAt: stamp(T(-26), 13) };
  e.decision = { ...e.decision, outcome: "conditional", conditions: ["Wheelchair assistance at airports", "Graduated compression stockings", "Do not lift heavy luggage (sternal precautions)"], earliestTravelDate: T(-28), validUntil: T(-18), rationale: "Uncomplicated mechanical AVR, 14 days post-op at travel, therapeutic INR, asymptomatic.", education: ["warning", "meds", "vte", "sternal", "antithrombotic"], attested: true, approvedBy: DOC, approvedAt: stamp(T(-26), 14) };
  e.outcome = {
    traveled: "unknown",
    actualTravelDate: "",
    followUps: [
      { id: "fe1", label: "Day 1 after flight", dueDate: T(-23), channel: "Phone", status: "no_response" },
      { id: "fe2", label: "Day 7 after flight", dueDate: T(-17), channel: "Phone", status: "no_response" },
      { id: "fe3", label: "Day 30 after flight", dueDate: T(6), channel: "Email", status: "scheduled" },
    ],
    responses: [],
    escalation: { status: "none", note: "" },
  };
  e.audit = [
    { at: stamp(T(-28), 9), actor: COORD, role: "coordinator", step: 1, action: "Case registered" },
    { at: stamp(T(-26), 14), actor: DOC, role: "physician", step: 7, action: "Decision approved: Conditional clearance" },
    { at: stamp(T(-17), 17), actor: COORD, role: "coordinator", step: 8, action: "Day-7 call: no answer" },
  ];

  // ---------- Scenario A: straightforward elective PCI, ready for identity check ----------
  const f = blankCase(ref(158));
  f.demo = true;
  f.createdAt = stamp(today, 8);
  f.patient = { fullName: "Amira Ben Haddad", dob: "1962-09-18", sex: "Female", nationality: "Tunisian", passportNo: "X7731402", mrn: "CMC-0102988", language: "Arabic, French", phone: "+216 20 555 418", email: "a.benhaddad@example.com" };
  f.request = { requestDate: today, requestedBy: "Patient", reason: "Return to Tunis after planned coronary stenting.", consentData: true, consentRecords: true, consentDate: today };
  f.travel = { ...f.travel, departureDate: T(6), origin: "Cairo (CAI)", destination: "Tunis (TUN)", airline: "Tunisair", flightNumber: "TU 822", durationHours: 3.4, legs: 1, itinerary: "CAI → TUN direct", airlineForm: "None required", assistance: { wheelchair: false, oxygen: false, extraLegroom: false, companion: true }, notes: "Husband travelling with her." };
  f.sourceRecords = {
    structured: [
      s("diagnosis", "Diagnosis", "Stable angina, single-vessel CAD (RCA)", "HIS", "Admission record", T(-4)),
      s("procedure_type", "Procedure", "Elective PCI", "HIS", "Cath lab log", T(-3)),
      s("procedure_date", "Procedure date", T(-3), "HIS", "Cath lab log", T(-3)),
      s("lvef", "LVEF", "58", "PACS", "Transthoracic echo report", T(-4), "%"),
      s("hb", "Haemoglobin", "12.9", "LIS", "Full blood count", T(-2), "g/dL"),
    ],
    documents: [
      { id: uid("d"), title: "Discharge summary", source: "EMR", date: T(-2), author: DOC, text: `Elective PCI to mid RCA on ${T(-3)} with one drug-eluting stent via right radial access. Uncomplicated.\nNo chest pain since the procedure.\nECG: sinus rhythm, no acute changes.\nDischarge medication: aspirin 75 mg daily, clopidogrel 75 mg daily, atorvastatin 40 mg.\nFollow-up with cardiology clinic in Tunis at 6 weeks.\nBackground: hypertension.` },
    ],
  };
  f.audit = [{ at: stamp(today, 8), actor: COORD, role: "coordinator", step: 1, action: "Case registered; consent recorded; identity check pending" }];

  // ---------- Scenario B: missing and conflicting information ----------
  const g = blankCase(ref(160));
  g.demo = true;
  g.createdAt = stamp(T(-1));
  g.patient = { fullName: "Rajesh Iyer", dob: "1970-02-11", sex: "Male", nationality: "Indian", passportNo: "Z4418290", mrn: "CMC-0103011", language: "English, Tamil", phone: "+91 98400 55512", email: "r.iyer@example.com" };
  g.request = { requestDate: T(-1), requestedBy: "Medical facilitator", reason: "Return to Chennai after catheter ablation.", consentData: true, consentRecords: true, consentDate: T(-1) };
  g.travel = { ...g.travel, departureDate: T(4), origin: "Cairo (CAI)", destination: "Chennai (MAA)", airline: "EgyptAir", flightNumber: "MS 970", durationHours: 9.5, legs: 2, itinerary: "CAI → BOM → MAA", airlineForm: "None required", assistance: { wheelchair: false, oxygen: false, extraLegroom: true, companion: false }, notes: "" };
  g.sourceRecords = {
    structured: [
      s("diagnosis", "Diagnosis", "Typical atrial flutter", "HIS", "Admission record", T(-4)),
      s("procedure_type", "Procedure", "Catheter ablation", "HIS", "EP lab log", T(-3)),
      s("procedure_date", "Procedure date", T(-3), "HIS", "EP lab log", T(-3)),
    ],
    documents: [
      { id: uid("d"), title: "EP procedure note", source: "EMR", date: T(-2), author: "Electrophysiology", text: `Cavotricuspid isthmus ablation on ${T(-2)}. Bidirectional block achieved.\nECG: sinus rhythm post-procedure.\nRivaroxaban 20 mg daily to continue.\nEchocardiogram and blood count not yet reported.` },
    ],
  };
  {
    const r = retrieveFromSources(g.sourceRecords);
    g.clinical = { retrievedAt: stamp(T(-1), 12), findings: r.findings, documents: r.documents, cdiAcknowledged: {} };
  }
  g.audit = [
    { at: stamp(T(-1), 9), actor: COORD, role: "coordinator", step: 1, action: "Case registered; consent recorded; identity verified" },
    { at: stamp(T(-1), 12), actor: "Integration (simulated)", role: "system", step: 3, action: "Records retrieved — echo and blood count missing" },
  ];

  // ---------- common seeding: identity, registration, certificates, scenario labels ----------
  const all = [f, g, b, c, d, a, e];
  for (const x of all) {
    if (x !== f) x.identity = { method: "Passport sighted in person", documentNo: x.patient.passportNo, verifiedBy: COORD, verifiedAt: x.createdAt };
    x.registration = { completedAt: x.createdAt };
    if (x.decision.approvedAt) {
      const at = x.decision.approvedAt;
      issueCertificate(x, x.decision.approvedBy ?? DOC, at);
    }
  }
  f.scenario = "A · Straightforward";
  g.scenario = "B · Missing information";
  c.scenario = "C · Deferral";
  d.scenario = "D · Material change after approval";
  e.scenario = "E · Follow-up, no response";
  a.scenario = "F · Concerning symptom";

  return all;
}
