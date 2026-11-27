/*
| PSU's campuses and their codes, for the staff account IDs the system gives
| (YY-CODE-NNN, such as 26-LN-601). The server's copy, with the numbering
| rule, is backend/src/services/staffIds.ts: keep the two lists the same.
*/

export const CAMPUSES = [
  { code: "AC", name: "Alaminos City", coordinatorFrom: 100 },
  { code: "AS", name: "Asingan", coordinatorFrom: 200 },
  { code: "BGU", name: "Bayambang", coordinatorFrom: 300 },
  { code: "BIN", name: "Binmaley", coordinatorFrom: 400 },
  { code: "IN", name: "Infanta", coordinatorFrom: 500 },
  { code: "LN", name: "Lingayen", coordinatorFrom: 600 },
  { code: "SC", name: "San Carlos City", coordinatorFrom: 700 },
  { code: "SM", name: "Sta. Maria", coordinatorFrom: 800 },
  { code: "UR", name: "Urdaneta City", coordinatorFrom: 900 },
] as const;

export type CampusCode = (typeof CAMPUSES)[number]["code"];

/** This deployment is PSU Lingayen's: the campus the forms start on. */
export const HOME_CAMPUS: CampusCode = "LN";

/** What the ID will look like, for the form's hint: "26-LN-6NN". */
export function staffIdShape(kind: "coordinator" | "admin", code: CampusCode): string {
  const campus = CAMPUSES.find((one) => one.code === code)!;
  const year = new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", year: "2-digit" }).format(new Date());
  const block = kind === "coordinator" ? `${String(campus.coordinatorFrom).charAt(0)}NN` : "0NN";
  return `${year}-${campus.code}-${block}`;
}
