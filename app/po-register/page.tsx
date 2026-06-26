"use client";

import { CSSProperties, useEffect, useMemo, useState } from "react";
import { logAudit } from "@/lib/auditClient";
import { useReviewer } from "../components/reviewer";

// BudgetIQ · PO Register. The source of truth every invoice check resolves
// against, made visible and fully maintainable. In production this is the AP
// system of record ("Points Purchasing"); here it is the synthetic register
// (data/po_register.json) surfaced through /api/po-register. A reviewer can edit
// ANY field of a PO, create a new PO (e.g. to source one for a no-PO invoice), or
// delete a created PO. Edits persist as overrides layered on the read-only seed,
// and new POs persist alongside (lib/poOverridesStore), so the next invoice check
// resolves against the updated register (the triage route loads overrides-applied
// + created POs). POs are NEVER added automatically by invoice upload; an invoice
// with no matching PO becomes a no-PO exception for a human to source here.
//
// The terms-policy flag activates the agreed_terms field: each PO is measured
// against Iovance's standard net-payment-terms threshold (the same editable clause
// threshold the contract playbook uses, so the standard lives in one place). A
// window SHORTER than the standard is the vendor-favorable deviation that strains
// cash timing, and is flagged here.

interface RegisterViewRow {
  key: string;
  isAdded: boolean;
  poNumber: string;
  vendor: string;
  workOrder: string;
  sowRef: string;
  contractValue: number;
  spentToDate: number;
  remaining: number;
  agreedTerms: number;
  status: string;
  edited: boolean;
  updatedAt: string | null;
  updatedBy: string | null;
  termsBelowStandard: boolean;
}

interface PoFormDraft {
  poNumber: string;
  vendor: string;
  workOrder: string;
  sowRef: string;
  status: string;
  contractValue: string;
  spentToDate: string;
  remaining: string;
  agreedTerms: string;
}
type FormState = { mode: "create" } | { mode: "edit"; row: RegisterViewRow } | null;

const BLANK_DRAFT: PoFormDraft = { poNumber: "", vendor: "", workOrder: "", sowRef: "", status: "Active", contractValue: "", spentToDate: "", remaining: "", agreedTerms: "60" };

const money = (n: number) => "$" + Math.round(n).toLocaleString("en-US");

