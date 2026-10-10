import { connect } from "./fk-shared";
import { deletePrivateFile } from "../services/privateFileStore";
import { photoRetentionDays } from "../services/privacy";

// Removes time-in photos older than PHOTO_RETENTION_DAYS. The attendance
// log itself, its times and its hours are kept; only the photo goes.
//
//   npm run privacy:purge-photos               lists what would be removed
//   npm run privacy:purge-photos -- --confirm  removes it
//
// Off unless PHOTO_RETENTION_DAYS is set (a whole number of days, at least
// 30). Only logs that are decided (Verified or Rejected) are touched: a
// photo someone may still need to look at is never removed.
//
// The photos are on the server's own disk, so on the hosting platform this
// must be run on the server (see DEPLOY.md), not from a laptop.

async function purge() {
  const days = photoRetentionDays();
  if (days === null) {
    console.log(
      "Photo retention is off: PHOTO_RETENTION_DAYS is not set (or is under 30). Nothing to do."
    );
    return;
  }
  const confirm = process.argv.includes("--confirm");
  const client = await connect();
  try {
    if (!confirm) await client.query("SET default_transaction_read_only = on");
    const due = await client.query<{ id: number; student_id: string; date: string; image_url: string }>(
      `SELECT id, student_id, TO_CHAR(date, 'YYYY-MM-DD') AS date, image_url
       FROM attendance
       WHERE image_url IS NOT NULL
         AND status IN ('Verified', 'Rejected')
         AND date < CURRENT_DATE - $1::int
       ORDER BY date, id`,
      [days]
    );
    console.log(
      `${due.rows.length} time-in photo${due.rows.length === 1 ? "" : "s"} older than ${days} days` +
        (due.rows.length > 0 ? ` (${due.rows[0].date} to ${due.rows[due.rows.length - 1].date}).` : ".")
    );
    if (due.rows.length === 0) return;
    if (!confirm) {
      console.log("Dry run: nothing was removed. Run again with --confirm to remove them.");
      return;
    }

    let removed = 0;
    for (const row of due.rows) {
      try {
        await deletePrivateFile(row.image_url.replace(/^\/uploads\//, ""));
      } catch (error) {
        // A file already gone is still a photo no longer kept.
        console.warn(`Log ${row.id}: the file could not be deleted (${(error as Error).message}).`);
      }
      await client.query(`UPDATE attendance SET image_url = NULL WHERE id = $1`, [row.id]);
      removed += 1;
    }
    console.log(`Removed ${removed} photo${removed === 1 ? "" : "s"}. The logs themselves are unchanged.`);
  } finally {
    await client.end();
  }
}

purge().catch((error: unknown) => {
  console.error("Photo purge failed:", error);
  process.exitCode = 1;
});
