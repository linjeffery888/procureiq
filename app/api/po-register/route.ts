import { NextRequest, NextResponse } from "next/server";
import { getRegisterView, loadPurchaseOrdersWithOverrides } from "@/lib/poRegister";
import { addPo, deleteAddedPo, resetRegister, setPoOverride, updateAddedPo, type PoFields } from "@/lib/poOverridesStore";
import { readThresholds } from "@/lib/thresholdStore";

// The PO register surface: read the source of truth every invoice is checked
// against, and let a reviewer MAINTAIN it. A reviewer can edit any field of a
// seed PO (persisted as an override layered on the read-only seed), create a new
// PO (e.g. to source one for a no-PO invoice), edit or delete a created PO, or
// reset the whole register to its seed. Edits and new POs flow into the matcher
// (see loadPurchaseOrdersWithOverrides), so the next invoice check resolves
// against the updated register. The terms-policy flag reuses the same editable
// net-terms threshold the contract playbook uses, so the standard lives in one place.

export const runtime = "nodejs";

async function viewPayload() {
  const thresholds = await readThresholds();
  const rows = await getRegisterView(thresholds.minNetDays);
  const belowStandard = rows.filter((r) => r.termsBelowStandard).length;
  const edited = rows.filter((r) => r.edited).length;
  return { rows, standard: { minNetDays: thresholds.minNetDays }, totals: { count: rows.length, belowStandard, edited } };
}

export async function GET() {
  return NextResponse.json(await viewPayload());
}

// Validate the editable fields. `full` requires every field (for a create); a
// partial edit validates only the fields present. Returns the coerced fields or
// an error message.
function coerceFields(raw: any, full: boolean): { fields?: Partial<PoFields>; error?: string } {
  const out: Partial<PoFields> = {};
  const has = (k: string) => raw?.[k] !== undefined && raw[k] !== null && raw[k] !== "";

  const strs: { k: keyof PoFields; required: boolean; def?: string }[] = [
    { k: "poNumber", required: true },
    { k: "vendor", required: true },
    { k: "workOrder", required: false, def: "" },
    { k: "sowRef", required: false, def: "" },
    { k: "status", required: true, def: "Active" },
  ];
  for (const { k, required, def } of strs) {
    if (has(k)) out[k] = String(raw[k]).trim() as any;
    else if (full) {
      if (required && def === undefined) return { error: `${k} is required.` };
      if (def !== undefined) out[k] = def as any;
    }
  }

  const nums: { k: keyof PoFields; min: number; max?: number }[] = [
    { k: "contractValue", min: 0 },
    { k: "spentToDate", min: 0 },
    { k: "remaining", min: 0 },
    { k: "agreedTerms", min: 0, max: 365 },
  ];
  for (const { k, min, max } of nums) {
    if (raw?.[k] !== undefined && raw[k] !== "") {
      const n = Number(raw[k]);
      if (!Number.isFinite(n) || n < min || (max !== undefined && n > max)) {
        return { error: `${k} must be a number${max !== undefined ? ` between ${min} and ${max}` : ` of at least ${min}`}.` };
      }
      out[k] = Math.round(n) as any;
    } else if (full) {
      return { error: `${k} is required.` };
    }
  }
  return { fields: out };
}

export async function POST(req: NextRequest) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Request body must be JSON." }, { status: 400 });
  }
  const actor = typeof body?.actor === "string" ? body.actor.trim() : "";
  // Accept `key` (the row's stable identity) or the legacy `poNumber` field.
  const key = typeof body?.key === "string" ? body.key.trim() : typeof body?.poNumber === "string" ? body.poNumber.trim() : "";
  const mode: string = body?.mode || (body?.clear === true ? "revert" : "edit");

  try {
    if (mode === "create") {
      const { fields, error } = coerceFields(body.fields ?? body, true);
      if (error) return NextResponse.json({ error }, { status: 400 });
      const created = await addPo(fields as PoFields, actor);
      const payload = await viewPayload();
      return NextResponse.json({ ok: true, created, ...payload });
    }

    if (!key) return NextResponse.json({ error: "A key (PO identity) is required." }, { status: 400 });

    if (mode === "delete") {
      await deleteAddedPo(key); // no-op if not an added PO
      return NextResponse.json({ ok: true, ...(await viewPayload()) });
    }

    if (mode === "revert") {
      await setPoOverride(key, null, actor); // revert a seed row to its seed values
      return NextResponse.json({ ok: true, ...(await viewPayload()) });
    }

    // edit
    const { fields, error } = coerceFields(body.fields ?? body, false);
    if (error) return NextResponse.json({ error }, { status: 400 });
    if (!fields || Object.keys(fields).length === 0) {
      return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
    }
    if (body?.isAdded === true) {
      const updated = await updateAddedPo(key, fields, actor);
      if (!updated) return NextResponse.json({ error: `No created PO with id ${key}.` }, { status: 404 });
    } else {
      await setPoOverride(key, fields, actor);
    }
    return NextResponse.json({ ok: true, ...(await viewPayload()) });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Could not update the register." }, { status: 500 });
  }
}

// DELETE: reset the whole register to its seed (clear every override and every
// created PO). A fresh-demo reset.
export async function DELETE() {
  await resetRegister();
  void loadPurchaseOrdersWithOverrides; // keep the matcher loader referenced for tree-shaking
  return NextResponse.json({ ok: true });
}
