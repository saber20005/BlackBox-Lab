// Static local import-path check for the source tree. This is intentionally
// not a JavaScript parser: only literal relative ESM imports are verified.
// Browser-generated URLs and non-literal imports are covered by browser tests.
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";

const excludedDirectories = new Set([
  ".git", ".github", ".vercel", "node_modules", "dist", "coverage",
  "docs", "downloads", "training-kit", "local-agent", "scripts",
]);
const supportedFiles = /\.(?:[cm]?js|html)$/i;
const relativeStaticImport = /^\s*(?:import|export)\s+(?:[^'";]{0,240}?\bfrom\s+)?(["'])(\.{1,2}\/[^'"\r\n]+)\1/gm;
const relativeDynamicImport = /\bimport\s*\(\s*(["'])(\.{1,2}\/[^'"\r\n]+)\1\s*\)/g;

export function findBrokenRelativeImports(sourceRoot) {
  const root = resolve(sourceRoot);
  const issues = [];
  const files = [];
  function visit(dir) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const target = join(dir, entry.name);
      if (entry.isDirectory() && !excludedDirectories.has(entry.name)) visit(target);
      else if (entry.isFile() && supportedFiles.test(entry.name)) files.push(target);
    }
  }
  visit(root);
  for (const filename of files) {
    const source = readFileSync(filename, "utf8");
    const fileLabel = relative(root, filename).split(sep).join("/");
    const unique = new Set();
    const patterns = fileLabel.startsWith("tests/")
      ? [relativeStaticImport] : [relativeStaticImport, relativeDynamicImport];
    for (const pattern of patterns) {
      for (const match of source.matchAll(pattern)) {
        const specifier = match[2];
        if (unique.has(specifier)) continue;
        unique.add(specifier);
        const raw = specifier.split(/[?#]/, 1)[0];
        let path;
        try { path = resolve(dirname(filename), decodeURIComponent(raw)); }
        catch { issues.push("Malformed local module import: " + fileLabel + " -> " + specifier); continue; }
        if (path !== root && !path.startsWith(root + sep)) {
          issues.push("Local module import escapes repository: " + fileLabel + " -> " + specifier);
        } else if (!existsSync(path)) {
          issues.push("Broken local module import: " + fileLabel + " -> " + specifier);
        }
      }
    }
  }
  return issues;
}
