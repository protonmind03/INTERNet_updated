/**
 * Shrinks a camera photo before upload. Phone cameras produce files well
 * over the server's 5 MB limit; an attendance photo only needs to be clear
 * enough to verify, so it is scaled to at most `maxEdge` pixels and saved
 * as JPEG. If the browser cannot decode the file, the original is returned.
 *
 * This is the only photo compressor. The page that receives the photo calls
 * it once, checks the result against the size limit, and passes that file
 * on; nothing downstream compresses it again. The photo is read with its
 * camera orientation applied, so a phone held upright stays upright.
 */
export async function compressPhoto(
  file: File,
  maxEdge = 1600,
  quality = 0.82
): Promise<File> {
  if (!file.type.startsWith("image/")) return file;

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    return file;
  }

  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  // Already small: keep the original bytes.
  if (scale === 1 && file.size <= 1.5 * 1024 * 1024 && file.type === "image/jpeg") {
    bitmap.close();
    return file;
  }

  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const context = canvas.getContext("2d");
  if (!context) {
    bitmap.close();
    return file;
  }
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", quality)
  );
  // Re-encoding did not help (a small PNG, say): keep the original.
  if (!blob || blob.size >= file.size) return file;

  const name = file.name.replace(/\.[^.]+$/, "") || "attendance";
  return new File([blob], `${name}.jpg`, { type: "image/jpeg" });
}
