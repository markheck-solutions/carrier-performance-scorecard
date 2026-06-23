import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import * as ts from "typescript";

type ImportEdge = {
  from: string;
  to: string;
  specifier: string;
};

const ignoredDirectories = new Set([".git", ".next", ".vercel", "coverage", "node_modules", "test-results"]);
const sourceExtensions = [".ts", ".tsx"] as const;
const serverOnlyPrefixes = ["src/lib/db/", "src/lib/env"];

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
  return (
    file.startsWith("src/") &&
    sourceExtensions.some((ext) => file.endsWith(ext)) &&
    !parts.some((part) => ignoredDirectories.has(part))
  );
}

function importSpecifiers(sourceFile: ts.SourceFile): string[] {
  const specifiers: string[] = [];
  sourceFile.forEachChild((node) => {
    if (!ts.isImportDeclaration(node)) return;
    const specifier = node.moduleSpecifier;
    if (ts.isStringLiteral(specifier)) specifiers.push(specifier.text);
  });
  return specifiers;
}

function candidatePaths(importPath: string): string[] {
  return sourceExtensions.flatMap((ext) => [`${importPath}${ext}`, `${importPath}/index${ext}`]);
}

function resolveImport(root: string, from: string, specifier: string): string | null {
  const base = specifier.startsWith("@/")
    ? `src/${specifier.slice(2)}`
    : specifier.startsWith(".")
      ? normalize(path.posix.join(path.posix.dirname(from), specifier))
      : null;
  if (!base) return null;
  return candidatePaths(base).find((candidate) => existsSync(path.join(root, candidate))) ?? null;
}

function scanImports(root: string, file: string): ImportEdge[] {
  const sourceFile = ts.createSourceFile(
    file,
    readFileSync(path.join(root, file), "utf8"),
    ts.ScriptTarget.Latest,
    true,
  );
  return importSpecifiers(sourceFile).flatMap((specifier) => {
    const resolved = resolveImport(root, file, specifier);
    return resolved ? [{ from: file, to: resolved, specifier }] : [];
  });
}

function isClientFile(root: string, file: string): boolean {
  const text = readFileSync(path.join(root, file), "utf8").trimStart();
  return text.startsWith('"use client"') || text.startsWith("'use client'");
}

function boundaryFindings(root: string, edges: ImportEdge[]): string[] {
  const findings: string[] = [];
  for (const edge of edges) {
    if (edge.from.startsWith("src/lib/") && (edge.to.startsWith("src/app/") || edge.to.startsWith("src/components/"))) {
      findings.push(`${edge.from} imports UI/app module ${edge.specifier}`);
    }
    if (isClientFile(root, edge.from) && serverOnlyPrefixes.some((prefix) => edge.to.startsWith(prefix))) {
      findings.push(`${edge.from} is client code importing server-only module ${edge.specifier}`);
    }
  }
  return findings;
}

function buildGraph(files: string[], edges: ImportEdge[]) {
  const graph = new Map(files.map((file) => [file, [] as string[]]));
  for (const edge of edges) graph.get(edge.from)?.push(edge.to);
  return graph;
}

function findCycle(graph: Map<string, string[]>): string[] | null {
  const visiting: string[] = [];
  const visited = new Set<string>();

  function visit(file: string): string[] | null {
    const activeIndex = visiting.indexOf(file);
    if (activeIndex >= 0) return [...visiting.slice(activeIndex), file];
    if (visited.has(file)) return null;
    visiting.push(file);
    for (const next of graph.get(file) ?? []) {
      const cycle = visit(next);
      if (cycle) return cycle;
    }
    visiting.pop();
    visited.add(file);
    return null;
  }

  for (const file of graph.keys()) {
    const cycle = visit(file);
    if (cycle) return cycle;
  }
  return null;
}

const root = process.cwd();
const files = listFromGit(root).filter(shouldScan);
const edges = files.flatMap((file) => scanImports(root, file));
const findings = boundaryFindings(root, edges);
const cycle = findCycle(buildGraph(files, edges));

if (cycle) findings.push(`import cycle: ${cycle.join(" -> ")}`);

if (findings.length > 0) {
  console.error("[import-boundary-check] Architecture boundary findings:");
  for (const finding of findings) console.error(`- ${finding}`);
  process.exit(1);
}

console.log("[import-boundary-check] OK. Import boundaries and src import graph are acyclic.");
