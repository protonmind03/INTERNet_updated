import { confirmed as writeConfirmed, connect } from "./fk-shared";
import { photoRetentionDays } from "../services/privacy";
import { photosDue, removePhotos } from "../services/photoPurge";

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
//
// The server also runs this by itself each night at 02:30 Philippine time
// (services/photoPurge.ts). A run from here is recorded beside those.

async function purge() {
  const days = photoRetentionDays();
  if (days === null) {
    console.log(
      "Photo retention is off: PHOTO_RETENTION_DAYS is not set (or is under 30). Nothing to do."
    );
    return;
  }
  const confirm = writeConfirmed();
  const client = await connect();
  try {
    if (!confirm) await client.query("SET default_transaction_read_only = on");
    const due = await photosDue(client, days);
    console.log(`${due.length} time-in photo${due.length === 1 ? "" : "s"} older than ${days} days.`);
    if (due.length === 0) return;
    if (!confirm) {
      console.log("Dry run: nothing was removed. Run again with --confirm to remove them.");
      return;
    }
    const { removed, failed } = await removePhotos(client, due);
    await client.query(
      `INSERT INTO photo_purge_runs (ran_on, retention_days, removed, failed, by_hand)
       VALUES (CURRENT_DATE, $1, $2, $3, TRUE)`,
      [days, removed, failed]
    );
    console.log(
      `Removed ${removed} photo${removed === 1 ? "" : "s"}. The logs themselves are unchanged.` +
        (failed > 0 ? ` ${failed} file${failed === 1 ? "" : "s"} could not be deleted.` : "")
    );
  } finally {
    await client.end();
  }
}

purge().catch((error: unknown) => {
  console.error("Photo purge failed:", error);
  process.exitCode = 1;
});
