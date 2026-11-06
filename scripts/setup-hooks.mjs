// Points git at the versioned hooks in .githooks (runs on `npm install`). Silently skips where there is
// no git checkout, e.g. on Vercel, so it can never break a build.
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";

if (existsSync(".git")) {
  try {
    execFileSync("git", ["config", "core.hooksPath", ".githooks"], { stdio: "ignore" });
    console.log("git hooks aktif (.githooks): commit berisi rahasia akan ditolak.");
  } catch {
    // git not installed: nothing to do
  }
}
