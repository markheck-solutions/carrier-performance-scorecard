import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import {
  CUSTOMER_IMPACT_VALUES,
  DELAY_REASON_VALUES,
  DELIVERY_STAGE_VALUES,
  PRODUCT_TYPE_VALUES,
  REGION_VALUES,
  RELATIONSHIP_TIER_VALUES,
} from "./demo-values";

const sqlInList = (values: readonly string[]) =>
  sql.raw(`('${values.map((v) => v.replaceAll("'", "''")).join("','")}')`);

export const seedMeta = pgTable("seed_meta", {
  datasetId: text("dataset_id").primaryKey().notNull(),
  seedVersion: text("seed_version").notNull(),
  fingerprint: text("fingerprint").notNull(),
  seededAt: timestamp("seeded_at", { withTimezone: true }).notNull().defaultNow(),
});

export const carriers = pgTable(
  "carriers",
  {
    id: uuid("id").primaryKey().notNull(),
    seedKey: text("seed_key").notNull(),
    name: text("name").notNull(),
    shortCode: varchar("short_code", { length: 16 }).notNull(),
    relationshipTier: text("relationship_tier").notNull(),
    regionFocus: text("region_focus").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    seedKeyUnique: uniqueIndex("carriers_seed_key_unique").on(t.seedKey),
    shortCodeUnique: uniqueIndex("carriers_short_code_unique").on(t.shortCode),
    tierCheck: check(
      "carriers_relationship_tier_check",
      sql`${t.relationshipTier} in ${sqlInList(RELATIONSHIP_TIER_VALUES)}`,
    ),
    regionFocusCheck: check("carriers_region_focus_check", sql`${t.regionFocus} in ${sqlInList(REGION_VALUES)}`),
  }),
);

export const periods = pgTable(
  "periods",
  {
    id: uuid("id").primaryKey().notNull(),
    seedKey: text("seed_key").notNull(),
    label: text("label").notNull(),
    startDate: date("start_date").notNull(),
    endDate: date("end_date").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    seedKeyUnique: uniqueIndex("periods_seed_key_unique").on(t.seedKey),
    dateOrderCheck: check("periods_date_order_check", sql`${t.endDate} >= ${t.startDate}`),
  }),
);

export const deliveryRecords = pgTable(
  "delivery_records",
  {
    id: uuid("id").primaryKey().notNull(),
    seedKey: text("seed_key").notNull(),
    carrierId: uuid("carrier_id")
      .notNull()
      .references(() => carriers.id, { onDelete: "restrict", onUpdate: "cascade" }),
    periodId: uuid("period_id")
      .notNull()
      .references(() => periods.id, { onDelete: "restrict", onUpdate: "cascade" }),
    region: text("region").notNull(),
    productType: text("product_type").notNull(),
    stage: text("stage").notNull(),
    delayReason: text("delay_reason").notNull(),
    committedDate: date("committed_date").notNull(),
    forecastDate: date("forecast_date"),
    completedDate: date("completed_date"),
    openedAt: timestamp("opened_at", { withTimezone: true }).notNull(),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    delayDays: integer("delay_days").notNull(),
    responsivenessHours: integer("responsiveness_hours").notNull(),
    escalationCount: integer("escalation_count").notNull(),
    issueSignature: text("issue_signature").notNull(),
    isRepeat: boolean("is_repeat").notNull(),
    customerImpact: text("customer_impact").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    seedKeyUnique: uniqueIndex("delivery_records_seed_key_unique").on(t.seedKey),
    regionCheck: check("delivery_records_region_check", sql`${t.region} in ${sqlInList(REGION_VALUES)}`),
    productTypeCheck: check(
      "delivery_records_product_type_check",
      sql`${t.productType} in ${sqlInList(PRODUCT_TYPE_VALUES)}`,
    ),
    stageCheck: check("delivery_records_stage_check", sql`${t.stage} in ${sqlInList(DELIVERY_STAGE_VALUES)}`),
    delayReasonCheck: check(
      "delivery_records_delay_reason_check",
      sql`${t.delayReason} in ${sqlInList(DELAY_REASON_VALUES)}`,
    ),
    customerImpactCheck: check(
      "delivery_records_customer_impact_check",
      sql`${t.customerImpact} in ${sqlInList(CUSTOMER_IMPACT_VALUES)}`,
    ),
    nonNegativeDelayDays: check("delivery_records_delay_days_nonneg", sql`${t.delayDays} >= 0`),
    nonNegativeResp: check("delivery_records_responsiveness_nonneg", sql`${t.responsivenessHours} >= 0`),
    nonNegativeEscalations: check("delivery_records_escalations_nonneg", sql`${t.escalationCount} >= 0`),
    completedAfterCommitted: check(
      "delivery_records_completed_after_committed_check",
      sql`${t.completedDate} is null or ${t.completedDate} >= ${t.committedDate}`,
    ),
    closedAfterOpened: check(
      "delivery_records_closed_after_opened_check",
      sql`${t.closedAt} is null or ${t.closedAt} >= ${t.openedAt}`,
    ),
    delayDaysMatchesReason: check(
      "delivery_records_delay_reason_days_consistency_check",
      sql`(${t.delayReason} = 'none' and ${t.delayDays} = 0) or (${t.delayReason} <> 'none' and ${t.delayDays} >= 0)`,
    ),
  }),
);

export const evidenceItems = pgTable(
  "evidence_items",
  {
    id: uuid("id").primaryKey().notNull(),
    seedKey: text("seed_key").notNull(),
    carrierId: uuid("carrier_id")
      .notNull()
      .references(() => carriers.id, { onDelete: "restrict", onUpdate: "cascade" }),
    periodId: uuid("period_id")
      .notNull()
      .references(() => periods.id, { onDelete: "restrict", onUpdate: "cascade" }),
    deliveryRecordId: uuid("delivery_record_id")
      .notNull()
      .references(() => deliveryRecords.id, { onDelete: "restrict", onUpdate: "cascade" }),
    dimension: text("dimension").notNull(),
    summary: text("summary").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    seedKeyUnique: uniqueIndex("evidence_items_seed_key_unique").on(t.seedKey),
  }),
);

export const schema = {
  seedMeta,
  carriers,
  periods,
  deliveryRecords,
  evidenceItems,
};
