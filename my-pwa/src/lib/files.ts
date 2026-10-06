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

/*
|--------------------------------------------------------------------------
| ATTENDANCE PHOTOS
|--------------------------------------------------------------------------
|
| A phone camera photo is several megabytes, far more than a proof-of-
| presence picture needs. Shrinking it first keeps the upload quick on
| mobile data and well inside the server's limit.
|
*/

export const ATTENDANCE_PHOTO_MAX_MB = 5;
const PHOTO_MAX_EDGE = 1600;
const PHOTO_QUALITY = 0.8;

/**
 * Returns the photo scaled down to at most 1600 px on its long edge, as a
 * JPEG. If the browser cannot process the image, the original is returned.
 */
export async function shrinkPhoto(file: File): Promise<File> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, PHOTO_MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", PHOTO_QUALITY)
    );
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.[^.]*$/, "") + ".jpg", {
      type: "image/jpeg",
    });
  } catch {
    return file;
  }
}
