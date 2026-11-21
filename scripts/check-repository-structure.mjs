// Static-site layout guard. Run with Node 24; never uses network, Firebase or credentials.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, extname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { findBrokenRelativeImports } from "./relative-import-guard.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const pathOf = p => resolve(root, p);
const nice = p => relative(root, p).split(sep).join("/");
const errors = [];

const mustRemain = [
  "index.html", "app.js", "labs.html", "pro.html", "mission-mode.html",
  "portfolio.html", "certificates.html", "training-guide.html", "vm-report.html", "firebase.json",
  "firestore.rules", "functions/index.js", "functions/soc-verified-service.js",
  "training-kit/blackbox-defense/analyze.py", "docs/repository-map.md", "docs/README.md",
  "assets/modules/training/lab-catalog.js",
  "assets/modules/training/documentation-templates.js",
  "assets/modules/training/training-hints.js",
  "assets/modules/diagnostics/ux-test-model.js",
  "assets/modules/diagnostics/recaptcha-diagnostic-core.js",
];
const expectedCss = [
  "certificates.css", "evidence-workbench.css", "lab-intro.css", "landing.css", "loading.css",
  "onboarding.css", "portfolio.css", "pro.css", "styles.css", "training-guide.css",
  "training-hints.css", "whats-new.css", "workspace-shell.css",
];

// Reviewed new /certificates.html route and its read-only scripts are explicitly allowlisted.
// Existing public JS/HTML entry points are documented exceptions to the
// flat-root policy. New frontend files must be grouped or explicitly reviewed.
const allowedRootJs = new Set([
  "account-config.js","account-sync.js","account-ui.js","analytics.js","app.js",
  "certificates.js","certificates-page.js",
  "appcheck-diagnostic.js","cybertrace-catalog.js","data.js","defense-tracks.js",
  "evidence-workbench.js","firebase-client.js",
  "lab-intro.js","landing.js","linked-skills-ui.js","loading.js",
  "mission-mode.js","mission-page.js","onboarding.js","portfolio-page.js","portfolio.js",
  "progress-session.js","progress.js",
  "recaptcha-independent-diagnostic.js","routes.js",
  "training-plan-ui.js","training-plan.js","ux-test.js",
  "verified-grading-client.js","vm-report-ui.js","vm-report.js","whats-new.js",
]);
const allowedRootHtml = new Set([
  "appcheck-diagnostic.html","beginner-journey.html","certificates.html","index.html","labs.html",
  "mission-mode.html","portfolio.html","pro.html","recaptcha-independent-diagnostic.html",
  "training-guide.html","ux-test.html","vm-report.html",
]);
for (const name of readdirSync(root)) {
  if (name.endsWith(".js") && !allowedRootJs.has(name))
    errors.push("New root JavaScript file requires relocation or explicit review: "+name);
  if (name.endsWith(".html") && !allowedRootHtml.has(name))
    errors.push("New root HTML page requires public-route compatibility review: "+name);
}

for (const name of mustRemain) if (!existsSync(pathOf(name)))
  errors.push("Missing protected public/deploy entry: " + name);
for(const legacy of ["ux-test-model.js","recaptcha-diagnostic-core.js","lab-catalog.js","training-hints.js","documentation-templates.js"]) {
  if(existsSync(pathOf(legacy))) errors.push("Internal module left in root: "+legacy);
}
for (const name of expectedCss) {
  if (existsSync(pathOf(name))) errors.push("Unorganized stylesheet at repository root: " + name);
  if (!existsSync(pathOf("assets/styles/" + name))) errors.push("Missing stylesheet: assets/styles/" + name);
}
for (const entry of readdirSync(root)) {
  if (entry.endsWith(".css")) errors.push("New root stylesheet must be grouped under assets/styles: " + entry);
}
// Existing lazy imports must follow relocated CSS references, not the old root filenames.
const app = readFileSync(pathOf("app.js"), "utf8");
for (const name of ["training-hints.css", "evidence-workbench.css"]) {
  if (!app.includes("./assets/styles/" + name)) errors.push("Missing lazy CSS reference in app.js: " + name);
}

const htmlPages = readdirSync(root).filter(n => n.endsWith(".html"));
let htmlChecked = 0;
for (const name of htmlPages) {
  const content = readFileSync(pathOf(name), "utf8");
  for (const match of content.matchAll(/(?:src|href)\s*=\s*["']([^"']+)["']/gi)) {
    const raw = match[1];
    if (/^(?:https?:|mailto:|tel:|data:|#|javascript:)/i.test(raw) || raw.startsWith("/_vercel/")) continue;
    let absolute;
    try {
      const url = new URL(raw.replaceAll("&amp;", "&"), "https://repo.example/" + name);
      if (url.origin !== "https://repo.example") continue;
      const pathname = decodeURIComponent(url.pathname);
      const target = pathname.endsWith("/") ? pathname + "index.html" : pathname;
      if (![".html", ".js", ".css", ".svg", ".png", ".xml", ".json", ".ico", ".txt", ".webp"].includes(extname(target))) continue;
      absolute = pathOf("." + target);
      if (!absolute.startsWith(root + sep)) { errors.push("HTML path escapes repository: " + name + " -> " + raw); continue; }
      if (!existsSync(absolute)) errors.push("Broken HTML dependency: " + name + " -> " + raw);
      htmlChecked++;
    } catch { errors.push("Malformed relative HTML reference: " + name + " -> " + raw); }
  }
}
const docs = ["README.md", ...readdirSync(pathOf("docs"),{recursive:true})
  .filter(p => p.endsWith(".md")).map(p => join("docs",p))];
let docChecked = 0;
for (const name of docs) {
  const markdown = readFileSync(pathOf(name),"utf8");
  for (const match of markdown.matchAll(/\]\(([^)]+)\)/g)) {
    let link = match[1].trim().replace(/^</,"").replace(/>$/,"").split(/\s+["']/)[0];
    if (!link || /^(?:https?:|mailto:|data:|\/|#)/i.test(link)) continue;
    try { link=decodeURIComponent(link.split("#")[0].split("?")[0]); }
    catch { errors.push("Malformed Markdown link: " + name + " -> " + link);continue; }
    if (!link) continue;
    const target=resolve(dirname(pathOf(name)),link);
    if (!target.startsWith(root + sep) && target!==root) errors.push("Documentation link escapes root: "+name+" -> "+link);
    else if (!existsSync(target)) errors.push("Broken documentation link: "+name+" -> "+link);
    docChecked++;
  }
}
// Confirm static and literal dynamic ESM imports still resolve after file relocations.
errors.push(...findBrokenRelativeImports(root));

if(errors.length){
  for(const error of errors) console.error("STRUCTURE:",error);
  process.exitCode=1;
}else{
  console.log("BLACKBOX structure OK: "+expectedCss.length+" grouped CSS assets, "+htmlPages.length+" HTML pages ("+htmlChecked+" local refs), "+docs.length+" Markdown documents ("+docChecked+" local links).");
}
