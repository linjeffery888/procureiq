// Persistence for the editable clause thresholds. The deterministic engine and
// the corpus re-labeling both read from here, so an edit made on the Knowledge
// page sticks across reloads and a server restart and governs every later
// upload. Same disk shape as the other stores (atomic write + a single-process
// write lock). On first read, or after a bad/missing file, the store returns the
// shipped DEFAULT_THRESHOLDS, so the engine always has a valid configuration.

import fs from "fs/promises";
import path from "path";
import { ClauseThresholds, DEFAULT_THRESHOLDS, coerceThresholds } from "./clauseThresholds";

const DATA_DIR = path.join(process.cwd(), "data");
const STORE_PATH = path.join(DATA_DIR, "thresholds.json");
const TMP_PATH = `${STORE_PATH}.tmp`;

async function ensureDir(): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

export async function readThresholds(): Promise<ClauseThresholds> {
  try {
    const raw = await fs.readFile(STORE_PATH, "utf8");
    return coerceThresholds(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_THRESHOLDS };
  }
}

let chain: Promise<unknown> = Promise.resolve();
function withLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = chain.then(fn, fn);
  chain = run.then(() => undefined, () => undefined);
  return run;
}

// Persist a new threshold set (coerced to valid ranges) and return what was
// stored, so the caller echoes back the canonical values.
export async function writeThresholds(input: any): Promise<ClauseThresholds> {
  return withLock(async () => {
    const next = coerceThresholds(input);
    await ensureDir();
    await fs.writeFile(TMP_PATH, JSON.stringify(next, null, 2), "utf8");
    await fs.rename(TMP_PATH, STORE_PATH);
    return next;
  });
}
