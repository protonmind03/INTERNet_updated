/*
|--------------------------------------------------------------------------
| HELP ANSWERS, WRITTEN ONCE (PSU redesign, Section 8)
|--------------------------------------------------------------------------
|
| Every answer is written here once and tagged by role, topic and the
| screens it is about. Two doors read it, and never copy it:
|
|   - the Help centre (pages/Help.tsx): pick a role, browse topics, search;
|   - "Help for this screen" (components/ScreenHelp.tsx): only the answers
|     tagged with the screen open now, two or three at most.
|
| Short answers, two lines each, about what the system does today. The
| offline table beside it (lib/offlineHelp.ts) stays its own section.
|
*/

export type HelpRole = "student" | "supervisor" | "coordinator";

export type HelpAnswer = {
  id: string;
  roles: HelpRole[];
  topic: string;
  question: string;
  answer: string;
  /** Routes whose "Help for this screen" shows it. */
  screens: string[];
};

export const HELP_ROLE_NAME: Record<HelpRole, string> = { student: "Trainee", supervisor: "Supervisor", coordinator: "Coordinator" };

/** The screens' names, as the help sheet's heading says them. */
export const SCREEN_NAMES: Record<string, string> = {
  "/student/dashboard": "Today",
  "/daily-log": "Attendance",
  "/schedule": "Schedule",
  "/task": "Tasks",
  "/documents": "Documents",
  "/journal": "Weekly journal",
  "/profile": "Profile",
  "/supervisor/dashboard": "Review",
  "/supervisor/attendance": "Attendance",
  "/supervisor/interns": "Interns",
  "/supervisor/tasks": "Tasks",
  "/supervisor/journals": "Weekly reports",
  "/coordinator/dashboard": "Home",
  "/coordinator/monitoring": "Monitoring",
  "/coordinator/resolution": "Decide",
  "/coordinator/students": "Students",
  "/coordinator/programs": "Programs",
};

