/*
|--------------------------------------------------------------------------
| THE LANDING PAGE'S WORDS (PSU redesign, Sections 1 to 5 and 9)
|--------------------------------------------------------------------------
|
| Kept apart from the layout so the wording can be checked in one place.
| Every claim is a rule INTERNet has today (the service named beside it).
| The figures on the small screens are example text, not anyone's data.
|
*/

export type DoorRole = "student" | "supervisor" | "coordinator";
export type DeviceKind = "phone" | "tablet" | "laptop";

/** The order the hero's circle and the role indicator show them in. */
export const HERO_ORDER: DoorRole[] = ["coordinator", "student", "supervisor"];
/** The order of the cards, the tabs and the footer. */
export const DOOR_ROLES: DoorRole[] = ["student", "supervisor", "coordinator"];

export const DEVICE_WORD: Record<DeviceKind, string> = { phone: "phone", tablet: "tablet", laptop: "laptop" };

export const DOORS: Record<
  DoorRole,
  {
    /** The role's name ("Trainee"). */
    name: string;
    /** The installed app's name. */
    appName: string;
    /** The card's title in "Three portals, one road". */
    cardTitle: string;
    /** The chip on the card's cap. */
    first: string;
    bullets: [string, string, string];
    /** The devices the role's portal suits best (filled chips). */
    best: Array<"Phone" | "Tablet" | "Computer">;
    /** Behind the card's "i". */
    deviceWhy: string;
    /** The device the role is shown on first in the hero. */
    heroDevice: DeviceKind;
    /** Two paper notes beside the role's device in the hero: example text. */
    notes: [{ title: string; line: string }, { title: string; line: string }];
    /** "Get the trainee app". */
    getApp: string;
    /** "for trainees" in "Install INTERNet for trainees". */
    plural: string;
  }
> = {
  student: {
    name: "Trainee",
    appName: "INTERNet Trainee",
    cardTitle: "Trainee app",
    first: "Phone first",
    bullets: ["Time in with a camera check", "Works without signal", "See the day you'll finish"],
    best: ["Phone"],
    deviceWhy: "Time-in needs the phone's front camera, so the trainee app is made for a phone. A computer can check hours and submit work.",
    heroDevice: "phone",
    notes: [
      { title: "Timed in 7:58 AM", line: "camera check passed" },
      { title: "74 hours to go", line: "expected finish shown" },
    ],
    getApp: "Get the trainee app",
    plural: "trainees",
  },
  supervisor: {
    name: "Supervisor",
    appName: "INTERNet Supervisor",
    cardTitle: "Supervisor desk",
    first: "Tablet and computer",
    bullets: ["See who is in at a glance", "Verify a day in one tap", "Tasks for teams, evaluations"],
    best: ["Tablet", "Computer"],
    deviceWhy: "Supervisors review a queue at a desk, so the larger screen shows the day board and the queue side by side. The phone app works too.",
    heroDevice: "tablet",
    notes: [
      { title: "Time-in verified", line: "one tap from the queue" },
      { title: "4 of 5 in today", line: "today's register" },
    ],
    getApp: "Get the supervisor app",
    plural: "supervisors",
  },
  coordinator: {
    name: "Coordinator",
    appName: "INTERNet Coordinator",
    cardTitle: "Coordinator console",
    first: "Computer first",
    bullets: ["What needs you comes first", "By college, program and block", "Reports for the dean"],
    best: ["Computer"],
    deviceWhy: "The coordinator runs the whole program from a desk, with filters, lists and reports that need a wide screen. The phone app keeps up on the go.",
    heroDevice: "laptop",
    notes: [
      { title: "Appeals to decide", line: "first on the list" },
      { title: "Trainees on the road", line: "behind, on the way, almost done" },
    ],
    getApp: "Get the coordinator app",
    plural: "coordinators",
  },
};

export const doorPath = (role: DoorRole) => `/${role}/sign-in`;
export const installPath = (role: DoorRole) => `/${role}/sign-in?install=1`;

/** Each role's own page on the website ("For trainees" in the top bar). */
export const ROLE_PAGE_PATH: Record<DoorRole, string> = {
  student: "/for-trainees",
  supervisor: "/for-supervisors",
  coordinator: "/for-coordinators",
};

