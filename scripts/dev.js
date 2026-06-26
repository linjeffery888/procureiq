#!/usr/bin/env node
// Dev launcher that guards against an EMPTY ANTHROPIC_API_KEY in the shell.
//
// Some environments (notably the Claude Code / agent runtime) export
// ANTHROPIC_API_KEY as an empty string along with ANTHROPIC_BASE_URL. Next.js
// loads .env.local but will NOT override a variable that already exists in
// process.env, so an empty shell value shadows the real key in .env.local. The
// /api/extract route then sees a falsy key and silently runs the offline
// heuristic on every request instead of the live model.
//
// The fix is surgical: if ANTHROPIC_API_KEY is present but blank, delete it so
// Next's env loader falls back to .env.local. A legitimately set (non-empty)
// key is left untouched, and production (next start) is unaffected.
const { spawn } = require("child_process");

const key = process.env.ANTHROPIC_API_KEY;
if (key !== undefined && key.trim() === "") {
  delete process.env.ANTHROPIC_API_KEY;
  console.log(
    "[dev] Ignoring an empty ANTHROPIC_API_KEY from the shell so .env.local can supply the real key."
  );
}

const args = ["dev", ...process.argv.slice(2)];
const child = spawn("next", args, { stdio: "inherit", env: process.env });
child.on("exit", (code) => process.exit(code ?? 0));
child.on("error", (err) => {
  console.error("[dev] Failed to start next dev:", err);
  process.exit(1);
});
