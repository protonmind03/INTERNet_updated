import { createHash } from "node:crypto";
import type { Pool } from "pg";

/*
|--------------------------------------------------------------------------
| THE FAULTS THE SYSTEM NOTICES IN ITSELF
|--------------------------------------------------------------------------
|
| Every route and background loop already reports a fault the same way:
| one console.error whose first words are a label, "ASSIGN TASK ERROR:",
| followed by the error. That line goes to the host's log. This module
| also keeps a count of each kind of fault in the database (migration
| 048), so a coordinator can see that something keeps going wrong without
| access to the host. A crash in someone's browser, which the app already
| reports, is kept the same way.
|
| The log line is watched where it is written (watchServerErrors), so no
| route has to remember to report, and nothing here can fail a request:
| keeping a fault is best effort and its own failures are only logged.
|
| What is kept is little, on purpose. From the server: the label and the
| KIND of error (its name, a database error's five-character code). Never
| the error's message: it can quote a value someone typed, such as an
| email address in a "duplicate key" error. From a browser: the crash
| message, the page's path and the app version. Nothing about who.
|
| A fault that repeats is one row with a count. A burst is held back: the
| same fault is written at most once a minute (the count catches up on
| the next write), and at most 40 different faults a minute are taken.
| Rows not seen for 30 days are removed.
|
*/

export type Problem = {
  source: "server" | "browser";
  label: string;
  detail: string;
  route: string;
};

const KEEP_DAYS = 30;
const WRITE_EVERY_MS = 60_000;
const MAX_KINDS_PER_MINUTE = 40;

const clean = (value: unknown, max: number): string =>
  typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "";

/**
 * What to keep of one console.error call, or null when it is not a fault
 * line. The label is the first argument up to its first colon. The detail
 * is the kind of the error that follows, never its message.
 */
export function problemFromLog(args: unknown[]): Problem | null {
  const first = args[0];
  if (typeof first !== "string") return null;
  const label = clean(first.split(":")[0], 120);
  // A browser's crash report is kept by its own route, with more than the log line has.
  if (label === "CLIENT ERROR") return null;
  // A sentence of explanation is not a label: labels are short and say ERROR or error.
  if (!label || !/error|rejection|exception|failed/i.test(label)) return null;
  const error = args.find((arg) => arg && typeof arg === "object") as
    | { name?: unknown; code?: unknown }
    | undefined;
  const name = clean(error?.name, 60);
  // A PostgreSQL error code is five letters and digits; a Node one is like ECONNREFUSED.
  const code = typeof error?.code === "string" && /^[A-Z0-9_]{3,30}$/.test(error.code) ? error.code : "";
  return { source: "server", label, detail: [name, code].filter(Boolean).join(" "), route: "" };
}

/** What to keep of a crash report from a browser (already cut down by clientErrorRecord). */
export function problemFromBrowser(report: { message: string; route: string; version: string }): Problem {
  return {
    source: "browser",
    label: clean(report.message, 200),
    detail: clean(report.version, 40),
    route: clean(report.route, 200),
  };
}

export function fingerprintOf(problem: Problem): string {
  return createHash("sha256")
    .update([problem.source, problem.label, problem.detail, problem.route].join("\u0000"))
    .digest("hex")
    .slice(0, 40);
}

type Held = { problem: Problem; waiting: number; lastWrite: number };

/**
 * Keeps faults for one pool. `now` and `log` are passed in by the tests.
 */
export function createProblemKeeper(
  pool: Pick<Pool, "query">,
  options: { now?: () => number; log?: (...args: unknown[]) => void } = {}
) {
  const now = options.now ?? Date.now;
  const log = options.log ?? (() => undefined);
  const held = new Map<string, Held>();
  let windowStart = 0;
  let kindsThisWindow = 0;
  let lastPrune = 0;

  async function write(fingerprint: string, entry: Held, times: number): Promise<void> {
    try {
      await pool.query(
        `INSERT INTO problem_reports AS p (fingerprint, source, label, detail, route, times)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (fingerprint) DO UPDATE SET times = p.times + $6, last_seen = NOW()`,
        [fingerprint, entry.problem.source, entry.problem.label, entry.problem.detail, entry.problem.route, times]
      );
      if (now() - lastPrune > 24 * 60 * 60 * 1000) {
        lastPrune = now();
        await pool.query(
          `DELETE FROM problem_reports WHERE last_seen < NOW() - make_interval(days => $1)`,
          [KEEP_DAYS]
        );
      }
    } catch (error) {
      // Give the count back to be written next time, and say so in the plain log.
      entry.waiting += times;
      log("Could not keep a problem report:", error instanceof Error ? error.name : "error");
    }
  }

  /** Notes one fault. Returns the write, for tests; callers do not wait for it. */
  function keep(problem: Problem): Promise<void> {
    const moment = now();
    if (moment - windowStart >= WRITE_EVERY_MS) {
      windowStart = moment;
      kindsThisWindow = 0;
      // Forget kinds not seen for a while, so the map cannot grow without end.
      for (const [key, entry] of held) {
        if (entry.waiting === 0 && moment - entry.lastWrite > 10 * WRITE_EVERY_MS) held.delete(key);
      }
    }
    const fingerprint = fingerprintOf(problem);
    let entry = held.get(fingerprint);
    if (!entry) {
      if (kindsThisWindow >= MAX_KINDS_PER_MINUTE) return Promise.resolve();
      kindsThisWindow += 1;
      entry = { problem, waiting: 0, lastWrite: 0 };
      held.set(fingerprint, entry);
    }
    entry.waiting += 1;
    if (entry.lastWrite !== 0 && moment - entry.lastWrite < WRITE_EVERY_MS) return Promise.resolve();
    const times = entry.waiting;
    entry.waiting = 0;
    entry.lastWrite = moment;
    return write(fingerprint, entry, times);
  }

  return { keep };
}

/**
 * From now on every console.error that is a fault line is also handed to
 * `keep`. The line is printed exactly as before. Call once.
 */
export function watchServerErrors(keep: (problem: Problem) => unknown): () => void {
  const original = console.error;
  console.error = (...args: unknown[]) => {
    original.apply(console, args);
    try {
      const problem = problemFromLog(args);
      if (problem) void keep(problem);
    } catch {
      /* Watching the log must never add a fault of its own. */
    }
  };
  return () => {
    console.error = original;
  };
}

export type ProblemRow = {
  id: number;
  source: "server" | "browser";
  label: string;
  detail: string;
  route: string;
  times: number;
  first_seen: string;
  last_seen: string;
};

/** The faults seen in the last `days` days, the most recent first. */
export async function recentProblems(pool: Pick<Pool, "query">, days = 7, limit = 20): Promise<ProblemRow[]> {
  const found = await pool.query<ProblemRow>(
    `SELECT id::int AS id, source, label, detail, route, times, first_seen, last_seen
     FROM problem_reports
     WHERE last_seen >= NOW() - make_interval(days => $1)
     ORDER BY last_seen DESC, id DESC
     LIMIT $2`,
    [days, limit]
  );
  return found.rows;
}
