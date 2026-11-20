// Builds dist/ when it is missing, so an app can install a branch straight from
// GitHub (`npm install github:meldgrove/ui#<branch>`): npm runs this after it
// installs the branch's dependencies. A checkout that has dist/ keeps it;
// `npm run build` rebuilds it.
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";

if (!existsSync("dist")) execFileSync("npm", ["run", "build"], { stdio: "inherit" });
