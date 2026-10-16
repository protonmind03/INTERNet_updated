/*
|--------------------------------------------------------------------------
| COMPARING IDS
|--------------------------------------------------------------------------
|
| Student, supervisor and coordinator ids are text a person typed. They are
| trimmed when saved (cleanId), and compared one way everywhere: sameId in
| code, sqlSameId in SQL that may meet an id saved before trimming began.
| `npm run db:id-spaces` counts any stored id that still has a space at
| either end.
|
*/

/** An id as it is stored: trimmed text, or "" when there is none. */
export function cleanId(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

/** Whether two ids name the same record. An empty id names nothing. */
export function sameId(left: unknown, right: unknown): boolean {
  const id = cleanId(left);
  return id !== "" && id === cleanId(right);
}

/** The same comparison in SQL, for two id expressions (columns or parameters). */
export function sqlSameId(left: string, right: string): string {
  return `TRIM(${left}::text) = TRIM(${right}::text)`;
}
