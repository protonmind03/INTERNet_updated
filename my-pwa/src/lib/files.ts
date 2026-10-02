/*
|--------------------------------------------------------------------------
| UPLOAD RULES
|--------------------------------------------------------------------------
|
| The same limits the server enforces, checked in the browser first so a
| student finds out before waiting for an upload to fail.
|
*/

const ALLOWED_TYPES: Record<string, string> = {
  "image/jpeg": "JPG",
  "image/png": "PNG",
  "application/pdf": "PDF",
  "application/msword": "DOC",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "DOCX",
};

export const UPLOAD_ACCEPT = ".jpg,.jpeg,.png,.pdf,.doc,.docx";
export const UPLOAD_HINT = "PDF, DOC, DOCX, JPG or PNG";

/** Returns why a file cannot be uploaded, or null when it is acceptable. */
export function uploadProblem(file: File, maxMegabytes: number): string | null {
  if (!ALLOWED_TYPES[file.type]) {
    return `That file type isn't accepted. Use ${UPLOAD_HINT}.`;
  }
  if (file.size > maxMegabytes * 1024 * 1024) {
    return `That file is ${formatFileSize(file.size)}. The limit is ${maxMegabytes} MB.`;
  }
  return null;
}

export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 KB";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
