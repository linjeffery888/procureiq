// Disk-backed store of human edits to the PO register.
//
// The register (data/po_register.json, surfaced as "Points Purchasing") is the
// synthetic stand-in for the AP system of record: the master list every invoice
// check resolves against. The seed file is read-only, so a reviewer's changes are
// layered on top here rather than mutating the seed:
//   - `overrides`: edits to a SEED row, keyed by its seed PO number. An override
//     carries only the fields that changed (any field, including a rename of the
//     PO number), plus who/when.
//   - `added`: brand-new POs a reviewer created (e.g. to source a PO for a no-PO
//     invoice). Each has a stable id and its own who/when.
// Reads overlay both onto the register, and the matcher loads the overridden +
// added POs, so an edit or a new PO actually changes what the next invoice is
// checked against. Same atomic-write + single-process-lock pattern as the other
// stores. Demo persistence, not production architecture.

import fs from "fs/promises";
import path from "path";

const DATA_DIR = path.join(process.cwd(), "data");
const STORE_PATH = path.join(DATA_DIR, "po-overrides.json");
const TMP_PATH = `${STORE_PATH}.tmp`;

// The editable fields of a PO. Every field is optional on an override (only what
// changed is stored); they are all required on a created PO.
export interface PoFields {
  poNumber: string;
  vendor: string;
  workOrder: string;
  sowRef: string;
  contractValue: number;
  spentToDate: number;
  remaining: number;
  agreedTerms: number;
  status: string;
}

// An edit layered on a seed row. `poNumber` here RENAMES the PO; the override is
// still keyed by the seed PO number (its stable identity).
export type PoOverride = Partial<PoFields> & {
  updatedAt: string;
  updatedBy: string;
};

// A PO a reviewer created. Identified by `id`, not its PO number (which is itself
// editable).
export interface AddedPo extends PoFields {
  id: string;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
}

interface StoreFile {
  overrides: Record<string, PoOverride>;
  added: AddedPo[];
  seq: number;
}

async function ensureDir(): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

async function readStore(): Promise<StoreFile> {
  try {
    const raw = await fs.readFile(STORE_PATH, "utf8");
    const parsed = JSON.parse(raw) as Partial<StoreFile>;
    return {
      overrides: parsed.overrides && typeof parsed.overrides === "object" ? parsed.overrides : {},
      added: Array.isArray(parsed.added) ? parsed.added : [],
      seq: typeof parsed.seq === "number" ? parsed.seq : 0,
    };
  } catch {
    return { overrides: {}, added: [], seq: 0 };
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

const EDITABLE: (keyof PoFields)[] = ["poNumber", "vendor", "workOrder", "sowRef", "contractValue", "spentToDate", "remaining", "agreedTerms", "status"];

export async function listPoOverrides(): Promise<Record<string, PoOverride>> {
  const s = await readStore();
  return { ...s.overrides };
}

export async function listAddedPos(): Promise<AddedPo[]> {
  const s = await readStore();
  return s.added.slice();
}

// Merge a partial edit into the override for a SEED PO (keyed by its seed PO
// number). Passing null clears it (revert to the seed). Returns the override map.
export async function setPoOverride(
  seedPoNumber: string,
  patch: Partial<PoFields> | null,
  actor: string,
): Promise<Record<string, PoOverride>> {
  return withLock(async () => {
    const s = await readStore();
    if (patch === null) {
      delete s.overrides[seedPoNumber];
    } else {
      const existing = s.overrides[seedPoNumber] ?? { updatedAt: "", updatedBy: "" };
      const next: PoOverride = { ...existing, updatedAt: new Date().toISOString(), updatedBy: actor || "unattributed" };
      for (const k of EDITABLE) {
        if (patch[k] !== undefined) (next as any)[k] = patch[k];
      }
      s.overrides[seedPoNumber] = next;
    }
    await writeStore(s);
    return { ...s.overrides };
  });
}

// Create a new PO. Returns the created row.
export async function addPo(fields: PoFields, actor: string): Promise<AddedPo> {
  return withLock(async () => {
    const s = await readStore();
    s.seq += 1;
    const now = new Date().toISOString();
    const po: AddedPo = { ...fields, id: `add-${s.seq}`, createdAt: now, createdBy: actor || "unattributed", updatedAt: now, updatedBy: actor || "unattributed" };
    s.added.push(po);
    await writeStore(s);
    return po;
  });
}

// Edit a created PO in place (by id). Returns the updated row, or null if unknown.
export async function updateAddedPo(id: string, fields: Partial<PoFields>, actor: string): Promise<AddedPo | null> {
  return withLock(async () => {
    const s = await readStore();
    const po = s.added.find((p) => p.id === id);
    if (!po) return null;
    for (const k of EDITABLE) {
      if (fields[k] !== undefined) (po as any)[k] = fields[k];
    }
    po.updatedAt = new Date().toISOString();
    po.updatedBy = actor || "unattributed";
    await writeStore(s);
    return po;
  });
}

export async function deleteAddedPo(id: string): Promise<void> {
  return withLock(async () => {
    const s = await readStore();
    const next = s.added.filter((p) => p.id !== id);
    if (next.length !== s.added.length) {
      s.added = next;
      await writeStore(s);
    }
  });
}

// Reset the whole register to its seed: clear every override AND every created PO.
export async function resetRegister(): Promise<void> {
  return withLock(async () => {
    const s = await readStore();
    await writeStore({ overrides: {}, added: [], seq: s.seq });
  });
}
