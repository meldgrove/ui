// Checks what `npm publish` would upload: the built files apps import, the
// license, and nothing of the sources, tests or demo.
import { execFileSync } from "node:child_process";

const [pack] = JSON.parse(execFileSync("npm", ["pack", "--dry-run", "--json"], { encoding: "utf8" }));
const files = new Set(pack.files.map((file) => file.path));
const required = [
  "LICENSE",
  "README.md",
  "package.json",
  "dist/styles.css",
  "dist/theme.css",
  "dist/tokens.css",
  "dist/components/button.js",
  "dist/components/button.d.ts",
  "dist/updates/index.js",
  "dist/updates/index.d.ts",
  "dist/updates/core.js",
  "dist/updates/server.js",
  "dist/updates/server.d.ts",
  "dist/updates/testing.js",
  "dist/standalone/meldgrove-updates.js",
  "dist/standalone/meldgrove-secret-input.js",
];
const missing = required.filter((file) => !files.has(file));
const unwanted = [...files].filter((file) => /^(src|demo|e2e|scripts)\/|\.test\.|\/test\//.test(file));
if (missing.length || unwanted.length) {
  if (missing.length) console.error(`Missing from the package: ${missing.join(", ")}`);
  if (unwanted.length) console.error(`Not meant for the package: ${unwanted.join(", ")}`);
  process.exit(1);
}
console.log(`${pack.name}: ${files.size} files, ${(pack.unpackedSize / 1024).toFixed(0)} kB unpacked`);
