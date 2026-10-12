import { formatDate } from "../../lib/format";

/** A requirement's deliverable settings, as the server sends them. Missing from an older server. */
export type DeliverableFields = {
  due_date?: string | null;
  due_rule?: string | null;
  reviewer_role?: "supervisor" | "coordinator";
  applies_to?: { program_ids?: number[]; block_ids?: number[] } | null;
};

/** The settings in a line for the list: "Due every week · Reviewed by the coordinator · 2 programs". Empty when all are as before. */
export function deliverableLine(item: DeliverableFields): string {
  const week = /^week:(\d{1,2})$/.exec(item.due_rule ?? "");
  const due = item.due_date
    ? `Due ${formatDate(item.due_date)}`
    : item.due_rule === "weekly"
      ? "Due every week"
      : week
        ? `Due by the end of week ${Number(week[1])} of the term`
        : "";
  const programs = item.applies_to?.program_ids?.length ?? 0;
  const blocks = item.applies_to?.block_ids?.length ?? 0;
  const who = [
    programs > 0 ? `${programs} ${programs === 1 ? "program" : "programs"}` : "",
    blocks > 0 ? `${blocks} ${blocks === 1 ? "block" : "blocks"}` : "",
  ]
    .filter(Boolean)
    .join(" and ");
  return [due, item.reviewer_role === "coordinator" ? "Reviewed by the coordinator" : "", who ? `Only ${who}` : ""]
    .filter(Boolean)
    .join(" · ");
}
