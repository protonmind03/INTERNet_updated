/*
|--------------------------------------------------------------------------
| THE NARRATIVE REPORT ON INTERNSHIP TRAINING: WHAT IT HOLDS
|--------------------------------------------------------------------------
|
| The binder's parts in the order of the university's own table of
| contents (read from the photo of a real one, November 2026), and where
| each comes from:
|
|   write      the trainee writes it here; it saves as they type
|              (backend narrative_reports). A starting draft can be put
|              together from their records (drafts below) to edit.
|   auto       INTERNet fills it from the record, ready to print
|   upload     a signed or issued paper the trainee keeps in Documents
|   waiting    the layout is not known yet: the user is sending a photo of
|              the university's sample
|
*/

export type PartSource = "write" | "auto" | "upload" | "waiting";

export type WritePart = {
  key: string;
  number: string;
  title: string;
  hint: string;
  source: PartSource;
  /** Indented under a heading, as on the table of contents. */
  level: 0 | 1 | 2;
};

export const PARTS: WritePart[] = [
  { key: "title_page", number: "I.", title: "Title Page", hint: "Pick a layout; every line is filled from your record and yours to change.", source: "write", level: 0 },
  { key: "toc", number: "II.", title: "Table of Contents", hint: "Made from the parts below, in the university's order.", source: "auto", level: 0 },
  { key: "dedication", number: "III.", title: "Dedication", hint: "To whom you dedicate this report, and why.", source: "write", level: 0 },
  { key: "acknowledgement", number: "IV.", title: "Acknowledgement", hint: "Thank the people and offices who helped you through your OJT.", source: "write", level: 0 },
  { key: "company", number: "V.", title: "Company Profile", hint: "", source: "write", level: 0 },
  { key: "agency_profile", number: "•", title: "Agency Profile", hint: "The agency's facts, history, mission and vision; INTERNet writes them up as its profile.", source: "write", level: 1 },
  { key: "organizational_chart", number: "•", title: "Organizational Chart", hint: "Build the chart from boxes (position, name, who they report to), or use a photo of the agency's own chart from your album.", source: "write", level: 1 },
  { key: "functions_services", number: "•", title: "Function and Services", hint: "Each function or service of the agency, with a line about who it serves.", source: "write", level: 1 },
  { key: "narrative", number: "VI.", title: "Narrative Report", hint: "", source: "write", level: 0 },
  { key: "introduction", number: "A.", title: "Introduction", hint: "Where and when you trained, how many hours, and what the OJT was for.", source: "write", level: 1 },
  { key: "learning", number: "B.", title: "Learning", hint: "", source: "write", level: 1 },
  { key: "participation", number: "1.", title: "Participation and Interaction", hint: "How you took part in the office's work and events, and how you worked with others.", source: "write", level: 2 },
  { key: "challenges", number: "2.", title: "Challenges and Solution", hint: "The problems you met and what you did about them.", source: "write", level: 2 },
  { key: "accomplishments", number: "3.", title: "Accomplishment and Conclusions", hint: "What you finished, and what it showed you.", source: "write", level: 2 },
  { key: "input_output", number: "4.", title: "Input and Output", hint: "What you brought to the work, and what came out of it.", source: "write", level: 2 },
  { key: "impact", number: "5.", title: "Impact to Fields of Specialization", hint: "How the OJT relates to your program and the career you are preparing for.", source: "write", level: 2 },
  { key: "tasks_summary", number: "6.", title: "Summary of Tasks/Activities", hint: "Put together from your weekly reports, week by week. Edit it freely.", source: "write", level: 2 },
  { key: "pictures", number: "7.", title: "Pictures Depicting OJT Experiences", hint: "The photos from your daily reports go here with their captions. Add a short note if you like.", source: "auto", level: 2 },
  { key: "conclusions", number: "8.", title: "Conclusion and Recommendations", hint: "What you conclude from your OJT, and what you would recommend to the company, the university and future interns.", source: "write", level: 2 },
];

export type Requirement = {
  number: string;
  title: string;
  source: PartSource;
  /** Matches the trainee's uploaded document by its requirement name. */
  match?: RegExp;
  /** Where INTERNet makes or keeps it. */
  to?: string;
  note?: string;
  optional?: boolean;
};

export const MOA: Requirement = { number: "VII.", title: "Memorandum of Agreement", source: "upload", match: /memorandum|\bmoa\b/i, note: "A copy of the signed and notarized agreement between PSU and the company." };

/** VIII. Internship Requirements, as the table of contents numbers them. */
export const REQUIREMENTS: Requirement[] = [
  { number: "1.", title: "Application for Internship", source: "upload", match: /application/i },
  { number: "2.", title: "Certification of Units Earned", source: "upload", match: /units/i },
  { number: "3.", title: "Consent and Waiver", source: "upload", match: /consent/i },
  { number: "4.", title: "Endorsement Letter", source: "upload", match: /endorse/i },
  { number: "5.", title: "Internship Resume", source: "upload", match: /resume|personal data/i, note: "The Personal Data Sheet (CS Form No. 212)." },
  { number: "6.", title: "Internship Agreement", source: "upload", match: /^(?!.*training).*agreement/i },
  { number: "7.", title: "Internship Release Form", source: "upload", match: /release/i },
  { number: "8.", title: "Medical Certificate", source: "upload", match: /medical/i, note: "Health information: it stays out of the album and of anything INTERNet exports." },
  { number: "9.", title: "Psychological Test Certificate", source: "upload", match: /psycholog/i, note: "Health information: it stays out of the album and of anything INTERNet exports." },
  { number: "10.", title: "Internship Timeframe", source: "auto", to: "#timeframe", note: "FM-AA-INT-17, from your attendance." },
  { number: "11.", title: "Training Agreement and Liability Waiver Form / Overtime Form", source: "upload", match: /waiver|overtime/i, optional: true },
  { number: "12.", title: "Practicum Weekly Report", source: "auto", to: "/journal?view=weekly", note: "FM-AA-INT-19, from your weekly reports." },
  { number: "13.", title: "Student Intern's Feedback Form", source: "auto", to: "/student/resolution?tab=evaluation", note: "FM-AA-INT-20, filled in here." },
  { number: "14.", title: "Training Supervisor's Feedback Form", source: "waiting", note: "Waiting for a photo of the university's form." },
  { number: "15.", title: "Internship Evaluation Form", source: "auto", to: "/student/resolution?tab=evaluation", note: "FM-AA-INT-13, from your supervisor's evaluation." },
  { number: "16.", title: "Certificate of Completion", source: "upload", match: /completion/i, note: "Issued by your host company." },
];

