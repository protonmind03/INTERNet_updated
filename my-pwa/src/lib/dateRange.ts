/**
 * True when a YYYY-MM-DD date falls inside the optional from/to range
 * (both ends inclusive). Longer date strings are cut to their date part.
 */
export function isWithinDateRange(
  date: string | null | undefined,
  from: string,
  to: string
): boolean {
  if (!from && !to) return true;
  const day = String(date || "").slice(0, 10);
  if (!day) return false;
  if (from && day < from) return false;
  if (to && day > to) return false;
  return true;
}
