export const DEMO_DATASET_ID = "carrier-performance-scorecard-demo";
export const DEMO_SEED_VERSION = "v1";

export const REGION_VALUES = ["na", "emea", "apac", "latam"] as const;
export type Region = (typeof REGION_VALUES)[number];

export const PRODUCT_TYPE_VALUES = ["fiber", "wireless", "colocation", "edge"] as const;
export type ProductType = (typeof PRODUCT_TYPE_VALUES)[number];

export const RELATIONSHIP_TIER_VALUES = ["core", "strategic", "approved", "new"] as const;
export type RelationshipTier = (typeof RELATIONSHIP_TIER_VALUES)[number];

export const DELIVERY_STAGE_VALUES = ["open", "in_progress", "completed", "cancelled"] as const;
export type DeliveryStage = (typeof DELIVERY_STAGE_VALUES)[number];

export const DELAY_REASON_VALUES = [
  "none",
  "permit",
  "construction",
  "access",
  "inventory",
  "backhaul",
  "capacity",
  "change_request",
  "weather",
  "handoff",
] as const;
export type DelayReason = (typeof DELAY_REASON_VALUES)[number];

export const CUSTOMER_IMPACT_VALUES = ["low", "medium", "high"] as const;
export type CustomerImpact = (typeof CUSTOMER_IMPACT_VALUES)[number];
