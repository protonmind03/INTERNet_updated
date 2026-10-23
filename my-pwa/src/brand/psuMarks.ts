/*
|--------------------------------------------------------------------------
| THE PSU MARKS REGISTRY
|--------------------------------------------------------------------------
|
| internet-revisions, Section 2. The university seal, the college seals and
| the student organisations' logos, taken from internet-revisions/assets/psu/
| marks.json. The images are in public/brand/psu: `<key>.png` at 512 px
| (loaded when shown) and `<key>@128.png` (kept for offline use by the
| service worker).
|
| Lookups ignore case and outer spaces. The hospitality college's logo
| spells it CTHM while the system says CHTM; both find it.
|
| An entry marked "replace" is never shown: the ABEcon organisation logo
| supplied belongs to another university, so ABEcon shows its monogram
| until the OJT office sends the right one (its files are not shipped).
| Entries marked "confirm" or "confirm-name" are shown and listed in the
| revision report for the OJT office to confirm.
|
| The server keeps the same list of keys (backend/src/services/psuMarks.ts);
| a test checks they agree. No imports here, so that test can read it.
|
*/

export type MarkKind = "university" | "college" | "program" | "major";

export type PsuMark = {
  key: string;
  kind: MarkKind;
  college: string | null;
  program: string | null;
  major: string | null;
  /** Whose mark it is: the college, or the student organisation. */
  name: string;
  /** "round" seals are cut to a circle; the others are kept whole on white. */
  shape: "round" | "wide" | "badge" | "free";
  status: "ok" | "confirm" | "confirm-name" | "replace";
};

export const PSU_MARKS: readonly PsuMark[] = [
  { key: "psu-seal", kind: "university", college: null, program: null, major: null, name: "Pangasinan State University", shape: "round", status: "ok" },
  { key: "college-casl", kind: "college", college: "CASL", program: null, major: null, name: "College of Arts, Sciences and Letters", shape: "round", status: "ok" },
  { key: "college-ccs", kind: "college", college: "CCS", program: null, major: null, name: "College of Computing Sciences", shape: "round", status: "ok" },
  { key: "college-cte", kind: "college", college: "CTE", program: null, major: null, name: "College of Teacher Education", shape: "round", status: "ok" },
  { key: "college-cit", kind: "college", college: "CIT", program: null, major: null, name: "College of Industrial Technology", shape: "round", status: "ok" },
  { key: "college-chtm", kind: "college", college: "CHTM", program: null, major: null, name: "College of Tourism and Hospitality Management", shape: "wide", status: "confirm-name" },
  { key: "org-abecon-ecosoc", kind: "program", college: "CASL", program: "ABEcon", major: null, name: "Economics Society (ECOSOC)", shape: "round", status: "replace" },
  { key: "org-bsnd-fndc", kind: "program", college: "CASL", program: "BSND", major: null, name: "Future Nutritionist-Dietitians Club (FNDC)", shape: "round", status: "ok" },
  { key: "org-bssw-jswap", kind: "program", college: "CASL", program: "BSSW", major: null, name: "Junior Social Workers' Association of the Philippines, PSU chapter (JSWAP)", shape: "round", status: "ok" },
  { key: "org-abel-lg", kind: "program", college: "CASL", program: "ABEL", major: null, name: "Linguists' Guild (LG)", shape: "badge", status: "ok" },
  { key: "org-bsbio-safb", kind: "program", college: "CASL", program: "BSBio", major: null, name: "Student Alliance of Future Biologists (SAFB)", shape: "round", status: "ok" },
  { key: "org-bsba-jbma", kind: "program", college: "CBPA", program: "BSBA", major: null, name: "Junior Business Managers' Association (JBMA)", shape: "round", status: "ok" },
  { key: "org-bpa-ypag", kind: "program", college: "CBPA", program: "BPA", major: null, name: "Young Public Administrators' Guild (YPAG)", shape: "round", status: "ok" },
  { key: "org-bscs-clics", kind: "program", college: "CCS", program: "BSCS", major: null, name: "Campus League of Ingenious Computer Science Students (CLICS)", shape: "round", status: "ok" },
  { key: "org-bsmath-mc", kind: "program", college: "CCS", program: "BSMath", major: null, name: "Math Circle (MC)", shape: "round", status: "ok" },
  { key: "org-bsit-sfiti", kind: "program", college: "CCS", program: "BSIT", major: null, name: "Society of Future I.T. Innovators (SFITI)", shape: "round", status: "ok" },
  { key: "org-bit-aits", kind: "program", college: "CIT", program: "BIT", major: null, name: "Association of Industrial Technology Students (AITS)", shape: "round", status: "ok" },
  { key: "org-bsed-english-afet", kind: "major", college: "CTE", program: "BSEd", major: "English", name: "Association of Future English Teachers (AFET)", shape: "round", status: "ok" },
  { key: "org-btvted-attes", kind: "program", college: "CTE", program: "BTVTEd", major: null, name: "Association of TechVoc Teacher Education Students (ATTES)", shape: "round", status: "ok" },
  { key: "org-bsed-science-ec", kind: "major", college: "CTE", program: "BSEd", major: "Science", name: "Environmentalists Club (EC)", shape: "free", status: "confirm" },
  { key: "org-bsed-filipino-kamfil", kind: "major", college: "CTE", program: "BSEd", major: "Filipino", name: "KAMFIL", shape: "round", status: "ok" },
  { key: "org-bsed-socstud-kmap", kind: "major", college: "CTE", program: "BSEd", major: "Social Studies", name: "KMAP", shape: "free", status: "confirm" },
  { key: "org-btled-ofttle", kind: "program", college: "CTE", program: "BTLEd", major: null, name: "Organization of Future Teachers of Technology and Livelihood Education (OFTTLE)", shape: "round", status: "ok" },
  { key: "org-bshm-frhc", kind: "program", college: "CHTM", program: "BSHM", major: null, name: "Future Restaurateur and Hotelier Club (FRHC)", shape: "free", status: "ok" },
];

