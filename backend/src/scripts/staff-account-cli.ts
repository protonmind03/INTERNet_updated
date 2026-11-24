import { connect } from "./fk-shared";
import { STAFF_KINDS, createStaffAccount, type StaffKind } from "../services/staffAccounts";

// What npm run director:create and npm run admin:create share
// (scripts/create-director.ts, scripts/create-admin.ts).

/**
 * A value, as "--email x" or as the bare word "email=x". The bare form is for
 * npm without its "--" (PowerShell and railway run drop it, and npm then keeps
 * --email for itself), the way the other data scripts take "confirm".
 */
function option(name: string): string {
  const at = process.argv.indexOf(`--${name}`);
  if (at > 0 && process.argv[at + 1]) return process.argv[at + 1].trim();
  const bare = process.argv.find((arg) => arg.startsWith(`${name}=`));
  return bare ? bare.slice(name.length + 1).trim() : "";
}

const deactivating = () => process.argv.includes("--deactivate") || process.argv.slice(2).includes("deactivate");

const capitalised = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

export function runStaffAccountCli(kind: StaffKind): void {
  const { table, idColumn, label } = STAFF_KINDS[kind];
  const Label = capitalised(label);

  async function main() {
    const email = option("email").toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Give the account's email: --email someone@example.edu.ph");

    // --deactivate: the account can no longer sign in, and every session it has ends.
    if (deactivating()) {
      const client = await connect();
      try {
        if (kind === "admin") {
          const others = await client.query(
            `SELECT 1 FROM system_admins WHERE is_active = TRUE AND LOWER(email) <> $1 LIMIT 1`,
            [email]
          );
          if (others.rows.length === 0) console.log("No other active administrator remains; make one with npm run admin:create.");
        }
        const done = await client.query(
          `UPDATE ${table} SET is_active = FALSE, auth_version = auth_version + 1 WHERE LOWER(email) = $1 RETURNING ${idColumn} AS id`,
          [email]
        );
        if (done.rows.length === 0) throw new Error(`No ${label} account has that email.`);
        console.log(`${Label} account ${done.rows[0].id} deactivated.`);
      } finally {
        await client.end();
      }
      return;
    }

    const name = option("name");
    if (name.length < 2) throw new Error('Give the account\'s full name: --name "Full Name"');
    const client = await connect();
    try {
      const made = await createStaffAccount(client, kind, email, name);
      console.log(`${Label} account ${made.id} created for ${made.email}.`);
      console.log(`Temporary password (shown once; they must change it at first sign-in): ${made.password}`);
    } finally {
      await client.end();
    }
  }

  main().catch((error: unknown) => {
    console.error(`Creating the ${label} account failed:`, error instanceof Error ? error.message : "unknown error");
    process.exitCode = 1;
  });
}