/** The device each role is shown on in "How it works" and on its own page. */
export const ROLE_DEVICE: Record<DoorRole, DeviceKind> = { student: "phone", supervisor: "tablet", coordinator: "laptop" };

export type RoleFeature = { title: string; body: string; icon: "camera" | "offline" | "road" | "tasks" | "report" | "print" | "board" | "check" | "team" | "star" | "filter" | "alert" | "audit" | "calendar" | "chart" | "chat" };

/** The words of each role's own page: what the portal does today, nothing promised. */
export const ROLE_PAGES: Record<
  DoorRole,
  {
    kicker: string;
    title: string;
    titleEm: string;
    intro: string;
    features: RoleFeature[];
    /** A short line beside the install section. */
    installLead: string;
  }
> = {
  student: {
    kicker: "For trainees",
    title: "Your OJT hours,",
    titleEm: "proven one day at a time.",
    intro: "Time in with your phone's camera, log what you did, hand in your work and see the day you will finish, all in one app made for your phone.",
    features: [
      { icon: "camera", title: "Time in with a camera check", body: "A short head turn proves it is you. Your supervisor sees the photo, and a clean day counts after two working days." },
      { icon: "offline", title: "Works without signal", body: "No data in the field? Your time-in waits on the phone and is sent once you are back online." },
      { icon: "road", title: "See the day you will finish", body: "Verified hours fill your road, and the expected finish date moves with every verified day." },
      { icon: "tasks", title: "Tasks and documents", body: "Submit your work and your requirements, and read your supervisor's notes in one place." },
      { icon: "report", title: "Weekly report", body: "Write the week's activities, learnings and challenges, and know when it has been reviewed." },
      { icon: "print", title: "A time record to sign", body: "Print your monthly time record with your saved signature and your supervisor's certification." },
    ],
    installLead: "Install the Trainee app on the phone you bring to your OJT. Time-in needs its front camera.",
  },
  supervisor: {
    kicker: "For supervisors",
    title: "Guide your interns,",
    titleEm: "verify their days in one tap.",
    intro: "See who is in, verify the day's time-ins together, review tasks, documents and weekly reports, and evaluate your interns from a tablet or a computer.",
    features: [
      { icon: "board", title: "Today's register", body: "Each intern's time-in, lunch and time-out on one board, and who is not in yet." },
      { icon: "check", title: "One review queue", body: "Time-ins, tasks, documents, absences and weekly reports wait in one list, oldest first." },
      { icon: "team", title: "Tasks for teams", body: "Give a task to one intern or to a team. Each member hands in and is reviewed on their own." },
      { icon: "star", title: "Evaluate and certify", body: "Rate your interns, submit the final evaluation and certify each month's time record." },
      { icon: "camera", title: "Record a time-in yourself", body: "When an intern's phone fails, record the time-in in person. It is approved on the spot." },
      { icon: "chat", title: "Talk to the OJT office", body: "Message the coordinator about an intern, or report a concern with evidence." },
    ],
    installLead: "Install the Supervisor app on the tablet or computer at your desk. The phone app works too.",
  },
  coordinator: {
    kicker: "For coordinators",
    title: "Every trainee's OJT,",
    titleEm: "in one console.",
    intro: "Run the term from a computer: what needs you comes first, every list narrows by college, program, block, company and supervisor, and reports are ready for the dean.",
    features: [
      { icon: "alert", title: "What needs you, first", body: "Appeals, concerns, flagged logs and trainees without a supervisor, oldest on top." },
      { icon: "filter", title: "One filter for everything", body: "Term, college, program, block, company or supervisor. Save the views you use." },
      { icon: "calendar", title: "Set up the term", body: "Programs, blocks, schedules, holidays and deliverables, in one place." },
      { icon: "chart", title: "Analytics and reports", body: "Attendance, progress and companies, as a PDF or a spreadsheet for the dean." },
      { icon: "audit", title: "Every change is recorded", body: "The audit log keeps who changed what, and when, and exports it." },
      { icon: "chat", title: "Announcements and messages", body: "Reach every trainee, every supervisor, or one company, and keep the conversations." },
    ],
    installLead: "Install the Coordinator app on your office computer. The phone app keeps up on the go.",
  },
};

