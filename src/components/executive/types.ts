import type { CarrierScorecard, ScoreScope } from "@/lib/scoring/types";

export type ScorecardsSummaryModel = {
  ok: true;
  // Keep this `unknown` on the client. The full manifest type lives in server modules.
  manifest: unknown;
  scope: ScoreScope;
  counts: {
    carriers: number;
    periods: number;
    deliveryRecords: number;
    evidenceItems: number;
  };
  aggregates: {
    delayReasons: Array<{ delayReason: string; count: number }>;
    regions: Array<{ region: string; count: number }>;
    productTypes: Array<{ productType: string; count: number }>;
    periods: Array<{ period: string; completed: number; onTime: number; delayed: number }>;
  };
  carriers: CarrierScorecard[];
};

export type HealthModel = {
  ok: true;
  service: string;
  demoMode: boolean;
  time: string;
};
