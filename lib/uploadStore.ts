// Disk-backed store of uploaded invoices for BudgetIQ invoice matching.
//
// An uploaded invoice can be parsed, flagged as needing human review (wrong PO,
// over budget, no PO, duplicate), and then "sit waiting" across sessions. The
// in-memory stores (recordStore, the former invoiceLedger) lost that on every
// server restart, forcing a re-upload. This persists each upload AND its review
// decision to data/uploads.json so the queue survives restarts, and it is also
// the receipt history the dedup check reads, so a re-sent invoice is caught even
// across sessions.
//
// Mirrors the lib/corpus.ts persistence pattern (process.cwd()/data, ensureDir,
// read/write JSON, seed-on-missing). It improves on it in two ways that matter
// here because uploads are written one-at-a-time during multi-file ingest:
//   - atomic writes (temp file + rename) so a crash mid-write cannot corrupt the
//     store, and
//   - a single-process write lock so concurrent ingests cannot lose a write in a
//     read-modify-write race.
//
// Demo persistence, not production architecture: production would write to the
// AP system of record (Points Purchasing), not a JSON file.

import fs from "fs/promises";
import path from "path";
import { DuplicateCheck, LedgerEntry } from "./dedup";
import { HumanAction, IngestEngine, Invoice, StoredUpload } from "./types";

const DATA_DIR = path.join(process.cwd(), "data");
const STORE_PATH = path.join(DATA_DIR, "uploads.json");
const TMP_PATH = `${STORE_PATH}.tmp`;

interface UploadStoreFile {
  uploads: StoredUpload[];
  seq: number; // monotonic id source; ids stay stable across deletes
}

async function ensureDir(): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

// Read the store from disk. Missing or corrupt file starts empty (uploads are
// user data; unlike the corpus there is nothing to seed).
async function readStore(): Promise<UploadStoreFile> {
  try {
    const raw = await fs.readFile(STORE_PATH, "utf8");
    const parsed = JSON.parse(raw) as UploadStoreFile;
    if (!Array.isArray(parsed.uploads)) return { uploads: [], seq: 0 };
    return { uploads: parsed.uploads, seq: typeof parsed.seq === "number" ? parsed.seq : parsed.uploads.length };
  } catch {
    return { uploads: [], seq: 0 };
  }
}

// Atomic write: write the temp file then rename over the store, so a reader never
// sees a half-written file and a crash cannot corrupt it. Safe to use a single
// temp name because every write goes through withLock (no concurrent writers).
async function writeStore(store: UploadStoreFile): Promise<void> {
  await ensureDir();
  await fs.writeFile(TMP_PATH, JSON.stringify(store, null, 2), "utf8");
  await fs.rename(TMP_PATH, STORE_PATH);
}

// Serialize all mutations so concurrent ingest calls cannot lose a write. Each
// mutating op chains on the previous one; failures do not break the chain.
let chain: Promise<unknown> = Promise.resolve();
function withLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = chain.then(fn, fn);
  chain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

export async function listUploads(): Promise<StoredUpload[]> {
  const s = await readStore();
  return s.uploads.slice();
}

export async function addUpload(
  invoice: Invoice,
  sourceName: string,
  engine: IngestEngine,
  duplicate: DuplicateCheck,
): Promise<StoredUpload> {
  return withLock(async () => {
    const s = await readStore();
    s.seq += 1;
    const upload: StoredUpload = {
      id: `up-${s.seq}`,
      invoice,
      sourceName,
      engine,
      duplicate,
      decision: null,
      uploadedAt: new Date().toISOString(),
    };
    s.uploads.push(upload);
    await writeStore(s);
    return upload;
  });
}

// Persist a human review decision (approve / override), or clear it (reopen ->
// null). Returns the updated upload, or null if the id is unknown.
export async function setUploadDecision(id: string, decision: HumanAction | null): Promise<StoredUpload | null> {
  return withLock(async () => {
    const s = await readStore();
    const u = s.uploads.find((x) => x.id === id);
    if (!u) return null;
    u.decision = decision;
    await writeStore(s);
    return u;
  });
}

export async function deleteUpload(id: string): Promise<void> {
  return withLock(async () => {
    const s = await readStore();
    const next = s.uploads.filter((x) => x.id !== id);
    if (next.length !== s.uploads.length) {
      s.uploads = next;
      await writeStore(s);
    }
  });
}

export async function clearAllUploads(): Promise<void> {
  return withLock(async () => {
    const s = await readStore();
    s.uploads = [];
    await writeStore(s);
  });
}

// Map the persisted uploads to the dedup engine's LedgerEntry shape, so the
// ingest check runs against the receipt history that survives restarts. A deleted
// upload is gone from here too, so re-uploading it later is not falsely flagged.
export async function uploadsAsLedger(): Promise<LedgerEntry[]> {
  const s = await readStore();
  return s.uploads.map((u) => ({
    invoiceNumber: u.invoice.invoiceNumber,
    vendor: u.invoice.vendor,
    amount: u.invoice.amount,
    poNumberClaimed: u.invoice.poNumberClaimed,
    receivedDate: u.invoice.receivedDate,
  }));
}
