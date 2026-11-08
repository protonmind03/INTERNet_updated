import { PSU_FORMS, type FormCode } from "../../../lib/psuForms";

/*
|--------------------------------------------------------------------------
| THE PRE-OJT FORMS, DEFINED ONCE (Fill and print, November 2026)
|--------------------------------------------------------------------------
|
| Each of the four forms is written here once, as blocks: a section
| heading, a ruled table, a paragraph with lines to fill, a numbered list,
| signatures, the notary's lines. The same blocks are drawn on the page
| (FormSheet.tsx, which is also what prints and what the PDF is made
| from) and written into the Word file (formWord.ts), so the three always
| agree.
|
| Lines the record knows, or the trainee typed, are filled in; the rest
| stay blank for the people who sign: the registrar, the officials, the
| notary.
|
*/

export type FormKey = "application" | "consent" | "release" | "waiver";

export type Fields = {
  lastName: string;
  firstName: string;
  middleName: string;
  age: string;
  sex: string;
  civilStatus: string;
  contact: string;
  course: string;
  major: string;
  yearSection: string;
  guardian: string;
  currentAddress: string;
  homeAddress: string;
  hours: string;
  company: string;
  companyAddress: string;
  companyHead: string;
  companyContact: string;
  companyRep: string;
  from: string;
  to: string;
  releaseDate: string;
  signedPlace: string;
  resCertNo: string;
  resCertDate: string;
  resCertPlace: string;
  guardianCertNo: string;
  guardianCertDate: string;
  guardianCertPlace: string;
};

export const EMPTY: Fields = {
  lastName: "",
  firstName: "",
  middleName: "",
  age: "",
  sex: "",
  civilStatus: "",
  contact: "",
  course: "",
  major: "",
  yearSection: "",
  guardian: "",
  currentAddress: "",
  homeAddress: "",
  hours: "",
  company: "",
  companyAddress: "",
  companyHead: "",
  companyContact: "",
  companyRep: "",
  from: "",
  to: "",
  releaseDate: "",
  signedPlace: "",
  resCertNo: "",
  resCertDate: "",
  resCertPlace: "",
  guardianCertNo: "",
  guardianCertDate: "",
  guardianCertPlace: "",
};

export const LABELS: Record<keyof Fields, string> = {
  lastName: "Last name",
  firstName: "First name",
  middleName: "Middle name",
  age: "Age",
  sex: "Sex",
  civilStatus: "Civil status",
  contact: "Contact number",
  course: "Course",
  major: "Major",
  yearSection: "Year and section",
  guardian: "Parent or guardian",
  currentAddress: "Current address",
  homeAddress: "Home address",
  hours: "Required hours",
  company: "Company or agency",
  companyAddress: "Company address",
  companyHead: "Head of the company or agency",
  companyContact: "Company contact number",
  companyRep: "Company representative",
  from: "From (start date)",
  to: "To (end date)",
  releaseDate: "Date of release",
  signedPlace: "Signed at (town or city)",
  resCertNo: "Residence certificate no.",
  resCertDate: "Issued on",
  resCertPlace: "Issued at",
  guardianCertNo: "Residence certificate no.",
  guardianCertDate: "Issued on",
  guardianCertPlace: "Issued at",
};

/** Fields that take a whole row in the panel. */
export const WIDE: (keyof Fields)[] = ["company", "companyAddress", "currentAddress", "homeAddress", "companyHead"];

export type Group = { title: string; keys: (keyof Fields)[] };

