import { FEATURE_FLAG_LIFECYCLE } from "../../src/lib/flags/feature-flags";

type Finding = {
  detail: string;
};

const findings: Finding[] = [];
const today = new Date();
today.setUTCHours(0, 0, 0, 0);

function parseDate(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

for (const [name, lifecycle] of Object.entries(FEATURE_FLAG_LIFECYCLE)) {
  if (!lifecycle.owner.trim()) {
    findings.push({ detail: `${name} is missing an owner.` });
  }
  if (!lifecycle.cleanupWhen.trim()) {
    findings.push({ detail: `${name} is missing cleanup criteria.` });
  }

  const introduced = parseDate(lifecycle.introduced);
  const reviewBy = parseDate(lifecycle.reviewBy);
  if (!introduced) {
    findings.push({ detail: `${name} has invalid introduced date ${lifecycle.introduced}.` });
  }
  if (!reviewBy) {
    findings.push({ detail: `${name} has invalid reviewBy date ${lifecycle.reviewBy}.` });
    continue;
  }
  if (reviewBy < today) {
    findings.push({ detail: `${name} passed its lifecycle review date ${lifecycle.reviewBy}.` });
  }
}

if (findings.length > 0) {
  console.error("[stale-feature-flag-check] Feature flag lifecycle findings:");
  for (const finding of findings) {
    console.error(`- ${finding.detail}`);
  }
  process.exit(1);
}

console.log("[stale-feature-flag-check] OK. Feature flags have current lifecycle metadata.");
