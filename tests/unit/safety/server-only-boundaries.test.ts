// @vitest-environment node
import { describe, expect, it } from "vitest";

import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

function walk(dir: string, out: string[]) {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (["node_modules", ".next", ".git", "test-results", "playwright-report"].includes(entry)) continue;
      walk(full, out);
      continue;
    }
    out.push(full);
  }
}

function isClientModule(source: string) {
  // Keep simple: the directive should appear near the top.
  const head = source.slice(0, 400);
  return /["']use client["']/.test(head);
}

const SERVER_ONLY_DIRECTIVE_RE = /(^|\n)\s*import\s+["']server-only["'];?/;

function extractModuleSpecifiers(source: string) {
  const specs: string[] = [];

  // import ... from "x"
  for (const match of source.matchAll(/\bimport\s+[^;]*?\sfrom\s+["']([^"']+)["']/g)) {
    specs.push(match[1]);
  }
  // import "x"
  for (const match of source.matchAll(/\bimport\s+["']([^"']+)["']/g)) {
    specs.push(match[1]);
  }
  // export ... from "x"
  for (const match of source.matchAll(/\bexport\s+[^;]*?\sfrom\s+["']([^"']+)["']/g)) {
    specs.push(match[1]);
  }
  // require("x")
  for (const match of source.matchAll(/\brequire\s*\(\s*["']([^"']+)["']\s*\)/g)) {
    specs.push(match[1]);
  }
  // import("x")
  for (const match of source.matchAll(/\bimport\s*\(\s*["']([^"']+)["']\s*\)/g)) {
    specs.push(match[1]);
  }

  return Array.from(new Set(specs));
}

function resolveImportToFile(absFromFile: string, specifier: string, repoRoot: string) {
  let absBase: string | null = null;
  if (specifier.startsWith("./") || specifier.startsWith("../")) {
    absBase = path.resolve(path.dirname(absFromFile), specifier);
  } else if (specifier.startsWith("@/")) {
    absBase = path.join(repoRoot, "src", specifier.slice(2));
  } else {
    return null;
  }

  const candidates: string[] = [];

  // Exact file path (when extension is included).
  candidates.push(absBase);

  // Common TS/JS extensions (when extension is omitted).
  for (const ext of [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"]) {
    candidates.push(`${absBase}${ext}`);
  }

  // Directory index forms.
  for (const ext of [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"]) {
    candidates.push(path.join(absBase, `index${ext}`));
  }

  for (const candidate of candidates) {
    try {
      if (statSync(candidate).isFile()) return candidate;
    } catch {
      // ignore
    }
  }

  return null;
}

describe("server-only boundaries", () => {
  it("detects relative imports of protected server-only modules", () => {
    const root = process.cwd();
    const srcRoot = path.join(root, "src");
    const srcFiles: string[] = [];
    walk(srcRoot, srcFiles);

    const protectedServerOnly = new Set(
      srcFiles
        .filter((f) => [".ts", ".tsx"].includes(path.extname(f).toLowerCase()))
        .filter((f) => {
          const source = readFileSync(f, "utf8");
          return SERVER_ONLY_DIRECTIVE_RE.test(source.slice(0, 500));
        })
        .map((f) => path.normalize(f)),
    );

    const protectedSeedDir = path.normalize(path.join(srcRoot, "lib", "seed")) + path.sep;

    const hypotheticalClient = path.join(srcRoot, "components", "executive", "__hypothetical-client.tsx");
    const source = [
      '"use client";',
      'import { getServerDb } from "../../lib/db/server-db";',
      "export const x = 1;",
    ].join("\n");

    const specs = extractModuleSpecifiers(source);
    const resolved = specs
      .map((s) => ({ specifier: s, resolved: resolveImportToFile(hypotheticalClient, s, root) }))
      .filter((x): x is { specifier: string; resolved: string } => Boolean(x.resolved));

    const violations = resolved.filter(({ resolved }) => {
      const norm = path.normalize(resolved);
      if (protectedServerOnly.has(norm)) return true;
      if (norm.startsWith(protectedSeedDir)) return true;
      return false;
    });

    expect(violations.map((v) => v.specifier)).toEqual(["../../lib/db/server-db"]);
  });

  it("prevents client modules from importing server-only modules or private env access (VAL-SAFE-012, VAL-QBR-016, VAL-QBR-019)", () => {
    const root = process.cwd();
    const srcRoot = path.join(root, "src");
    const files: string[] = [];
    walk(srcRoot, files);

    const violations: Array<{ file: string; matched: string }> = [];

    const protectedServerOnly = new Set(
      files
        .filter((f) => [".ts", ".tsx"].includes(path.extname(f).toLowerCase()))
        .filter((f) => {
          const source = readFileSync(f, "utf8");
          return SERVER_ONLY_DIRECTIVE_RE.test(source.slice(0, 500));
        })
        .map((f) => path.normalize(f)),
    );

    const protectedSeedDir = path.normalize(path.join(srcRoot, "lib", "seed")) + path.sep;

    const forbiddenStrings = [
      // Directly importing server-only guard in a client module is always a violation.
      'import "server-only"',
      "process.env.DATABASE_URL",
      "process.env.OPENAI_COMPATIBLE",
      "process.env.AI_PROVIDER",
    ];

    const forbiddenImportPrefixes = ["drizzle-orm", "postgres"];

    for (const file of files) {
      const ext = path.extname(file).toLowerCase();
      if (ext !== ".ts" && ext !== ".tsx") continue;
      const rel = path.relative(root, file).replaceAll("\\", "/");
      const source = readFileSync(file, "utf8");
      if (!isClientModule(source)) continue;

      // Cheap string scans for env or direct guard usage.
      for (const needle of forbiddenStrings) {
        if (!source.includes(needle)) continue;
        violations.push({ file: rel, matched: needle });
      }

      // Import resolution catches both alias and relative imports of protected server-only modules.
      for (const specifier of extractModuleSpecifiers(source)) {
        for (const prefix of forbiddenImportPrefixes) {
          if (specifier === prefix || specifier.startsWith(`${prefix}/`)) {
            violations.push({ file: rel, matched: `import:${specifier}` });
          }
        }

        const resolved = resolveImportToFile(file, specifier, root);
        if (!resolved) continue;
        const norm = path.normalize(resolved);
        if (protectedServerOnly.has(norm)) {
          violations.push({ file: rel, matched: `import:${specifier}` });
          continue;
        }
        if (norm.startsWith(protectedSeedDir)) {
          violations.push({ file: rel, matched: `import:${specifier}` });
        }
      }
    }

    expect(violations).toEqual([]);
  });
});