/* ---------- Starting drafts, put together from the record ---------- */

export type Records = {
  name: string;
  program: string;
  campus: string;
  company: string;
  department: string;
  supervisor: string;
  start?: string;
  end?: string;
  hours: number;
  requiredHours: number;
  weeks: { week_start: string; activities: string; learnings: string; challenges: string | null; solutions?: string | null }[];
  events: { day: string; title: string; details: string }[];
  tasksDone: string[];
};

const longDate = (day?: string) =>
  day ? new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", month: "long", day: "numeric", year: "numeric" }).format(new Date(`${day}T12:00:00+08:00`)) : "";

const firstSentence = (text: string) => {
  const trimmed = text.trim().replace(/\s+/g, " ");
  const end = trimmed.search(/[.!?](\s|$)/);
  return end > 0 ? trimmed.slice(0, end + 1) : trimmed;
};

/** A starting draft for a part, from the trainee's own records; empty when there is nothing to start from. */
export function draftFor(key: string, r: Records): string {
  const place = [r.department, r.company].filter(Boolean).join(", ");
  switch (key) {
    case "introduction":
      return [
        `I had my On-the-Job Training at ${place || "my host company"}${r.start ? ` from ${longDate(r.start)}` : ""}${r.end ? ` to ${longDate(r.end)}` : ""}, rendering ${Math.round(r.hours)} of the ${r.requiredHours} hours required by the ${r.program || "program"} of Pangasinan State University${r.campus ? `, ${r.campus} Campus` : ""}.`,
        r.supervisor ? `My training was supervised by ${r.supervisor}.` : "",
        "The internship let me apply what I learned in school to real work, and see how an office runs from day to day.",
      ]
        .filter(Boolean)
        .join(" ");
    case "participation": {
      const lines = r.events.slice(0, 12).map((event) => `• ${longDate(event.day)}: ${event.title}${event.details ? ` — ${firstSentence(event.details)}` : ""}`);
      return lines.length ? `I took part in the office's work and activities, among them:\n${lines.join("\n")}` : "";
    }
    case "challenges": {
      const lines = r.weeks
        .filter((week) => week.challenges)
        .map((week) => `• ${firstSentence(week.challenges ?? "")}${week.solutions ? ` What I did: ${firstSentence(week.solutions)}` : ""}`);
      return lines.length ? `These were the problems I met during my training, and how I dealt with them:\n${lines.join("\n")}` : "";
    }
    case "accomplishments": {
      const lines = r.tasksDone.slice(0, 15).map((task) => `• ${task}`);
      return [`I completed ${Math.round(r.hours)} hours of training.`, lines.length ? `The tasks I finished include:\n${lines.join("\n")}` : ""].filter(Boolean).join("\n");
    }
    case "input_output":
      return r.weeks.length
        ? r.weeks
            .slice(0, 6)
            .map((week) => `• ${firstSentence(week.activities)} ${firstSentence(week.learnings)}`)
            .join("\n")
        : "";
    case "impact": {
      const lines = r.weeks.slice(-5).map((week) => `• ${firstSentence(week.learnings)}`);
      return lines.length ? `My training related to my field, ${r.program || "my program"}, in these ways:\n${lines.join("\n")}` : "";
    }
    case "tasks_summary":
      return r.weeks
        .slice()
        .sort((a, b) => a.week_start.localeCompare(b.week_start))
        .map((week, index) => `Week ${index + 1} (${longDate(week.week_start)}): ${week.activities.trim()}`)
        .join("\n\n");
    case "dedication":
      return [
        "This narrative report is humbly dedicated to my family, whose love, patience and support carried me through every day of my training.",
        `To my mentors at ${r.company || "my host company"}, who trusted me with real work and taught me by example.`,
        "And above all, to God, the source of strength and wisdom, without whom none of this would have been possible.",
      ].join("\n\n");
    case "acknowledgement":
      return [
        `I would like to express my sincere gratitude to the people who made my On-the-Job Training at ${place || "my host company"} a meaningful experience.`,
        r.supervisor ? `To ${r.supervisor}, my training supervisor, for the guidance, patience and trust given to me throughout my ${Math.round(r.hours) || r.requiredHours} hours of training.` : "",
        `To the faculty of the ${r.program || "program"} of Pangasinan State University${r.campus ? `, ${r.campus} Campus` : ""}, and especially our OJT coordinator, for preparing and following us all the way.`,
        "To my family and friends, for their unending support, and to my fellow interns, for the help and the laughter along the way.",
      ]
        .filter(Boolean)
        .join("\n\n");
    case "agency_profile":
      return r.company ? `${r.company}${r.department ? `, through its ${r.department},` : ""} …` : "";
    default:
      return "";
  }
}
