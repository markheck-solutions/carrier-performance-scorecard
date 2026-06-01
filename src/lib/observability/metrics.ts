export type MetricLabels = Record<string, string | number | boolean | null | undefined>;

export type CounterMetric = {
  type: "counter";
  name: string;
  labels: Record<string, string>;
  value: number;
};

export type HistogramMetric = {
  type: "histogram";
  name: string;
  labels: Record<string, string>;
  count: number;
  sum: number;
  min: number;
  max: number;
};

export type MetricsSnapshot = {
  generatedAt: string;
  counters: CounterMetric[];
  histograms: HistogramMetric[];
};

const MAX_LABEL_LENGTH = 80;
const SAFE_NAME_PATTERN = /[^a-zA-Z0-9_:.-]/g;
const SENSITIVE_KEY_PATTERN = /authorization|cookie|token|secret|password|passphrase|api[-_]?key|database[-_]?url|dsn/i;
const SENSITIVE_VALUE_PATTERNS = [
  /\b(?:postgres|postgresql|mysql|mongodb(?:\+srv)?):\/\/[^\s"'`]+/gi,
  /\bBearer\s+[A-Za-z0-9._-]{12,}\b/gi,
  /\bsk-[A-Za-z0-9_-]{12,}\b/gi,
];

const counters = new Map<string, CounterMetric>();
const histograms = new Map<string, HistogramMetric>();

function sanitizeName(name: string): string {
  const normalized = name.trim().replace(SAFE_NAME_PATTERN, "_").slice(0, 120);
  return normalized.length > 0 ? normalized : "unnamed_metric";
}

function sanitizeLabelValue(key: string, value: unknown): string {
  if (SENSITIVE_KEY_PATTERN.test(key)) return "[redacted]";
  const raw = String(value ?? "none");
  const redacted = SENSITIVE_VALUE_PATTERNS.reduce((current, pattern) => current.replace(pattern, "[redacted]"), raw);
  return redacted.slice(0, MAX_LABEL_LENGTH);
}

function sanitizeLabels(labels: MetricLabels = {}): Record<string, string> {
  const safeEntries = Object.entries(labels)
    .map(([key, value]) => [sanitizeName(key), sanitizeLabelValue(key, value)] as const)
    .sort(([a], [b]) => a.localeCompare(b));
  return Object.fromEntries(safeEntries);
}

function keyFor(name: string, labels: Record<string, string>): string {
  return JSON.stringify({ name, labels });
}

export function incrementMetric(name: string, labels: MetricLabels = {}, amount = 1): CounterMetric {
  const safeName = sanitizeName(name);
  const safeLabels = sanitizeLabels(labels);
  const key = keyFor(safeName, safeLabels);
  const current = counters.get(key) ?? { type: "counter", name: safeName, labels: safeLabels, value: 0 };
  current.value += Number.isFinite(amount) && amount > 0 ? amount : 1;
  counters.set(key, current);
  return { ...current, labels: { ...current.labels } };
}

export function observeMetric(name: string, value: number, labels: MetricLabels = {}): HistogramMetric {
  const safeName = sanitizeName(name);
  const safeLabels = sanitizeLabels(labels);
  const safeValue = Number.isFinite(value) ? value : 0;
  const key = keyFor(safeName, safeLabels);
  const current =
    histograms.get(key) ??
    ({
      type: "histogram",
      name: safeName,
      labels: safeLabels,
      count: 0,
      sum: 0,
      min: safeValue,
      max: safeValue,
    } satisfies HistogramMetric);
  current.count += 1;
  current.sum += safeValue;
  current.min = Math.min(current.min, safeValue);
  current.max = Math.max(current.max, safeValue);
  histograms.set(key, current);
  return { ...current, labels: { ...current.labels } };
}

export function snapshotMetrics(now = new Date()): MetricsSnapshot {
  const byName = (
    a: { name: string; labels: Record<string, string> },
    b: { name: string; labels: Record<string, string> },
  ) => a.name.localeCompare(b.name) || JSON.stringify(a.labels).localeCompare(JSON.stringify(b.labels));

  return {
    generatedAt: now.toISOString(),
    counters: Array.from(counters.values())
      .map((metric) => ({ ...metric, labels: { ...metric.labels } }))
      .sort(byName),
    histograms: Array.from(histograms.values())
      .map((metric) => ({ ...metric, labels: { ...metric.labels } }))
      .sort(byName),
  };
}

export function resetMetricsForTests(): void {
  counters.clear();
  histograms.clear();
}
