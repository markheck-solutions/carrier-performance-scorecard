import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

type Check = {
  id: string;
  description: string;
  test: (content: string) => boolean;
};

const agentsPath = path.join(process.cwd(), "AGENTS.md");

if (!existsSync(agentsPath)) {
  console.error("[agents-verify] AGENTS.md is missing.");
  process.exit(1);
}

const content = readFileSync(agentsPath, "utf8");

const checks: Check[] = [
  {
    id: "nextjs-caution-heading",
    description: "Next.js version caution heading is present",
    test: (value) => value.includes("This is NOT the Next.js you know"),
  },
  {
    id: "nextjs-docs-caution",
    description: "Next.js docs caution is present",
    test: (value) => value.includes("node_modules/next/dist/docs/"),
  },
  {
    id: "plain-dash-rule",
    description: "No em dash prose rule is present",
    test: (value) => /no em dash characters/i.test(value) && /U\+2014/.test(value),
  },
  {
    id: "no-unicode-dash",
    description: "AGENTS.md contains no Unicode dash punctuation",
    test: (value) => !/[\u2013\u2014\u2015]/.test(value),
  },
];

const failures = checks.filter((check) => !check.test(content));

if (failures.length > 0) {
  for (const failure of failures) {
    console.error(`[agents-verify] Failed ${failure.id}: ${failure.description}`);
  }
  process.exit(1);
}

console.log("[agents-verify] OK");
