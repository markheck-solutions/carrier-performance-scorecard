import fs from "node:fs";
import path from "node:path";

type Check = {
  id: string;
  description: string;
  pattern: RegExp;
};

function countMatches(pattern: RegExp, text: string): number {
  const matches = text.match(pattern);
  return matches ? matches.length : 0;
}

const readmePath = path.join(process.cwd(), "README.md");
const readme = fs.readFileSync(readmePath, "utf8");

const forbidden: Check[] = [
  {
    id: "next-template-default-port",
    description: "Next.js template default port",
    pattern: /localhost:3000/gi,
  },
  {
    id: "non-npm-yarn",
    description: "yarn quickstart instructions",
    pattern: /\byarn\b/gi,
  },
  {
    id: "non-npm-pnpm",
    description: "pnpm quickstart instructions",
    pattern: /\bpnpm\b/gi,
  },
  {
    id: "non-npm-bun",
    description: "bun quickstart instructions",
    pattern: /\bbun\b/gi,
  },
];

const required: Check[] = [
  {
    id: "approved-local-runtime",
    description: "approved local runtime address",
    pattern: /127\.0\.0\.1:3100/gi,
  },
  {
    id: "npm-workflow",
    description: "npm workflow is documented",
    pattern: /\bnpm\b/gi,
  },
];

let failed = false;

for (const check of forbidden) {
  const count = countMatches(check.pattern, readme);
  if (count > 0) {
    failed = true;
    console.error(`[README verify] Forbidden content found (${check.id}): ${check.description} (matches: ${count})`);
  }
}

for (const check of required) {
  const count = countMatches(check.pattern, readme);
  if (count === 0) {
    failed = true;
    console.error(`[README verify] Required content missing (${check.id}): ${check.description}`);
  }
}

if (failed) {
  process.exit(1);
}

console.log("[README verify] OK");
