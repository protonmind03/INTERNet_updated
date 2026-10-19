/*
|--------------------------------------------------------------------------
| WHAT WORKS WITH NO CONNECTION, BY ROLE
|--------------------------------------------------------------------------
|
| Iteration 12. The table on the Help page (pages/Help.tsx). DEVELOPING.md
| has the same table for developers; change both together.
|
| The limits are the server's defaults (OFFLINE_MAX_AGE_HOURS_TIME_IN,
| _LUNCH and _TIME_OUT); a deployment can set others.
|
*/

export type OfflineRow = {
  role: "Student" | "Supervisor" | "Coordinator";
  /** Works with no connection at all. */
  works: string[];
  /** Kept on the phone and sent by itself once the server can be reached. */
  waits: string[];
  /** Needs the server: tried with no connection, it is refused with a message. */
  needs: string[];
};

export const OFFLINE_TABLE: OfflineRow[] = [
  {
    role: "Student",
    works: [
      "Your dashboard, attendance, tasks, schedule, absences, company and profile as they were last loaded",
      "Text you are typing in a journal, report, task note, absence or message: kept as a draft on the phone",
    ],
    waits: [
      "Time-in: with your photo when the phone is ready for it (Profile says so), otherwise without one for your supervisor to confirm. Sent within 12 hours, and judged at the time you pressed it: a time-in before it opened is not added",
      "Lunch break and End break: sent within 12 hours",
      "Time-out: sent within 24 hours",
      "Up to 3 pictures on the time-out note, made smaller to about 400 kB each: sent after the time-out, within the same 24 hours",
    ],
    needs: [
      "Submitting a task, document, journal or absence, and the pictures on a journal or concern",
      "Sending a message or a concern",
      "Signing in",
    ],
  },
  {
    role: "Supervisor",
    works: [
      "Your interns, their logs, tasks, documents, absences, weekly reports and schedules as they were last loaded",
      "Text you are typing in a message: kept as a draft",
    ],
    waits: ["Nothing: a decision is never kept for later, so it cannot overwrite someone else's"],
    needs: [
      "Every decision: verifying or rejecting a log, reviewing a task, document, absence or weekly report",
      "Recording an intern's time-in for them",
      "Giving tasks, sending messages, signing in",
    ],
  },
  {
    role: "Coordinator",
    works: ["Notifications and announcements as they were last loaded", "Text you are typing in a message: kept as a draft"],
    waits: ["Nothing: a decision is never kept for later"],
    needs: ["Every page's current figures, and every decision, change, import and export", "Signing in"],
  },
];

/** What happens when two people decide the same record. */
export const DECIDED_FIRST =
  "If someone else changes a record while you have it open (another reviewer, the coordinator, or the student), your decision is not saved. You are told how the record is now, and the page reloads so you can look again.";

/*
| Iteration 18: the day's rules, as the server applies them
| (backend/src/services/dayRules.ts). The numbers are the defaults in
| attendance_rules; a deployment can change them, and the app always shows
| the times the server works out for the day itself.
*/
export const ATTENDANCE_RULES_HELP: string[] = [
  "Time in opens 30 minutes before your shift starts. Your hours count from the start of your shift, not from when you arrive early.",
  "You are late from the first minute after your start: 8:00:59 is on time for 8:00, 8:01 is late.",
  "The four steps are Time in, Lunch break, End break and Time out. Coming back after your lunch ends is marked, but does not change your hours.",
  "If you have not timed in by the start of lunch, the day becomes afternoon-only: time in opens 30 minutes before lunch ends, your hours count from the end of lunch, and there is no lunch break. The morning shows as absent; you may file a reason for it.",
  "A shift that starts at noon or later is an afternoon shift, and one that ends by noon is a morning shift: each has just Time in and Time out.",
  "On a holiday or a day not on your schedule you may time in at any time, and nothing is marked late.",
];
