// Client-side file upload with progress. fetch() cannot report upload progress,
// so the four upload surfaces (contract review, invoice matching, financial
// planning, knowledge) use this XHR wrapper to drive a live progress bar.
//
// Two phases are reported:
//   - "uploading": real byte progress of the multipart POST (fraction 0..1).
//   - "processing": the bytes are sent; the server is now extracting text. The
//     caller can either leave this indeterminate, or, if it processes the
//     returned files one at a time, advance done/total for a determinate bar.

export interface UploadProgressState {
  phase: "uploading" | "processing";
  fraction: number; // 0..1, the upload byte fraction (used while phase === "uploading")
  done?: number; // processed-file count, when the caller drives the processing phase
  total?: number; // total files to process, when known
  fileCount: number; // how many files are in this upload
}

export interface UploadResult {
  ok: boolean;
  status: number;
  data: any;
}

// POST a FormData with upload-progress callbacks. Resolves once the server
// responds; rejects only on a transport-level failure (network/abort/timeout),
// mirroring how the previous fetch()-based callers treated a thrown error.
export function postFilesWithProgress(
  url: string,
  form: FormData,
  fileCount: number,
  onProgress: (s: UploadProgressState) => void
): Promise<UploadResult> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);

    xhr.upload.onprogress = (e) => {
      const fraction = e.lengthComputable && e.total ? e.loaded / e.total : 0;
      onProgress({ phase: "uploading", fraction, fileCount });
    };
    // Send finished; the server is extracting text now. Hand the bar over to the
    // processing phase (indeterminate until the caller reports done/total).
    xhr.upload.onload = () => onProgress({ phase: "processing", fraction: 1, fileCount });

    xhr.onload = () => {
      let data: any = {};
      try {
        data = xhr.responseText ? JSON.parse(xhr.responseText) : {};
      } catch {
        data = {};
      }
      resolve({ ok: xhr.status >= 200 && xhr.status < 300, status: xhr.status, data });
    };
    xhr.onerror = () => reject(new Error("Network error during upload"));
    xhr.ontimeout = () => reject(new Error("Upload timed out"));

    xhr.send(form);
  });
}
