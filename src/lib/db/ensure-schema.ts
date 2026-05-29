import { sql } from "drizzle-orm";
import type { PgliteDatabase } from "drizzle-orm/pglite";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

import {
  CUSTOMER_IMPACT_VALUES,
  DELAY_REASON_VALUES,
  DELIVERY_STAGE_VALUES,
  PRODUCT_TYPE_VALUES,
  REGION_VALUES,
  RELATIONSHIP_TIER_VALUES,
} from "./demo-values";
import { schema } from "./schema";

export type DemoDb = PostgresJsDatabase<typeof schema> | PgliteDatabase<typeof schema>;

function sqlQuotedList(values: readonly string[]) {
  return `('${values.map((v) => v.replaceAll("'", "''")).join("','")}')`;
}

export async function ensureDemoSchema(db: DemoDb) {
  await db.execute(sql`
    create table if not exists seed_meta (
      dataset_id text primary key,
      seed_version text not null,
      fingerprint text not null,
      seeded_at timestamptz not null default now()
    );
  `);

  await db.execute(
    sql.raw(`
      create table if not exists carriers (
        id uuid primary key,
        seed_key text not null,
        name text not null,
        short_code varchar(16) not null,
        relationship_tier text not null,
        region_focus text not null,
        created_at timestamptz not null default now(),
        constraint carriers_relationship_tier_check check (relationship_tier in ${sqlQuotedList(
          RELATIONSHIP_TIER_VALUES
        )}),
        constraint carriers_region_focus_check check (region_focus in ${sqlQuotedList(REGION_VALUES)})
      );
    `)
  );

  await db.execute(sql`create unique index if not exists carriers_seed_key_unique on carriers (seed_key);`);
  await db.execute(sql`create unique index if not exists carriers_short_code_unique on carriers (short_code);`);

  await db.execute(
    sql.raw(`
      create table if not exists periods (
        id uuid primary key,
        seed_key text not null,
        label text not null,
        start_date date not null,
        end_date date not null,
        created_at timestamptz not null default now(),
        constraint periods_date_order_check check (end_date >= start_date)
      );
    `)
  );

  await db.execute(sql`create unique index if not exists periods_seed_key_unique on periods (seed_key);`);

  await db.execute(
    sql.raw(`
      create table if not exists delivery_records (
        id uuid primary key,
        seed_key text not null,
        carrier_id uuid not null references carriers(id) on update cascade on delete restrict,
        period_id uuid not null references periods(id) on update cascade on delete restrict,
        region text not null,
        product_type text not null,
        stage text not null,
        delay_reason text not null,
        committed_date date not null,
        forecast_date date null,
        completed_date date null,
        opened_at timestamptz not null,
        closed_at timestamptz null,
        delay_days integer not null,
        responsiveness_hours integer not null,
        escalation_count integer not null,
        issue_signature text not null,
        is_repeat boolean not null,
        customer_impact text not null,
        created_at timestamptz not null default now(),
        constraint delivery_records_region_check check (region in ${sqlQuotedList(REGION_VALUES)}),
        constraint delivery_records_product_type_check check (product_type in ${sqlQuotedList(
          PRODUCT_TYPE_VALUES
        )}),
        constraint delivery_records_stage_check check (stage in ${sqlQuotedList(DELIVERY_STAGE_VALUES)}),
        constraint delivery_records_delay_reason_check check (delay_reason in ${sqlQuotedList(
          DELAY_REASON_VALUES
        )}),
        constraint delivery_records_customer_impact_check check (customer_impact in ${sqlQuotedList(
          CUSTOMER_IMPACT_VALUES
        )}),
        constraint delivery_records_delay_days_nonneg check (delay_days >= 0),
        constraint delivery_records_responsiveness_nonneg check (responsiveness_hours >= 0),
        constraint delivery_records_escalations_nonneg check (escalation_count >= 0),
        constraint delivery_records_completed_after_committed_check check (
          completed_date is null or completed_date >= committed_date
        ),
        constraint delivery_records_closed_after_opened_check check (closed_at is null or closed_at >= opened_at),
        constraint delivery_records_delay_reason_days_consistency_check check (
          (delay_reason = 'none' and delay_days = 0) or (delay_reason <> 'none' and delay_days >= 0)
        )
      );
    `)
  );

  await db.execute(
    sql`create unique index if not exists delivery_records_seed_key_unique on delivery_records (seed_key);`
  );

  await db.execute(
    sql.raw(`
      create table if not exists evidence_items (
        id uuid primary key,
        seed_key text not null,
        carrier_id uuid not null references carriers(id) on update cascade on delete restrict,
        period_id uuid not null references periods(id) on update cascade on delete restrict,
        delivery_record_id uuid not null references delivery_records(id) on update cascade on delete restrict,
        dimension text not null,
        summary text not null,
        created_at timestamptz not null default now()
      );
    `)
  );

  await db.execute(sql`create unique index if not exists evidence_items_seed_key_unique on evidence_items (seed_key);`);
}
