// Builds the package into dist/: the components as ES modules with types (tsc),
// the CSS files, and the standalone elements for apps without React (Vite).
import { execFileSync } from "node:child_process";
import { copyFileSync, readFileSync, rmSync } from "node:fs";

const run = (command, args) => execFileSync(command, args, { stdio: "inherit" });

rmSync("dist", { recursive: true, force: true });
run("npx", ["tsc", "-p", "tsconfig.build.json"]);
for (const file of ["styles.css", "theme.css", "tokens.css"]) copyFileSync(`src/${file}`, `dist/${file}`);
run("npx", ["vite", "build", "--config", "vite.standalone.config.ts", "--logLevel", "warn"]);

// Next.js needs the client directive as the first statement of each client module.
const index = readFileSync("dist/components/popover.js", "utf8");
if (!index.startsWith('"use client";'))
  throw new Error("dist/components/popover.js lost its 'use client' directive");
