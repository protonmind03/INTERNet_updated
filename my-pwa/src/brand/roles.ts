/**
 * INTERNet role identities.
 *
 * One logo, three portals. Each role keeps the same mark but gets its own
 * surface colour, tag, tagline, launch steps and loading language, so a
 * student, a supervisor and a coordinator each feel that the system is
 * talking about *their* work.
 */

export type Role = "student" | "supervisor" | "coordinator";
export type BrandRole = Role | "guest";

/** Every data process a page can wait on. Pages pass one of these to <BrandLoader process=…>. */
export type LoadProcess =
  | "launch"
  | "dashboard"
  | "timeIn"
  | "attendance"
  | "dailyLog"
  | "tasks"
  | "taskSubmit"
  | "schedule"
  | "documents"
  | "upload"
  | "notifications"
  | "feedback"
  | "report"
  | "profile"
  | "interns"
  | "verify"
  | "evaluation"
  | "complaints"
  | "students"
  | "supervisors"
  | "monitoring"
  | "requirements"
  | "analytics"
  | "export"
  | "search"
  | "signIn"
  | "save";

export type RoleTheme = {
  role: BrandRole;
  /** Shown under the wordmark in sidebars and on the splash screen. */
  portal: string;
  /** Short chip shown in headers ("Trainee", "Supervisor", "Coordinator"). */
  tag: string;
  /** One-line promise shown on splash and empty headers. */
  tagline: string;
  /** Sidebar / header surface. "dark" = navy family, "light" = white. */
  surface: "dark" | "light";
  /** Hex values used by the brand components. */
  colors: {
    surface: string;      // sidebar + mobile header background
    surfaceRaised: string; // icon tile on that surface, hover
    accent: string;       // active nav, primary buttons, progress
    accentText: string;   // text placed on the accent
    text: string;         // main text on the surface
    muted: string;        // secondary text on the surface
    tagBg: string;        // role chip background
    tagText: string;      // role chip text
  };
  /** Steps shown, in order, on the prelaunch splash. */
  launchSteps: { label: string; message: string }[];
  /** Loading copy for each process. Missing keys fall back to DEFAULT_MESSAGES. */
  messages: Partial<Record<LoadProcess, string>>;
};

const NAVY = "#1A237E";
const DEEP = "#121A5E";
const AMBER = "#FACC15";

export const DEFAULT_MESSAGES: Record<LoadProcess, string> = {
  launch: "Starting INTERNet…",
  dashboard: "Getting things ready…",
  timeIn: "Recording your time-in…",
  attendance: "Loading attendance…",
  dailyLog: "Loading daily logs…",
  tasks: "Loading tasks…",
  taskSubmit: "Submitting task…",
  schedule: "Loading schedule…",
  documents: "Loading documents…",
  upload: "Uploading file…",
  notifications: "Loading notifications…",
  feedback: "Loading feedback…",
  report: "Sending your report…",
  profile: "Loading profile…",
  interns: "Loading interns…",
  verify: "Saving verification…",
  evaluation: "Loading evaluations…",
  complaints: "Loading complaints…",
  students: "Loading students…",
  supervisors: "Loading supervisors…",
  monitoring: "Loading monitoring data…",
  requirements: "Loading requirements…",
  analytics: "Crunching analytics…",
  export: "Preparing your PDF…",
  search: "Searching records…",
  signIn: "Signing you in…",
  save: "Saving changes…",
};

