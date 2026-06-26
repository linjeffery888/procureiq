// Disk-backed store for the last invoice-matching triage run.
//
// Triage is the expensive step (live mode calls the model), and it now runs only
// when the user presses Run. So the result is persisted to data/triage-result.json
// and reloaded on mount: the queue shows the last run across a reload or a server
// restart, instead of re-running every time the page opens. Same persistence
// pattern as the other stores (atomic write + single-process lock). Demo
// persistence, not production architecture.

import fs from "fs/promises";
import path from "path";
import { PersistedTriage, TriageResponse } from "./types";

const DATA_DIR = path.join(process.cwd(), "data");
const STORE_PATH = path.join(DATA_DIR, "triage-result.json");
const TMP_PATH = `${STORE_PATH}.tmp`;

const EMPTY: PersistedTriage = { result: null, batchKey: null, ranAt: null };

async function ensureDir(): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

async function readStore(): Promise<PersistedTriage> {
  try {
    const raw = await fs.readFile(STORE_PATH, "utf8");
    const parsed = JSON.parse(raw) as PersistedTriage;
    return { result: parsed.result ?? null, batchKey: parsed.batchKey ?? null, ranAt: parsed.ranAt ?? null };
  } catch {
    return { ...EMPTY };
  }
}

async function writeStore(store: PersistedTriage): Promise<void> {
  await ensureDir();
  await fs.writeFile(TMP_PATH, JSON.stringify(store, null, 2), "utf8");
  await fs.rename(TMP_PATH, STORE_PATH);
}

let chain: Promise<unknown> = Promise.resolve();
function withLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = chain.then(fn, fn);
  chain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

export async function getTriageResult(): Promise<PersistedTriage> {
  return readStore();
}

export async function saveTriageResult(result: TriageResponse, batchKey: string): Promise<void> {
  return withLock(async () => {
    await writeStore({ result, batchKey, ranAt: new Date().toISOString() });
  });
}

export async function clearTriageResult(): Promise<void> {
  return withLock(async () => {
    await writeStore({ ...EMPTY });
  });
}
