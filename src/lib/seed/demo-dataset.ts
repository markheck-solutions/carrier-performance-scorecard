import type {
  CustomerImpact,
  DelayReason,
  DeliveryStage,
  ProductType,
  Region,
  RelationshipTier,
} from "../domain/demo-values";
import { DEMO_DATASET_ID, DEMO_SEED_VERSION } from "../domain/demo-values";

export type DemoCarrier = {
  id: string;
  seedKey: string;
  name: string;
  shortCode: string;
  relationshipTier: RelationshipTier;
  regionFocus: Region;
};

export type DemoPeriod = {
  id: string;
  seedKey: string;
  label: string;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
};

export type DemoDeliveryRecord = {
  id: string;
  seedKey: string;
  carrierId: string;
  periodId: string;
  region: Region;
  productType: ProductType;
  stage: DeliveryStage;
  delayReason: DelayReason;
  committedDate: string; // YYYY-MM-DD
  forecastDate?: string | null; // YYYY-MM-DD
  completedDate?: string | null; // YYYY-MM-DD
  openedAt: string; // ISO
  closedAt?: string | null; // ISO
  delayDays: number;
  responsivenessHours: number;
  escalationCount: number;
  issueSignature: string;
  isRepeat: boolean;
  customerImpact: CustomerImpact;
};

export type DemoEvidenceItem = {
  id: string;
  seedKey: string;
  carrierId: string;
  periodId: string;
  deliveryRecordId: string;
  dimension: string;
  summary: string;
};

export type DemoDataset = {
  datasetId: string;
  seedVersion: string;
  carriers: DemoCarrier[];
  periods: DemoPeriod[];
  deliveryRecords: DemoDeliveryRecord[];
  evidenceItems: DemoEvidenceItem[];
};

