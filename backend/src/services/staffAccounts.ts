import { randomInt } from "node:crypto";
import bcrypt from "bcryptjs";
import type { Pool, PoolClient } from "pg";
import { BCRYPT_ROUNDS } from "./passwordHash";
import { StaffIdError, lockStaffIds, nextStaffId, type Campus } from "./staffIds";

/*
|--------------------------------------------------------------------------
| ACCOUNTS ONLY THE COMMAND LINE OR AN ADMINISTRATOR MAKES
|--------------------------------------------------------------------------
|
| The OJT Director (Phase 1.6, migration 080) and the IT administrator
| (Phase 1.7, migration 081). Nobody signs up for either. The first of each
| is made by its script (npm run director:create, npm run admin:create);
| after that an administrator can make more from the Accounts page. Either
| way the account starts with a temporary password it must replace at its
| first sign-in.
|
*/

export type StaffKind = "director" | "admin";

export const STAFF_KINDS: Record<StaffKind, { table: string; idColumn: string; prefix: string; label: string }> = {
  director: { table: "directors", idColumn: "director_id", prefix: "DIR", label: "OJT Director" },
  admin: { table: "system_admins", idColumn: "admin_id", prefix: "ADM", label: "administrator" },
};

export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const UPPER = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const LOWER = "abcdefghijkmnpqrstuvwxyz";
const DIGITS = "23456789";
const pick = (from: string) => from[randomInt(from.length)];

/**
 * 14 characters with upper and lower case and a digit, as the password policy
 * asks. Every character is random, the three kinds included, and so is where
 * each lands (until 27 November 2026 every one ended in "Aa7").
 */
export function temporaryPassword(): string {
  const all = UPPER + LOWER + DIGITS;
  const characters = [pick(UPPER), pick(LOWER), pick(DIGITS), ...Array.from({ length: 11 }, () => pick(all))];
  for (let at = characters.length - 1; at > 0; at -= 1) {
    const other = randomInt(at + 1);
    [characters[at], characters[other]] = [characters[other], characters[at]];
  }
  return characters.join("");
}

export class StaffAccountError extends Error {}

type Db = Pick<Pool | PoolClient, "query">;

/**
 * Makes the account with a new temporary password, which it returns: the
 * script prints it once, the Accounts page emails it to the owner.
 */
export async function createStaffAccount(
  db: Db,
  kind: StaffKind,
  emailGiven: string,
  nameGiven: string,
  /** An administrator's campus: its ID is YY-CODE-0NN (services/staffIds.ts). A Director's ID stays DIR-0001. */
  campus?: Campus | null
): Promise<{ id: string; email: string; name: string; password: string }> {
  const { table, idColumn, prefix, label } = STAFF_KINDS[kind];
  const email = emailGiven.trim().toLowerCase();
  const name = nameGiven.trim();
  if (!EMAIL_PATTERN.test(email) || email.length > 150) throw new StaffAccountError("Give the account's email.");
  if (name.length < 2 || name.length > 150) throw new StaffAccountError("Give the account's full name.");
  const taken = await db.query(`SELECT 1 FROM ${table} WHERE LOWER(email) = $1`, [email]);
  if (taken.rows.length > 0) throw new StaffAccountError(`An ${label} account already has that email.`);
  let id: string;
  if (kind === "admin") {
    if (!campus) throw new StaffAccountError("Choose the administrator's campus.");
    await lockStaffIds(db, "admin");
    try {
      id = await nextStaffId(db, "admin", campus);
    } catch (error) {
      if (error instanceof StaffIdError) throw new StaffAccountError(error.message);
      throw error;
    }
  } else {
    const count = Number((await db.query<{ n: string }>(`SELECT COALESCE(MAX(id), 0) AS n FROM ${table}`)).rows[0].n);
    id = `${prefix}-${String(count + 1).padStart(4, "0")}`;
  }
  const password = temporaryPassword();
  await db.query(
    `INSERT INTO ${table} (${idColumn}, email, password, name, must_change_password, is_active)
     VALUES ($1, $2, $3, $4, TRUE, TRUE)`,
    [id, email, await bcrypt.hash(password, BCRYPT_ROUNDS), name]
  );
  return { id, email, name, password };
}
