import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import * as ts from "typescript";

type Finding = {
  file: string;
  line: number;
  name: string;
  complexity: number;
};

const DEFAULT_LIMIT = 10;
const rawLimit = Number.parseInt(process.env.CYCLOMATIC_COMPLEXITY_LIMIT ?? "", 10);
const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? rawLimit : DEFAULT_LIMIT;

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

const sourceExtensions = new Set([".ts", ".tsx"]);
const decisionKinds = new Set<ts.SyntaxKind>([
  ts.SyntaxKind.CaseClause,
  ts.SyntaxKind.CatchClause,
  ts.SyntaxKind.ConditionalExpression,
  ts.SyntaxKind.DoStatement,
  ts.SyntaxKind.ForInStatement,
  ts.SyntaxKind.ForOfStatement,
  ts.SyntaxKind.ForStatement,
  ts.SyntaxKind.IfStatement,
  ts.SyntaxKind.WhileStatement,
]);

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
    .map(normalize);
}

function shouldScan(file: string): boolean {
  const parts = file.split("/");
  if (parts.some((part) => ignoredDirectories.has(part))) return false;
  if (file.endsWith(".test.ts") || file.endsWith(".test.tsx")) return false;
  return (file.startsWith("src/") || file.startsWith("scripts/")) && sourceExtensions.has(path.extname(file));
}

function isFunctionLike(node: ts.Node): node is ts.FunctionLikeDeclaration {
  return ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node) || ts.isArrowFunction(node);
}

function functionName(node: ts.FunctionLikeDeclaration): string | null {
  if (ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node)) return node.name?.text ?? null;
  const parent = node.parent;
  if (ts.isVariableDeclaration(parent) && ts.isIdentifier(parent.name)) return parent.name.text;
  return null;
}

function lineFor(sourceFile: ts.SourceFile, node: ts.Node): number {
  return sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
}

function decisionWeight(node: ts.Node): number {
  if (decisionKinds.has(node.kind)) return 1;
  if (!ts.isBinaryExpression(node)) return 0;
  const op = node.operatorToken.kind;
  return op === ts.SyntaxKind.AmpersandAmpersandToken || op === ts.SyntaxKind.BarBarToken ? 1 : 0;
}

function complexityOf(node: ts.FunctionLikeDeclaration): number {
  let complexity = 1;
  const body = node.body;
  if (!body) return complexity;

  function visit(child: ts.Node) {
    if (child !== body && isFunctionLike(child)) return;
    if (ts.isJsxElement(child) || ts.isJsxFragment(child) || ts.isJsxSelfClosingElement(child)) return;
    complexity += decisionWeight(child);
    ts.forEachChild(child, visit);
  }

  visit(body);
  return complexity;
}

function scanFile(root: string, file: string): Finding[] {
  const sourcePath = path.join(root, file);
  const sourceFile = ts.createSourceFile(file, readFileSync(sourcePath, "utf8"), ts.ScriptTarget.Latest, true);
  const findings: Finding[] = [];

  function visit(node: ts.Node) {
    if (isFunctionLike(node)) {
      const name = functionName(node);
      if (name) {
        const complexity = complexityOf(node);
        if (complexity > limit) findings.push({ file, line: lineFor(sourceFile, node), name, complexity });
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return findings;
}

const root = process.cwd();
const findings = listFromGit(root)
  .filter(shouldScan)
  .filter((file) => existsSync(path.join(root, file)))
  .flatMap((file) => scanFile(root, file));

if (findings.length > 0) {
  console.error(`[complexity-check] Functions exceed cyclomatic complexity limit ${limit}:`);
  for (const finding of findings) {
    console.error(`- ${finding.file}:${finding.line} ${finding.name} complexity ${finding.complexity}`);
  }
  process.exit(1);
}

console.log(`[complexity-check] OK. No production function exceeds complexity limit ${limit}.`);
