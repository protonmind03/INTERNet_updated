/*
| Host Training Establishments (Phase 1.3): the words for a company's kind
| and status, and what a placement needs. The server decides
| (backend/src/services/placement.ts); these only explain.
*/

export type HteType = "government" | "private" | "university";
export type HteStatus = "applied" | "screening" | "approved" | "suspended";

export const HTE_TYPE_WORDS: Record<HteType, string> = {
  government: "Government",
  private: "Private",
  university: "University",
};

export const HTE_STATUS_WORDS: Record<HteStatus, string> = {
  applied: "Applied",
  screening: "Screening",
  approved: "Approved",
  suspended: "Suspended",
};

export const HTE_STATUS_TONE: Record<HteStatus, "good" | "waiting" | "bad" | "neutral"> = {
  applied: "neutral",
  screening: "waiting",
  approved: "good",
  suspended: "bad",
};

/** Why a company cannot take another student, or null when it can. */
export function placementBlock(company: { status?: string; is_active?: boolean; slots: number | null; active_students?: number }): string | null {
  if (company.is_active === false) return "inactive";
  if (company.status && company.status !== "approved") return `${HTE_STATUS_WORDS[company.status as HteStatus]?.toLowerCase() ?? company.status}, not approved yet`;
  if (company.slots !== null && company.active_students !== undefined && company.active_students >= company.slots) return `all ${company.slots} slots taken`;
  return null;
}