/** What each form asks of the trainee, grouped as the panel shows it. */
export const ASKS: Record<FormKey, Group[]> = {
  application: [
    { title: "You", keys: ["lastName", "firstName", "middleName", "age", "sex", "civilStatus", "contact", "guardian", "currentAddress", "homeAddress"] },
    { title: "Your program", keys: ["course", "yearSection", "major"] },
    { title: "The company", keys: ["company", "companyAddress", "companyHead", "companyContact", "hours"] },
  ],
  consent: [
    { title: "You", keys: ["firstName", "middleName", "lastName", "homeAddress", "course", "hours"] },
    { title: "The company", keys: ["company"] },
    { title: "Your residence certificate", keys: ["resCertNo", "resCertDate", "resCertPlace"] },
    { title: "Your parent or guardian", keys: ["guardian"] },
    { title: "Signing", keys: ["signedPlace"] },
  ],
  release: [
    { title: "You", keys: ["firstName", "middleName", "lastName", "homeAddress", "course", "major", "hours"] },
    { title: "The company", keys: ["company", "companyAddress", "from", "to"] },
    { title: "The release", keys: ["releaseDate"] },
  ],
  waiver: [
    { title: "You", keys: ["firstName", "middleName", "lastName"] },
    { title: "Your residence certificate", keys: ["resCertNo", "resCertDate", "resCertPlace"] },
    { title: "Your parent or guardian", keys: ["guardian", "guardianCertNo", "guardianCertDate", "guardianCertPlace"] },
    { title: "The company", keys: ["company", "companyRep"] },
  ],
};

export type FormMeta = { key: FormKey; title: string; code?: FormCode; icon: "clipboard" | "edit" | "document" | "shield"; line: string };

export const FORMS: FormMeta[] = [
  { key: "application", title: "Application for Internship", code: PSU_FORMS.application, icon: "clipboard", line: "Your profile, academic credentials and the company, for approval" },
  { key: "consent", title: "Consent Form", code: PSU_FORMS.consent, icon: "edit", line: "Your sworn consent to the internship's terms; to be notarized" },
  { key: "release", title: "Internship Release Form", icon: "document", line: "Releases you to your company once your documents are complete" },
  { key: "waiver", title: "Training Agreement and Liability Waiver Form", code: PSU_FORMS.waiver, icon: "shield", line: "For overtime training, with your parent's consent (optional)" },
];

/* ---------- The blocks ---------- */

/** A line to fill: the value on it, or blank; s, m or l long. */
export type Line = { v: string; w: "s" | "m" | "l"; upper?: boolean };
export type Run = string | Line | { b: string } | { i: string };
export type Cell = { text?: string; v?: string; label?: boolean; span?: number; head?: boolean };
export type Signature = { lead?: string; name?: string; title: string; after?: Run[][] };

export type Block =
  | { kind: "section"; title: string }
  | { kind: "table"; cols: number[]; rows: Cell[][]; empty?: number }
  | { kind: "para"; runs: Run[]; italic?: boolean; align?: "justify" | "left" | "center" }
  | { kind: "list"; style: "decimal" | "alpha"; items: Run[][] }
  | { kind: "signatures"; items: Signature[]; columns?: 1 | 2; align?: "left" }
  | { kind: "gap"; mm: number };

const line = (v: string, w: Line["w"] = "m", upper = false): Line => ({ v, w, upper });

function fullName(f: Fields): string {
  return [f.firstName, f.middleName ? `${f.middleName.trim()[0]}.` : "", f.lastName].filter(Boolean).join(" ").trim();
}

const resCert = (no: string, on: string, at: string): Run[][] => [
  ["Res. Cert No.: ", line(no, "m")],
  ["Issued on: ", line(on, "m")],
  ["Issued at: ", line(at, "m")],
];

const notary: Block[] = [
  { kind: "gap", mm: 2 },
  { kind: "para", runs: ["SUBSCRIBED AND SWORN TO BEFORE ME this ", line("", "s"), " day of ", line("", "m"), ", 20", line("", "s"), " at ", line("", "m"), ", Philippines."] },
  { kind: "para", align: "left", runs: ["Doc. No. ", line("", "s"), "    Page No. ", line("", "s"), "    Book No. ", line("", "s"), "    Series of ", line("", "s")] },
];

