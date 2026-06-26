#!/usr/bin/env node
// Production serve launcher for the live demo.
//
// Why this exists instead of `next dev`: `next dev` compiles routes on demand
// and rewrites .next as you browse. Under a long session that cache can desync
// and a route's compiled page (e.g. .next/server/app/invoice-matching/page.js)
// goes MODULE_NOT_FOUND, 500-ing the page until a restart. For a 30-minute
// present-back that is fatal. `next start` serves the precompiled production
// build: every page exists ahead of time, nothing recompiles at runtime, so
// that failure mode cannot occur. Run `npm run build` first.
//
// Two guarantees layered on top of `next start`:
//   1. Empty-key guard. Some shells (the Claude/agent runtime) export
//      ANTHROPIC_API_KEY="" which would shadow the real key in .env.local. We
//      strip a blank value so the in-app key resolver falls back to the file.
//      (Belt-and-suspenders: lib/anthropicKey.ts already reads .env.local too.)
//   2. Watchdog. If `next start` ever exits unexpectedly mid-demo, we relaunch
//      it automatically. A burst of instant crashes (e.g. port already in use)
//      trips a circuit breaker so we report the real problem instead of
//      spin-looping forever.
const { spawn } = require("child_process");
const net = require("net");
const path = require("path");
const fs = require("fs");

// Resolve the Next binary explicitly so this works whether launched via
// `npm run demo` (which puts node_modules/.bin on PATH) or directly as
// `node scripts/serve.js` (which does not). Falling back to "next" on PATH.
const localNext = path.join(__dirname, "..", "node_modules", ".bin", "next");
const nextBin = fs.existsSync(localNext) ? localNext : "next";

const key = process.env.ANTHROPIC_API_KEY;
if (key !== undefined && key.trim() === "") {
  delete process.env.ANTHROPIC_API_KEY;
  console.log("[serve] Ignored an empty ANTHROPIC_API_KEY so .env.local can supply the real key.");
}

const port = process.env.PORT || "3000";
const host = process.env.HOST || "0.0.0.0";
const extraArgs = process.argv.slice(2);

// Circuit breaker: if the server dies within MIN_UPTIME_MS of starting, that is
// a crash-on-boot (bad build, port taken), not a mid-run blip. Allow a few of
// those, then stop so the operator sees the real error.
const MIN_UPTIME_MS = 4000;
const MAX_FAST_CRASHES = 4;
let fastCrashes = 0;
let shuttingDown = false;
let child = null;

function start() {
  const startedAt = Date.now();
  child = spawn(nextBin, ["start", "-p", port, "-H", host, ...extraArgs], {
    stdio: "inherit",
    env: process.env,
  });

  child.on("exit", (code, signal) => {
    if (shuttingDown) return;
    const uptime = Date.now() - startedAt;
    if (uptime < MIN_UPTIME_MS) {
      fastCrashes += 1;
      if (fastCrashes >= MAX_FAST_CRASHES) {
        console.error(
          `[serve] next start exited ${MAX_FAST_CRASHES}x within ${MIN_UPTIME_MS}ms ` +
            `(code=${code} signal=${signal}). Not restarting — fix the underlying error ` +
            `(is :${port} already in use? did the build succeed?).`
        );
        process.exit(code ?? 1);
      }
    } else {
      fastCrashes = 0; // healthy run; reset the breaker
    }
    const delay = Math.min(1000 * fastCrashes, 3000);
    console.error(
      `[serve] next start exited (code=${code} signal=${signal}) after ${Math.round(uptime / 1000)}s. ` +
        `Relaunching in ${delay}ms to keep the demo up…`
    );
    setTimeout(start, delay);
  });

  child.on("error", (err) => {
    if (shuttingDown) return;
    // A spawn failure (e.g. the next binary is missing) won't fix itself on
    // retry — fail fast with guidance instead of spin-looping.
    console.error(`[serve] Could not launch the Next server: ${err.message}`);
    console.error(`[serve] Tried: ${nextBin}. Run 'npm install' and 'npm run build', then 'npm run demo'.`);
    process.exit(1);
  });
}

function shutdown(sig) {
  shuttingDown = true;
  if (child) child.kill(sig);
  process.exit(0);
}
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

// Pre-flight: if :port is already taken (commonly a previous demo's watchdog
// still running), `next start` would crash-loop on EADDRINUSE and the message
// is easy to misread. Fail fast with the exact commands to free it. Note that
// killing only `next-server` does NOT help while a stray serve.js is alive —
// the watchdog respawns it — so the fix below targets serve.js itself.
function preflightThenStart() {
  const tester = net
    .createServer()
    .once("error", (err) => {
      if (err && err.code === "EADDRINUSE") {
        console.error(
          `\n[serve] Port ${port} is already in use — most likely a previous demo is still running.\n` +
            `[serve] Free it and re-run 'npm run demo':\n` +
            `[serve]     pkill -f scripts/serve.js          # stop a stray watchdog (it respawns next-server otherwise)\n` +
            `[serve]     lsof -ti tcp:${port} | xargs kill -9   # then free the port\n` +
            `[serve] Or just run on another port:  PORT=3001 npm run demo\n`
        );
        process.exit(1);
      }
      // Unknown probe error — don't block the demo, just try to start.
      start();
    })
    .once("listening", () => {
      tester.close(() => {
        console.log(`[serve] Starting production server on http://localhost:${port} (watchdog on). Ctrl-C to stop.`);
        start();
      });
    });
  tester.listen(port, host);
}

preflightThenStart();
