// SIMULATED exploratory ML. A synthetic historical cohort with k-means clustering and
// nearest-neighbour lookup. For exploration and hypothesis generation ONLY — clusters are
// never clearance criteria and the cohort is not real patient data.
import type { FtfCase } from "./types";
import { ageFrom, daysBetween, isISODate } from "./dates";
import { bestFinding } from "./rules";

export interface CohortPoint {
  id: number;
  age: number;
  daysPost: number;
  lvef: number;
  flightHours: number;
  spo2: number;
  outcome: "uneventful" | "minor_event" | "serious_event" | "unknown";
  cluster: number;
}

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FEATURES = ["age", "daysPost", "lvef", "flightHours", "spo2"] as const;
const RANGE: Record<(typeof FEATURES)[number], [number, number]> = {
  age: [40, 88],
  daysPost: [1, 45],
  lvef: [20, 70],
  flightHours: [1, 15],
  spo2: [88, 100],
};

function norm(p: Pick<CohortPoint, (typeof FEATURES)[number]>): number[] {
  return FEATURES.map((k) => (p[k] - RANGE[k][0]) / (RANGE[k][1] - RANGE[k][0]));
}

function dist(a: number[], b: number[]) {
  return Math.sqrt(a.reduce((s, v, i) => s + (v - b[i]!) ** 2, 0));
}

let cache: { points: CohortPoint[]; centroids: number[][] } | null = null;

export function syntheticCohort() {
  if (cache) return cache;
  const r = mulberry32(20261110);
  const points: CohortPoint[] = [];
  for (let i = 0; i < 180; i++) {
    const age = Math.round(45 + r() * 38);
    const daysPost = Math.round(2 + r() ** 1.3 * 40);
    const lvef = Math.round(28 + r() * 35);
    const flightHours = Math.round((1.5 + r() * 12) * 10) / 10;
    const spo2 = Math.round(91 + r() * 8);
    const risk = -3.2 + (lvef < 40 ? 1.1 : 0) + (daysPost < 7 ? 0.9 : 0) + (spo2 < 94 ? 0.8 : 0) + (flightHours > 6 ? 0.4 : 0) + (age > 75 ? 0.4 : 0);
    const pEvent = 1 / (1 + Math.exp(-risk));
    const u = r();
    const outcome: CohortPoint["outcome"] =
      r() < 0.2 ? "unknown" : u < pEvent * 0.35 ? "serious_event" : u < pEvent ? "minor_event" : "uneventful";
    points.push({ id: i + 1, age, daysPost, lvef, flightHours, spo2, outcome, cluster: 0 });
  }
  // k-means, k=3, deterministic init
  const X = points.map(norm);
  let centroids: number[][] = [X[3]!, X[57]!, X[121]!].map((c) => [...c]);
  for (let it = 0; it < 25; it++) {
    points.forEach((p, i) => {
      let best = 0;
      centroids.forEach((c, k) => {
        if (dist(X[i]!, c) < dist(X[i]!, centroids[best]!)) best = k;
      });
      p.cluster = best;
    });
    centroids = centroids.map((c, k) => {
      const members = X.filter((_, i) => points[i]!.cluster === k);
      if (!members.length) return c;
      return c.map((_, d) => members.reduce((s, m) => s + m[d]!, 0) / members.length);
    });
  }
  cache = { points, centroids };
  return cache;
}

export function clusterProfile(k: number) {
  const { points } = syntheticCohort();
  const m = points.filter((p) => p.cluster === k);
  const mean = (f: (typeof FEATURES)[number]) => Math.round((m.reduce((s, p) => s + p[f], 0) / m.length) * 10) / 10;
  return {
    k,
    size: m.length,
    meanLvef: mean("lvef"),
    meanDaysPost: mean("daysPost"),
    meanFlight: mean("flightHours"),
    meanSpo2: mean("spo2"),
    outcomes: tally(m),
  };
}

function tally(list: CohortPoint[]) {
  return {
    uneventful: list.filter((p) => p.outcome === "uneventful").length,
    minor_event: list.filter((p) => p.outcome === "minor_event").length,
    serious_event: list.filter((p) => p.outcome === "serious_event").length,
    unknown: list.filter((p) => p.outcome === "unknown").length,
  };
}

export function patientFeatures(c: FtfCase) {
  const age = ageFrom(c.patient.dob, c.travel.departureDate || undefined);
  const d = bestFinding(c, "procedure_date")?.value;
  const daysPost = d && isISODate(d) && isISODate(c.travel.departureDate) ? daysBetween(d, c.travel.departureDate) : undefined;
  const lv = bestFinding(c, "lvef");
  const lvef = lv ? Number.parseFloat(lv.value) : undefined;
  const flightHours = c.travel.durationHours;
  const spo2 = c.exam.vitals.spo2;
  const missing = [
    age === undefined && "age",
    daysPost === undefined && "days post-procedure",
    (lvef === undefined || Number.isNaN(lvef)) && "LVEF",
    flightHours === undefined && "flight duration",
    spo2 === undefined && "SpO₂",
  ].filter(Boolean) as string[];
  return { age, daysPost, lvef, flightHours, spo2, missing };
}

export function exploreSimilar(c: FtfCase, k = 12) {
  const f = patientFeatures(c);
  if (f.missing.length) return { ok: false as const, missing: f.missing };
  const { points, centroids } = syntheticCohort();
  const x = norm({ age: f.age!, daysPost: f.daysPost!, lvef: f.lvef!, flightHours: f.flightHours!, spo2: f.spo2! });
  let cluster = 0;
  centroids.forEach((cc, i) => {
    if (dist(x, cc) < dist(x, centroids[cluster]!)) cluster = i;
  });
  const neighbours = [...points].sort((a, b) => dist(norm(a), x) - dist(norm(b), x)).slice(0, k);
  return { ok: true as const, features: f, cluster, profile: clusterProfile(cluster), neighbours, neighbourOutcomes: tally(neighbours) };
}
