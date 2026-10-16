/*
|--------------------------------------------------------------------------
| COMPARING IDS
|--------------------------------------------------------------------------
|
| Ids arrive as numbers (programs, blocks, logs) or text (students,
| supervisors), and the pickers hold them as strings. sameId compares any
| two the one way the server does (backend/src/services/ids.ts): as trimmed
| text, where an empty id names nothing.
|
*/

/** An id as text, trimmed; "" when there is none. */
export function cleanId(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

/** Whether two ids name the same record. An empty id names nothing. */
export function sameId(left: unknown, right: unknown): boolean {
  const id = cleanId(left);
  return id !== "" && id === cleanId(right);
}
