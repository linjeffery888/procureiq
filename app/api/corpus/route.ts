import { NextRequest, NextResponse } from "next/server";
import {
  getStatus,
  listDocs,
  indexAll,
  addDocs,
  labelDoc,
  retrieve,
  evaluate,
  classifyDocs,
  NewDocInput,
} from "@/lib/corpus";
import { CorpusLabel } from "@/lib/types";

// The Knowledge module's API: manage the precedent corpus (the RAG store) and
// run retrieval / eval. GET returns the current corpus and indexing status.
// POST takes an action so a single endpoint covers the whole module:
//   index    -> embed any unindexed docs ("train" the store)
//   classify -> grounded pass/flag suggestion for new docs, before they are logged
//   add      -> ingest new precedents (from uploaded files)
//   label    -> set a precedent's disposition (pass / flag / unlabeled)
//   retrieve -> preview the top-k precedents for a query
//   evaluate -> leave-one-out accuracy vs past attorney dispositions
//
// All heavy lifting (embeddings, persistence) lives in lib/corpus. This route is
// thin and only validates inputs.

export const runtime = "nodejs";
// Batches of many contracts embed and classify in one request, so allow longer
// than the default. Clients should still chunk very large uploads (see app/knowledge).
export const maxDuration = 300;

export async function GET() {
  try {
    const [status, docs] = await Promise.all([getStatus(), listDocs()]);
    return NextResponse.json({ status, docs });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? "Could not read the corpus." }, { status: 500 });
  }
}

const VALID_LABELS: CorpusLabel[] = ["pass", "flag", "unlabeled"];

export async function POST(req: NextRequest) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Request body must be JSON with an action field." }, { status: 400 });
  }

  const action = body?.action;
  try {
    if (action === "index") {
      const status = await indexAll();
      return NextResponse.json({ status });
    }

    if (action === "add") {
      const docs = Array.isArray(body?.docs) ? body.docs : [];
      const cleaned: NewDocInput[] = docs
        .filter((d: any) => d && typeof d.text === "string" && d.text.trim().length > 0)
        .map((d: any) => ({
          title: typeof d.title === "string" && d.title.trim() ? d.title : "Untitled precedent",
          text: d.text,
          vendor: d.vendor ?? null,
          docType: d.docType ?? null,
          label: VALID_LABELS.includes(d.label) ? d.label : "unlabeled",
          clauseTag: d.clauseTag ?? null,
          note: typeof d.note === "string" ? d.note : "",
        }));
      if (cleaned.length === 0) {
        return NextResponse.json({ error: "No usable documents to add (each needs non-empty text)." }, { status: 400 });
      }
      const status = await addDocs(cleaned);
      return NextResponse.json({ status });
    }

    if (action === "label") {
      const id = body?.id;
      const label = body?.label;
      if (typeof id !== "string" || !VALID_LABELS.includes(label)) {
        return NextResponse.json({ error: "label requires an id and a label of pass | flag | unlabeled." }, { status: 400 });
      }
      const status = await labelDoc(id, label);
      return NextResponse.json({ status });
    }

    if (action === "classify") {
      const docs = Array.isArray(body?.docs) ? body.docs : [];
      const cleaned = docs
        .filter((d: any) => d && typeof d.text === "string" && d.text.trim().length > 0)
        .map((d: any) => ({
          title: typeof d.title === "string" && d.title.trim() ? d.title : "Untitled precedent",
          text: d.text,
        }));
      if (cleaned.length === 0) {
        return NextResponse.json({ error: "classify requires at least one document with non-empty text." }, { status: 400 });
      }
      const suggestions = await classifyDocs(cleaned);
      return NextResponse.json({ suggestions });
    }

    if (action === "retrieve") {
      const query = typeof body?.query === "string" ? body.query : "";
      const k = Number.isFinite(body?.k) ? Math.max(1, Math.min(10, body.k)) : 4;
      if (!query.trim()) {
        return NextResponse.json({ error: "retrieve requires a non-empty query." }, { status: 400 });
      }
      const precedents = await retrieve(query, k);
      return NextResponse.json({ precedents });
    }

    if (action === "evaluate") {
      const result = await evaluate();
      return NextResponse.json({ eval: result });
    }

    return NextResponse.json({ error: "Unknown action. Use index | classify | add | label | retrieve | evaluate." }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? "The Knowledge action failed. The local embedding model may be unavailable." },
      { status: 500 }
    );
  }
}
