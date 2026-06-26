// Disk-backed store of human review dispositions for the invoice-matching
// exception queue, keyed by invoice number.
//
// A reviewer approves a suggestion, or handles an exception manually (entering a
// PO and/or note). That disposition used to live only in client state, so it was
// lost on navigation or restart: the audit trail and the "All invoices" ledger
// reverted to the machine result. This persists the full disposition (the
// decision plus any hand-entered PO/note) to data/decisions.json for EVERY
// invoice (seeded or uploaded), so the page can overlay it onto the triage result
// it reloads. Same persistence pattern as the other stores (atomic write +
// single-process lock). Demo persistence, not production architecture.
//
// Keyed by invoice number: a re-sent duplicate (same number) shares a decision,
// which is acceptable for the prototype.

import fs from "fs/promises";
import path from "path";
import { StoredDecision } from "./types";

const DATA_DIR = path.join(process.cwd(), "data");
const STORE_PATH = path.join(DATA_DIR, "decisions.json");
const TMP_PATH = `${STORE_PATH}.tmp`;

interface StoreFile {
  decisions: Record<string, StoredDecision>;
}

async function ensureDir(): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

async function readStore(): Promise<StoreFile> {
  try {
    const raw = await fs.readFile(STORE_PATH, "utf8");
    const parsed = JSON.parse(raw) as StoreFile;
    return { decisions: parsed.decisions && typeof parsed.decisions === "object" ? parsed.decisions : {} };
  } catch {
    return { decisions: {} };
  }
}

async function writeStore(store: StoreFile): Promise<void> {
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

export async function listDecisions(): Promise<Record<string, StoredDecision>> {
  const s = await readStore();
  return { ...s.decisions };
}

// Set the disposition for an invoice, or clear it when value is null (reopen).
export async function setDecision(invoiceNumber: string, value: StoredDecision | null): Promise<Record<string, StoredDecision>> {
  return withLock(async () => {
    const s = await readStore();
    if (value === null) {
      delete s.decisions[invoiceNumber];
    } else {
      s.decisions[invoiceNumber] = value;
    }
    await writeStore(s);
    return { ...s.decisions };
  });
}

export async function clearDecisions(): Promise<void> {
  return withLock(async () => {
    await writeStore({ decisions: {} });
  });
}
