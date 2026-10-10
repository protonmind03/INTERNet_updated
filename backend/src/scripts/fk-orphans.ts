import { connect, pendingForeignKeys, printReport } from "./fk-shared";

// Read-only report: for each foreign key that is not yet validated, how
// many existing rows point at a parent that does not exist. Changes
// nothing; the session is set read-only so it cannot.
//
//   npm run db:fk-orphans

async function report() {
  const client = await connect();
  try {
    await client.query("SET default_transaction_read_only = on");
    const pending = await pendingForeignKeys(client);
    printReport(pending);

    const withOrphans = pending.filter((fk) => fk.orphans > 0);
    if (pending.length > 0) {
      console.log(
        `${pending.length - withOrphans.length} of ${pending.length} can be validated now. ` +
          (withOrphans.length > 0
            ? `Orphan rows in ${withOrphans.length} need a decision first.`
            : "None have orphan rows.")
      );
    }
  } finally {
    await client.end();
  }
}

report().catch((error: unknown) => {
  console.error("Foreign-key report failed:", error);
  process.exitCode = 1;
});
