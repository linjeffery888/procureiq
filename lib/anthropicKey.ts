import { readFileSync } from "fs";
import { join } from "path";

// Resolving the Anthropic API key is not as simple as reading
// process.env.ANTHROPIC_API_KEY, and getting it wrong is why the live engine
// was intermittently falling to the offline heuristic.
//
// The Claude / agent runtime this prototype is sometimes launched under exports
// ANTHROPIC_API_KEY as an EMPTY string in the shell (alongside
// ANTHROPIC_BASE_URL). Next's env loader (@next/env) will NOT override a
// variable that already exists in process.env, so that empty shell value
// shadows the real key in .env.local. Every route's `!process.env.ANTHROPIC_API_KEY`
// gate then sees a falsy value and silently runs the deterministic heuristic.
//
// scripts/dev.js strips an empty ANTHROPIC_API_KEY before launching `next dev`,
// which fixes `npm run dev`. This helper is the belt-and-suspenders so the key
// resolves the SAME way no matter how the server was started (next start, a
// test harness, an editor task runner that re-injects the empty var): it
// returns the env var when it is a real non-empty value, and otherwise reads
// ANTHROPIC_API_KEY straight out of .env.local. The result is cached so the
// file is read at most once per process.

let cached: string | null = null;

function fromEnvFile(): string | null {
  for (const name of [".env.local", ".env"]) {
    try {
      const raw = readFileSync(join(process.cwd(), name), "utf8");
      for (const line of raw.split(/\r?\n/)) {
        const m = line.match(/^\s*(?:export\s+)?ANTHROPIC_API_KEY\s*=\s*(.*?)\s*$/);
        if (!m) continue;
        let val = m[1].trim();
        // Strip a single pair of surrounding quotes if present.
        if (
          (val.startsWith('"') && val.endsWith('"')) ||
          (val.startsWith("'") && val.endsWith("'"))
        ) {
          val = val.slice(1, -1);
        }
        if (val) return val;
      }
    } catch {
      // File missing or unreadable; try the next candidate.
    }
  }
  return null;
}

// The resolved key, or null if neither the environment nor .env.local has a
// real (non-empty) value. Treat null as "run offline".
export function anthropicApiKey(): string | null {
  if (cached) return cached;
  const fromEnv = process.env.ANTHROPIC_API_KEY;
  if (fromEnv && fromEnv.trim()) {
    cached = fromEnv.trim();
    return cached;
  }
  const fromFile = fromEnvFile();
  if (fromFile) cached = fromFile;
  return fromFile;
}

export function hasAnthropicKey(): boolean {
  return !!anthropicApiKey();
}
