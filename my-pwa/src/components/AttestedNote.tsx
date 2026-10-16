import Icon from "./Icon";

/*
|--------------------------------------------------------------------------
| AN ATTESTED OFFLINE TIME-IN, FOR THE REVIEWER
|--------------------------------------------------------------------------
|
| Shown to the supervisor and the coordinator on a time-in recorded with no
| connection that came with the camera check and a record signed by the
| intern's phone (backend routes/offlineTimeIn.ts).
|
*/

/** What the server checked about an attested offline time-in. */
export type OfflineAttestation = {
  clock_gap_at_issue_seconds: number;
  clock_gap_at_sync_seconds: number | null;
  clock_moved: boolean;
};

/** "3 minutes ahead", "2 hours behind", "right, within a minute": a phone clock against the server's. */
function gapText(seconds: number | null): string {
  if (seconds === null) return "not measured";
  if (Math.abs(seconds) <= 60) return "right, within a minute";
  const minutes = Math.round(Math.abs(seconds) / 60);
  const amount = minutes >= 120 ? `${Math.round(minutes / 60)} hours` : minutes === 1 ? "1 minute" : `${minutes} minutes`;
  return `${amount} ${seconds > 0 ? "ahead" : "behind"}`;
}

/**
 * A time-in recorded offline with the camera check: what was checked, and
 * the phone's clock when it got ready and when the time-in arrived.
 */
export default function AttestedNote({ attestation }: { attestation: OfflineAttestation }) {
  return (
    <div className="space-y-2">
      <p className="flex items-start gap-2 rounded-lg bg-emerald-50 px-3 py-2.5 text-sm text-emerald-950 ring-1 ring-inset ring-emerald-600/15">
        <Icon name="check-circle" size={16} className="mt-0.5 shrink-0 text-emerald-600" />
        <span>
          <span className="font-semibold">Offline · attested.</span> The intern had no connection.
          The camera check ran on their phone, and the phone signed this photo and the time, so
          neither was changed afterwards. The time comes from the phone's clock: phone clock{" "}
          {gapText(attestation.clock_gap_at_issue_seconds)} when it got ready,{" "}
          {gapText(attestation.clock_gap_at_sync_seconds)} when this arrived.
        </span>
      </p>
      {attestation.clock_moved && (
        <p className="flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2.5 text-sm text-red-950 ring-1 ring-inset ring-red-600/20">
          <Icon name="alert" size={16} className="mt-0.5 shrink-0 text-red-600" />
          <span>
            <span className="font-semibold">The phone's clock was changed while it was offline.</span>{" "}
            The time-in may be off by the difference between the two readings above. Check the time
            before verifying.
          </span>
        </p>
      )}
    </div>
  );
}
