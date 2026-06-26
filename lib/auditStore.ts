// Append-only audit trail of human touchpoints. Every time a person commits a
// reviewed contract, approves or overrides an invoice match, reopens a closed
// item, applies actuals to the budget, or edits the clause thresholds, the
// client appends one AuditEvent here. The trail answers the compliance question
// "who decided what, and when" for ContractIQ and BudgetIQ alike.
//
// Persisted to disk (data/audit-log.json) so the record survives reloads and a
// server restart, and stays a permanent ledger rather than session state. Same
// persistence shape as lib/recordStore (atomic write + a single-process write
// lock + a monotonic seq for ids). The log is append-only by design: events are
// never edited, only added; clearAuditEvents wipes it wholesale for a fresh demo.

import fs from "fs/promises";
import path from "path";
import { AuditEvent } from "./types";

interface StoreFile {
  events: AuditEvent[];
  seq: number; // monotonic id source; ids stay unique across clears
}

const DATA_DIR = path.join(process.cwd(), "data");
const STORE_PATH = path.join(DATA_DIR, "audit-log.json");
const TMP_PATH = `${STORE_PATH}.tmp`;

async function ensureDir(): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

// Read the log from disk. Starts empty (events are produced only by human
// action). Missing or corrupt file starts empty.
async function readStore(): Promise<StoreFile> {
  try {
    const raw = await fs.readFile(STORE_PATH, "utf8");
    const parsed = JSON.parse(raw) as StoreFile;
    if (!Array.isArray(parsed.events)) return { events: [], seq: 0 };
    return { events: parsed.events, seq: typeof parsed.seq === "number" ? parsed.seq : parsed.events.length };
  } catch {
    return { events: [], seq: 0 };
  }
}

// Atomic write: temp file then rename, so a reader never sees a half-written
// file. Safe to share one temp name because every write goes through withLock.
async function writeStore(store: StoreFile): Promise<void> {
  await ensureDir();
  await fs.writeFile(TMP_PATH, JSON.stringify(store, null, 2), "utf8");
  await fs.rename(TMP_PATH, STORE_PATH);
}

// Serialize all mutations so two concurrent appends cannot lose a write in a
// read-modify-write race. Each mutating op chains on the previous one.
let chain: Promise<unknown> = Promise.resolve();
function withLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = chain.then(fn, fn);
  chain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

// What the client sends per touchpoint: everything except the id and the
// canonical timestamp, which the store assigns so the ledger owns its own clock
// and id sequence.
export type AuditEventInput = Omit<AuditEvent, "id" | "at"> & { at?: string };

// Append one event. The store stamps the id and (unless the caller supplied
// one) the timestamp. Returns the stored event.
export async function appendAuditEvent(input: AuditEventInput): Promise<AuditEvent> {
  return withLock(async () => {
    const s = await readStore();
    s.seq += 1;
    const event: AuditEvent = {
      id: `evt-${s.seq}`,
      at: input.at || new Date().toISOString(),
      module: input.module,
      surface: input.surface,
      actor: input.actor,
      action: input.action,
      actionLabel: input.actionLabel,
      subject: input.subject,
      outcome: input.outcome,
      detail: input.detail,
    };
    s.events.push(event);
    await writeStore(s);
    return event;
  });
}

// Newest first, so the table and the dashboard show the latest touchpoint on top.
export async function listAuditEvents(): Promise<AuditEvent[]> {
  const s = await readStore();
  return s.events.slice().sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
}

export async function clearAuditEvents(): Promise<void> {
  return withLock(async () => {
    const s = await readStore();
    s.events = [];
    await writeStore(s);
  });
}
