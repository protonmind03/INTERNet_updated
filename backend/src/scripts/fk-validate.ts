import {
  connect,
  pendingForeignKeys,
  printReport,
  validateStatement,
} from "./fk-shared";

// Validates the foreign keys that have no orphan rows, so the database
// vouches for existing rows as well as new ones. Constraints with orphans
// are left alone. Without --confirm this only prints what it would do.
// Not part of the deploy: run it by hand, after a backup.
//
//   npm run db:fk-validate               (dry run)
//   npm run db:fk-validate -- --confirm

async function validate() {
  const confirmed = process.argv.includes("--confirm");
  const client = await connect();
  try {
    if (!confirmed) {
      await client.query("SET default_transaction_read_only = on");
    }
    const pending = await pendingForeignKeys(client);
    printReport(pending);
    if (pending.length === 0) return;

    const clean = pending.filter((fk) => fk.orphans === 0);
    const skipped = pending.filter((fk) => fk.orphans > 0);

    if (!confirmed) {
      console.log(
        `Dry run. With --confirm this would validate ${clean.length} constraint(s)` +
          (skipped.length > 0
            ? ` and skip ${skipped.length} with orphan rows.`
            : ".")
      );
      for (const fk of clean) console.log(`  ${validateStatement(fk)};`);
      return;
    }

    // One statement at a time, so a failure leaves the earlier ones done
    // and names the one that failed.
    for (const fk of clean) {
      await client.query(validateStatement(fk));
      console.log(`Validated ${fk.name}.`);
    }
    for (const fk of skipped) {
      console.log(`Skipped ${fk.name}: ${fk.orphans} orphan row(s).`);
    }
    console.log(
      `Done: ${clean.length} validated, ${skipped.length} skipped.`
    );
  } finally {
    await client.end();
  }
}

validate().catch((error: unknown) => {
  console.error("Foreign-key validation failed:", error);
  process.exitCode = 1;
});
