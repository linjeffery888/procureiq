import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import { extractJsonObject } from "@/lib/normalizeExtraction";
import {
  BudgetIngestLine,
  BudgetIngestResponse,
  IngestMeta,
  Invoice,
  InvoiceIngestResponse,
} from "@/lib/types";
import { checkDuplicate } from "@/lib/dedup";
import { addUpload, clearAllUploads, uploadsAsLedger } from "@/lib/uploadStore";

// The document-ingest engine for BudgetIQ. It turns the raw text of an uploaded
// PDF (already extracted by /api/upload) into the structured rows the working
// surfaces need: a single Invoice for the matching queue, or a list of vendor
// figures for the accrual/reforecast planner.
//
// This is the AP and finance pain Ben described, automated: today a person reads
// each invoice PDF and keys it into Points Purchasing, and finance re-keys vendor
// actuals into a budget spreadsheet by hand. Here the document is parsed once and
// flows straight into the same deterministic matching and accrual logic.
//
// Robustness mirrors the sibling extract/triage routes: a live present-back
// cannot crash on a malformed model response and cannot go dark if no key is set
// or the API rate-limits. So the model output is parsed forgivingly, a
// deterministic heuristic stands in when the live path is unavailable, and the
// response always carries a _meta block stating which engine ran.

export const runtime = "nodejs";
export const maxDuration = 60;

const MODEL = "claude-sonnet-4-6";
const MAX_INPUT_CHARS = 40000;

type IngestKind = "invoice" | "budget";

const INVOICE_SYSTEM = `You read a single vendor invoice (text extracted from a PDF) and return its key fields as JSON for the accounts-payable matching queue at Iovance Biotherapeutics. A human approves every invoice before it clears.

Return ONLY valid JSON, no prose, no markdown fences, matching this exact shape:
{
  "invoiceNumber": string | null,
  "vendor": string | null,
  "amount": number | null,
  "poNumberClaimed": string | null,
  "lineItems": string[],
  "receivedDate": string | null
}

Rules:
- vendor: the company billing Iovance (the sender), never Iovance itself.
- amount: the total amount due, as a number with no currency symbol and no commas.
- poNumberClaimed: the purchase order number the invoice cites, exactly as printed (for example "PO-44120" or "PO-2026-027"), keeping the full identifier, or null if the invoice prints no PO number. Do NOT invent a PO number.
- lineItems: short descriptions of what is billed, one string each.
- receivedDate: the invoice date as YYYY-MM-DD if determinable, else null.
- Base every field on the invoice text only.`;

const BUDGET_SYSTEM = `You read a finance actuals export or a vendor spend estimate (text extracted from a PDF or spreadsheet) and return the per-vendor figures as JSON, so a budget analyst does not have to re-key them into a spreadsheet by hand. This is for Iovance Biotherapeutics' IT budget reforecast and quarter-close accruals.

Return ONLY valid JSON, no prose, no markdown fences, matching this exact shape:
{
  "period": string | null,
  "lines": [{ "vendor": string, "amount": number, "note": string }]
}

Rules:
- One entry per vendor figure. vendor is the vendor name exactly as printed; amount is the spend figure as a number with no currency symbol and no commas.
- note: a short label for what the figure is, e.g. "June actual" or "Q2 estimate". Empty string if unclear.
- period: the reporting period the document covers, e.g. "June 2026", or null.
- Ignore total, subtotal, and budget-column rows and any column headers; return only real per-vendor spend figures.
- Base every figure on the document text only.`;

function meta(engine: IngestMeta["engine"], model: string | null, latencyMs: number, note: string): IngestMeta {
  return { engine, model, latencyMs, note };
}

