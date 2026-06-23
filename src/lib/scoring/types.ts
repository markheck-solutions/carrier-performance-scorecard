import type { ProductType, Region } from "../domain/demo-values";

export type ScoringComponentId =
  | "commitment_adherence"
  | "delay_severity"
  | "repeat_issue_concentration"
  | "responsiveness"
  | "aging_open_commitments"
  | "escalation_volume"
  | "completion_trend";

export type ScoreGrade = "A" | "B" | "C" | "D" | "F";

export type ConfidenceLabel = "high" | "medium" | "low";

export type ScoreFilters = {
  carrierId: string | null;
  region: Region | null;
  productType: ProductType | null;
  period: string | null; // period seedKey (e.g. "2026-06")
};

export type PeriodWindow = {
  mode: "all" | "single";
  seedKey?: string;
  startDate?: string;
  endDate?: string;
};

export type ScoreScope = {
  filters: ScoreFilters;
  periodWindow: PeriodWindow;
};

export type ScalarMetric = {
  kind: "scalar";
  value: number;
  unit: string;
};

export type RatioMetric = {
  kind: "ratio";
  numerator: number;
  denominator: number;
  unit: string;
};

export type ScoreMetric = ScalarMetric | RatioMetric;

export type ScoreComponentResult = {
  id: ScoringComponentId;
  label: string;
  direction: "higher_is_better" | "lower_is_better";
  weight: number; // points out of 100
  metric: ScoreMetric;
  sampleCount: number;
  evidenceCount: number;
  evidenceIds: string[];
  normalization: {
    floor: number;
    cap: number;
    best: number;
    worst: number;
    notes?: string;
  };
  normalizedScore: number; // 0..100
  contribution: number; // 0..weight
  explanation: string;
  dataQuality: {
    availability: "ok" | "insufficient_data";
    notes: string[];
  };
  scope: ScoreScope;
};

export type CarrierScorecard = {
  carrier: {
    id: string;
    name: string;
    shortCode: string;
    relationshipTier: string;
    regionFocus: string;
  };
  scope: ScoreScope;
  mix: {
    regions: Array<{ region: Region; count: number; share: number }>;
    productTypes: Array<{ productType: ProductType; count: number; share: number }>;
    topRegion: Region | null;
    topProductType: ProductType | null;
  };
  sampleCount: number;
  confidence: {
    label: ConfidenceLabel;
    lowVolume: boolean;
    threshold: number;
    notes: string[];
  };
  components: ScoreComponentResult[];
  totalScore: number; // 0..100
  grade: ScoreGrade;
  rankTieBreaker: {
    by: "totalScore" | "name" | "id";
    order: "desc" | "asc";
  }[];
};
