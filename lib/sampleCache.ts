// Pinned extractions for the bundled demo samples, so the present-back is snappy
// and identical every time.
//
// Why this exists: the content cache (lib/extractCache) keys on the editable
// clause thresholds + the grounding toggle, so any threshold edit on the
// Knowledge page silently orphans a sample's cached entry. The clean samples
// don't notice — the deterministic confidence gate serves them instantly without
// the cache. But the Apexion change order is an AMENDMENT, which deliberately
// never passes that gate (it needs parent-agreement reasoning), so on a cache
// miss it falls through to the ~60s live model call and "always re-reviews".
//
// Pinning a bundled sample by its EXACT text sidesteps the threshold-sensitive
// key entirely: the shipped sample always resolves to the same reviewed record.
// Real uploads never match a sample text, so they are completely unaffected.

import { readFileSync } from "fs";
import { join } from "path";
import { SAMPLE_CHANGE_ORDER } from "./mockData";
import { ContractExtraction } from "./types";

// sampleKey -> the exact bundled contract text. Add a sample here (and an entry
// in data/sample-extractions.json) to pin it.
const PINNED_SAMPLE_TEXT: Record<string, string> = {
  "apexion-co": SAMPLE_CHANGE_ORDER,
};

let cached: Record<string, ContractExtraction> | null = null;
function loadPinned(): Record<string, ContractExtraction> {
  if (cached) return cached;
  try {
    const raw = readFileSync(join(process.cwd(), "data", "sample-extractions.json"), "utf8");
    const parsed = JSON.parse(raw);
    cached = parsed && typeof parsed === "object" ? (parsed as Record<string, ContractExtraction>) : {};
  } catch {
    // Missing/unreadable fixture: fall back to the normal path (never throw).
    cached = {};
  }
  return cached;
}

// Normalize trivial whitespace differences so a pasted/loaded sample still
// matches the shipped constant.
const norm = (s: string) => s.replace(/\r\n/g, "\n").trim();

// The pinned live extraction for a bundled sample whose exact text was submitted,
// or null for anything else (every real upload). Never throws.
export function getPinnedSampleExtraction(text: string): ContractExtraction | null {
  const t = norm(text);
  for (const [key, sampleText] of Object.entries(PINNED_SAMPLE_TEXT)) {
    if (norm(sampleText) === t) {
      const ext = loadPinned()[key];
      if (ext) return ext;
    }
  }
  return null;
}
