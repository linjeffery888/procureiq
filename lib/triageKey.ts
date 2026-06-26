// A stable signature of a triage batch (the invoices + the engine it would run
// under). Used to tell whether the queue has changed since the last persisted
// run, so the UI can show a "re-run" prompt without re-running automatically.
// Pure and shared by the client (the invoice-matching page) and the server (the
// triage route) so both compute the same key.

import { Invoice } from "./types";

export function triageBatchKey(forceOffline: boolean, invoices: Invoice[]): string {
  const sig = invoices.map((i) => `${i.invoiceNumber}|${i.vendor}|${i.amount}|${i.poNumberClaimed ?? ""}`).join("~");
  return `${forceOffline ? "offline" : "live"}::${sig}`;
}
