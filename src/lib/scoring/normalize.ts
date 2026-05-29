export function clamp(value: number, floor: number, cap: number) {
  if (!Number.isFinite(value)) return floor;
  return Math.min(cap, Math.max(floor, value));
}

export function roundTo(value: number, decimals: number) {
  if (!Number.isFinite(value)) return 0;
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

export function normalizeLinear(params: {
  value: number;
  best: number;
  worst: number;
  floor: number;
  cap: number;
  direction: "higher_is_better" | "lower_is_better";
}) {
  const capped = clamp(params.value, params.floor, params.cap);
  const best = params.best;
  const worst = params.worst;

  const denom = best - worst;
  if (!Number.isFinite(denom) || denom === 0) return 0;

  const raw =
    params.direction === "higher_is_better"
      ? (capped - worst) / denom
      : (worst - capped) / (worst - best);

  const clamped = clamp(raw, 0, 1);
  return clamped * 100;
}