/** Shown marks only: an entry to be replaced is never drawn. */
const SHOWN = PSU_MARKS.filter((mark) => mark.status !== "replace");

const norm = (value: string | null | undefined): string => (value ?? "").trim().toLowerCase();
/** The logo's spelling of a college beside the system's. */
const COLLEGE_ALIASES: Record<string, string> = { cthm: "chtm" };
const collegeCode = (value: string | null | undefined): string => {
  const code = norm(value);
  return COLLEGE_ALIASES[code] ?? code;
};

/** Where a mark's image is: the 128 px copy for small sizes, the 512 px one otherwise. */
export function markSrc(key: string, size = 128): string {
  return size * 2 <= 128 ? `/brand/psu/${key}@128.png` : `/brand/psu/${key}.png`;
}

/** The university seal. */
export const PSU_SEAL: PsuMark = PSU_MARKS[0];

/** A mark by its key (as stored in mark_key), if it is one that is shown. */
export function getMark(key: string | null | undefined): PsuMark | null {
  const wanted = norm(key);
  return SHOWN.find((mark) => mark.key === wanted) ?? null;
}

/** A college's seal by its short name ("CCS", "CHTM" or "CTHM"). */
export function getCollegeMark(shortName: string | null | undefined): PsuMark | null {
  const wanted = collegeCode(shortName);
  if (!wanted) return null;
  return SHOWN.find((mark) => mark.kind === "college" && collegeCode(mark.college) === wanted) ?? null;
}

/** A program's organisation mark by its short code ("BSIT"). */
export function getProgramMark(shortCode: string | null | undefined): PsuMark | null {
  const wanted = norm(shortCode);
  if (!wanted) return null;
  return SHOWN.find((mark) => mark.kind === "program" && norm(mark.program) === wanted) ?? null;
}

/** A major's organisation mark ("BSEd", "English"). */
export function getMajorMark(programCode: string | null | undefined, majorName: string | null | undefined): PsuMark | null {
  const program = norm(programCode);
  const major = norm(majorName);
  if (!program || !major) return null;
  return SHOWN.find((mark) => mark.kind === "major" && norm(mark.program) === program && norm(mark.major) === major) ?? null;
}

/** The marks a coordinator may choose for a college, or for a program or major (its organisation's, or a college seal). */
export function markChoices(kind: "college" | "org"): PsuMark[] {
  return SHOWN.filter((mark) => (kind === "college" ? mark.kind === "college" : mark.kind === "program" || mark.kind === "major" || mark.kind === "college"));
}

/** The seals the Time Record may carry: the university's or a college's. */
export function sealChoices(): PsuMark[] {
  return SHOWN.filter((mark) => mark.kind === "university" || mark.kind === "college");
}

/**
 * A short code from a program's typed name, for a trainee not yet linked to
 * a program: "BS Information Technology" → "BSIT". It only finds a mark when
 * it matches a program's short code; otherwise it is the monogram's text.
 */
export function programCodeOf(text: string | null | undefined): string {
  return (text || "")
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => (/^[A-Z]{2,}$/.test(word) ? word : word[0]))
    .join("")
    .toUpperCase()
    .slice(0, 6);
}
