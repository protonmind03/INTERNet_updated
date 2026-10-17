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
      "Time-in: with your photo when the phone is ready for it (Profile says so), otherwise without one for your supervisor to confirm. Sent within 12 hours",
      "Out for lunch and back from lunch: sent within 12 hours",
      "Time-out: sent within 24 hours",
    ],
    needs: [
      "Submitting a task, document, journal or absence",
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
