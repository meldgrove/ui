// Builds the template demo as one HTML file (script and styles inside), for sharing.
// Usage: npm run build:templates [-- <file.html>]
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const dir = "dist-templates";
const out = process.argv[2] ?? join(dir, "meldgrove-templates.html");
execFileSync("npx", ["vite", "build", "--config", "demo/templates/vite.config.ts", "--logLevel", "warn"], {
  stdio: "inherit",
});

let html = readFileSync(join(dir, "index.html"), "utf8");
html = html.replace(/<script type="module" crossorigin src="\.\/([^"]+)"><\/script>/, (_, file) => {
  const code = readFileSync(join(dir, file), "utf8").replaceAll("</script", "<\\/script");
  return `<script type="module">${code}</script>`;
});
html = html.replace(/<link rel="stylesheet" crossorigin href="\.\/([^"]+)">/, (_, file) => {
  return `<style>${readFileSync(join(dir, file), "utf8")}</style>`;
});
if (/(src|href)="\.\/assets/.test(html)) throw new Error("A file is still referenced, not inlined.");
writeFileSync(out, html);
console.log(`${out}: ${Math.round(html.length / 1024)} kB`);
