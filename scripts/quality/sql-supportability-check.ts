import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import * as ts from "typescript";

type RawSqlFinding = {
  file: string;
  kind: "db-execute-string" | "sql-raw" | "sql-template";
  line: number;
  text: string;
};

type SinkFinding = {
  file: string;
  kind: string;
  line: number;
};

type BaselineEntry = {
  file: string;
  kind: string;
  count: number;
  sha256?: string;
};

type Catalog = {
  version: 1;
  behaviorProof: {
    command: string;
    files: string[];
  };
  allowedSqlFiles: string[];
  rawSqlBaselines: BaselineEntry[];
  sinkBaselines: BaselineEntry[];
};

const ignoredDirectories = new Set([
  ".factory",
  ".git",
  ".next",
  ".vercel",
  "coverage",
  "node_modules",
  "playwright-report",
  "test-results",
]);

const sourceExtensions = new Set([".cjs", ".js", ".mjs", ".ts", ".tsx"]);
const dbReceiverNames = new Set(["db", "tx"]);
const drizzleSinkNames = new Set(["delete", "execute", "insert", "select", "update"]);
const requiredProofFiles = [
  "tests/unit/demo-data/seed-and-schema.test.ts",
  "tests/unit/scoring/scoring-engine.test.ts",
  "tests/unit/scoring/evidence-edgecases.test.ts",
];

function normalize(filePath: string): string {
  return filePath.replaceAll("\\", "/");
}

function listFromGit(root: string): string[] {
  const output = execFileSync("git", ["ls-files", "-z", "--cached", "--others", "--exclude-standard"], {
    cwd: root,
    encoding: "utf8",
  });
  return output
    .split("\0")
    .map((file) => file.trim())
    .filter(Boolean)
    .map(normalize)
    .sort((a, b) => a.localeCompare(b));
}

function isIgnored(file: string): boolean {
  return file.split("/").some((part) => ignoredDirectories.has(part));
}

function isSourceFile(file: string): boolean {
  return !isIgnored(file) && sourceExtensions.has(path.extname(file));
}

function parseJsonFile<T>(filePath: string): T {
  return JSON.parse(readFileSync(filePath, "utf8")) as T;
}

function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

function normalizeSnippet(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .trim();
}

function lineFor(sourceFile: ts.SourceFile, node: ts.Node): number {
  return sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
}

function expressionName(expression: ts.Expression): string | null {
  if (ts.isIdentifier(expression)) return expression.text;
  if (ts.isPropertyAccessExpression(expression)) return expression.name.text;
  return null;
}

function receiverName(expression: ts.Expression): string | null {
  if (!ts.isPropertyAccessExpression(expression)) return null;
  return expressionName(expression.expression);
}

function isSqlRawCall(node: ts.CallExpression): boolean {
  if (!ts.isPropertyAccessExpression(node.expression)) return false;
  return receiverName(node.expression) === "sql" && node.expression.name.text === "raw";
}

function isSqlTemplate(node: ts.TaggedTemplateExpression): boolean {
  return ts.isIdentifier(node.tag) && node.tag.text === "sql";
}

function sqlLikeString(node: ts.Expression): string | null {
  if (!ts.isStringLiteral(node) && !ts.isNoSubstitutionTemplateLiteral(node)) return null;
  return /\b(?:alter|create|delete|drop|insert|select|update)\b/i.test(node.text) ? node.text : null;
}

function sinkKind(node: ts.CallExpression): string | null {
  if (!ts.isPropertyAccessExpression(node.expression)) return null;
  const receiver = receiverName(node.expression);
  const method = node.expression.name.text;
  if (!receiver || !dbReceiverNames.has(receiver) || !drizzleSinkNames.has(method)) return null;
  return `${receiver}.${method}`;
}

