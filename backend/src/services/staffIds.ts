import type { Pool, PoolClient } from "pg";

/*
|--------------------------------------------------------------------------
| STAFF ACCOUNT IDS: YEAR, CAMPUS, NUMBER (27 November 2026)
|--------------------------------------------------------------------------
|
| A coordinator's or an IT administrator's account ID is made by the system,
| never typed:
|
|   YY-CODE-NNN    26-LN-600, 26-BGU-301
|
|   YY     the last two digits of the year the account is made (Manila time)
|   CODE   the campus (CAMPUSES below; Bayambang's is three letters)
|   NNN    the next number on that campus, in order:
|            coordinators: each campus its own block of 100, in the order
|              of the list (Alaminos 100-199, Asingan 200-299, ...,
|              Lingayen 600-699, ..., Urdaneta 900-999)
|            administrators: 001-099 on every campus
|
| "In order" is across years: the next number is one past the highest the
| campus has used for that kind of account, whatever its year, so 26-LN-600
| is followed by 27-LN-601, never by a second 600. Older IDs in any other
| form (COORD-0001, a test's made-up ID) are left as they are and do not
| count. The frontend's copy of the list is my-pwa/src/lib/campuses.ts.
|
*/

export const CAMPUSES = [
  { code: "AC", name: "Alaminos City", coordinatorFrom: 100 },
  { code: "AS", name: "Asingan", coordinatorFrom: 200 },
  { code: "BGU", name: "Bayambang", coordinatorFrom: 300 },
  { code: "BIN", name: "Binmaley", coordinatorFrom: 400 },
  { code: "IN", name: "Infanta", coordinatorFrom: 500 },
  { code: "LN", name: "Lingayen", coordinatorFrom: 600 },
  { code: "SC", name: "San Carlos City", coordinatorFrom: 700 },
  { code: "SM", name: "Sta. Maria", coordinatorFrom: 800 },
  { code: "UR", name: "Urdaneta City", coordinatorFrom: 900 },
] as const;

export type Campus = (typeof CAMPUSES)[number];
export type StaffIdKind = "coordinator" | "admin";

/** This deployment is PSU Lingayen's: the campus a script uses when none is named. */
export const HOME_CAMPUS: Campus = CAMPUSES.find((campus) => campus.code === "LN")!;

export const STAFF_ID_PATTERN = new RegExp(`^(\\d{2})-(${CAMPUSES.map((campus) => campus.code).join("|")})-(\\d{3})$`);

const TABLES: Record<StaffIdKind, { table: string; idColumn: string }> = {
  coordinator: { table: "coordinators", idColumn: "coordinator_id" },
  admin: { table: "system_admins", idColumn: "admin_id" },
};

export class StaffIdError extends Error {}

/** The campus with this code (any case), or null. */
export function campusOf(code: unknown): Campus | null {
  if (typeof code !== "string") return null;
  const wanted = code.trim().toUpperCase();
  return CAMPUSES.find((campus) => campus.code === wanted) ?? null;
}

/** The numbers this kind of account may use on this campus, first and last. */
export function staffIdRange(kind: StaffIdKind, campus: Campus): [number, number] {
  return kind === "coordinator" ? [campus.coordinatorFrom, campus.coordinatorFrom + 99] : [1, 99];
}

/** The year's last two digits in Manila, where the accounts are made. */
function yearInManila(now: Date): string {
  return new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", year: "2-digit" }).format(now);
}

type Db = Pick<Pool | PoolClient, "query">;

/**
 * The ID the next account of this kind on this campus gets. Two made at the
 * same moment could be given the same one: the caller holds
 * lockStaffIds(kind) in the same transaction while it reads and inserts.
 */
export async function nextStaffId(db: Db, kind: StaffIdKind, campus: Campus, now = new Date()): Promise<string> {
  const { table, idColumn } = TABLES[kind];
  const [from, to] = staffIdRange(kind, campus);
  const used = await db.query<{ id: string }>(`SELECT ${idColumn} AS id FROM ${table} WHERE ${idColumn} LIKE $1`, [`%-${campus.code}-%`]);
  let highest = from - 1;
  for (const { id } of used.rows) {
    const match = STAFF_ID_PATTERN.exec(id);
    if (!match || match[2] !== campus.code) continue;
    const number = Number(match[3]);
    if (number >= from && number <= to && number > highest) highest = number;
  }
  const next = highest + 1;
  if (next > to) {
    const label = kind === "coordinator" ? "coordinator" : "administrator";
    throw new StaffIdError(`Every ${label} number for ${campus.name} (${String(from).padStart(3, "0")} to ${to}) is used.`);
  }
  return `${yearInManila(now)}-${campus.code}-${String(next).padStart(3, "0")}`;
}

/** Holds the numbering of one kind of account until the transaction ends. */
export async function lockStaffIds(db: Db, kind: StaffIdKind): Promise<void> {
  await db.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [`staff-id:${kind}`]);
}