export const ROLE_THEMES: Record<BrandRole, RoleTheme> = {
  student: {
    role: "student",
    portal: "Student Portal",
    tag: "Trainee",
    tagline: "Your road to graduation, one verified day at a time.",
    surface: "dark",
    colors: {
      surface: NAVY,
      surfaceRaised: "#283593",
      accent: AMBER,
      accentText: "#0F172A",
      text: "#FFFFFF",
      muted: "#C7CDF0",
      tagBg: "rgba(250, 204, 21, 0.16)",
      tagText: AMBER,
    },
    launchSteps: [
      { label: "Time-in", message: "Checking today’s time-in…" },
      { label: "Hours", message: "Adding up your verified OJT hours…" },
      { label: "Tasks", message: "Loading tasks from your supervisor…" },
      { label: "Documents", message: "Syncing your documents…" },
      { label: "Progress", message: "Plotting your road to graduation…" },
    ],
    messages: {
      dashboard: "Getting your OJT day ready…",
      timeIn: "Recording your time-in photo…",
      attendance: "Loading your attendance record…",
      dailyLog: "Loading your daily logs…",
      tasks: "Loading tasks from your supervisor…",
      taskSubmit: "Submitting your task…",
      schedule: "Loading your OJT schedule…",
      documents: "Loading your documents…",
      upload: "Uploading your document…",
      notifications: "Checking your notifications…",
      feedback: "Loading your feedback history…",
      report: "Sending your concern to the coordinator…",
      profile: "Loading your profile…",
      analytics: "Measuring your progress…",
      save: "Saving your changes…",
    },
  },
  supervisor: {
    role: "supervisor",
    portal: "Supervisor Portal",
    tag: "Supervisor",
    tagline: "Guide, verify and evaluate your interns.",
    surface: "dark",
    colors: {
      surface: DEEP,
      surfaceRaised: NAVY,
      accent: AMBER,
      accentText: "#0F172A",
      text: "#FFFFFF",
      muted: "#C7CDF0",
      tagBg: "rgba(255, 255, 255, 0.12)",
      tagText: "#FFFFFF",
    },
    launchSteps: [
      { label: "Interns", message: "Gathering your assigned interns…" },
      { label: "Time-ins", message: "Collecting time-ins waiting for verification…" },
      { label: "Tasks", message: "Checking submitted tasks…" },
      { label: "Documents", message: "Loading documents to review…" },
      { label: "Evaluations", message: "Preparing evaluation records…" },
    ],
    messages: {
      dashboard: "Gathering your interns’ day…",
      attendance: "Loading time-ins to verify…",
      verify: "Verifying attendance…",
      interns: "Loading your interns…",
      tasks: "Loading tasks you assigned…",
      taskSubmit: "Saving the task…",
      evaluation: "Loading evaluation history…",
      documents: "Loading intern documents…",
      complaints: "Loading your filed concerns…",
      report: "Sending your concern to the coordinator…",
      notifications: "Checking your notifications…",
      profile: "Loading your profile…",
      save: "Saving your changes…",
    },
  },
  coordinator: {
    role: "coordinator",
    portal: "Coordinator Portal",
    tag: "Coordinator",
    tagline: "Oversee every OJT journey across the program.",
    surface: "light",
    colors: {
      surface: "#FFFFFF",
      surfaceRaised: "#4F46E5",
      accent: "#4F46E5",
      accentText: "#FFFFFF",
      text: "#0F172A",
      muted: "#64748B",
      tagBg: "#EEF2FF",
      tagText: "#4338CA",
    },
    launchSteps: [
      { label: "Students", message: "Loading the student roster…" },
      { label: "Supervisors", message: "Loading partner supervisors…" },
      { label: "Monitoring", message: "Compiling attendance and hours…" },
      { label: "Requirements", message: "Checking requirement compliance…" },
      { label: "Analytics", message: "Crunching program analytics…" },
    ],
    messages: {
      dashboard: "Compiling the program overview…",
      students: "Loading the student roster…",
      supervisors: "Loading supervisors…",
      monitoring: "Loading monitoring data…",
      requirements: "Checking requirement compliance…",
      documents: "Loading submitted documents…",
      evaluation: "Loading evaluations…",
      complaints: "Loading complaints…",
      analytics: "Crunching program analytics…",
      export: "Preparing the analytics PDF…",
      search: "Searching students, supervisors and complaints…",
      profile: "Loading your profile…",
      save: "Saving changes…",
    },
  },
  guest: {
    role: "guest",
    portal: "OJT Monitoring & Analytics",
    tag: "Welcome",
    tagline: "Where every intern’s progress becomes data.",
    surface: "dark",
    colors: {
      surface: NAVY,
      surfaceRaised: "#283593",
      accent: AMBER,
      accentText: "#0F172A",
      text: "#FFFFFF",
      muted: "#C7CDF0",
      tagBg: "rgba(255, 255, 255, 0.1)",
      tagText: "#FFFFFF",
    },
    launchSteps: [
      { label: "Attendance", message: "Preparing attendance tracking…" },
      { label: "Tasks", message: "Preparing task management…" },
      { label: "Documents", message: "Preparing document review…" },
      { label: "Analytics", message: "Preparing analytics…" },
    ],
    messages: { signIn: "Signing you in…" },
  },
};

export function messageFor(role: BrandRole, process: LoadProcess): string {
  return ROLE_THEMES[role].messages[process] ?? DEFAULT_MESSAGES[process];
}

/* ---------- Action feedback copy (what the user sees after they act) ---------- */

/** Generic confirmations. Pages should pass a specific `success` text when they know it
 *  (e.g. "Attendance approved for Demo Student"), these are the fallback. */
export const DEFAULT_SUCCESS: Partial<Record<LoadProcess, string>> = {
  save: "Changes saved.",
  upload: "File uploaded.",
  taskSubmit: "Task submitted.",
  report: "Report sent to your coordinator.",
  verify: "Saved.",
  export: "PDF ready.",
  signIn: "Signed in.",
};

const ROLE_SUCCESS: Record<BrandRole, Partial<Record<LoadProcess, string>>> = {
  student: {
    timeIn: "Time recorded. One more verified step on your road.",
    taskSubmit: "Task submitted to your supervisor.",
    upload: "Document uploaded for review.",
    report: "Concern sent to your coordinator.",
    feedback: "Thanks — your feedback was sent.",
    save: "Your changes are saved.",
  },
  supervisor: {
    verify: "Decision saved. The student has been notified.",
    taskSubmit: "Task assigned to your intern.",
    evaluation: "Evaluation submitted.",
    report: "Incident sent to the coordinator.",
    save: "Your changes are saved.",
  },
  coordinator: {
    save: "Changes saved.",
    students: "Student account saved.",
    supervisors: "Supervisor account saved.",
    complaints: "Complaint updated.",
    requirements: "Requirement schedule saved.",
    export: "Analytics PDF ready to download.",
  },
  guest: { signIn: "Welcome back." },
};

export function successFor(role: BrandRole, process: LoadProcess): string {
  return ROLE_SUCCESS[role][process] ?? DEFAULT_SUCCESS[process] ?? "Done.";
}

/** Turns any thrown value into one plain sentence for the user. */
export function errorText(err: unknown, fallback = "Something went wrong. Please try again."): string {
  if (typeof err === "string" && err.trim()) return err;
  if (err instanceof Error && err.message && !/^(TypeError|Failed to fetch|NetworkError)/i.test(err.message)) return err.message;
  if (err instanceof TypeError) return "Can’t reach the server. Check your connection and try again.";
  return fallback;
}

/** Reads the signed-in role the same way sessionGuard.ts does (localStorage "active_role"). */
export function getActiveRole(): BrandRole {
  try {
    const r = localStorage.getItem("active_role");
    return r === "student" || r === "supervisor" || r === "coordinator" ? r : "guest";
  } catch {
    return "guest";
  }
}
