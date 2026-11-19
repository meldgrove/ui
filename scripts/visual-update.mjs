// Writes the screenshot baselines in the Playwright container that CI uses,
// so fonts and rendering match. Needs Docker and a build (npm run build).
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const version = JSON.parse(readFileSync("package.json", "utf8")).devDependencies["@playwright/test"];
execFileSync(
  "docker",
  [
    "run",
    "--rm",
    "--ipc=host",
    "-v",
    `${process.cwd()}:/work`,
    "-w",
    "/work",
    // Files it writes belong to the current user; npx needs a writable home.
    "--user",
    `${process.getuid()}:${process.getgid()}`,
    "-e",
    "HOME=/tmp",
    "-e",
    "CI=1",
    `mcr.microsoft.com/playwright:v${version}-noble`,
    "npx",
    "playwright",
    "test",
    "--update-snapshots=changed",
    ...process.argv.slice(2),
  ],
  { stdio: "inherit" },
);
