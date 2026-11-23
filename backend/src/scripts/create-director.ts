import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { connect } from "./fk-shared";
import { BCRYPT_ROUNDS } from "../services/passwordHash";

// Creates an OJT Director account (Phase 1.6).
//
// Once an active Director exists, the coordinators no longer manage
// coordinator accounts, the programs or the OJT rules: the Director does
// (server.ts, requireOffice). The IT administrator's portal (Phase 1.7)
// will create Directors too; until then this is the way.
//
//   npm run director:create -- --email director@example.edu.ph --name "Juana Dela Cruz"
//
// It prints a temporary password once. The account must set its own at
// first sign-in. On the hosted database, through a tunnel (DEPLOY.md,
// "Running a data script on the hosted database"):
//
//   railway run --service Postgres npm run director:create <port> --email ... --name ...

function option(name: string): string {
  const at = process.argv.indexOf(`--${name}`);
  return at > 0 && process.argv[at + 1] ? process.argv[at + 1].trim() : "";
}

/** 14 characters with upper and lower case and a digit, as the password policy asks. */
function temporaryPassword(): string {
  const letters = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const bytes = randomBytes(14);
  const body = [...bytes].map((byte) => letters[byte % letters.length]).join("");
  return `${body.slice(0, 11)}Aa7`;
}

async function main() {
  const email = option("email").toLowerCase();
  const name = option("name");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Give the account's email: --email someone@example.edu.ph");
  if (name.length < 2) throw new Error('Give the account\'s full name: --name "Full Name"');

  const client = await connect();
  try {
    const taken = await client.query(`SELECT 1 FROM directors WHERE LOWER(email) = $1`, [email]);
    if (taken.rows.length > 0) throw new Error("An OJT Director account already has that email.");
    const count = Number((await client.query(`SELECT COALESCE(MAX(id), 0) AS n FROM directors`)).rows[0].n);
    const directorId = `DIR-${String(count + 1).padStart(4, "0")}`;
    const password = temporaryPassword();
    await client.query(
      `INSERT INTO directors (director_id, email, password, name, must_change_password, is_active)
       VALUES ($1, $2, $3, $4, TRUE, TRUE)`,
      [directorId, email, await bcrypt.hash(password, BCRYPT_ROUNDS), name]
    );
    console.log(`OJT Director account ${directorId} created for ${email}.`);
    console.log(`Temporary password (shown once; they must change it at first sign-in): ${password}`);
  } finally {
    await client.end();
  }
}

main().catch((error: unknown) => {
  console.error("Creating the Director account failed:", error instanceof Error ? error.message : "unknown error");
  process.exitCode = 1;
});
