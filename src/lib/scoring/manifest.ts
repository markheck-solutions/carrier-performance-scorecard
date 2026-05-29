import type { ScoringComponentId, ScoreGrade } from "./types";

export const SCORE_MANIFEST_VERSION = "v1";

export const SCORE_ROUNDING = {
  normalizedScoreDecimals: 0,
  contributionDecimals: 1,
  totalScoreDecimals: 0,
} as const;

export const SCORE_WEIGHTS: Record<ScoringComponentId, number> = {
  commitment_adherence: 25,
  delay_severity: 20,
  repeat_issue_concentration: 15,
  responsiveness: 15,
  aging_open_commitments: 10,
  escalation_volume: 10,
  completion_trend: 5,
} as const;

export const SCORE_GRADE_THRESHOLDS: Array<{ grade: ScoreGrade; minScore: number }> = [
  { grade: "A", minScore: 90 },
  { grade: "B", minScore: 80 },
  { grade: "C", minScore: 70 },
  { grade: "D", minScore: 60 },
  { grade: "F", minScore: 0 },
];

export const SCORE_TIE_BREAKERS = [
  { by: "totalScore" as const, order: "desc" as const },
  { by: "name" as const, order: "asc" as const },
  { by: "id" as const, order: "asc" as const },
] as const;

export const LOW_VOLUME_SAMPLE_THRESHOLD = 4;

export type ComponentManifest = {
  id: ScoringComponentId;
  label: string;
  direction: "higher_is_better" | "lower_is_better";
  unit: string;
  weight: number;
  normalization: {
    best: number;
    worst: number;
    floor: number;
    cap: number;
    notes?: string;
  };
  missingDataPolicy: {
    normalizedScore: number; // deterministic fallback
    note: string;
  };
};

export const SCORE_COMPONENTS: Record<ScoringComponentId, ComponentManifest> = {
  commitment_adherence: {
    id: "commitment_adherence",
    label: "Commitment adherence",
    direction: "higher_is_better",
    unit: "rate",
    weight: SCORE_WEIGHTS.commitment_adherence,
    normalization: {
      best: 1,
      worst: 0,
      floor: 0,
      cap: 1,
      notes: "On-time completion rate, mapped linearly to 0..100.",
    },
    missingDataPolicy: {
      normalizedScore: 50,
      note: "No completed deliveries in scope. Component treated as neutral with reduced confidence.",
    },
  },
  delay_severity: {
    id: "delay_severity",
    label: "Delay severity",
    direction: "lower_is_better",
    unit: "days",
    weight: SCORE_WEIGHTS.delay_severity,
    normalization: {
      best: 0,
      worst: 21,
      floor: 0,
      cap: 21,
      notes: "Average delay days (completed deliveries), capped at 21 days.",
    },
    missingDataPolicy: {
      normalizedScore: 50,
      note: "No completed deliveries in scope. Component treated as neutral with reduced confidence.",
    },
  },
  repeat_issue_concentration: {
    id: "repeat_issue_concentration",
    label: "Repeat issue concentration",
    direction: "lower_is_better",
    unit: "rate",
    weight: SCORE_WEIGHTS.repeat_issue_concentration,
    normalization: {
      best: 0,
      worst: 0.6,
      floor: 0,
      cap: 0.6,
      notes: "Share of records flagged as repeat. Rates above 60% are capped.",
    },
    missingDataPolicy: {
      normalizedScore: 50,
      note: "No deliveries in scope. Component treated as neutral with reduced confidence.",
    },
  },
  responsiveness: {
    id: "responsiveness",
    label: "Responsiveness",
    direction: "lower_is_better",
    unit: "hours",
    weight: SCORE_WEIGHTS.responsiveness,
    normalization: {
      best: 4,
      worst: 72,
      floor: 0,
      cap: 96,
      notes: "Average responsiveness hours, capped at 96. Best is 4 hours or better.",
    },
    missingDataPolicy: {
      normalizedScore: 50,
      note: "No deliveries in scope. Component treated as neutral with reduced confidence.",
    },
  },
  aging_open_commitments: {
    id: "aging_open_commitments",
    label: "Aging open commitments",
    direction: "lower_is_better",
    unit: "rate",
    weight: SCORE_WEIGHTS.aging_open_commitments,
    normalization: {
      best: 0,
      worst: 0.5,
      floor: 0,
      cap: 0.5,
      notes: "Share of open/in-progress items aging past 30 days within the period window.",
    },
    missingDataPolicy: {
      normalizedScore: 100,
      note: "No open commitments in scope. Component treated as best-case.",
    },
  },
  escalation_volume: {
    id: "escalation_volume",
    label: "Escalation volume",
    direction: "lower_is_better",
    unit: "escalations_per_record",
    weight: SCORE_WEIGHTS.escalation_volume,
    normalization: {
      best: 0,
      worst: 2,
      floor: 0,
      cap: 4,
      notes: "Average escalations per record, capped at 4. Worst band starts at 2.",
    },
    missingDataPolicy: {
      normalizedScore: 50,
      note: "No deliveries in scope. Component treated as neutral with reduced confidence.",
    },
  },
  completion_trend: {
    id: "completion_trend",
    label: "Completion trend momentum",
    direction: "higher_is_better",
    unit: "delta_rate",
    weight: SCORE_WEIGHTS.completion_trend,
    normalization: {
      best: 0.25,
      worst: -0.25,
      floor: -0.25,
      cap: 0.25,
      notes: "Change in on-time completion rate from earlier to later periods, capped at +/- 25 points.",
    },
    missingDataPolicy: {
      normalizedScore: 50,
      note: "Insufficient period history to determine trend. Component treated as neutral with reduced confidence.",
    },
  },
};

export const SCORE_MANIFEST = {
  version: SCORE_MANIFEST_VERSION,
  rounding: SCORE_ROUNDING,
  weights: SCORE_WEIGHTS,
  gradeThresholds: SCORE_GRADE_THRESHOLDS,
  tieBreakers: SCORE_TIE_BREAKERS,
  lowVolume: {
    sampleCountThreshold: LOW_VOLUME_SAMPLE_THRESHOLD,
    confidenceLabels: {
      low: "low",
      medium: "medium",
      high: "high",
    },
  },
  components: SCORE_COMPONENTS,
} as const;