function num(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const cleaned = v.replace(/[^0-9.]/g, "");
    if (!cleaned) return null;
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function str(v: unknown): string | null {
  if (typeof v === "string") {
    const t = v.trim();
    return t.length ? t : null;
  }
  if (typeof v === "number") return String(v);
  return null;
}

// Normalize a cited PO into the canonical "PO-..." form Points Purchasing uses,
// so it matches the register exactly. Handles BOTH PO id shapes in play: a single
// number (PO-44120) and a hyphenated year-sequence (PO-2026-027). Capturing only
// the first digit group would truncate "PO-2026-027" to "PO-2026" and break the
// match, so we keep the whole hyphenated identifier. Returns null when no PO
// digits are present (the AP "no PO number" case).
function normPo(v: unknown): string | null {
  const s = str(v);
  if (!s) return null;
  // Prefer a "PO"-prefixed token, capturing its full digit/hyphen identifier.
  const withPrefix = s.match(/P\.?O\.?[\s#:.-]*(\d+(?:-\d+)*)/i);
  if (withPrefix) return `PO-${withPrefix[1]}`;
  // Fallback: a bare hyphenated id (2026-027) or a lone number (44120).
  const bare = s.match(/(\d{3,4}(?:-\d{1,5})+|\d{3,7})/);
  return bare ? `PO-${bare[1]}` : null;
}

// --- Offline heuristics: no network, used when no key is set or the Engine
// toggle forced Offline. They are intentionally simpler than the model and read
// the same text with plain pattern matching. ---

function offlineInvoice(raw: string): Invoice {
  const text = raw.replace(/\r/g, "");
  const flat = text.replace(/\s+/g, " ");

  const invNo =
    text.match(/invoice\s*(?:#|no\.?|number)\s*:?\s*([A-Za-z0-9][A-Za-z0-9-]{2,})/i)?.[1] ?? null;

  const po = normPo(flat.match(/\bP\.?O\.?\s*(?:#|no\.?|number)?\s*:?\s*-?\s*(\d{2,4}(?:-\d{1,5})+|\d{3,7})/i)?.[0] ?? null);

  // Amount: prefer the grand TOTAL, then "Amount Due". Handles a "$" or "USD"
  // prefix and a parenthesized credit "(1,234.56)" which denotes a negative
  // (credit memo). "Subtotal" is deliberately not matched (\btotal has no word
  // boundary inside "Subtotal"), so the grand total wins. Falls back to the
  // largest money figure on the page.
  const readMoney = (seg: string): number | null => {
    const m = seg.match(/(\(?)\s*([\d,]+(?:\.\d{1,2})?)\s*\)?/);
    if (!m) return null;
    const n = Number(m[2].replace(/,/g, ""));
    if (!Number.isFinite(n)) return null;
    return m[1] === "(" ? -n : n;
  };
  let amount: number | null = null;
  const totals = [
    ...flat.matchAll(/\b(?:total|amount\s*(?:due|payable)|balance\s*due)\s*:?\s*(?:USD|US\$|\$|EUR|€|GBP|£)?\s*(\(?[\d,]+(?:\.\d{1,2})?\)?)/gi),
  ];
  if (totals.length) amount = readMoney(totals[totals.length - 1][1]);
  if (amount == null) {
    const figs = [...flat.matchAll(/(?:USD|US\$|\$)\s*(\(?[\d,]+(?:\.\d{1,2})?\)?)/gi)]
      .map((m) => readMoney(m[1]))
      .filter((n): n is number => n != null && n !== 0);
    amount = figs.length ? figs.reduce((a, b) => (Math.abs(b) > Math.abs(a) ? b : a)) : 0;
  }

  // Vendor (the sender). Letterhead invoices print the vendor right after the
  // all-caps "INVOICE" banner, before its street number: "INVOICE Acme Corp 123
  // Main St". Prefer that, because a naive "remit to" match grabs the bill-to
  // CUSTOMER on templates that list the customer there. Guard against the known
  // customer names (synthetic data) either way.
  const isCustomer = (s: string) => /oncocell|iovance/i.test(s);
  let vendor: string | null = null;
  const letterhead = flat.match(/\bINVOICE\s+([A-Z][A-Za-z0-9&.,'() -]{2,60}?)\s+\d/);
  if (letterhead && !isCustomer(letterhead[1])) vendor = letterhead[1].trim();
  if (!vendor) {
    const labeled = text.match(/(?:remit\s*(?:payment\s*)?(?:net\s*\d+\s*)?to|bill\s*from|vendor)\s*:?\s*([A-Za-z0-9][^\n]{2,70})/i)?.[1];
    if (labeled && !isCustomer(labeled)) vendor = labeled.trim();
  }
  if (!vendor) {
    const lines = text.split(/\n/).map((l) => l.trim()).filter(Boolean);
    vendor =
      lines.find(
        (l) =>
          /[A-Za-z]/.test(l) &&
          !isCustomer(l) &&
          !/^invoice\b/i.test(l) &&
          !/^(bill\s*to|ship\s*to|date|invoice|po|purchase\s*order|description|amount|total|subtotal|terms|due|reference)\b/i.test(l) &&
          l.length <= 70,
      ) ?? null;
  }
  if (vendor) vendor = vendor.replace(/\s*\|.*$/, "").replace(/[",]+$/, "").trim();

  const desc = text.match(/(?:description|for|services?)\s*:?\s*([^\n]{3,90})/i)?.[1]?.trim();
  const lineItems = desc ? [desc] : [];

  // Date: ISO first, then a "Month DD, YYYY" letterhead date, else today.
  const MONTHS: Record<string, string> = {
    january: "01", february: "02", march: "03", april: "04", may: "05", june: "06",
    july: "07", august: "08", september: "09", october: "10", november: "11", december: "12",
  };
  const named = flat.match(/invoice\s*date\s*:?\s*([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})/i);
  const namedIso =
    named && MONTHS[named[1].toLowerCase()] ? `${named[3]}-${MONTHS[named[1].toLowerCase()]}-${named[2].padStart(2, "0")}` : null;
  const date =
    text.match(/(?:invoice\s*date|date)\s*:?\s*(\d{4}-\d{2}-\d{2})/i)?.[1] ??
    namedIso ??
    text.match(/\b(\d{4}-\d{2}-\d{2})\b/)?.[1] ??
    new Date().toISOString().slice(0, 10);

  return {
    invoiceNumber: invNo ?? `UP-${Date.now().toString().slice(-5)}`,
    vendor: vendor ?? "Unreadable vendor",
    amount: amount ?? 0,
    poNumberClaimed: po,
    lineItems,
    receivedDate: date,
  };
}

function offlineBudget(raw: string): BudgetIngestLine[] {
  const text = raw.replace(/\r/g, "");
  const period = text.match(/period\s*:?\s*([^\n]{3,40})/i)?.[1]?.trim() ?? null;
  const lines: BudgetIngestLine[] = [];
  for (const line of text.split(/\n/)) {
    const l = line.trim();
    if (!l) continue;
    if (/^(vendor|period|total|subtotal|budget|iovance|q[1-4]\b)/i.test(l)) continue;
    // "Vendor Name   $20,000" or "Vendor Name .... 20,000"
    const m = l.match(/^(.+?)[\s.]{2,}\$?\s*([\d,]+(?:\.\d{1,2})?)\s*$/) || l.match(/^(.+?)\s+\$\s*([\d,]+(?:\.\d{1,2})?)\b/);
    if (!m) continue;
    const vendor = m[1].replace(/[.\s]+$/, "").trim();
    const amount = Number(m[2].replace(/,/g, ""));
    if (!vendor || !Number.isFinite(amount) || amount <= 0) continue;
    lines.push({ vendor, amount, period, note: period ? `${period} figure` : "uploaded figure" });
  }
  return lines;
}

// --- Live normalizers: coerce the model's JSON into the guaranteed shape. ---

function normalizeInvoice(parsed: any): Invoice {
  const items = Array.isArray(parsed?.lineItems)
    ? parsed.lineItems.map((x: unknown) => str(x)).filter((x: string | null): x is string => !!x)
    : [];
  return {
    invoiceNumber: str(parsed?.invoiceNumber) ?? `UP-${Date.now().toString().slice(-5)}`,
    vendor: str(parsed?.vendor) ?? "Unreadable vendor",
    amount: num(parsed?.amount) ?? 0,
    poNumberClaimed: normPo(parsed?.poNumberClaimed),
    lineItems: items,
    receivedDate: str(parsed?.receivedDate) ?? new Date().toISOString().slice(0, 10),
  };
}

function normalizeBudget(parsed: any): BudgetIngestLine[] {
  const period = str(parsed?.period);
  const raw = Array.isArray(parsed?.lines) ? parsed.lines : [];
  const out: BudgetIngestLine[] = [];
  for (const r of raw) {
    const vendor = str(r?.vendor);
    const amount = num(r?.amount);
    if (!vendor || amount == null || amount <= 0) continue;
    out.push({ vendor, amount, period, note: str(r?.note) ?? (period ? `${period} figure` : "uploaded figure") });
  }
  return out;
}

export async function POST(req: NextRequest) {
  const started = Date.now();

  let kind: IngestKind = "invoice";
  let text = "";
  let forceOffline = false;
  let sourceName = "pasted invoice";
  try {
    const body = await req.json();
    if (body?.kind === "budget") kind = "budget";
    text = typeof body?.text === "string" ? body.text : "";
    forceOffline = body?.forceOffline === true;
    if (typeof body?.sourceName === "string" && body.sourceName.trim()) {
      sourceName = body.sourceName.trim();
    }
  } catch {
    return NextResponse.json({ error: "Body must be JSON with a 'text' field (the extracted document text)." }, { status: 400 });
  }

  // Dedup against the persisted receipt history, then persist this invoice as
  // received. Runs on every invoice return path (live and offline) so the verdict
  // is identical regardless of which engine parsed the PDF: dedup is a
  // deterministic rule, not model work. The invoice is persisted after the check
  // so it does not match itself, and is stored even when flagged so the queue
  // survives restarts and the receipt history stays complete. Returns the stored
  // id so the client can track and delete it.
  const finalizeInvoice = async (invoice: Invoice, m: IngestMeta) => {
    const duplicate = checkDuplicate(invoice, await uploadsAsLedger());
    const stored = await addUpload(invoice, sourceName, m.engine, duplicate);
    const res: InvoiceIngestResponse = { id: stored.id, invoice, duplicate, _meta: m };
    return NextResponse.json(res);
  };

  if (text.trim().length < 20) {
    return NextResponse.json({ error: "Document text was empty or too short to parse. Upload a readable PDF." }, { status: 400 });
  }
  const input = text.slice(0, MAX_INPUT_CHARS);

  const offlineResponse = (note: string) => {
    if (kind === "budget") {
      const res: BudgetIngestResponse = { lines: offlineBudget(input), _meta: meta("offline-heuristic", null, Date.now() - started, note) };
      return NextResponse.json(res);
    }
    return finalizeInvoice(offlineInvoice(input), meta("offline-heuristic", null, Date.now() - started, note));
  };

  // --- Offline path: no key, or the Engine toggle forced it. ---
  if (forceOffline || !process.env.ANTHROPIC_API_KEY) {
    return offlineResponse(
      forceOffline && process.env.ANTHROPIC_API_KEY
        ? "Offline heuristic mode: the Engine toggle is set to Offline, so this PDF was parsed by deterministic pattern matching, not the model. Switch the toggle to Live for the Claude parse."
        : "Offline heuristic mode: no ANTHROPIC_API_KEY set, so this PDF was parsed by deterministic pattern matching, not the model. Set a key in .env.local for the live Claude parse.",
    );
  }

  // --- Live path: ask Claude to parse, fall back to the heuristic on any failure. ---
  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const msg = await client.messages.create({
      model: MODEL,
      max_tokens: 1500,
      temperature: 0,
      system: kind === "budget" ? BUDGET_SYSTEM : INVOICE_SYSTEM,
      messages: [{ role: "user", content: `DOCUMENT:\n"""\n${input}\n"""` }],
    });
    const rawText = msg.content
      .filter((b) => b.type === "text")
      .map((b: any) => b.text)
      .join("");
    const parsed = extractJsonObject(rawText);
    if (parsed == null) {
      return offlineResponse("Live model response could not be parsed as JSON; fell back to the deterministic parser. Re-run to retry the live engine.");
    }
    if (kind === "budget") {
      const lines = normalizeBudget(parsed);
      const res: BudgetIngestResponse = {
        lines,
        _meta: meta("live", MODEL, Date.now() - started, `Live parse by ${MODEL}: ${lines.length} vendor figure(s) read from the uploaded document. Finance confirms before any accrual posts.`),
      };
      return NextResponse.json(res);
    }
    const invoice = normalizeInvoice(parsed);
    return finalizeInvoice(
      invoice,
      meta("live", MODEL, Date.now() - started, `Live parse by ${MODEL}. The parsed invoice runs the same deterministic dedup + match + budget check as any other; a human approves every exception.`),
    );
  } catch (err: any) {
    return offlineResponse(`Live engine unavailable (${err?.message ?? "API error"}); fell back to the deterministic parser. The document below was still read.`);
  }
}

// Clear all persisted uploads (and with them the receipt history). A demo / test
// convenience so a fresh run does not dedupe against earlier uploads. The
// invoice-matching UI also uses DELETE /api/uploads for the same effect.
export async function DELETE() {
  await clearAllUploads();
  return NextResponse.json({ ok: true, uploads: 0 });
}
