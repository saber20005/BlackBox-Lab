// Static-site layout guard. Run with Node 24; never uses network, Firebase or credentials.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, extname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const pathOf = p => resolve(root, p);
const nice = p => relative(root, p).split(sep).join("/");
const errors = [];

const mustRemain = [
  "index.html", "app.js", "labs.html", "pro.html", "mission-mode.html",
  "portfolio.html", "training-guide.html", "vm-report.html", "firebase.json",
  "firestore.rules", "functions/index.js", "functions/soc-verified-service.js",
  "training-kit/blackbox-defense/analyze.py", "docs/repository-map.md", "docs/README.md",
];
const expectedCss = [
  "evidence-workbench.css", "lab-intro.css", "landing.css", "loading.css",
  "onboarding.css", "portfolio.css", "pro.css", "styles.css", "training-guide.css",
  "training-hints.css", "whats-new.css", "workspace-shell.css",
];

for (const name of mustRemain) if (!existsSync(pathOf(name)))
  errors.push("Missing protected public/deploy entry: " + name);
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
if(errors.length){
  for(const error of errors) console.error("STRUCTURE:",error);
  process.exitCode=1;
}else{
  console.log("BLACKBOX structure OK: 12 grouped CSS assets, "+htmlPages.length+" HTML pages ("+htmlChecked+" local refs), "+docs.length+" Markdown documents ("+docChecked+" local links).");
}
