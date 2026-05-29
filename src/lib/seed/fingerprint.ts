import { createHash } from "node:crypto";

import type { DemoDataset } from "./demo-dataset";

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((v) => stableStringify(v)).join(",")}]`;
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(",")}}`;
}

function sortBySeedKey<T extends { seedKey: string }>(rows: readonly T[]): T[] {
  return [...rows].sort((a, b) => a.seedKey.localeCompare(b.seedKey));
}

export function computeDatasetFingerprint(dataset: DemoDataset) {
  const canonical = {
    datasetId: dataset.datasetId,
    seedVersion: dataset.seedVersion,
    carriers: sortBySeedKey(dataset.carriers),
    periods: sortBySeedKey(dataset.periods),
    deliveryRecords: sortBySeedKey(dataset.deliveryRecords),
    evidenceItems: sortBySeedKey(dataset.evidenceItems),
  };

  const serialized = stableStringify(canonical);
  const digest = createHash("sha256").update(serialized).digest("hex");
  return { digest, serializedLength: serialized.length };
}
