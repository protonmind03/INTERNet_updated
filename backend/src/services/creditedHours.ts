/*
|--------------------------------------------------------------------------
| A DAY'S CREDITED HOURS (Phase 1.4, migration 084)
|--------------------------------------------------------------------------
|
| One rule for every place a log's hours are worked out (the time-out live
| or sent later, a missed time-out, a reviewer's correction, an appeal that
| restores the times, and an overtime approval):
|
|   hours = (end - start - the break) / 3600, at least 0, to 2 decimals
|
| where start is the credited start (the later of the time-in and the
| scheduled start, services/dayRules.ts) and end is the time-out, but no
| later than where credit stops: the log's credited_until (the scheduled
| end, stored at time-in), or the end of overtime the supervisor approved
| for that day, whichever is later. Only the part of the break inside that
| span is taken off: a break after the scheduled end costs nothing, since
| that time was not counted. The 16-hour limit on one log (MAX_SHIFT_HOURS
| in server.ts) still applies before this.
|
| A log made before migration 084 has no credited_until, so its hours come
| out exactly as they always did and are never cut: hours already counted
| or verified do not change. (The other choice, a setting for new terms,
| would have kept two rules alive in one term; this way a log's own row
| says which rule it follows.)
|
| These build SQL from expressions the caller writes; nothing from a
| request goes into them.
|
*/

/** The moment credit stops on the log aliased `a`: its scheduled end, or a later approved overtime end. */
export function creditEndSql(a: string): string {
  return `GREATEST(${a}.credited_until, COALESCE((
      SELECT MAX(o.work_date + o.planned_end) FROM overtime_requests o
      WHERE o.student_id = ${a}.student_id AND o.work_date = ${a}.date AND o.status = 'approved'
    ), ${a}.credited_until))`;
}

/**
 * A log's hours. `start`, `end`, `breakStart` and `breakEnd` are SQL
 * moments; the break's are NULL when there was none (an open break's end is
 * the caller's time-out).
 */
export function hoursSql(options: { alias: string; start: string; end: string; breakStart: string; breakEnd: string }): string {
  const { alias: a, start, end, breakStart, breakEnd } = options;
  const stop = `LEAST(${end}, ${creditEndSql(a)})`;
  // Before migration 084: the whole break, as it always was.
  const oldBreak = `COALESCE(EXTRACT(EPOCH FROM ((${breakEnd}) - (${breakStart}))), 0)`;
  // Since: only the part of the break between the credited start and where credit stops.
  const newBreak = `COALESCE(GREATEST(0, EXTRACT(EPOCH FROM (LEAST(${breakEnd}, ${stop}) - GREATEST(${breakStart}, ${start})))), 0)`;
  const seconds = `CASE WHEN ${a}.credited_until IS NULL
      THEN EXTRACT(EPOCH FROM ((${end}) - (${start}))) - ${oldBreak}
      ELSE EXTRACT(EPOCH FROM (${stop} - (${start}))) - ${newBreak} END`;
  return `GREATEST(ROUND((${seconds}) / 3600.0, 2), 0)`;
}

/** The hours of a finished log as stored: from its credited start to its time-out, less its break. */
export function storedLogHoursSql(a: string): string {
  return hoursSql({
    alias: a,
    start: `COALESCE(${a}.credited_from, ${a}.time_in)`,
    end: `${a}.time_out`,
    breakStart: `${a}.break_time`,
    breakEnd: `CASE WHEN ${a}.break_time IS NOT NULL THEN COALESCE(${a}.break_end_time, ${a}.time_out) END`,
  });
}
