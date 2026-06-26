import { NextRequest, NextResponse } from "next/server";
import { readThresholds, writeThresholds } from "@/lib/thresholdStore";
import { relabelByThresholds, getStatus } from "@/lib/corpus";

// The clause-thresholds API: read and edit the numeric knobs the deterministic
// engine compares contracts against. GET returns the current thresholds (and the
// corpus status, so the editor can show the live pass/flag tally). PUT saves a
// new threshold set and immediately re-labels the on-file precedents against it,
// returning how many flipped. Future uploads pick the new thresholds up through
// the extract route. Thin by design: the stores do the work.

export const runtime = "nodejs";
// This route reads and WRITES the live threshold store, so it must never be
// statically optimized. Without this, Next prerenders the parameter-less GET and
// marks the whole route static, and a PUT to a static route returns an HTML error
// page instead of JSON (the "Unexpected token '<'" the save then chokes on).
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [thresholds, status] = await Promise.all([readThresholds(), getStatus()]);
    return NextResponse.json({ thresholds, status });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? "Could not read thresholds." }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body must be JSON." }, { status: 400 });
  }
  try {
    // Persist first (coerced to valid ranges), then re-label the corpus against
    // exactly what was stored so the returned status reflects the saved config.
    const thresholds = await writeThresholds(body?.thresholds ?? body);
    const { status, changed } = await relabelByThresholds(thresholds);
    return NextResponse.json({ thresholds, status, changed });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? "Could not save thresholds." }, { status: 500 });
  }
}
