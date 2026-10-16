/*
|--------------------------------------------------------------------------
| PHILIPPINE TIME
|--------------------------------------------------------------------------
|
| Every OJT date is a Philippine date, and the attendance times (34 columns,
| from the first migration on) are stored as Philippine wall-clock time
| without a zone. What such a column means depends on the zone the reader
| uses: a script, report or psql session on UTC reads it eight hours off.
| So everything that needs "now in the Philippines", "today", or "this
| column as a moment" gets it from here, and every connection, the server's
| and the scripts', is opened with PH_PG_OPTIONS.
|
| The Philippines has kept UTC+8 without daylight saving since 1990, so the
| offset below is fixed.
|
*/

export const PH_TIME_ZONE = "Asia/Manila";
export const PH_UTC_OFFSET = "+08:00";

/** The connection option that makes NOW(), CURRENT_DATE and zoneless columns Philippine time. */
export const PH_PG_OPTIONS = `-c timezone=${PH_TIME_ZONE}`;

/**
 * pg turns a zoneless column into a Date using the process's zone, so the
 * process must be on Philippine time too. Set unconditionally: a host that
 * presets TZ (for example to UTC) would otherwise shift every time.
 */
export function usePhilippineProcessTime(): void {
  process.env.TZ = PH_TIME_ZONE;
}

const zone = `'${PH_TIME_ZONE}'`;

/** SQL pieces that state the zone, so they read the same on any connection. */
export const phSql = {
  /** The current Philippine wall-clock time (timestamp without time zone). */
  now: `(NOW() AT TIME ZONE ${zone})`,
  /** Today's date in the Philippines. */
  today: `((NOW() AT TIME ZONE ${zone})::date)`,
  /** A moment (timestamptz) as Philippine wall-clock time. */
  wallTime: (moment: string) => `(${moment} AT TIME ZONE ${zone})`,
  /** The Philippine date a moment (timestamptz) falls on. */
  date: (moment: string) => `((${moment} AT TIME ZONE ${zone})::date)`,
  /** A stored Philippine wall-clock time (timestamp without time zone) as a moment. */
  moment: (wallTime: string) => `(${wallTime} AT TIME ZONE ${zone})`,
};

const clockFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone: PH_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** The date ("YYYY-MM-DD"), time ("HH:MM") and weekday (0 = Sunday) in the Philippines. */
export function phClock(now: Date = new Date()): { date: string; time: string; weekday: number } {
  const parts = Object.fromEntries(clockFormat.formatToParts(now).map((part) => [part.type, part.value]));
  const date = `${parts.year}-${parts.month}-${parts.day}`;
  // Noon UTC of that calendar day is the same weekday everywhere.
  const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
  // "24" is how some runtimes write midnight.
  return { date, time: `${parts.hour === "24" ? "00" : parts.hour}:${parts.minute}`, weekday };
}

/** Today's date in the Philippines as "YYYY-MM-DD". */
export function phToday(now: Date = new Date()): string {
  return phClock(now).date;
}

/** The moment a Philippine date and time ("YYYY-MM-DD", "HH:MM[:SS]") names. */
export function phMoment(date: string, time = "00:00:00"): Date {
  const clock = time.length === 5 ? `${time}:00` : time;
  return new Date(`${date}T${clock}${PH_UTC_OFFSET}`);
}
