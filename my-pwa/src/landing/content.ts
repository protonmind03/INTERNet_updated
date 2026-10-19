/*
|--------------------------------------------------------------------------
| THE LANDING PAGE'S WORDS (Iteration 23)
|--------------------------------------------------------------------------
|
| Kept apart from the layout so the wording can be checked in one place.
| Every claim here is something the system does today; nothing is counted
| or rated that has not been measured.
|
*/

export type DoorRole = "student" | "supervisor" | "coordinator";

export const DOOR_ROLES: DoorRole[] = ["student", "supervisor", "coordinator"];

export const DOORS: Record<
  DoorRole,
  { name: string; palette: string; promise: string; fragment: string; fragmentNote: string; appName: string }
> = {
  student: {
    name: "Trainee",
    palette: "Sunpath",
    promise: "Time in at your placement, log the day and watch your hours add up.",
    fragment: "Timed in · 7:58 AM",
    fragmentNote: "On time",
    appName: "INTERNet Trainee",
  },
  supervisor: {
    name: "Supervisor",
    palette: "Laurel Ledger",
    promise: "Verify your trainees' days, tasks and documents from one review queue.",
    fragment: "3 days waiting for review",
    fragmentNote: "Oldest: yesterday",
    appName: "INTERNet Supervisor",
  },
  coordinator: {
    name: "Coordinator",
    palette: "Royal Seal",
    promise: "Follow every placement, flag and requirement across the program.",
    fragment: "Action list · 5 items",
    fragmentNote: "2 flagged logs",
    appName: "INTERNet Coordinator",
  },
};

export const doorPath = (role: DoorRole) => `/${role}/sign-in`;

/** The four steps of a trainee's day, in the order the hero and the story show them. */
export const DAY_STEPS = [
  {
    key: "time-in",
    station: "Time in",
    banner: "Timed in · 7:58 AM",
    note: "On time. Camera check passed.",
    title: "Time in",
    body: "At the placement, tap Time in. A short camera check with on-screen prompts confirms it is you, and the photo goes to your supervisor.",
  },
  {
    key: "break",
    station: "Lunch break",
    banner: "On lunch break · since 12:01 PM",
    note: "Your hours pause until you are back.",
    title: "Lunch break",
    body: "One tap when you leave for lunch. With no signal the step is kept on the phone and sent when the connection returns.",
  },
  {
    key: "break-end",
    station: "End break",
    banner: "Back from break · 12:58 PM",
    note: "Confirmed with your screen lock.",
    title: "End break",
    body: "Tap End break when you are back. If you added a passkey, your phone's screen lock confirms the step; without it the step still counts.",
  },
  {
    key: "time-out",
    station: "Time out",
    banner: "Timed out · 5:02 PM",
    note: "8 h counted, waiting for your supervisor.",
    title: "Time out",
    body: "Time out ends the day. Your supervisor verifies it, and the verified hours count toward your required total.",
  },
] as const;

/** "What the system checks": only what it does. */
export const CHECKS = [
  {
    title: "A camera check at time-in",
    body: "Before the time-in photo is sent, the phone asks for a few movements shown on screen. The check runs on the phone.",
    icon: "M4 8h3l2-3h6l2 3h3v11H4zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z",
  },
  {
    title: "Signed time-in with no signal",
    body: "With no connection, time-in uses a voucher collected earlier. It is signed on the phone and checked when it arrives.",
    icon: "M12 3l7 3v5c0 5-3 8-7 10-4-2-7-5-7-10V6zM9 12l2 2 4-4",
  },
  {
    title: "Your supervisor confirms each day",
    body: "Every day is verified or rejected by the trainee's supervisor. A rejected photo or day can be appealed to the coordinator.",
    icon: "M9 11l3 3 8-8M20 12v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h9",
  },
  {
    title: "An audit log",
    body: "Changes to records are kept in an audit log: who made them, what changed and when. The coordinator can read it.",
    icon: "M5 4h11l3 3v13H5zM9 9h6M9 13h6M9 17h4",
  },
  {
    title: "A privacy notice and your data",
    body: "Trainees read and agree to the privacy notice before the first time-in, and can download a copy of their own records.",
    icon: "M12 3a4 4 0 0 1 4 4v3H8V7a4 4 0 0 1 4-4zM6 10h12v10H6zM12 14v3",
  },
  {
    title: "Passkey confirmation",
    body: "A trainee may add a passkey. Lunch break, End break and Time out then ask for the phone's screen lock. It never stops a step.",
    icon: "M14 10a4 4 0 1 0-3.9 4H11v2h2v2h2v2h3v-3l-4.1-4.1A4 4 0 0 0 14 10zM9 10h.01",
  },
] as const;

export const QUESTIONS = [
  {
    q: "Does it work with no signal?",
    a: "Partly, and on purpose. Once the app has been opened with a connection, a trainee can record Time in, Lunch break, End break and Time out with no signal; the steps wait on the phone and are sent when the connection returns. Pages you have opened before show what they last saved. Sending tasks, documents and reports needs a connection.",
  },
  {
    q: "Which phones work?",
    a: "An Android phone with Chrome, or an iPhone or iPad with Safari, kept up to date. Time-in needs the phone's front camera. Supervisors and coordinators can also use a computer with Chrome, Edge or Safari. INTERNet is an installable web app: there is nothing to download from an app store.",
  },
  {
    q: "What happens to my photo and records?",
    a: "The time-in photo is seen by your supervisor and the OJT coordinator. The privacy notice in the Trainee app says what is kept and why, and Profile, Privacy and data has Download my data for a copy of your own records.",
  },
  {
    q: "Who do I contact?",
    a: "Your program's OJT coordinator at the OJT office, Pangasinan State University – Lingayen Campus. Coordinators create the accounts, so a supervisor or trainee without one asks there. Forgotten passwords can be reset from each sign-in page.",
  },
] as const;
