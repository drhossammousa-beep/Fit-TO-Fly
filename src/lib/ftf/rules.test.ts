import { describe, expect, it } from "vitest";
import { buildDemoCases } from "./demo-cases";
import { riskIndicators, minimumInterval } from "./rules";
import { classifyOutcome } from "./status";
import { retrieveFromSources } from "./factory";

const T = "2026-11-10";
const cases = () => buildDemoCases(T);
const byName = (n: string) => cases().find((c) => c.patient.fullName.includes(n))!;

describe("clinical rules", () => {
  it("CABG needs 10 days", () => expect(minimumInterval("CABG", 50, false).days).toBe(10));
  it("low-risk ACS needs 3 days, LVEF<40 has no fixed interval", () => {
    expect(minimumInterval("Primary PCI (STEMI)", 50, false).days).toBe(3);
    expect(minimumInterval("Primary PCI (STEMI)", 35, false).days).toBeNull();
  });
  it("SpO2 below 92 is high severity", () => {
    const c = byName("Khalid");
    c.exam.vitals.spo2 = 90;
    expect(riskIndicators(c).find((r) => r.id === "R3-spo2")?.severity).toBe("high");
  });
  it("STEMI case with LVEF 35-40% is flagged high after retrieval", () => {
    const c = byName("Okafor");
    c.clinical.findings = retrieveFromSources(c.sourceRecords).findings;
    expect(riskIndicators(c).find((r) => r.id === "R1-interval")?.severity).toBe("high");
  });
});

describe("outcomes", () => {
  it("no follow-up response is unknown, not safe", () => expect(classifyOutcome(byName("Volkov"))).toBe("unknown"));
  it("calf swelling response is a reported concern", () => expect(classifyOutcome(byName("Kamau"))).toBe("complication_reported"));
});

describe("negation", () => {
  it("'no pneumothorax' in a note does not raise a pneumothorax alert", () => {
    expect(riskIndicators(byName("Khalid")).some((r) => r.id === "R7-ptx")).toBe(false);
  });
});