export function buildDemoDataset(): DemoDataset {
  const carriers: DemoCarrier[] = [
    {
      id: "6d1f6ed0-26b9-4a2d-a1e0-2d5dcbf5b2f1",
      seedKey: "carrier:northlane",
      name: "Northlane Fiberworks",
      shortCode: "NLF",
      relationshipTier: "core",
      regionFocus: "na",
    },
    {
      id: "bbd1dc33-25c9-4d8f-b234-3a5a6d7d9f0c",
      seedKey: "carrier:skybridge",
      name: "SkyBridge MetroNet",
      shortCode: "SBM",
      relationshipTier: "strategic",
      regionFocus: "emea",
    },
    {
      id: "c0d9aa25-0b19-4c1a-9c93-5c8b9f2f1df0",
      seedKey: "carrier:aurora",
      name: "Aurora TransitLink",
      shortCode: "ATLX",
      relationshipTier: "approved",
      regionFocus: "apac",
    },
    {
      id: "4fd3e1f0-8a25-4aa7-9c38-9e54f8d0fcd6",
      seedKey: "carrier:pinecrest",
      name: "Pinecrest Backbone Cooperative",
      shortCode: "PBC",
      relationshipTier: "approved",
      regionFocus: "na",
    },
    {
      id: "b1a87f62-0d5b-4c2a-b5a8-718d0ea2b7d7",
      seedKey: "carrier:copperfield",
      name: "Copperfield Connect",
      shortCode: "CFC",
      relationshipTier: "new",
      regionFocus: "emea",
    },
  ];

  const periods: DemoPeriod[] = [
    {
      id: "53cc9c40-9f35-4bf8-9e2a-c0aa6a8c1d35",
      seedKey: "2026-01",
      label: "2026 Jan",
      startDate: "2026-01-01",
      endDate: "2026-01-31",
    },
    {
      id: "243b4f9e-a8dd-46b4-9d86-5d7b5d3f2be2",
      seedKey: "2026-02",
      label: "2026 Feb",
      startDate: "2026-02-01",
      endDate: "2026-02-28",
    },
    {
      id: "0ea668e4-9f5f-4f6a-a9bb-40a33b8ed3a1",
      seedKey: "2026-03",
      label: "2026 Mar",
      startDate: "2026-03-01",
      endDate: "2026-03-31",
    },
    {
      id: "5d2ed9cf-6f6d-4b13-9a93-1c43e9a1f55d",
      seedKey: "2026-04",
      label: "2026 Apr",
      startDate: "2026-04-01",
      endDate: "2026-04-30",
    },
    {
      id: "c3f5a2ef-ae69-4e62-aaf3-3a4c9a4b7a0b",
      seedKey: "2026-05",
      label: "2026 May",
      startDate: "2026-05-01",
      endDate: "2026-05-31",
    },
    {
      id: "c22de0a4-3c09-44f2-9ae7-0d42d8a1cf1a",
      seedKey: "2026-06",
      label: "2026 Jun",
      startDate: "2026-06-01",
      endDate: "2026-06-30",
    },
  ];

  const byCarrier = Object.fromEntries(carriers.map((c) => [c.seedKey, c.id]));
  const byPeriod = Object.fromEntries(periods.map((p) => [p.seedKey, p.id]));

  const deliveryRecords: DemoDeliveryRecord[] = [
    // Northlane: improving completion trend, mostly on-time by late periods.
    {
      id: "1d5d7a5d-3d74-4f9f-9eab-0b6c3b5ce9a2",
      seedKey: "dr:northlane:2026-01:fiber:permit:delayed",
      carrierId: byCarrier["carrier:northlane"],
      periodId: byPeriod["2026-01"],
      region: "na",
      productType: "fiber",
      stage: "completed",
      delayReason: "permit",
      committedDate: "2026-01-18",
      forecastDate: "2026-01-26",
      completedDate: "2026-01-26",
      openedAt: "2026-01-03T14:00:00.000Z",
      closedAt: "2026-01-26T18:00:00.000Z",
      delayDays: 8,
      responsivenessHours: 20,
      escalationCount: 1,
      issueSignature: "permit:na:fiber",
      isRepeat: false,
      customerImpact: "medium",
    },
    {
      id: "b8c0b5f4-0db1-4dbe-a845-3b3f7e7fd8b1",
      seedKey: "dr:northlane:2026-02:fiber:none:on_time",
      carrierId: byCarrier["carrier:northlane"],
      periodId: byPeriod["2026-02"],
      region: "na",
      productType: "fiber",
      stage: "completed",
      delayReason: "none",
      committedDate: "2026-02-14",
      forecastDate: "2026-02-14",
      completedDate: "2026-02-14",
      openedAt: "2026-02-01T16:00:00.000Z",
      closedAt: "2026-02-14T17:00:00.000Z",
      delayDays: 0,
      responsivenessHours: 6,
      escalationCount: 0,
      issueSignature: "none:na:fiber",
      isRepeat: false,
      customerImpact: "low",
    },
    {
      id: "c3b0c301-ef3d-4a5e-9242-0b8c5a1df12e",
      seedKey: "dr:northlane:2026-03:wireless:construction:minor",
      carrierId: byCarrier["carrier:northlane"],
      periodId: byPeriod["2026-03"],
      region: "na",
      productType: "wireless",
      stage: "completed",
      delayReason: "construction",
      committedDate: "2026-03-10",
      forecastDate: "2026-03-12",
      completedDate: "2026-03-12",
      openedAt: "2026-03-02T15:00:00.000Z",
      closedAt: "2026-03-12T15:30:00.000Z",
      delayDays: 2,
      responsivenessHours: 10,
      escalationCount: 0,
      issueSignature: "construction:na:wireless",
      isRepeat: false,
      customerImpact: "low",
    },
    {
      id: "0b63d17a-b8f5-4a9f-94bd-1b5a4e71d6b4",
      seedKey: "dr:northlane:2026-04:fiber:none:on_time",
      carrierId: byCarrier["carrier:northlane"],
      periodId: byPeriod["2026-04"],
      region: "na",
      productType: "fiber",
      stage: "completed",
      delayReason: "none",
      committedDate: "2026-04-09",
      forecastDate: "2026-04-09",
      completedDate: "2026-04-09",
      openedAt: "2026-04-01T18:00:00.000Z",
      closedAt: "2026-04-09T18:20:00.000Z",
      delayDays: 0,
      responsivenessHours: 4,
      escalationCount: 0,
      issueSignature: "none:na:fiber",
      isRepeat: false,
      customerImpact: "low",
    },
    {
      id: "16c3e12d-0e59-4b9e-bc7d-7c5b03d2a2cf",
      seedKey: "dr:northlane:2026-05:edge:none:on_time",
      carrierId: byCarrier["carrier:northlane"],
      periodId: byPeriod["2026-05"],
      region: "na",
      productType: "edge",
      stage: "completed",
      delayReason: "none",
      committedDate: "2026-05-22",
      forecastDate: "2026-05-22",
      completedDate: "2026-05-22",
      openedAt: "2026-05-04T14:00:00.000Z",
      closedAt: "2026-05-22T14:10:00.000Z",
      delayDays: 0,
      responsivenessHours: 5,
      escalationCount: 0,
      issueSignature: "none:na:edge",
      isRepeat: false,
      customerImpact: "low",
    },
    {
      id: "fe0ed3f2-2f4d-4fe2-9f0b-8ab7d0d4d6e3",
      seedKey: "dr:northlane:2026-06:fiber:none:on_time",
      carrierId: byCarrier["carrier:northlane"],
      periodId: byPeriod["2026-06"],
      region: "na",
      productType: "fiber",
      stage: "completed",
      delayReason: "none",
      committedDate: "2026-06-12",
      forecastDate: "2026-06-12",
      completedDate: "2026-06-12",
      openedAt: "2026-06-01T15:00:00.000Z",
      closedAt: "2026-06-12T15:05:00.000Z",
      delayDays: 0,
      responsivenessHours: 3,
      escalationCount: 0,
      issueSignature: "none:na:fiber",
      isRepeat: false,
      customerImpact: "low",
    },

    // SkyBridge: repeat access issues, slower responsiveness, higher escalations, declining trend.
    {
      id: "f5b0b71e-3916-4b6e-8c2a-4c2f0a4b8d21",
      seedKey: "dr:skybridge:2026-01:colocation:access:repeat_1",
      carrierId: byCarrier["carrier:skybridge"],
      periodId: byPeriod["2026-01"],
      region: "emea",
      productType: "colocation",
      stage: "completed",
      delayReason: "access",
      committedDate: "2026-01-20",
      forecastDate: "2026-02-05",
      completedDate: "2026-02-05",
      openedAt: "2026-01-06T10:00:00.000Z",
      closedAt: "2026-02-05T13:00:00.000Z",
      delayDays: 16,
      responsivenessHours: 56,
      escalationCount: 3,
      issueSignature: "access:emea:colocation:site_window",
      isRepeat: true,
      customerImpact: "high",
    },
    {
      id: "d2b8d4b4-2b7a-49f8-9e2f-b3a2e0f1b6a7",
      seedKey: "dr:skybridge:2026-02:colocation:access:repeat_2",
      carrierId: byCarrier["carrier:skybridge"],
      periodId: byPeriod["2026-02"],
      region: "emea",
      productType: "colocation",
      stage: "completed",
      delayReason: "access",
      committedDate: "2026-02-12",
      forecastDate: "2026-03-01",
      completedDate: "2026-03-01",
      openedAt: "2026-02-02T09:30:00.000Z",
      closedAt: "2026-03-01T12:10:00.000Z",
      delayDays: 17,
      responsivenessHours: 60,
      escalationCount: 2,
      issueSignature: "access:emea:colocation:site_window",
      isRepeat: true,
      customerImpact: "high",
    },
    {
      id: "aa1b0f95-1f6a-40f9-9b64-2f2c0d5d3b2a",
      seedKey: "dr:skybridge:2026-03:wireless:capacity:delayed",
      carrierId: byCarrier["carrier:skybridge"],
      periodId: byPeriod["2026-03"],
      region: "emea",
      productType: "wireless",
      stage: "completed",
      delayReason: "capacity",
      committedDate: "2026-03-08",
      forecastDate: "2026-03-22",
      completedDate: "2026-03-22",
      openedAt: "2026-03-01T11:00:00.000Z",
      closedAt: "2026-03-22T16:00:00.000Z",
      delayDays: 14,
      responsivenessHours: 30,
      escalationCount: 1,
      issueSignature: "capacity:emea:wireless",
      isRepeat: false,
      customerImpact: "medium",
    },
    {
      id: "b0c4d0f6-6c4f-41d1-8b37-1e0a3a7a0f74",
      seedKey: "dr:skybridge:2026-04:fiber:handoff:open_aging",
      carrierId: byCarrier["carrier:skybridge"],
      periodId: byPeriod["2026-04"],
      region: "emea",
      productType: "fiber",
      stage: "open",
      delayReason: "handoff",
      committedDate: "2026-04-15",
      forecastDate: null,
      completedDate: null,
      openedAt: "2026-03-10T12:00:00.000Z",
      closedAt: null,
      delayDays: 12,
      responsivenessHours: 72,
      escalationCount: 4,
      issueSignature: "handoff:emea:fiber",
      isRepeat: false,
      customerImpact: "high",
    },
    {
      id: "91c7a052-2f5d-4e32-bc7b-827f0b8e4f1a",
      seedKey: "dr:skybridge:2026-05:colocation:access:repeat_3",
      carrierId: byCarrier["carrier:skybridge"],
      periodId: byPeriod["2026-05"],
      region: "emea",
      productType: "colocation",
      stage: "completed",
      delayReason: "access",
      committedDate: "2026-05-06",
      forecastDate: "2026-05-28",
      completedDate: "2026-05-28",
      openedAt: "2026-05-01T08:10:00.000Z",
      closedAt: "2026-05-28T10:00:00.000Z",
      delayDays: 22,
      responsivenessHours: 50,
      escalationCount: 3,
      issueSignature: "access:emea:colocation:site_window",
      isRepeat: true,
      customerImpact: "high",
    },

    // Aurora: low volume overall, but fast responsiveness; one weather outlier.
    {
      id: "4c7e1d3b-2b58-4a52-bd86-8f8a4b2c1f7d",
      seedKey: "dr:aurora:2026-03:wireless:none:on_time",
      carrierId: byCarrier["carrier:aurora"],
      periodId: byPeriod["2026-03"],
      region: "apac",
      productType: "wireless",
      stage: "completed",
      delayReason: "none",
      committedDate: "2026-03-19",
      forecastDate: "2026-03-19",
      completedDate: "2026-03-19",
      openedAt: "2026-03-05T05:00:00.000Z",
      closedAt: "2026-03-19T06:00:00.000Z",
      delayDays: 0,
      responsivenessHours: 2,
      escalationCount: 0,
      issueSignature: "none:apac:wireless",
      isRepeat: false,
      customerImpact: "low",
    },
    {
      id: "e2b4a7d0-1f8a-4d6c-9f5a-0c7b8e9d1a2b",
      seedKey: "dr:aurora:2026-05:wireless:weather:outlier",
      carrierId: byCarrier["carrier:aurora"],
      periodId: byPeriod["2026-05"],
      region: "apac",
      productType: "wireless",
      stage: "completed",
      delayReason: "weather",
      committedDate: "2026-05-11",
      forecastDate: "2026-05-25",
      completedDate: "2026-05-25",
      openedAt: "2026-05-02T05:00:00.000Z",
      closedAt: "2026-05-25T07:00:00.000Z",
      delayDays: 14,
      responsivenessHours: 4,
      escalationCount: 1,
      issueSignature: "weather:apac:wireless",
      isRepeat: false,
      customerImpact: "medium",
    },

    // Pinecrest: mixed performance, repeat inventory constraints on edge, moderate escalations.
    {
      id: "9f4e1c2b-3d5a-4b7c-8e9f-0a1b2c3d4e5f",
      seedKey: "dr:pinecrest:2026-02:edge:inventory:repeat_1",
      carrierId: byCarrier["carrier:pinecrest"],
      periodId: byPeriod["2026-02"],
      region: "na",
      productType: "edge",
      stage: "completed",
      delayReason: "inventory",
      committedDate: "2026-02-20",
      forecastDate: "2026-03-02",
      completedDate: "2026-03-02",
      openedAt: "2026-02-03T17:00:00.000Z",
      closedAt: "2026-03-02T17:10:00.000Z",
      delayDays: 10,
      responsivenessHours: 18,
      escalationCount: 1,
      issueSignature: "inventory:na:edge:sku_hold",
      isRepeat: true,
      customerImpact: "medium",
    },
    {
      id: "0f1e2d3c-4b5a-6978-9a0b-1c2d3e4f5a6b",
      seedKey: "dr:pinecrest:2026-03:edge:inventory:repeat_2",
      carrierId: byCarrier["carrier:pinecrest"],
      periodId: byPeriod["2026-03"],
      region: "na",
      productType: "edge",
      stage: "completed",
      delayReason: "inventory",
      committedDate: "2026-03-14",
      forecastDate: "2026-03-27",
      completedDate: "2026-03-27",
      openedAt: "2026-03-02T17:00:00.000Z",
      closedAt: "2026-03-27T17:20:00.000Z",
      delayDays: 13,
      responsivenessHours: 22,
      escalationCount: 2,
      issueSignature: "inventory:na:edge:sku_hold",
      isRepeat: true,
      customerImpact: "high",
    },
    {
      id: "3a4b5c6d-7e8f-4012-9345-6789abcdef01",
      seedKey: "dr:pinecrest:2026-06:fiber:none:on_time",
      carrierId: byCarrier["carrier:pinecrest"],
      periodId: byPeriod["2026-06"],
      region: "na",
      productType: "fiber",
      stage: "completed",
      delayReason: "none",
      committedDate: "2026-06-18",
      forecastDate: "2026-06-18",
      completedDate: "2026-06-18",
      openedAt: "2026-06-01T13:00:00.000Z",
      closedAt: "2026-06-18T13:10:00.000Z",
      delayDays: 0,
      responsivenessHours: 8,
      escalationCount: 0,
      issueSignature: "none:na:fiber",
      isRepeat: false,
      customerImpact: "low",
    },

    // Copperfield: new carrier, sparse data, one slow-response open item.
    {
      id: "abcdef01-2345-6789-abcd-ef0123456789",
      seedKey: "dr:copperfield:2026-04:fiber:change_request:open_low_volume",
      carrierId: byCarrier["carrier:copperfield"],
      periodId: byPeriod["2026-04"],
      region: "emea",
      productType: "fiber",
      stage: "in_progress",
      delayReason: "change_request",
      committedDate: "2026-04-28",
      forecastDate: null,
      completedDate: null,
      openedAt: "2026-04-04T10:00:00.000Z",
      closedAt: null,
      delayDays: 5,
      responsivenessHours: 80,
      escalationCount: 1,
      issueSignature: "change_request:emea:fiber",
      isRepeat: false,
      customerImpact: "medium",
    },
  ];

  const evidenceItems: DemoEvidenceItem[] = [
    {
      id: "7c2b7b6d-64bb-47b9-8e02-3cddb4ed1fb0",
      seedKey: "ev:northlane:permit:2026-01",
      carrierId: byCarrier["carrier:northlane"],
      periodId: byPeriod["2026-01"],
      deliveryRecordId: "1d5d7a5d-3d74-4f9f-9eab-0b6c3b5ce9a2",
      dimension: "commitment_adherence",
      summary:
        "Permitting packet required a resubmission cycle. Commit moved once, then stabilized with daily status updates.",
    },
    {
      id: "5f9b2b0b-0db9-4a1e-85c8-6f8459e0b216",
      seedKey: "ev:skybridge:access:repeat:2026-02",
      carrierId: byCarrier["carrier:skybridge"],
      periodId: byPeriod["2026-02"],
      deliveryRecordId: "d2b8d4b4-2b7a-49f8-9e2f-b3a2e0f1b6a7",
      dimension: "repeat_issue_concentration",
      summary:
        "Multiple deliveries hit the same site-window constraint. Escalations were needed to secure consistent access windows.",
    },
    {
      id: "2d4c6b8a-9e0f-4a2b-8c7d-6e5f4a3b2c1d",
      seedKey: "ev:skybridge:handoff:open:2026-04",
      carrierId: byCarrier["carrier:skybridge"],
      periodId: byPeriod["2026-04"],
      deliveryRecordId: "b0c4d0f6-6c4f-41d1-8b37-1e0a3a7a0f74",
      dimension: "aging_open_commitments",
      summary:
        "Handoff dependencies are pending with no forecast date. The item remains open with limited inbound updates.",
    },
    {
      id: "19a5c3e2-3d4f-4c5b-9a8e-7f6e5d4c3b2a",
      seedKey: "ev:aurora:weather:2026-05",
      carrierId: byCarrier["carrier:aurora"],
      periodId: byPeriod["2026-05"],
      deliveryRecordId: "e2b4a7d0-1f8a-4d6c-9f5a-0c7b8e9d1a2b",
      dimension: "delay_severity",
      summary:
        "Weather-driven access constraints pushed completion out by two weeks. Responsiveness remained strong during recovery.",
    },
    {
      id: "c2b1a0f9-e8d7-4c6b-9a8f-7e6d5c4b3a21",
      seedKey: "ev:pinecrest:inventory:repeat:2026-03",
      carrierId: byCarrier["carrier:pinecrest"],
      periodId: byPeriod["2026-03"],
      deliveryRecordId: "0f1e2d3c-4b5a-6978-9a0b-1c2d3e4f5a6b",
      dimension: "escalation_volume",
      summary:
        "Repeated inventory constraints drove multiple escalations to unblock allocation. Resolution required a revised build sequence.",
    },
    {
      id: "6e4d3c2b-1a0f-49e8-8d7c-6b5a4f3e2d1c",
      seedKey: "ev:copperfield:slow_response:2026-04",
      carrierId: byCarrier["carrier:copperfield"],
      periodId: byPeriod["2026-04"],
      deliveryRecordId: "abcdef01-2345-6789-abcd-ef0123456789",
      dimension: "responsiveness",
      summary:
        "Inbound status updates are infrequent. The work item is in progress with delayed confirmations on dependencies.",
    },
  ];

  return {
    datasetId: DEMO_DATASET_ID,
    seedVersion: DEMO_SEED_VERSION,
    carriers,
    periods,
    deliveryRecords,
    evidenceItems,
  };
}
