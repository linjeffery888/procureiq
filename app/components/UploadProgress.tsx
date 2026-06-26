"use client";

import { UploadProgressState } from "@/lib/uploadClient";

// Shared upload progress bar used by every upload surface. Determinate during
// the byte-upload phase (and during a processing phase where the caller knows
// done/total); indeterminate while the server extracts text with no count yet.
export function UploadProgress({
  state,
  processingLabel,
}: {
  state: UploadProgressState;
  // Optional override for the indeterminate processing-phase label (e.g. a
  // screen that does extra server work after extraction).
  processingLabel?: string;
}) {
  const { phase, fraction, done, total, fileCount } = state;

  const hasCount = typeof total === "number" && total > 0;
  const determinate = phase === "uploading" || (phase === "processing" && hasCount);

  const pct =
    phase === "uploading"
      ? Math.round(fraction * 100)
      : hasCount
        ? Math.round(((done ?? 0) / total!) * 100)
        : 0;

  const label =
    phase === "uploading"
      ? `Uploading ${fileCount} file${fileCount === 1 ? "" : "s"}…`
      : hasCount
        ? `Reading ${done ?? 0} of ${total}…`
        : processingLabel ?? "Extracting text…";

  return (
    <div style={{ marginTop: 4, textAlign: "left" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
        <span style={{ fontSize: 11.5, color: "#5a6675", fontWeight: 600 }}>{label}</span>
        {determinate && <span className="num" style={{ fontSize: 11, color: "#8893a2" }}>{pct}%</span>}
      </div>
      <div style={{ position: "relative", height: 6, borderRadius: 4, background: "#eef0f3", overflow: "hidden" }}>
        {determinate ? (
          <div style={{ height: "100%", borderRadius: 4, background: "var(--accent)", width: `${pct}%`, transition: "width .2s ease" }} />
        ) : (
          <div className="pq-indeterminate" style={{ position: "absolute", top: 0, height: "100%", borderRadius: 4, background: "var(--accent)" }} />
        )}
      </div>
    </div>
  );
}