export function blocksFor(form: FormKey, f: Fields): Block[] {
  const name = fullName(f);
  if (form === "application")
    return [
      { kind: "section", title: "A. Personal profile" },
      {
        kind: "table",
        cols: [20, 28, 22, 30],
        rows: [
          [{ text: "Name", label: true }, { v: f.lastName }, { v: f.firstName }, { v: f.middleName }],
          [{ text: "Age", label: true }, { v: f.age }, { text: "Civil status", label: true }, { v: f.civilStatus }],
          [{ text: "Sex", label: true }, { v: f.sex }, { text: "Contact number", label: true }, { v: f.contact }],
          [{ text: "Course", label: true }, { v: f.course }, { text: "Year & section", label: true }, { v: f.yearSection }],
          [{ text: "Major", label: true }, { v: f.major }, { text: "Parent/guardian", label: true }, { v: f.guardian }],
          [{ text: "Current address", label: true }, { v: f.currentAddress, span: 3 }],
          [{ text: "Home address", label: true }, { v: f.homeAddress, span: 3 }],
        ],
      },
      { kind: "section", title: "B. Academic credentials/qualifications" },
      { kind: "para", italic: true, runs: ["This is to certify that as per records kept in this office, the above name had already taken and pass ", line("", "s"), " units except the following subject/s to wit:"] },
      {
        kind: "table",
        cols: [9, 12, 27, 10, 10, 9, 14, 9],
        rows: [["Sem", "SY", "Subject", "Passing", "Failing", "Grade", "Signature", "Date"].map((text) => ({ text, label: true, head: true }))],
        empty: 4,
      },
      { kind: "para", italic: true, runs: ["This is to certify that he/she is ", line("", "m"), " to undergo internship."] },
      { kind: "para", align: "left", runs: ["Certified and verified true and correct:"] },
      { kind: "signatures", columns: 1, items: [{ title: "Campus Registrar" }] },
      { kind: "section", title: "C. Firm/agency/company for internship" },
      {
        kind: "table",
        cols: [30, 70],
        rows: [
          [{ text: "Name of the firm/agency/company", label: true }, { v: f.company }],
          [{ text: "Address", label: true }, { v: f.companyAddress }],
          [{ text: "Head", label: true }, { v: f.companyHead }],
          [{ text: "Contact number", label: true }, { v: f.companyContact }],
          [{ text: "Number of hours", label: true }, { v: f.hours }],
        ],
      },
      { kind: "para", italic: true, runs: ["Note: Please attach Medical Certificate and Psychological Test from any government physician, certifying that the student applicant is physically, emotionally, and mentally fit for the internship training activity."] },
      { kind: "section", title: "Recommending approval" },
      {
        kind: "signatures",
        items: [{ title: "Internship/Practicum Subject Instructor" }, { title: "Campus Internship Coordinator" }, { title: "Department Chair" }, { title: "College Dean" }],
      },
      { kind: "section", title: "Approved by" },
      { kind: "signatures", columns: 1, items: [{ title: "Campus Executive Director" }] },
    ];

  if (form === "consent")
    return [
      { kind: "para", runs: ["I, ", line(name, "l"), ", Filipino, of legal age, and residing at ", line(f.homeAddress, "l"), " after being duly sworn by law, do hereby depose and say that:"] },
      {
        kind: "list",
        style: "decimal",
        items: [
          ["I am a student of Pangasinan State University, Lingayen Campus and that as a course requirement for ", line(f.course, "l"), ", I am required to undergo Internship / Practicum in any company in line with my major field of specialization for ", line(f.hours, "s"), " hours;"],
          ["That the Pangasinan State University, Lingayen Campus, thru the Campus Internship Coordinator and the Internship/Practicum Subject Instructor has requested ", line(f.company, "l"), " allow me to undergo thereat and said company had accepted said request;"],
          ["I promise to render the necessary work to the best of my ability in order that my practicum shall be brought to a successful conclusion and that ", line(f.company, "l"), " and the Pangasinan State University, Lingayen Campus shall not adversely affect;"],
          ["That while performing the practicum and the duration thereof, I shall abide by the rules and policies of said Company and Pangasinan State University, Lingayen Campus relative to the work covered by said practicum and such order and instruction issued or to be issued thereby;"],
          ["I shall be punctual in my attendance and shall abide by the evaluation given me by said company based on such internship;"],
          ["I declare unconditional that there exists no employer-employee relationship between ", line(f.company, "l"), " and me, and hereby hold its officers, directors and personnel free and harmless from any case or causes of action, claims or otherwise arising from or about my internship which I have, including money claims, it understood that the internship is just a part of the academic preparation and thus non-compensable;"],
        ],
      },
      { kind: "para", align: "left", runs: ["Signed at ", line(f.signedPlace, "m"), ", Pangasinan. This ", line("", "s"), " day of ", line("", "m"), ", 20", line("", "s"), "."] },
      {
        kind: "signatures",
        items: [
          { lead: "Witnesses:", title: "Campus Internship Coordinator" },
          { lead: "Conforme:", name, title: "Signature over Printed Name of Student", after: resCert(f.resCertNo, f.resCertDate, f.resCertPlace) },
          { lead: "Noted:", title: "Campus Executive Director" },
          // An empty lead, so this line sits level with "Noted:" beside it.
          { lead: " ", name: f.guardian, title: "Signature over Printed Name of Parent/Guardian" },
        ],
      },
      ...notary,
    ];

  if (form === "release")
    return [
      { kind: "signatures", columns: 1, align: "left", items: [{ name: f.releaseDate, title: "Date" }] },
      { kind: "gap", mm: 2 },
      { kind: "para", align: "left", runs: [line(name, "l"), "\n", line(f.homeAddress, "l")] },
      { kind: "gap", mm: 2 },
      { kind: "para", align: "left", runs: [{ b: "Course: " }, line(f.course, "l"), "\n", { b: "Major: " }, line(f.major, "l")] },
      { kind: "para", runs: ["Upon completion and submission of all your required documents for your Internship / Practicum activity, you are hereby released to undergo ", line(f.hours, "s"), " hours Internship / Practicum at"] },
      { kind: "para", align: "left", runs: [{ b: "Cooperating Company/Agency/Firm: " }, line(f.company, "l"), "\n", { b: "Company/Agency/Firm Address: " }, line(f.companyAddress, "l")] },
      { kind: "para", align: "left", runs: ["From ", line(f.from, "m"), " to ", line(f.to, "m"), "."] },
      { kind: "para", runs: ["Please be guided with the school and company Internship / Practicum policies and guidelines throughout the duration of your Internship / Practicum Activity."] },
      { kind: "signatures", items: [{ title: "Internship / Practicum Subject Instructor" }, { title: "Campus Internship Coordinator" }] },
      { kind: "signatures", columns: 1, items: [{ lead: "Noted:", title: "Campus Executive Director" }] },
    ];

  return [
    { kind: "para", runs: ["I, ", line(name, "l", true), ", a student of Pangasinan State University, hereby voluntarily agree to undergo overtime training in my Internship Training at ", line(f.company, "l"), " under the following terms and conditions:"] },
    {
      kind: "list",
      style: "alpha",
      items: [
        ["That I have consent from my parents/guardians for the said overtime."],
        ["That the company/establishment where I am undergoing my training has knowledge of the overtime."],
        ["That I fully understand that the Pangasinan State University and ", line(f.company, "l"), " is no longer responsible/liable for any injury or incident that may occur during the said overtime."],
      ],
    },
    {
      kind: "signatures",
      // As on the form: the student and the company's representative side by side, the parent's consent below.
      items: [
        { name: name.toUpperCase(), title: "Student-Intern", after: resCert(f.resCertNo, f.resCertDate, f.resCertPlace) },
        { name: f.companyRep, title: "Company Representative", after: resCert("", "", "") },
        { lead: "With our consent and approval:", name: f.guardian, title: "Parent/Guardian", after: resCert(f.guardianCertNo, f.guardianCertDate, f.guardianCertPlace) },
      ],
    },
    ...notary,
  ];
}

/** The file name a saved form gets: "Consent Form - Demo Student". */
export function fileNameFor(meta: FormMeta, f: Fields): string {
  const who = fullName(f) || "INTERNet";
  return `${meta.title} - ${who}`.replace(/[\\/:*?"<>|]+/g, "").trim();
}
