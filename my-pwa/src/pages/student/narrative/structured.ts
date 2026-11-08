import type { NarrativeParts } from "../../../lib/traineeRecord";
import type { Records } from "./model";

/*
|--------------------------------------------------------------------------
| THE GUIDED PARTS OF THE NARRATIVE REPORT (change1108)
|--------------------------------------------------------------------------
|
| The Title Page, Dedication, Acknowledgement and Company Profile differ
| from school to school and from agency to agency, so instead of one fixed
| layout each is built with a guided form; the form's fields are saved with
| the part (backend narrative_reports, "data") beside a readable text
| version of them, which is what the Word file and the "Written" mark use.
|
|   Title Page             three layouts to pick from (classic, seal band,
|                          modern), every line filled from the record and
|                          changeable
|   Agency Profile         name, address, head of office, year founded,
|                          mission, vision and a short history
|   Organizational Chart   boxes (name, position, reports to) drawn as a
|                          chart, or a photo of the agency's own chart
|                          picked from the trainee's album
|   Function and Services  a list: each service and a line about it
|   Dedication and         guiding questions that start a sentence, and a
|   Acknowledgement        starting draft from the record (model.ts)
|
| This module holds the shapes, the defaults and the text versions; the
| forms are in Builders.tsx.
|
*/

export type TitleLayout = "classic" | "seal" | "modern";

export type TitleData = {
  layout: TitleLayout;
  title: string;
  /** "In Partial Fulfillment of the Requirements for the Degree …" */
  purpose: string;
  agency: string;
  submittedBy: string;
  submittedTo: string;
  date: string;
};

export type AgencyData = { name: string; address: string; head: string; founded: string; mission: string; vision: string; history: string };

export type Service = { name: string; detail: string };
export type ServicesData = { items: Service[] };

export type OrgPerson = { id: string; name: string; position: string; parent: string | null };
export type OrgData = { mode: "chart" | "photo"; people: OrgPerson[]; photoId: number | null; note: string };

export const TITLE_LAYOUTS: { value: TitleLayout; label: string; line: string }[] = [
  { value: "classic", label: "Classic", line: "Centred, the seal on top, the way most PSU binders open" },
  { value: "seal", label: "Seal band", line: "The university's name in a band across the top, the title in a frame" },
  { value: "modern", label: "Modern", line: "Left-aligned, a gold rule down the side" },
];

const monthYear = (day?: string) =>
  new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", month: "long", year: "numeric" }).format(day ? new Date(`${day}T12:00:00+08:00`) : new Date());

export function titleDefaults(records: Records, saved?: string): TitleData {
  return {
    layout: "classic",
    // A title written before the guided form keeps its words.
    title: saved?.trim() && !saved.includes("\n") ? saved.trim() : "NARRATIVE REPORT ON INTERNSHIP TRAINING",
    purpose: `In Partial Fulfillment of the Requirements for the Degree ${records.program || "of Bachelor of Science in Information Technology"}`,
    agency: [records.department, records.company].filter(Boolean).join(", "),
    submittedBy: records.name,
    submittedTo: "",
    date: monthYear(records.end),
  };
}

export function titleText(data: TitleData): string {
  return [data.title, data.agency && `at ${data.agency}`, data.purpose, data.submittedBy && `Submitted by: ${data.submittedBy}`, data.submittedTo && `Submitted to: ${data.submittedTo}`, data.date].filter(Boolean).join("\n");
}

export function agencyDefaults(records: Records): AgencyData {
  return { name: records.company, address: "", head: "", founded: "", mission: "", vision: "", history: "" };
}

export function agencyText(data: AgencyData): string {
  const facts = [
    data.name && `${data.name}${data.address ? ` is located at ${data.address}` : ""}.`,
    data.founded && `It was established in ${data.founded}.`,
    data.head && `The office is headed by ${data.head}.`,
  ]
    .filter(Boolean)
    .join(" ");
  return [facts, data.history, data.mission && `Mission\n${data.mission}`, data.vision && `Vision\n${data.vision}`].filter(Boolean).join("\n\n");
}

export function servicesText(data: ServicesData): string {
  return data.items
    .filter((item) => item.name.trim())
    .map((item) => `• ${item.name.trim()}${item.detail.trim() ? ` — ${item.detail.trim()}` : ""}`)
    .join("\n");
}

export function orgDefaults(records: Records): OrgData {
  return {
    mode: "chart",
    people: records.supervisor ? [{ id: "p1", name: records.supervisor, position: "Training supervisor", parent: null }] : [],
    photoId: null,
    note: "",
  };
}

export type OrgNode = OrgPerson & { children: OrgNode[] };

/** The boxes as a tree: the people who report to no one (or to someone removed) at the top. */
export function orgTree(people: OrgPerson[]): OrgNode[] {
  const byId = new Map(people.map((person) => [person.id, { ...person, children: [] as OrgNode[] }]));
  const roots: OrgNode[] = [];
  for (const node of byId.values()) {
    const parent = node.parent ? byId.get(node.parent) : undefined;
    // A box cannot report to itself or to one of its own reports.
    let loop = false;
    for (let up = parent, guard = 0; up && guard < 50; up = up.parent ? byId.get(up.parent) : undefined, guard += 1) if (up.id === node.id) loop = true;
    if (parent && !loop) parent.children.push(node);
    else roots.push(node);
  }
  return roots;
}

export function orgText(data: OrgData): string {
  if (data.mode === "photo") return [data.photoId ? "The agency's organizational chart (photo)." : "", data.note].filter(Boolean).join("\n");
  const lines: string[] = [];
  const walk = (nodes: OrgNode[], depth: number) => {
    for (const node of nodes) {
      lines.push(`${"    ".repeat(depth)}• ${node.position || "Position"}${node.name ? ` — ${node.name}` : ""}`);
      walk(node.children, depth + 1);
    }
  };
  walk(orgTree(data.people), 0);
  return [lines.join("\n"), data.note].filter(Boolean).join("\n\n");
}

/** A part's saved fields, or the defaults when it has none yet. */
export function fieldsOf<T>(parts: NarrativeParts, key: string, defaults: T): T {
  const data = parts[key]?.data as Partial<T> | undefined;
  return data ? { ...defaults, ...data } : defaults;
}

/** Questions that start a sentence, for the parts written from the heart. */
export const PROMPTS: Record<string, { ask: string; start: string }[]> = {
  dedication: [
    { ask: "Who kept you going?", start: "This work is dedicated to my family, who " },
    { ask: "Someone who believed in you", start: "To " },
    { ask: "Faith", start: "Above all, to the Almighty God, " },
    { ask: "Future interns", start: "And to the future interns who will walk the same path: " },
  ],
  acknowledgement: [
    { ask: "Your supervisor", start: "I sincerely thank my training supervisor, " },
    { ask: "Your host office", start: "I am grateful to the people of " },
    { ask: "Your coordinator", start: "My gratitude goes to our OJT coordinator, " },
    { ask: "Family and friends", start: "To my family and friends, thank you for " },
    { ask: "Fellow interns", start: "I also thank my fellow interns, who " },
  ],
};
