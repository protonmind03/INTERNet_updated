/*
|--------------------------------------------------------------------------
| ACTIONS RECORDED OFFLINE
|--------------------------------------------------------------------------
|
| Break, back-to-work and time-out normally take the server's clock. When
| the phone had no connection, the app sends the time the button was
| pressed (`occurred_at`) and an id of its own for the action
| (`client_request_id`). This file holds the rules for accepting that time.
| They are pure functions, so the tests can check them directly.
|
| A request with neither field is an ordinary live request and none of this
| applies. Time-in is never accepted this way: it needs the camera check.
|
*/

export type OfflineAction = "break" | "break-end" | "time-out";

/** How far ahead of this server a phone's clock may be before its time is refused. */
export const CLOCK_SKEW_MS = 2 * 60 * 1000;

const DEFAULT_MAX_AGE_HOURS = 12;

/** How old an offline action may be when it arrives. OFFLINE_ACTION_MAX_AGE_HOURS, default 12. */
export function offlineMaxAgeHours(raw: string | undefined = process.env.OFFLINE_ACTION_MAX_AGE_HOURS): number {
  const value = Number(raw);
  return Number.isFinite(value) && value >= 1 && value <= 72 ? value : DEFAULT_MAX_AGE_HOURS;
}

export type OfflineStamp =
  | { kind: "live" }
  | { kind: "invalid"; status: 400 | 409; message: string }
  | { kind: "offline"; occurredAt: Date; requestId: string };

/** The steps already on the log, as the database returned them. */
export type LogTimes = {
  time_in: Date | string | null;
  break_time: Date | string | null;
  break_end_time: Date | string | null;
};

const REQUEST_ID = /^[A-Za-z0-9-]{8,64}$/;

/**
 * Reads `occurred_at` and `client_request_id` from a request body and
 * decides whether the time can be used.
 */
export function readOfflineStamp(
  body: unknown,
  action: OfflineAction,
  log: LogTimes | null,
  now: Date = new Date(),
  maxAgeHours: number = offlineMaxAgeHours()
): OfflineStamp {
  const input = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const rawTime = input.occurred_at;
  const rawId = input.client_request_id;
  if (rawTime === undefined && rawId === undefined) return { kind: "live" };

  if (typeof rawId !== "string" || !REQUEST_ID.test(rawId)) {
    return {
      kind: "invalid",
      status: 400,
      message: "An action recorded offline needs its request id.",
    };
  }
  // A full date and time with a zone, so it cannot be read as local time.
  if (
    typeof rawTime !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$/.test(rawTime)
  ) {
    return {
      kind: "invalid",
      status: 400,
      message: "An action recorded offline needs the time it happened.",
    };
  }
  const occurredAt = new Date(rawTime);
  if (Number.isNaN(occurredAt.getTime())) {
    return { kind: "invalid", status: 400, message: "That time is not a real date." };
  }

  if (occurredAt.getTime() > now.getTime() + CLOCK_SKEW_MS) {
    return {
      kind: "invalid",
      status: 400,
      message: "That time is in the future. Check the date and time on your phone.",
    };
  }
  if (now.getTime() - occurredAt.getTime() > maxAgeHours * 60 * 60 * 1000) {
    return {
      kind: "invalid",
      status: 409,
      message:
        action === "time-out"
          ? `This time-out was recorded more than ${maxAgeHours} hours ago. Enter it as a missed time-out instead, with the reason.`
          : `This was recorded more than ${maxAgeHours} hours ago and can no longer be added. Tell your supervisor what happened.`,
    };
  }

  // Each step has to come after the ones already on the log.
  if (log) {
    const earlier = [log.time_in, log.break_time, log.break_end_time]
      .filter((value): value is Date | string => value !== null && value !== undefined)
      .map((value) => new Date(value).getTime())
      .filter((value) => !Number.isNaN(value));
    const latest = earlier.length > 0 ? Math.max(...earlier) : null;
    if (latest !== null && occurredAt.getTime() < latest) {
      return {
        kind: "invalid",
        status: 409,
        message: "That time is before an earlier step on the same log, so it cannot be right.",
      };
    }
  }

  return {
    kind: "offline",
    // A clock a little ahead of the server's is brought back to now.
    occurredAt: occurredAt.getTime() > now.getTime() ? now : occurredAt,
    requestId: rawId,
  };
}
