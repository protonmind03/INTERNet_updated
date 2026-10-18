/*
|--------------------------------------------------------------------------
| SUBMITTED DOCUMENTS AS ONE ZIP
|--------------------------------------------------------------------------
|
| The coordinator can take the documents their filters leave (the approved
| MOAs of one block, say) as a single ZIP. Storage stays as it is: one flat
| place, each file under a name nobody can guess. Nothing is grouped into
| folders there, and the stored names never leave the server. Inside the
| ZIP each file is named for a person to read:
|
|   <student name> - <requirement> - <original name>
|
| The ZIP is capped, by number of files and by size, so one request cannot
| tie the server up; over the cap, nothing is built and the answer says
| how to narrow it.
|
*/

/** The most files one ZIP holds. */
export const ZIP_MAX_FILES = 500;
/** The most the files of one ZIP may weigh together. */
export const ZIP_MAX_BYTES = 500 * 1024 * 1024;

const megabytes = (bytes: number) =>
  bytes >= 1024 * 1024 * 1024
    ? `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
    : `${Math.max(1, Math.round(bytes / (1024 * 1024)))} MB`;

/** Why these documents cannot be one ZIP, or "" when they can. */
export function zipProblem(files: number, bytes: number): string {
  if (files === 0) return "No documents match those filters.";
  if (files > ZIP_MAX_FILES || bytes > ZIP_MAX_BYTES) {
    return (
      `That is ${files} ${files === 1 ? "file" : "files"} (${megabytes(bytes)}). One ZIP holds at most ${ZIP_MAX_FILES} files ` +
      `or ${megabytes(ZIP_MAX_BYTES)}. Narrow the filters (one block, one requirement, or approved only) and download in parts.`
    );
  }
  return "";
}

/** A piece of a file name with nothing a file system or a ZIP reader would trip on. */
function clean(part: string, fallback: string): string {
  const text = String(part ?? "")
    // Path separators, characters Windows refuses, and control characters.
    .replace(/[\\/:*?"<>|\u0000-\u001f\u007f]+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/^[. ]+|[. ]+$/g, "")
    .slice(0, 80)
    .trim();
  return text || fallback;
}

/**
 * The name of each document inside the ZIP, in the order given. Two files
 * that would share a name get " (2)", " (3)" before the extension, so none
 * overwrites another when the ZIP is opened.
 */
export function zipNames(
  documents: { student_name: string | null; doc_type: string; original_filename: string }[]
): string[] {
  const used = new Map<string, number>();
  return documents.map((document) => {
    const original = clean(document.original_filename, "file");
    const dot = original.lastIndexOf(".");
    const stem = dot > 0 ? original.slice(0, dot) : original;
    const extension = dot > 0 ? original.slice(dot) : "";
    const base = `${clean(document.student_name ?? "", "Unknown student")} - ${clean(document.doc_type, "Document")} - ${stem}`;
    const key = `${base}${extension}`.toLowerCase();
    const seen = (used.get(key) ?? 0) + 1;
    used.set(key, seen);
    return seen === 1 ? `${base}${extension}` : `${base} (${seen})${extension}`;
  });
}

/*
| Iteration 13: with "Include pictures", each student's pictures on their
| time-out notes and weekly reports go in a folder of their own:
|
|   Pictures/<student name>/Time-out <date> - <n>.<ext>
|   Pictures/<student name>/Weekly report <week's Monday> - <n>.<ext>
|
| Pictures on concerns are never included: a concern may be about someone
| who could be handed the ZIP.
*/

const PICTURE_EXTENSIONS: Record<string, string> = { "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp" };

/** The name of each picture inside the ZIP, in the order given. */
export function pictureZipNames(
  pictures: { student_name: string | null; owner_type: string; entry_date: string | null; mime_type: string }[]
): string[] {
  const count = new Map<string, number>();
  return pictures.map((picture) => {
    const what = picture.owner_type === "journal" ? "Weekly report" : "Time-out";
    const base = `Pictures/${clean(picture.student_name ?? "", "Unknown student")}/${what} ${clean(picture.entry_date ?? "", "undated")}`;
    const n = (count.get(base.toLowerCase()) ?? 0) + 1;
    count.set(base.toLowerCase(), n);
    return `${base} - ${n}${PICTURE_EXTENSIONS[picture.mime_type] ?? ".jpg"}`;
  });
}