export const HELP_ANSWERS: HelpAnswer[] = [
  {
    id: "camera-check",
    roles: ["student"],
    topic: "Timing in",
    question: "The camera check keeps failing",
    answer: "Face the camera in good light and turn your head when asked. After a few tries, ask your supervisor to time you in from their phone.",
    screens: ["/student/dashboard", "/daily-log"],
  },
  {
    id: "no-signal",
    roles: ["student"],
    topic: "Timing in",
    question: "Can I time in without signal?",
    answer: "Yes, once the app has been opened with a connection. The time-in waits on the phone, is sent when the signal is back, and your supervisor confirms it.",
    screens: ["/student/dashboard", "/daily-log"],
  },
  {
    id: "forgot-time-out",
    roles: ["student"],
    topic: "Timing in",
    question: "I forgot to time out",
    answer: "Open Attendance and enter the time you left on that day's log. Your supervisor checks it.",
    screens: ["/student/dashboard", "/daily-log"],
  },
  {
    id: "hours-not-counting",
    roles: ["student"],
    topic: "Hours and rejections",
    question: "Why aren't my hours counting yet?",
    answer: "Only days your supervisor has verified count. A pending day is added once it is verified.",
    screens: ["/student/dashboard", "/daily-log", "/schedule"],
  },
  {
    id: "photo-rejected",
    roles: ["student"],
    topic: "Hours and rejections",
    question: "My photo was rejected",
    answer: "Retake it from the red row on Today before the time shown. With no new photo in time, the day is closed as an absence.",
    screens: ["/student/dashboard", "/daily-log"],
  },
  {
    id: "disagree",
    roles: ["student"],
    topic: "Hours and rejections",
    question: "I disagree with a decision",
    answer: "Tap Appeal on that day in Attendance while the appeal is open. The coordinator reads the day and decides.",
    screens: ["/daily-log"],
  },
  {
    id: "finish-date",
    roles: ["student"],
    topic: "Hours and rejections",
    question: "When will I finish?",
    answer: "Schedule shows your expected finish date from your schedule and your verified hours, and how it was worked out.",
    screens: ["/schedule", "/student/dashboard"],
  },
  {
    id: "submit-task",
    roles: ["student"],
    topic: "Tasks and documents",
    question: "How do I submit a task?",
    answer: "Open Tasks, choose the task and add your work. Your supervisor reviews it and may return it with a note.",
    screens: ["/task"],
  },
  {
    id: "upload-requirements",
    roles: ["student"],
    topic: "Tasks and documents",
    question: "Where do I upload requirements?",
    answer: "In More, Documents. Each requirement shows what is due and when.",
    screens: ["/documents"],
  },
  {
    id: "weekly-journal",
    roles: ["student"],
    topic: "Tasks and documents",
    question: "What goes in the weekly journal?",
    answer: "What you did and learned that week. Your supervisor reads it; up to three pictures can go with it.",
    screens: ["/journal"],
  },
  {
    id: "passkey",
    roles: ["student"],
    topic: "Account and app",
    question: "Why does Time out ask for my fingerprint?",
    answer: "You added a passkey in Profile. It confirms Lunch break, End break and Time out; cancelling it still records the step.",
    screens: ["/student/dashboard", "/profile"],
  },
  {
    id: "iphone-notifications",
    roles: ["student", "supervisor", "coordinator"],
    topic: "Account and app",
    question: "No notifications on my iPhone",
    answer: "On an iPhone they need the app added to the Home Screen and opened from there. Then turn them on in Profile.",
    screens: ["/profile"],
  },
  {
    id: "verify-fast",
    roles: ["supervisor"],
    topic: "Reviewing",
    question: "Fastest way to verify logs",
    answer: "Use Verify all for the ordinary time-ins. Time-ins made offline stay out of it: confirm each one on its own.",
    screens: ["/supervisor/dashboard", "/supervisor/attendance"],
  },
  {
    id: "reject-photo-or-day",
    roles: ["supervisor"],
    topic: "Reviewing",
    question: "Reject the photo or the whole day?",
    answer: "Reject the photo when only the picture is wrong: the trainee retakes it and keeps working. Reject the day when the attendance itself is wrong.",
    screens: ["/supervisor/dashboard", "/supervisor/attendance"],
  },
  {
    id: "record-time-in",
    roles: ["supervisor"],
    topic: "Reviewing",
    question: "An intern's camera check keeps failing",
    answer: "Open the intern and use Record time-in to time them in yourself.",
    screens: ["/supervisor/dashboard", "/supervisor/interns"],
  },
  {
    id: "changed-meanwhile",
    roles: ["supervisor", "coordinator"],
    topic: "Reviewing",
    question: "It says the record changed",
    answer: "Someone decided it after you opened it. The page reloads it; check it again before deciding.",
    screens: ["/supervisor/dashboard", "/supervisor/attendance", "/coordinator/resolution"],
  },
  {
    id: "flagged-log",
    roles: ["coordinator"],
    topic: "Monitoring",
    question: "What's a flagged log?",
    answer: "A log that was rejected, is missing a time-out, or has waited more than 2 days for its supervisor.",
    screens: ["/coordinator/dashboard", "/coordinator/monitoring"],
  },
  {
    id: "behind-schedule",
    roles: ["coordinator"],
    topic: "Monitoring",
    question: "Who counts as behind?",
    answer: "A trainee whose expected finish, from their schedule and verified hours, falls after the term ends.",
    screens: ["/coordinator/dashboard", "/coordinator/students"],
  },
  {
    id: "decide-appeal",
    roles: ["coordinator"],
    topic: "Deciding",
    question: "How do I decide an appeal?",
    answer: "Open it, read the day's timeline, then uphold the decision or overturn it. The trainee and the supervisor are both told.",
    screens: ["/coordinator/dashboard", "/coordinator/resolution"],
  },
  {
    id: "program-marks",
    roles: ["coordinator"],
    topic: "Setting up",
    question: "How do I set a college's seal?",
    answer: "In Programs, edit the college or program and pick its mark from the PSU set.",
    screens: ["/coordinator/programs"],
  },
  {
    id: "install",
    roles: ["student", "supervisor", "coordinator"],
    topic: "Installing the app",
    question: "How do I install the app?",
    answer: "Open your sign-in page and choose Install. On an iPhone or iPad, tap Share, then Add to Home Screen.",
    screens: [],
  },
];

/** The answers for one screen and role, at most three. */
export function answersFor(role: HelpRole, pathname: string): HelpAnswer[] {
  return HELP_ANSWERS.filter((answer) => answer.roles.includes(role) && answer.screens.includes(pathname)).slice(0, 3);
}
