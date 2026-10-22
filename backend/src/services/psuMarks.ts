/*
|--------------------------------------------------------------------------
| THE SHIPPED PSU MARKS
|--------------------------------------------------------------------------
|
| Migration 071. A college, program or major names its mark by key; the
| key must be one of the images the app ships (my-pwa/public/brand/psu,
| listed in my-pwa/src/brand/psuMarks.ts). There are no uploads: a
| coordinator picks from this set on the Programs page. A test checks that
| this list and the app's registry agree.
|
| Not here on purpose: the ABEcon organisation logo (ECOSOC), which belongs
| to another university and is marked "replace" in the asset manifest.
|
*/

export const COLLEGE_MARK_KEYS = ["college-casl", "college-ccs", "college-chtm", "college-cit", "college-cte"] as const;

export const ORG_MARK_KEYS = [
  "org-abel-lg",
  "org-bit-aits",
  "org-bpa-ypag",
  "org-bsba-jbma",
  "org-bsbio-safb",
  "org-bscs-clics",
  "org-bsed-english-afet",
  "org-bsed-filipino-kamfil",
  "org-bsed-science-ec",
  "org-bsed-socstud-kmap",
  "org-bshm-frhc",
  "org-bsit-sfiti",
  "org-bsmath-mc",
  "org-bsnd-fndc",
  "org-bssw-jswap",
  "org-btled-ofttle",
  "org-btvted-attes",
] as const;

/** The seals the Time Record may carry (the coordinator's institution details): the university's, or a college's. */
export const SEAL_KEYS = ["psu-seal", ...COLLEGE_MARK_KEYS] as const;

/**
 * Reads a mark key from a request body: a shipped key, null to clear it,
 * or "bad". A college takes a college seal; a program or major takes an
 * organisation mark or, failing one, its college's seal.
 */
export function markKey(value: unknown, kind: "college" | "org"): string | null | "bad" {
  if (value === null || value === "") return null;
  if (typeof value !== "string") return "bad";
  const key = value.trim().toLowerCase();
  const allowed: readonly string[] = kind === "college" ? COLLEGE_MARK_KEYS : [...ORG_MARK_KEYS, ...COLLEGE_MARK_KEYS];
  return allowed.includes(key) ? key : "bad";
}
