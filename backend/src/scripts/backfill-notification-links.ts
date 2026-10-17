import { backfillLink, type NotificationRole } from "../services/notificationLinks";
import { confirmed as writeConfirmed, connect } from "./fk-shared";

// Gives notifications written before migration 018 the page they open.
//
// Those rows have no link, so each portal guessed the page from the title.
// This sets the link the server would store today, from the same rule
// (services/notificationLinks.ts), but only where the title and type name
// one page; a row the rule can only send to the notifications list keeps
// no link. The record they are about (entity_type, entity_id) cannot be
// recovered from a title, so it is left empty.
//
// Without --confirm it only prints what it would do and changes nothing.
//
//   npm run db:backfill-notification-links               (dry run)
//   npm run db:backfill-notification-links -- --confirm
//
// On the hosted database it is run by the project owner, after a backup,
// through a tunnel (DEPLOY.md, "Running a data script on the hosted
// database"):
//
//   railway connect Postgres --tunnel-only
//   railway run --service Postgres npm run db:backfill-notification-links <port>
//   railway run --service Postgres npm run db:backfill-notification-links <port> confirm

type Row = {
  id: number;
  student_id: string | null;
  supervisor_id: string | null;
  coordinator_id: string | null;
  title: string;
  type: string | null;
};

const roleOf = (row: Row): NotificationRole | null =>
  row.student_id ? "student" : row.supervisor_id ? "supervisor" : row.coordinator_id ? "coordinator" : null;

async function backfill() {
  const confirmed = writeConfirmed();
  const client = await connect();
  try {
    if (!confirmed) await client.query("SET default_transaction_read_only = on");
    const rows = await client.query<Row>(
      `SELECT id, student_id::text, supervisor_id::text, coordinator_id::text, title, type
       FROM notifications WHERE link IS NULL ORDER BY id`
    );
    const plan = new Map<string, number[]>();
    let kept = 0;
    for (const row of rows.rows) {
      const role = roleOf(row);
      const link = role ? backfillLink(role, row.type, row.title) : null;
      if (!link) {
        kept += 1;
        continue;
      }
      plan.set(link, [...(plan.get(link) ?? []), row.id]);
    }

    console.log(`${rows.rows.length} notifications have no link.`);
    for (const [link, ids] of [...plan.entries()].sort((a, b) => b[1].length - a[1].length)) {
      console.log(`  ${String(ids.length).padStart(5)}  ${link}`);
    }
    console.log(`  ${String(kept).padStart(5)}  left without a link (the title names no one page)`);

    if (!confirmed) {
      console.log("\nDry run: nothing was changed. Run again with confirm (or --confirm) after the port to write these links.");
      return;
    }
    await client.query("BEGIN");
    let written = 0;
    for (const [link, ids] of plan) {
      const result = await client.query(`UPDATE notifications SET link = $1 WHERE id = ANY($2::int[]) AND link IS NULL`, [link, ids]);
      written += result.rowCount ?? 0;
    }
    await client.query("COMMIT");
    console.log(`\n${written} links written.`);
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    await client.end();
  }
}

backfill().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
