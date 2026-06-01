import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

type Finding = {
  file: string;
  detail: string;
};

const root = process.cwd();
const requiredFiles = [
  ".github/workflows/release-notes.yml",
  ".github/workflows/release.yml",
  ".github/workflows/ci-failure-issue.yml",
];

const findings: Finding[] = [];

for (const file of requiredFiles) {
  const absoluteFilePath = path.join(root, file);
  if (!existsSync(absoluteFilePath)) {
    findings.push({ file, detail: "Required automation workflow is missing." });
    continue;
  }

  const text = readFileSync(absoluteFilePath, "utf8");
  if (/secrets\.(?!GITHUB_TOKEN)/.test(text)) {
    findings.push({
      file,
      detail: "Workflow should not require external secrets for release notes or release basics.",
    });
  }
}

const releaseNotesPath = path.join(root, ".github/workflows/release-notes.yml");
if (existsSync(releaseNotesPath)) {
  const text = readFileSync(releaseNotesPath, "utf8");
  if (!text.includes("generateReleaseNotes")) {
    findings.push({
      file: ".github/workflows/release-notes.yml",
      detail: "GitHub release note generation is missing.",
    });
  }
}

const releasePath = path.join(root, ".github/workflows/release.yml");
if (existsSync(releasePath)) {
  const text = readFileSync(releasePath, "utf8");
  if (!text.includes("createRelease")) {
    findings.push({ file: ".github/workflows/release.yml", detail: "GitHub release creation is missing." });
  }
  if (!text.includes("dry_run")) {
    findings.push({ file: ".github/workflows/release.yml", detail: "Release workflow needs a dry run control." });
  }
}

if (findings.length > 0) {
  console.error("[release-notes-check] Release automation findings:");
  for (const finding of findings) {
    console.error(`- ${finding.file}: ${finding.detail}`);
  }
  process.exit(1);
}

console.log("[release-notes-check] OK. Release notes, release, and CI failure insight workflows are configured.");
