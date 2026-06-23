import "server-only";

import { createHash } from "node:crypto";

import type { QbrBriefSections, QbrProviderId } from "./public";
import type { QbrSafeContextV1 } from "./context";

export type MockQbrResult = {
  provider: { id: QbrProviderId };
  brief: QbrBriefSections;
  dataNotice: { kind: "limited_data"; message: string } | null;
};

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((v) => stableStringify(v)).join(",")}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(",")}}`;
}

function seedFromContext(context: QbrSafeContextV1, variant: number) {
  const canonical = stableStringify({ context, variant });
  const hex = createHash("sha256").update(canonical).digest("hex").slice(0, 8);
  return Number.parseInt(hex, 16) >>> 0;
}

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(rng: () => number, items: readonly T[]) {
  return items[Math.floor(rng() * items.length)]!;
}

function pct(n: number, d: number) {
  if (!Number.isFinite(n) || !Number.isFinite(d) || d <= 0) return 0;
  return Math.round((n / d) * 100);
}

function asScalar(metric: QbrSafeContextV1["score"]["components"][number]["metric"], fallback = 0) {
  if (metric.kind !== "scalar") return fallback;
  return Number.isFinite(metric.value) ? metric.value : fallback;
}

function asRatio(metric: QbrSafeContextV1["score"]["components"][number]["metric"]) {
  if (metric.kind !== "ratio") return { numerator: 0, denominator: 0 };
  return {
    numerator: Number.isFinite(metric.numerator) ? metric.numerator : 0,
    denominator: Number.isFinite(metric.denominator) ? metric.denominator : 0,
  };
}

function findComp(context: QbrSafeContextV1, id: QbrSafeContextV1["score"]["components"][number]["id"]) {
  return context.score.components.find((c) => c.id === id) ?? null;
}

function ensureNoEmDash(text: string) {
  // Replace U+2014 with a regular hyphen. Also replace U+2015 and U+2013 for safety.
  return text.replaceAll("\u2014", "-").replaceAll("\u2015", "-").replaceAll("\u2013", "-");
}

function sanitizeBullets(items: string[]) {
  const cleaned = items
    .map((s) => ensureNoEmDash(s.trim()))
    .map((s) => s.replaceAll(/\s+/g, " "))
    .map((s) => (s.length > 240 ? `${s.slice(0, 237)}...` : s))
    .filter((s) => s.length > 0);
  return cleaned.length > 0 ? cleaned : ["No grounded talking points are available for this scope yet."];
}

function normalizedVariant(params?: { variant?: number | null }) {
  return Number.isFinite(params?.variant) ? Math.max(0, Math.floor(params!.variant as number)) : 0;
}

function buildScopeLabel(context: QbrSafeContextV1) {
  const scopeParts = [
    context.scope.filters.period ? `Period ${context.scope.filters.period}` : "All periods",
    context.scope.filters.region ? `Region ${context.scope.filters.region.toUpperCase()}` : "All regions",
    context.scope.filters.productType ? `Product ${context.scope.filters.productType}` : "All products",
  ];
  return scopeParts.join(", ");
}

function extractMetrics(context: QbrSafeContextV1) {
  const commitment = findComp(context, "commitment_adherence");
  const delay = findComp(context, "delay_severity");
  const repeat = findComp(context, "repeat_issue_concentration");
  const resp = findComp(context, "responsiveness");
  const aging = findComp(context, "aging_open_commitments");
  const esc = findComp(context, "escalation_volume");
  const trend = findComp(context, "completion_trend");

  const onTime = commitment ? asRatio(commitment.metric) : { numerator: 0, denominator: 0 };
  const repeatMetric = repeat ? asRatio(repeat.metric) : { numerator: 0, denominator: 0 };
  const agingMetric = aging ? asRatio(aging.metric) : { numerator: 0, denominator: 0 };

  return {
    agingRate: pct(agingMetric.numerator, Math.max(1, agingMetric.denominator)),
    avgDelayDays: delay ? Math.round(asScalar(delay.metric, 0)) : 0,
    avgRespHours: resp ? Math.round(asScalar(resp.metric, 0)) : 0,
    escalationPerRecord: esc ? Math.round(asScalar(esc.metric, 0) * 10) / 10 : 0,
    limitedData: context.records.deliveryRecords === 0 || context.records.sampleCount === 0,
    onTime,
    onTimePct: pct(onTime.numerator, onTime.denominator),
    repeatRate: pct(repeatMetric.numerator, Math.max(1, repeatMetric.denominator)),
    topDelay: context.delays.topDelayReasons[0]?.delayReason ?? null,
    topDelayCount: context.delays.topDelayReasons[0]?.count ?? 0,
    trendDeltaPts: trend && trend.metric.kind === "scalar" ? Math.round(trend.metric.value * 100) : 0,
  };
}

function evidenceExample(context: QbrSafeContextV1) {
  const highlight = context.evidence.highlights[0];
  if (!highlight) return null;
  return `Evidence ${highlight.id} (${highlight.dimension}) summary: ${highlight.summary}`;
}

function dataNoticeFor(context: QbrSafeContextV1, carrierTag: string, scopeLabel: string) {
  if (context.records.deliveryRecords === 0 || context.records.sampleCount === 0) {
    return {
      kind: "limited_data" as const,
      message: `No delivery records are available for ${carrierTag} in this scope (${scopeLabel}).`,
    };
  }
  if (!context.records.lowVolume) return null;
  return {
    kind: "limited_data" as const,
    message: `Limited sample size (${context.records.sampleCount}). Treat talking points as directional for ${carrierTag}.`,
  };
}

function limitedDataBrief(carrierTag: string): QbrBriefSections {
  return {
    strengths: sanitizeBullets([
      `${carrierTag}: no scored strengths are available yet because this scope has zero delivery records.`,
    ]),
    concerns: sanitizeBullets([
      `${carrierTag}: avoid drawing conclusions from this scope. Broaden period, region, or product filters to build signal.`,
    ]),
    questions: sanitizeBullets([
      `Which period and product mix best represents the work we want to review for ${carrierTag}?`,
    ]),
    governanceActions: sanitizeBullets([
      `Broaden scope and re-run the brief for ${carrierTag}, then align on a governance cadence once records exist.`,
    ]),
  };
}

function trendToneFor(context: QbrSafeContextV1) {
  const tones: Record<string, string> = {
    declining: "declining",
    improving: "improving",
    stable: "stable",
    watch: "watch",
  };
  return tones[context.score.trendLabel] ?? "stable";
}

function governanceLead(context: QbrSafeContextV1, carrierTag: string) {
  const positiveTone = context.score.grade === "A" || context.score.grade === "B";
  const negativeTone = context.score.grade === "D" || context.score.grade === "F";
  if (positiveTone) {
    return `Keep normal cadence for ${carrierTag}. Use this as a reference baseline in the next QBR and confirm what practices are worth standardizing.`;
  }
  return negativeTone
    ? `Move ${carrierTag} to a tighter governance cadence. Agree on owners, weekly checkpoints, and a recovery plan tied to delay drivers.`
    : `Hold a focused QBR segment for ${carrierTag} to confirm the top drivers and align on two measurable improvement actions.`;
}

function fullBrief(
  context: QbrSafeContextV1,
  rng: () => number,
  carrierTag: string,
  scopeLabel: string,
): QbrBriefSections {
  const metrics = extractMetrics(context);
  const scoreTag = `Grade ${context.score.grade} (${context.score.totalScore})`;
  const trendTone = trendToneFor(context);

  const strengthsTemplates = [
    `${carrierTag} is running at ${scoreTag} with an on-time rate of ${metrics.onTimePct}% (${metrics.onTime.numerator}/${metrics.onTime.denominator}) in this scope (${scopeLabel}).`,
    `${carrierTag} is ${scoreTag} in this scope with ${metrics.onTimePct}% on-time performance (${metrics.onTime.numerator}/${metrics.onTime.denominator}) for ${scopeLabel}.`,
    `${carrierTag} is ${scoreTag} in this scope, anchored by ${metrics.onTimePct}% on-time completion (${metrics.onTime.numerator}/${metrics.onTime.denominator}).`,
  ] as const;

  const concernsTemplates = [
    metrics.topDelay
      ? `${carrierTag} delay exposure is led by "${metrics.topDelay}" (${metrics.topDelayCount} record(s)); average miss is about ${metrics.avgDelayDays} day(s) for completed work in this scope.`
      : `${carrierTag} delay exposure is present; average miss is about ${metrics.avgDelayDays} day(s) for completed work in this scope.`,
    `${carrierTag} repeat pressure is ${metrics.repeatRate}% repeats in this scope, which can hide systemic blockers if not managed explicitly.`,
    `${carrierTag} responsiveness is averaging about ${metrics.avgRespHours} hour(s) in this scope; slow responses compound schedule risk.`,
    `${carrierTag} escalation density is about ${metrics.escalationPerRecord} per record in this scope, which can consume leadership bandwidth.`,
    `${carrierTag} has ${metrics.agingRate}% aging open commitments in this scope; aging items should be pulled into a tighter cadence.`,
  ] as const;

  const questionsTemplates = [
    metrics.topDelay
      ? `For "${metrics.topDelay}", what is the specific gating step and the plan to prevent repeats for ${carrierTag}?`
      : `What are the top two blockers behind the current delays for ${carrierTag}, and which owner controls each?`,
    `What response-time target do we want for ${carrierTag} in this scope, given an observed average of about ${metrics.avgRespHours} hour(s)?`,
    `Where are repeats clustering for ${carrierTag} (${metrics.repeatRate}% repeats), and what upstream fix reduces the recurrence?`,
    `Momentum is ${trendTone} (${metrics.trendDeltaPts} pts). What should change in the next window to move it in the desired direction for ${carrierTag}?`,
  ] as const;

  const governanceTemplates = [
    governanceLead(context, carrierTag),
    `Track delay reasons explicitly for ${carrierTag}${metrics.topDelay ? `, starting with "${metrics.topDelay}"` : ""}, and review the mix each period.`,
    `Set a response-time and escalation expectation for ${carrierTag} (current average about ${metrics.avgRespHours} hour(s), escalation density ${metrics.escalationPerRecord}).`,
    `Create a repeat and aging action list for ${carrierTag} (repeat rate ${metrics.repeatRate}%, aging rate ${metrics.agingRate}%). Review recurrence and lingering work each window.`,
  ] as const;

  const example = evidenceExample(context);
  const strengths = sanitizeBullets([
    pick(rng, strengthsTemplates),
    `${carrierTag} momentum is ${trendTone} (${metrics.trendDeltaPts} pts) across the selected window.`,
    example ? `${carrierTag} proof cue: ${example}.` : "",
  ]);

  // Ensure every material driver can influence at least one visible bullet, while still allowing
  // a small deterministic variation in phrasing.
  const concerns = sanitizeBullets([concernsTemplates[0], concernsTemplates[1], pick(rng, concernsTemplates.slice(2))]);

  const questions = sanitizeBullets([
    questionsTemplates[0],
    questionsTemplates[2],
    pick(rng, questionsTemplates.slice(1)),
  ]);

  const governanceActions = sanitizeBullets([
    governanceTemplates[0],
    governanceTemplates[1],
    governanceTemplates[2],
    governanceTemplates[3],
  ]);

  // Ensure at least one carrier-specific bullet per section.
  const forceCarrierMention = (items: string[]) =>
    items.map((s) => (s.includes(context.carrier.name) ? s : `${carrierTag}: ${s}`));

  return {
    strengths: forceCarrierMention(strengths),
    concerns: forceCarrierMention(concerns),
    questions: forceCarrierMention(questions),
    governanceActions: forceCarrierMention(governanceActions),
  };
}

export function generateMockQbrBrief(context: QbrSafeContextV1, params?: { variant?: number | null }): MockQbrResult {
  const variant = normalizedVariant(params);
  const rng = mulberry32(seedFromContext(context, variant));
  const carrierTag = `${context.carrier.name} (${context.carrier.shortCode})`;
  const scopeLabel = buildScopeLabel(context);
  const dataNotice = dataNoticeFor(context, carrierTag, scopeLabel);
  const metrics = extractMetrics(context);
  const brief = metrics.limitedData ? limitedDataBrief(carrierTag) : fullBrief(context, rng, carrierTag, scopeLabel);
  return { provider: { id: "mock" }, brief, dataNotice };
}
