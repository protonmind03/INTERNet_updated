/**
 * What a supervisor or the coordinator can rate an intern on. Both portals
 * use this one list, so reports that group by category add up.
 */
export const EVALUATION_CATEGORIES = [
  "Overall Performance",
  "Work Quality",
  "Technical Competence",
  "Punctuality & Attendance",
  "Communication Skills",
  "Initiative",
  "Professionalism & Conduct",
  "Documentation & Reports",
] as const;