/** "How it works": four steps per role, each what the portal does today. */
export const HOW_STEPS: Record<DoorRole, { title: string; heading: string; steps: Array<{ title: string; body: string }> }> = {
  student: {
    title: "A trainee's day",
    heading: "trainee's",
    steps: [
      { title: "Time in with a camera check", body: "Turn your head when asked. No signal? It still works and is sent later." },
      { title: "Lunch, then time out", body: "Lunch is taken off your hours. At time-out, say what you did and which tasks it was for." },
      { title: "Tasks, deliverables and weekly report", body: "Submit your work, upload what's due, and write your weekly report." },
      { title: "Watch verified hours grow", body: "See your expected finish date, and print a signed time record." },
    ],
  },
  supervisor: {
    title: "A supervisor's day",
    heading: "supervisor's",
    steps: [
      { title: "See who is in", body: "Today's register shows each intern's time-in, and who is not in yet." },
      { title: "Check what is unusual", body: "Clean, camera-checked days count on their own after two working days unless you reject them. Offline or corrected time-ins wait for you." },
      { title: "Review tasks, documents and weekly reports", body: "Mark work reviewed, or return it with a note." },
      { title: "Evaluate and certify", body: "Fill in the final evaluation, and certify each month's time record." },
    ],
  },
  coordinator: {
    title: "A coordinator's week",
    heading: "coordinator's",
    steps: [
      { title: "Watch what needs you", body: "Appeals, flagged logs and concerns come first, oldest on top." },
      { title: "Decide appeals", body: "Read the day's timeline, then uphold the decision or overturn it." },
      { title: "Set up the term", body: "Programs, blocks, schedules, holidays and deliverables, in one place." },
      { title: "Report to the dean", body: "Figures by college, program and block, as a PDF or a spreadsheet." },
    ],
  },
};

export type Verdict = "Blocked" | "Handled" | "Spotted" | "Allowed";

