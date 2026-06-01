import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

type Finding = {
  detail: string;
};

const root = process.cwd();
const dependabotPath = path.join(root, ".github", "dependabot.yml");
const findings: Finding[] = [];

function sectionFor(text: string, ecosystem: string): string {
  const marker = `package-ecosystem: ${ecosystem}`;
  const start = text.indexOf(marker);
  if (start === -1) return "";
  const rest = text.slice(start);
  const next = rest.indexOf("\n  - package-ecosystem:", marker.length);
  return next === -1 ? rest : rest.slice(0, next);
}

function requireCooldown(section: string, ecosystem: string): void {
  if (!section) {
    findings.push({ detail: `Dependabot ecosystem ${ecosystem} is missing.` });
    return;
  }
  for (const key of ["default-days", "semver-major-days", "semver-minor-days", "semver-patch-days"]) {
    const match = section.match(new RegExp(`${key}:\\s*(\\d+)`));
    if (!match) {
      findings.push({ detail: `Dependabot ${ecosystem} cooldown is missing ${key}.` });
      continue;
    }
    const days = Number.parseInt(match[1] ?? "0", 10);
    if (!Number.isFinite(days) || days < 1) {
      findings.push({ detail: `Dependabot ${ecosystem} cooldown ${key} must be at least 1 day.` });
    }
  }
}

if (!existsSync(dependabotPath)) {
  findings.push({ detail: ".github/dependabot.yml is missing." });
} else {
  const text = readFileSync(dependabotPath, "utf8");
  requireCooldown(sectionFor(text, "npm"), "npm");
  requireCooldown(sectionFor(text, "github-actions"), "github-actions");
}

if (findings.length > 0) {
  console.error("[dependency-age-policy-check] Dependency age policy findings:");
  for (const finding of findings) {
    console.error(`- ${finding.detail}`);
  }
  process.exit(1);
}

console.log("[dependency-age-policy-check] OK. Dependabot cooldown policy is configured.");
