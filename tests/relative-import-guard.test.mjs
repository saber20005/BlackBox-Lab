import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { findBrokenRelativeImports } from "../scripts/relative-import-guard.mjs";

const keyword = "im" + "port";
function withFixture(run) {
  const root = mkdtempSync(join(tmpdir(), "bb-relative-imports-"));
  try { return run(root); } finally { rmSync(root, { recursive: true, force: true }); }
}

test("resolves unchanged relative static, dynamic and HTML module imports", () => withFixture(root => {
  mkdirSync(join(root, "assets"));
  writeFileSync(join(root, "assets", "model.js"), "export const value = 1;");
  writeFileSync(join(root, "app.js"),
    keyword + " { value } from './assets/model.js';\n" +
    "void " + keyword + "('./assets/model.js');\n");
  writeFileSync(join(root, "page.html"),
    "<script type=\"module\">\n" + keyword + " './assets/model.js';\n</script>");
  assert.deepEqual(findBrokenRelativeImports(root), []);
}));

test("reports missing static and dynamic imports after a module move", () => withFixture(root => {
  writeFileSync(join(root, "app.js"),
    keyword + " { value } from './missing.js';\n" +
    "void " + keyword + "('./also-missing.js');\n");
  const problems = findBrokenRelativeImports(root);
  assert.equal(problems.length, 2);
  assert(problems.some(problem => problem.includes("app.js -> ./missing.js")));
  assert(problems.some(problem => problem.includes("app.js -> ./also-missing.js")));
}));

test("checks tests' real static imports but ignores their mocked dynamic imports", () => withFixture(root => {
  mkdirSync(join(root, "tests"));
  writeFileSync(join(root, "tests", "sample.test.mjs"),
    keyword + " '../missing.js';\n" +
    "const snippet = \"" + keyword + "('./mocked.js')\";");
  assert.deepEqual(findBrokenRelativeImports(root), [
    "Broken local module import: tests/sample.test.mjs -> ../missing.js",
  ]);
}));
