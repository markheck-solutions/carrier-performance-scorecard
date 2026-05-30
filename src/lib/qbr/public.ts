import type { ProductType, Region } from "@/lib/db/demo-values";
import type { ScoreScope } from "@/lib/scoring/types";

export type QbrProviderId = "mock" | "local";

export type QbrBriefRequestBody = {
  carrierId: string;
  region?: Region | null;
  productType?: ProductType | null;
  period?: string | null;
  /**
   * Optional deterministic variation selector for the mock provider.
   * Same context + same variant => same output.
   */
  variant?: number | null;
};

export type QbrBriefSections = {
  strengths: string[];
  concerns: string[];
  questions: string[];
  governanceActions: string[];
};

export type QbrBriefResponse =
  | {
      ok: true;
      provider: { id: QbrProviderId };
      carrier: { id: string; name: string; shortCode: string };
      scope: ScoreScope;
      brief: QbrBriefSections;
      dataNotice: { kind: "limited_data"; message: string } | null;
    }
  | {
      ok: false;
      error: { code: string; message: string };
    };