/** "Go on, try to fool it": ten things a trainee might try, and the rule that answers. */
export const FOOL: Array<{
  group: "Timing in" | "During the day" | "Afterwards";
  try: string;
  tag: string;
  verdict: Verdict;
  answer: string;
  rule: string;
  extra?: { title: string; body: string };
  checkedBy: Array<"Phone" | "Server" | "Supervisor" | "Coordinator">;
  /** What the small phone shows. */
  screen: { kind: "camera" | "refused" | "queued" | "flag" | "confirm" | "remind" | "redo" | "locked" | "hours"; title: string; line: string };
}> = [
  {
    group: "Timing in",
    try: "Hold up a photo of yourself",
    tag: "Camera check",
    verdict: "Blocked",
    answer: "A photo can't turn its head on cue.",
    rule: "The camera check asks for head turns picked by the server. The ticket for each check lasts ten minutes and works once, and your supervisor still sees the photo.",
    extra: { title: "After a rejected photo", body: "The trainee gets the stricter check (both head turns and the colour light test) until a log is verified again." },
    checkedBy: ["Phone", "Server", "Supervisor"],
    screen: { kind: "camera", title: "Now turn your head left", line: "then back to the centre" },
  },
  {
    group: "Timing in",
    try: "Time in twice",
    tag: "One a day",
    verdict: "Blocked",
    answer: "There is one time-in a day.",
    rule: "The server keeps one attendance log per trainee per day, and refuses a second time-in.",
    checkedBy: ["Server"],
    screen: { kind: "refused", title: "Already timed in today", line: "You already logged attendance today." },
  },
  {
    group: "Timing in",
    try: "Come in early to bank hours",
    tag: "Day rules",
    verdict: "Handled",
    answer: "Hours start when the shift does.",
    rule: "Time-in opens 30 minutes before your shift starts, and hours count from the start of the shift, not from an early time-in.",
    checkedBy: ["Server"],
    screen: { kind: "hours", title: "Counting from 8:00 AM", line: "your shift's start" },
  },
  {
    group: "During the day",
    try: "Time in with no signal",
    tag: "Offline",
    verdict: "Allowed",
    answer: "It works, and it's marked.",
    rule: "With no signal, time-in uses a voucher the phone collected earlier. It is signed on the phone, checked when it arrives, and accepted within 12 hours.",
    extra: { title: "On the supervisor's side", body: "An offline time-in is never part of “Verify all”: the supervisor confirms it on its own." },
    checkedBy: ["Phone", "Server", "Supervisor"],
    screen: { kind: "queued", title: "Waiting to send", line: "sent when the signal is back" },
  },
  {
    group: "During the day",
    try: "Set the phone's clock back",
    tag: "Clock gap",
    verdict: "Spotted",
    answer: "A moved clock flags the log.",
    rule: "An offline step carries how far the phone's clock was from the server's. A clock moved by more than two minutes flags the log for the supervisor.",
    checkedBy: ["Phone", "Server", "Supervisor"],
    screen: { kind: "flag", title: "Phone clock moved", line: "flagged for your supervisor" },
  },
  {
    group: "During the day",
    try: "Let a friend press Time out",
    tag: "Passkey",
    verdict: "Spotted",
    answer: "Your screen lock is asked for.",
    rule: "With a passkey added, Lunch break, End break and Time out ask for the phone's screen lock. The supervisor sees which steps were confirmed and which were not.",
    checkedBy: ["Phone", "Server", "Supervisor"],
    screen: { kind: "confirm", title: "Confirm it's you", line: "use your screen lock" },
  },
  {
    group: "Afterwards",
    try: "Forget to time out",
    tag: "Reminder",
    verdict: "Handled",
    answer: "You're reminded, and can fix it.",
    rule: "A reminder comes an hour after the shift ends. A missed time-out can be entered later, for the supervisor to check.",
    checkedBy: ["Server", "Supervisor"],
    screen: { kind: "remind", title: "Did you forget to time out?", line: "your shift ended an hour ago" },
  },
  {
    group: "Afterwards",
    try: "Keep a photo that got rejected",
    tag: "Photo redo",
    verdict: "Handled",
    answer: "A rejected photo must be retaken.",
    rule: "A rejected photo opens a window to take a new one. With no new photo in time, the day is closed as an unexcused absence.",
    checkedBy: ["Server", "Supervisor"],
    screen: { kind: "redo", title: "Retake your time-in photo", line: "before the window closes" },
  },
  {
    group: "Afterwards",
    try: "Change your times later",
    tag: "Corrections",
    verdict: "Blocked",
    answer: "Only your supervisor can, with a reason.",
    rule: "A trainee cannot edit a log's times. A supervisor corrects them with a reason, and every change is kept in the audit log.",
    checkedBy: ["Server", "Supervisor", "Coordinator"],
    screen: { kind: "locked", title: "Times are locked", line: "ask your supervisor to correct them" },
  },
  {
    group: "Afterwards",
    try: "Count hours nobody checked",
    tag: "Two-day window",
    verdict: "Handled",
    answer: "Only clean days count on their own, and only after two working days.",
    rule: "A clean day (camera check passed, timed out normally, nothing offline, corrected or flagged) counts two working days later unless the supervisor rejects it first. Anything unusual waits for the supervisor to verify it.",
    checkedBy: ["Server", "Supervisor"],
    screen: { kind: "hours", title: "Counts after two working days", line: "unless your supervisor rejects it" },
  },
];

/** "Get the app": per device, three steps. */
export const INSTALL_DEVICES = [
  {
    key: "android",
    label: "Android",
    browsers: "Chrome, Samsung Internet",
    steps: [
      { title: "Tap “Install the app”", body: "Or open the browser's ⋮ menu and choose Install app (older phones: Add to Home screen)." },
      { title: "Confirm Install", body: "No Play Store needed. It takes a few seconds." },
      { title: "Open it from your home screen", body: "Sign in once. It opens like any other app." },
    ],
  },
  {
    key: "ios",
    label: "iPhone and iPad",
    browsers: "Safari",
    steps: [
      { title: "Open the sign-in page in Safari", body: "Other browsers on iPhone and iPad may not offer Add to Home Screen." },
      { title: "Tap Share, then Add to Home Screen", body: "Then tap Add. No App Store needed." },
      { title: "Open it from your home screen", body: "Sign in once. It opens like any other app." },
    ],
  },
  {
    key: "desktop",
    label: "Computer",
    browsers: "Windows, Mac, Chromebook",
    steps: [
      { title: "Open the sign-in page in Chrome or Edge", body: "On a Mac with Safari, use File, then Add to Dock." },
      { title: "Choose Install", body: "On the page, or at the right of the address bar." },
      { title: "Open it like any program", body: "From the Start menu, the Dock or the shelf." },
    ],
  },
] as const;