function shortTime(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function rowToDraft(r: RegisterViewRow): PoFormDraft {
  return {
    poNumber: r.poNumber, vendor: r.vendor, workOrder: r.workOrder, sowRef: r.sowRef, status: r.status,
    contractValue: String(r.contractValue), spentToDate: String(r.spentToDate), remaining: String(r.remaining), agreedTerms: String(r.agreedTerms),
  };
}

export default function PoRegisterPage() {
  const { name: reviewer } = useReviewer();

  const [rows, setRows] = useState<RegisterViewRow[]>([]);
  const [minNetDays, setMinNetDays] = useState<number>(40);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [query, setQuery] = useState("");
  const [view, setView] = useState<"all" | "below" | "edited" | "added">("all");

  const [form, setForm] = useState<FormState>(null);
  const [draft, setDraft] = useState<PoFormDraft>(BLANK_DRAFT);
  const [formBusy, setFormBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [rowBusy, setRowBusy] = useState<string | null>(null);
  const [resetting, setResetting] = useState(false);

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/po-register", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not load the PO register.");
      setRows(Array.isArray(data.rows) ? data.rows : []);
      if (data?.standard?.minNetDays != null) setMinNetDays(data.standard.minNetDays);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { refresh(); }, []);

  const totals = useMemo(() => {
    const t = { count: rows.length, below: 0, edited: 0, added: 0, remaining: 0 };
    for (const r of rows) {
      if (r.termsBelowStandard) t.below++;
      if (r.edited) t.edited++;
      if (r.isAdded) t.added++;
      t.remaining += r.remaining;
    }
    return t;
  }, [rows]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (view === "below" && !r.termsBelowStandard) return false;
      if (view === "edited" && !r.edited) return false;
      if (view === "added" && !r.isAdded) return false;
      if (q) {
        const hay = `${r.poNumber} ${r.vendor} ${r.workOrder} ${r.sowRef} ${r.status}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [rows, query, view]);

  function openCreate() {
    setForm({ mode: "create" });
    setDraft(BLANK_DRAFT);
    setFormError(null);
  }
  function openEdit(r: RegisterViewRow) {
    setForm({ mode: "edit", row: r });
    setDraft(rowToDraft(r));
    setFormError(null);
  }
  function closeForm() {
    setForm(null);
    setFormError(null);
  }
  function setField(k: keyof PoFormDraft, v: string) {
    setDraft((d) => ({ ...d, [k]: v }));
  }

  // Local validation; returns the parsed full field set or an error.
  function parseDraft(): { fields?: any; error?: string } {
    const f: any = {};
    if (!draft.poNumber.trim()) return { error: "PO number is required." };
    if (!draft.vendor.trim()) return { error: "Vendor is required." };
    f.poNumber = draft.poNumber.trim();
    f.vendor = draft.vendor.trim();
    f.workOrder = draft.workOrder.trim();
    f.sowRef = draft.sowRef.trim();
    f.status = draft.status.trim() || "Active";
    const num = (label: string, raw: string, min: number, max?: number) => {
      const n = Number(raw);
      if (raw.trim() === "" || !Number.isFinite(n) || n < min || (max !== undefined && n > max)) {
        throw new Error(`${label} must be a number${max !== undefined ? ` between ${min} and ${max}` : ` of at least ${min}`}.`);
      }
      return Math.round(n);
    };
    try {
      f.contractValue = num("Contract value", draft.contractValue, 0);
      f.spentToDate = num("Spent to date", draft.spentToDate, 0);
      f.remaining = num("Remaining", draft.remaining, 0);
      f.agreedTerms = num("Agreed terms", draft.agreedTerms, 0, 365);
    } catch (e: any) {
      return { error: e.message };
    }
    return { fields: f };
  }

  async function submitForm() {
    if (!form) return;
    const { fields, error } = parseDraft();
    if (error) { setFormError(error); return; }

    let body: any;
    let auditDetail = "";
    if (form.mode === "create") {
      body = { mode: "create", actor: reviewer || "unattributed", fields };
      auditDetail = `created ${fields.poNumber} (${fields.vendor}), ${money(fields.remaining)} remaining, Net ${fields.agreedTerms}`;
    } else {
      const r = form.row;
      // Send only the fields that actually changed.
      const changed: any = {};
      const changes: string[] = [];
      const cmp: [keyof PoFormDraft, any, any, string][] = [
        ["poNumber", fields.poNumber, r.poNumber, "PO #"],
        ["vendor", fields.vendor, r.vendor, "vendor"],
        ["workOrder", fields.workOrder, r.workOrder, "work order"],
        ["sowRef", fields.sowRef, r.sowRef, "SOW"],
        ["status", fields.status, r.status, "status"],
        ["contractValue", fields.contractValue, r.contractValue, "contract value"],
        ["spentToDate", fields.spentToDate, r.spentToDate, "spent"],
        ["remaining", fields.remaining, r.remaining, "remaining"],
        ["agreedTerms", fields.agreedTerms, r.agreedTerms, "terms"],
      ];
      for (const [k, nv, ov, label] of cmp) {
        if (nv !== ov) { changed[k] = nv; changes.push(`${label} ${ov} -> ${nv}`); }
      }
      if (Object.keys(changed).length === 0) { closeForm(); return; }
      body = { mode: "edit", key: r.key, isAdded: r.isAdded, actor: reviewer || "unattributed", fields: changed };
      auditDetail = changes.join("; ");
    }

    setFormBusy(true);
    setFormError(null);
    try {
      const res = await fetch("/api/po-register", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not save.");
      setRows(Array.isArray(data.rows) ? data.rows : rows);
      if (data?.standard?.minNetDays != null) setMinNetDays(data.standard.minNetDays);
      logAudit({
        module: "BudgetIQ", action: "po-updated", surface: "PO Register",
        actor: reviewer || "unattributed", actionLabel: form.mode === "create" ? "PO created" : "PO register edited",
        subject: `${fields.poNumber} · ${fields.vendor}`, outcome: form.mode === "create" ? "created" : "edited", detail: auditDetail,
      });
      closeForm();
    } catch (e: any) {
      setFormError(e.message);
    } finally {
      setFormBusy(false);
    }
  }

  async function rowAction(r: RegisterViewRow, mode: "revert" | "delete") {
    if (mode === "delete" && !window.confirm(`Delete the created PO ${r.poNumber}? It is removed from the register and the invoice check.`)) return;
    setRowBusy(r.key);
    setError(null);
    try {
      const res = await fetch("/api/po-register", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode, key: r.key, isAdded: r.isAdded, actor: reviewer || "unattributed" }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not update the PO.");
      setRows(Array.isArray(data.rows) ? data.rows : rows);
      if (data?.standard?.minNetDays != null) setMinNetDays(data.standard.minNetDays);
      logAudit({
        module: "BudgetIQ", action: "po-updated", surface: "PO Register",
        actor: reviewer || "unattributed", actionLabel: mode === "delete" ? "PO deleted" : "PO register reverted",
        subject: `${r.poNumber} · ${r.vendor}`, outcome: mode === "delete" ? "deleted" : "reverted",
        detail: mode === "delete" ? "removed a created PO" : "reverted to the register seed values",
      });
      if (form && form.mode === "edit" && form.row.key === r.key) closeForm();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setRowBusy(null);
    }
  }

  async function resetAll() {
    if (!window.confirm("Revert the entire register to its seed values? This clears every human edit and every created PO, and cannot be undone.")) return;
    setResetting(true);
    setError(null);
    try {
      const res = await fetch("/api/po-register", { method: "DELETE" });
      if (!res.ok) throw new Error("Could not reset the register.");
      closeForm();
      await refresh();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setResetting(false);
    }
  }

  const btn: CSSProperties = { padding: "8px 14px", borderRadius: 8, border: "1px solid #d8dde4", background: "#fff", color: "#3a4655", fontSize: 12.5, fontWeight: 600, cursor: "pointer" };
  const headerCell: CSSProperties = { fontSize: 10, fontWeight: 600, color: "#9aa3b0", textTransform: "uppercase", letterSpacing: ".5px" };

  // The grid shared by the table header and every row. The columnGap separates the
  // numeric columns (notably Remaining and Agreed terms) so they never run together.
  const GRID = "150px 1.3fr 0.8fr 0.95fr 1fr 1.1fr 0.95fr 150px";
  const GAP = 16;

  return (
    <div className="pq-route">
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 20, gap: 20 }}>
        <div style={{ maxWidth: 780 }}>
          <div style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: "1px", textTransform: "uppercase", color: "#1f7a5a", marginBottom: 6 }}>BudgetIQ · Source of truth</div>
          <h2 className="serif" style={{ fontSize: 23, fontWeight: 600, letterSpacing: "-.3px", margin: "0 0 10px", color: "#16202e" }}>PO register</h2>
          <p style={{ fontSize: 13.5, lineHeight: 1.6, color: "#5a6675", margin: 0 }}>
            The master list every invoice is checked against. Edit any field, or add a PO to source one for a no-PO invoice;
            edits and new POs persist and flow into the next invoice check. Invoice upload never adds a PO automatically, an
            unmatched invoice becomes a no-PO exception for a human to source here. Every change is signed onto the audit trail.
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
          <button onClick={openCreate} style={{ ...btn, background: "#1f7a5a", color: "#fff", border: "none", display: "inline-flex", alignItems: "center", gap: 7 }}>
            <span style={{ fontSize: 15, lineHeight: 1 }}>+</span> New PO
          </button>
          <button onClick={refresh} disabled={loading} style={{ ...btn, opacity: loading ? 0.6 : 1 }}>{loading ? "Loading…" : "Refresh"}</button>
        </div>
      </div>

      {/* Summary tiles */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 14 }}>
        {[
          { label: "Purchase orders", value: String(totals.count), sub: `${totals.added} created by a reviewer` },
          { label: "Below Net standard", value: String(totals.below), sub: `terms shorter than Net ${minNetDays}` },
          { label: "Human edits", value: String(totals.edited), sub: "overrides + created POs" },
          { label: "Budget remaining", value: money(totals.remaining), sub: "across all POs", small: true },
        ].map((tile: any) => (
          <div key={tile.label} style={{ background: "#fff", border: "1px solid #e6e8ec", borderRadius: 10, padding: "16px 18px" }}>
            <div style={{ fontSize: 10.5, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".5px", color: "#9aa3b0", marginBottom: 7 }}>{tile.label}</div>
            <div className="serif num" style={{ fontSize: tile.small ? 21 : 28, fontWeight: 600, color: "#16202e", letterSpacing: "-.5px" }}>{tile.value}</div>
            <div style={{ fontSize: 11.5, color: "#8893a2", marginTop: 4 }}>{tile.sub}</div>
          </div>
        ))}
      </div>

      {/* Terms-policy explainer */}
      <div style={{ background: "#fbf8ef", border: "1px solid #ece2c8", borderRadius: 9, padding: "11px 15px", marginBottom: 16, fontSize: 12, lineHeight: 1.55, color: "#7a6526" }}>
        <strong style={{ color: "#6a5512" }}>Terms policy:</strong> a PO is flagged when its agreed payment window is shorter than the Iovance standard of{" "}
        <strong>Net {minNetDays}</strong> (the same threshold the contract playbook uses). This is a policy check on the PO itself, not an invoice-vs-PO
        comparison, because invoices in this data set carry no stated payment terms to compare against.
      </div>

      {/* Filters */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
        <div style={{ display: "flex", border: "1px solid #d8dde4", borderRadius: 8, overflow: "hidden" }}>
          {([
            ["all", "All"],
            ["below", "Below standard"],
            ["edited", "Edited"],
            ["added", "Created"],
          ] as const).map(([key, label], i) => (
            <button key={key} onClick={() => setView(key)} style={{ padding: "7px 13px", fontSize: 12.5, fontWeight: 600, border: "none", borderLeft: i === 0 ? "none" : "1px solid #e3e7ec", background: view === key ? "#eef4f1" : "#fff", color: view === key ? "#1f7a5a" : "#7a8493", cursor: "pointer" }}>
              {label}
            </button>
          ))}
        </div>
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search PO, vendor, work order, SOW…" style={{ padding: "7px 10px", borderRadius: 8, border: "1px solid #d8dde4", background: "#fff", color: "#3a4655", fontSize: 12.5, flex: 1, minWidth: 220 }} />
        <span style={{ fontSize: 12, color: "#8893a2" }}>{filtered.length} of {rows.length} shown</span>
        <button onClick={resetAll} disabled={resetting || totals.edited === 0} title="Revert every PO to its seed values and remove created POs (fresh-demo reset)" style={{ ...btn, color: "#b4504a", borderColor: "#e7cdcb", opacity: resetting || totals.edited === 0 ? 0.5 : 1 }}>
          {resetting ? "Resetting…" : "Reset all"}
        </button>
      </div>

      {error && (
        <div style={{ background: "#fdf1f0", border: "1px solid #f3d5d2", borderRadius: 9, padding: "12px 16px", marginBottom: 14, fontSize: 12.5, color: "#a4453d" }}>{error}</div>
      )}

      {/* Register table */}
      <div style={{ background: "#fff", border: "1px solid #e6e8ec", borderRadius: 10, overflow: "hidden" }}>
        <div style={{ display: "grid", gridTemplateColumns: GRID, columnGap: GAP, padding: "11px 18px", background: "#fafbfc", borderBottom: "1px solid #eef0f3", ...headerCell }}>
          <div>PO / status</div>
          <div>Vendor / work order</div>
          <div>SOW</div>
          <div style={{ textAlign: "right" }}>Contract value</div>
          <div style={{ textAlign: "right" }}>Remaining</div>
          <div>Agreed terms</div>
          <div>Last edit</div>
          <div style={{ textAlign: "right" }}>Actions</div>
        </div>

        {/* Create panel sits at the top of the table body */}
        {form?.mode === "create" && (
          <PoFormPanel mode="create" draft={draft} setField={setField} onSubmit={submitForm} onCancel={closeForm} busy={formBusy} formError={formError} minNetDays={minNetDays} />
        )}

        {loading ? (
          <div style={{ padding: "40px 18px", textAlign: "center", fontSize: 13, color: "#9aa3b0" }}>Loading the register…</div>
        ) : filtered.length === 0 && form?.mode !== "create" ? (
          <div style={{ padding: "40px 18px", textAlign: "center", fontSize: 13, color: "#9aa3b0" }}>
            {rows.length === 0 ? "The register is empty. Add a PO to begin." : "No POs match these filters."}
          </div>
        ) : (
          filtered.map((r) => {
            const busy = rowBusy === r.key;
            const editingThis = form?.mode === "edit" && form.row.key === r.key;
            return (
              <div key={r.key}>
                <div style={{ display: "grid", gridTemplateColumns: GRID, columnGap: GAP, padding: "12px 18px", borderBottom: editingThis ? "none" : "1px solid #f3f4f6", alignItems: "center", fontSize: 12.5, background: editingThis ? "#fbfdfc" : "#fff" }}>
                  {/* PO + status */}
                  <div>
                    <div className="mono" style={{ fontWeight: 600, color: "#16202e", fontSize: 12, display: "flex", alignItems: "center", gap: 6 }}>
                      {r.poNumber}
                      {r.isAdded && <span title="Created by a reviewer" style={{ fontSize: 8.5, fontWeight: 700, padding: "1px 5px", borderRadius: 4, background: "#e7f3ee", color: "#1f7a5a", textTransform: "uppercase", letterSpacing: ".3px" }}>New</span>}
                    </div>
                    <div style={{ marginTop: 3 }}>
                      <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 7px", borderRadius: 5, background: "#eef1f6", color: "#5a7290", textTransform: "capitalize" }}>{r.status}</span>
                    </div>
                  </div>
                  {/* Vendor + work order */}
                  <div style={{ minWidth: 0 }}>
                    <div style={{ color: "#2a3645", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.vendor}</div>
                    <div style={{ fontSize: 11, color: "#9aa3b0", marginTop: 2 }}>{r.workOrder || "no work order"}</div>
                  </div>
                  {/* SOW */}
                  <div className="mono" style={{ color: "#6a7484", fontSize: 11.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.sowRef || "-"}</div>
                  {/* Contract value */}
                  <div className="num" style={{ textAlign: "right", color: "#5a6675" }}>{money(r.contractValue)}</div>
                  {/* Remaining */}
                  <div className="num" style={{ textAlign: "right", color: "#2a3645", fontWeight: 600 }}>{money(r.remaining)}</div>
                  {/* Agreed terms + below-standard chip */}
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span className="num" style={{ color: "#2a3645" }}>Net {r.agreedTerms}</span>
                    {r.termsBelowStandard && (
                      <span title={`Shorter than the Net ${minNetDays} standard`} style={{ fontSize: 9.5, fontWeight: 700, padding: "2px 6px", borderRadius: 5, background: "#fbf4e3", color: "#9a6b00", textTransform: "uppercase", letterSpacing: ".3px", whiteSpace: "nowrap" }}>Below</span>
                    )}
                  </div>
                  {/* Last edit */}
                  <div>
                    {r.edited ? (
                      <div style={{ fontSize: 11, color: "#6a7484", lineHeight: 1.4 }}>
                        <div style={{ fontWeight: 600, color: "#2a3645", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.updatedBy || "unattributed"}</div>
                        <div className="num" style={{ color: "#9aa3b0" }}>{shortTime(r.updatedAt)}</div>
                      </div>
                    ) : (
                      <span style={{ color: "#c2c8d0", fontSize: 11 }}>seed</span>
                    )}
                  </div>
                  {/* Actions */}
                  <div style={{ display: "flex", gap: 6, justifyContent: "flex-end", alignItems: "center" }}>
                    <button onClick={() => (editingThis ? closeForm() : openEdit(r))} disabled={busy} style={{ padding: "6px 11px", fontSize: 11.5, fontWeight: 600, border: "1px solid #d8dde4", borderRadius: 6, background: editingThis ? "#eef4f1" : "#fff", color: editingThis ? "#1f7a5a" : "#3a4655", cursor: "pointer" }}>{editingThis ? "Close" : "Edit"}</button>
                    {r.isAdded ? (
                      <button onClick={() => rowAction(r, "delete")} disabled={busy} title="Delete this created PO" style={{ padding: "6px 9px", fontSize: 11.5, fontWeight: 600, border: "1px solid #e7cdcb", borderRadius: 6, background: "#fff", color: "#b4504a", cursor: "pointer", opacity: busy ? 0.6 : 1 }}>{busy ? "…" : "Delete"}</button>
                    ) : r.edited ? (
                      <button onClick={() => rowAction(r, "revert")} disabled={busy} title="Revert to the register seed values" style={{ padding: "6px 9px", fontSize: 11.5, fontWeight: 600, border: "1px solid #e7cdcb", borderRadius: 6, background: "#fff", color: "#b4504a", cursor: "pointer", opacity: busy ? 0.6 : 1 }}>{busy ? "…" : "Revert"}</button>
                    ) : null}
                  </div>
                </div>
                {editingThis && (
                  <PoFormPanel mode="edit" draft={draft} setField={setField} onSubmit={submitForm} onCancel={closeForm} busy={formBusy} formError={formError} minNetDays={minNetDays} />
                )}
              </div>
            );
          })
        )}
      </div>

      <div style={{ fontSize: 11.5, color: "#9aa3b0", marginTop: 12, lineHeight: 1.5 }}>
        Edits are stored as overrides on the read-only seed, and created POs alongside; both are applied wherever the register
        is read, including the invoice check. Reset all reverts the register to its seed for a clean demo.
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// The full-field edit / create form, rendered inline (at the top for a create,
// below the row for an edit). Every PO field is editable here.
// ---------------------------------------------------------------------------
function PoFormPanel({ mode, draft, setField, onSubmit, onCancel, busy, formError, minNetDays }: {
  mode: "create" | "edit"; draft: PoFormDraft; setField: (k: keyof PoFormDraft, v: string) => void;
  onSubmit: () => void; onCancel: () => void; busy: boolean; formError: string | null; minNetDays: number;
}) {
  const label: CSSProperties = { fontSize: 9.5, fontWeight: 600, color: "#9aa3b0", textTransform: "uppercase", letterSpacing: ".4px", marginBottom: 5, display: "block" };
  const input: CSSProperties = { width: "100%", boxSizing: "border-box", padding: "7px 9px", fontSize: 12.5, border: "1px solid #dbe0e6", borderRadius: 6, outline: "none", color: "#16202e", background: "#fff" };
  const fields: { k: keyof PoFormDraft; label: string; numeric?: boolean; prefix?: string }[] = [
    { k: "poNumber", label: "PO number" },
    { k: "vendor", label: "Vendor" },
    { k: "status", label: "Status" },
    { k: "workOrder", label: "Work order" },
    { k: "sowRef", label: "SOW reference" },
    { k: "agreedTerms", label: "Agreed terms (Net days)", numeric: true },
    { k: "contractValue", label: "Contract value", numeric: true, prefix: "$" },
    { k: "spentToDate", label: "Spent to date", numeric: true, prefix: "$" },
    { k: "remaining", label: "Remaining", numeric: true, prefix: "$" },
  ];
  return (
    <div style={{ padding: "16px 18px 18px", background: "#f7faf8", borderBottom: "1px solid #eef0f3", borderTop: mode === "create" ? "none" : "1px dashed #d9e6df" }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: "#1f7a5a", marginBottom: 13, textTransform: "uppercase", letterSpacing: ".4px" }}>
        {mode === "create" ? "New purchase order" : "Edit purchase order"}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 13 }}>
        {fields.map((f) => (
          <div key={f.k}>
            <label style={label}>{f.label}</label>
            <div style={{ position: "relative" }}>
              {f.prefix && <span style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", fontSize: 12, color: "#9aa3b0" }}>{f.prefix}</span>}
              <input
                value={draft[f.k]}
                onChange={(e) => setField(f.k, e.target.value)}
                inputMode={f.numeric ? "numeric" : undefined}
                placeholder={f.numeric ? "0" : ""}
                style={{ ...input, paddingLeft: f.prefix ? 18 : 9 }}
              />
            </div>
          </div>
        ))}
      </div>
      {formError && <div style={{ marginTop: 11, fontSize: 12, color: "#b4504a" }}>{formError}</div>}
      <div style={{ display: "flex", alignItems: "center", gap: 9, marginTop: 14 }}>
        <button onClick={onSubmit} disabled={busy} style={{ padding: "8px 16px", fontSize: 12.5, fontWeight: 600, border: "none", borderRadius: 7, background: "#1f7a5a", color: "#fff", cursor: "pointer", opacity: busy ? 0.6 : 1 }}>
          {busy ? "Saving…" : mode === "create" ? "Create PO" : "Save changes"}
        </button>
        <button onClick={onCancel} disabled={busy} style={{ padding: "8px 14px", fontSize: 12.5, fontWeight: 600, border: "1px solid #d8dde4", borderRadius: 7, background: "#fff", color: "#7a8493", cursor: "pointer" }}>Cancel</button>
        <span style={{ fontSize: 11, color: "#9aa3b0", marginLeft: 4 }}>
          Net terms shorter than {minNetDays} will be flagged. Changes flow into the next invoice check.
        </span>
      </div>
    </div>
  );
}