function scanSourceFile(root: string, file: string): { rawSql: RawSqlFinding[]; sinks: SinkFinding[] } {
  const absolute = path.join(root, file);
  const text = readFileSync(absolute, "utf8");
  const sourceFile = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const rawSql: RawSqlFinding[] = [];
  const sinks: SinkFinding[] = [];

  function visit(node: ts.Node) {
    if (ts.isTaggedTemplateExpression(node) && isSqlTemplate(node)) {
      rawSql.push({
        file,
        kind: "sql-template",
        line: lineFor(sourceFile, node),
        text: normalizeSnippet(node.getText(sourceFile)),
      });
    }

    if (ts.isCallExpression(node)) {
      const kind = sinkKind(node);
      if (kind) sinks.push({ file, kind, line: lineFor(sourceFile, node) });
      if (isSqlRawCall(node)) {
        rawSql.push({
          file,
          kind: "sql-raw",
          line: lineFor(sourceFile, node),
          text: normalizeSnippet(node.getText(sourceFile)),
        });
      }
      const firstArg = node.arguments[0];
      const sqlText = firstArg ? sqlLikeString(firstArg) : null;
      if (kind?.endsWith(".execute") && sqlText) {
        rawSql.push({
          file,
          kind: "db-execute-string",
          line: lineFor(sourceFile, firstArg),
          text: normalizeSnippet(sqlText),
        });
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return { rawSql, sinks };
}

function collectInventory(root: string, files: string[]) {
  const rawSql: RawSqlFinding[] = [];
  const sinks: SinkFinding[] = [];
  const sqlFiles = files.filter((file) => !isIgnored(file) && file.endsWith(".sql"));

  for (const file of files.filter(isSourceFile)) {
    const scanned = scanSourceFile(root, file);
    rawSql.push(...scanned.rawSql);
    sinks.push(...scanned.sinks);
  }

  return { rawSql, sinks, sqlFiles };
}

function groupedRawBaselines(rawSql: RawSqlFinding[]): BaselineEntry[] {
  const grouped = new Map<string, RawSqlFinding[]>();
  for (const finding of rawSql) {
    const key = `${finding.file}\0${finding.kind}`;
    grouped.set(key, [...(grouped.get(key) ?? []), finding]);
  }

  return [...grouped.entries()].map(([key, findings]) => {
    const [file, kind] = key.split("\0") as [string, string];
    const ordered = findings.sort((a, b) => a.line - b.line || a.text.localeCompare(b.text));
    const body = ordered.map((finding) => finding.text).join("\n---sql-fragment---\n");
    return { file, kind, count: ordered.length, sha256: sha256(body) };
  });
}

function groupedSinkBaselines(sinks: SinkFinding[]): BaselineEntry[] {
  const counts = new Map<string, number>();
  for (const sink of sinks) {
    const key = `${sink.file}\0${sink.kind}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return [...counts.entries()].map(([key, count]) => {
    const [file, kind] = key.split("\0") as [string, string];
    return { file, kind, count };
  });
}

function baselineKey(entry: BaselineEntry): string {
  return `${entry.file}:${entry.kind}`;
}

function compareBaselines(current: BaselineEntry[], expected: BaselineEntry[], label: string): string[] {
  const findings: string[] = [];
  const currentMap = new Map(current.map((entry) => [baselineKey(entry), entry]));
  const expectedMap = new Map(expected.map((entry) => [baselineKey(entry), entry]));

  for (const entry of current) {
    const expectedEntry = expectedMap.get(baselineKey(entry));
    if (!expectedEntry) findings.push(`${label}: unclassified ${entry.file} ${entry.kind}`);
    else if (entry.count !== expectedEntry.count) findings.push(`${label}: count changed ${entry.file} ${entry.kind}`);
    else if (entry.sha256 && entry.sha256 !== expectedEntry.sha256)
      findings.push(`${label}: SQL hash changed ${entry.file} ${entry.kind}`);
  }

  for (const entry of expected) {
    if (!currentMap.has(baselineKey(entry)))
      findings.push(`${label}: catalog entry no longer exists ${entry.file} ${entry.kind}`);
  }

  return findings;
}

function validateCatalog(root: string, catalog: Catalog): string[] {
  const findings: string[] = [];
  if (catalog.version !== 1) findings.push("catalog version must be 1");
  if (!catalog.behaviorProof.command.trim()) findings.push("behavior proof command is missing");
  for (const file of requiredProofFiles) {
    if (!catalog.behaviorProof.files.includes(file)) findings.push(`required behavior proof missing: ${file}`);
  }
  for (const file of catalog.behaviorProof.files) {
    if (!existsSync(path.join(root, file))) findings.push(`behavior proof file not found: ${file}`);
  }
  return findings;
}

function validatePackageAndCi(root: string): string[] {
  const findings: string[] = [];
  const packageJson = parseJsonFile<{ scripts?: Record<string, string> }>(path.join(root, "package.json"));
  const ci = readFileSync(path.join(root, ".github/workflows/ci.yml"), "utf8");
  if (packageJson.scripts?.["sql:check"] !== "tsx scripts/quality/sql-supportability-check.ts") {
    findings.push("package.json sql:check script is missing or changed");
  }
  if (!packageJson.scripts?.["quality:check"]?.includes("npm run sql:check")) {
    findings.push("package.json quality:check does not include sql:check");
  }
  if (!ci.includes("npm run quality:check")) findings.push("CI no longer runs quality:check");
  return findings;
}

function sortBaselines(entries: BaselineEntry[]): BaselineEntry[] {
  return [...entries].sort((a, b) => a.file.localeCompare(b.file) || a.kind.localeCompare(b.kind));
}

const root = process.cwd();
const catalogPath = path.join(root, "docs/sql-supportability-catalog.json");
const files = listFromGit(root);
const inventory = collectInventory(root, files);
const catalog = existsSync(catalogPath) ? parseJsonFile<Catalog>(catalogPath) : null;

if (!catalog) {
  console.error("[sql-supportability-check] Missing docs/sql-supportability-catalog.json. Suggested baseline:");
  console.error(
    JSON.stringify(
      {
        version: 1,
        behaviorProof: {
          command:
            "npm run test -- tests/unit/demo-data/seed-and-schema.test.ts tests/unit/scoring/scoring-engine.test.ts tests/unit/scoring/evidence-edgecases.test.ts --run",
          files: requiredProofFiles,
        },
        allowedSqlFiles: inventory.sqlFiles,
        rawSqlBaselines: sortBaselines(groupedRawBaselines(inventory.rawSql)),
        sinkBaselines: sortBaselines(groupedSinkBaselines(inventory.sinks)),
      },
      null,
      2,
    ),
  );
  process.exit(1);
}

const allowedSqlFiles = new Set(catalog.allowedSqlFiles);
const unknownSqlFiles = inventory.sqlFiles.filter((file) => !allowedSqlFiles.has(file));
const findings = [
  ...validateCatalog(root, catalog),
  ...validatePackageAndCi(root),
  ...unknownSqlFiles.map((file) => `unknown SQL file: ${file}`),
  ...compareBaselines(
    sortBaselines(groupedRawBaselines(inventory.rawSql)),
    catalog.rawSqlBaselines,
    "raw SQL baseline",
  ),
  ...compareBaselines(sortBaselines(groupedSinkBaselines(inventory.sinks)), catalog.sinkBaselines, "DB sink baseline"),
];

if (findings.length > 0) {
  console.error("[sql-supportability-check] SQL supportability findings:");
  for (const finding of findings) console.error(`- ${finding}`);
  process.exit(1);
}

console.log("Gate implementation: PASS");
console.log("Repo SQL supportability: PASS");
console.log("SQL behavior proof: PASS");
