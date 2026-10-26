import type { AttendanceEntry } from "./useSupervisorWork";

/*
|--------------------------------------------------------------------------
| THE ATTENDANCE PAGE'S VIEW: GROUP, SORT, FILTER
|--------------------------------------------------------------------------
|
| Roadmap 4.7. One bar: Group by (status, day, intern, team or block), Sort
| (oldest waiting first, newest, intern A–Z, hours) and filter chips that
| combine. Status chips (Needs review, Verified, Rejected) widen each other,
| as do the kind chips (Offline · no photo, Offline · attested, Photo redo
| pending, Time corrected); the two kinds narrow each other, so "Needs
| review" with "Offline · attested" is the attested logs still waiting.
|
| Groups that need review always come first. A log "Verify all" would leave
| out says so wherever it is (bulkSkipReason, which the Review queue uses
| to choose what Verify all takes).
|
*/

export type GroupBy = "status" | "day" | "intern" | "team" | "block";
export type SortBy = "waiting" | "newest" | "intern" | "hours";
export type Chip = "review" | "counting" | "verified" | "rejected" | "offline_photo" | "offline_attested" | "redo" | "corrected";

export type AttendanceView = { group: GroupBy; sort: SortBy; chips: Chip[] };

export const DEFAULT_VIEW: AttendanceView = { group: "status", sort: "waiting", chips: [] };

export const GROUP_OPTIONS: { value: GroupBy; label: string }[] = [
  { value: "status", label: "Status" },
  { value: "day", label: "Day" },
  { value: "intern", label: "Intern" },
  { value: "team", label: "Team" },
  { value: "block", label: "Block" },
];

export const SORT_OPTIONS: { value: SortBy; label: string }[] = [
  { value: "waiting", label: "Oldest waiting first" },
  { value: "newest", label: "Newest first" },
  { value: "intern", label: "Intern A–Z" },
  { value: "hours", label: "Most hours first" },
];

export const CHIPS: { value: Chip; label: string; status: boolean }[] = [
  { value: "review", label: "Needs review", status: true },
  { value: "counting", label: "Counts on its own", status: true },
  { value: "offline_photo", label: "Offline · no photo", status: false },
  { value: "offline_attested", label: "Offline · attested", status: false },
  { value: "redo", label: "Photo redo pending", status: false },
  { value: "corrected", label: "Time corrected", status: false },
  { value: "verified", label: "Verified", status: true },
  { value: "rejected", label: "Rejected", status: true },
];

/**
 * A clean day (2026-10-27): camera-checked, timed out, nothing unusual. It
 * counts on its own after auto_count_on unless the supervisor rejects or
 * decides it first (backend services/autoCount.ts says which are clean).
 */
export const countsOnItsOwn = (entry: AttendanceEntry) => entry.status === "Pending" && Boolean(entry.auto_count_on);

/** True when the log is waiting for this supervisor's decision: a clean day does not. */
export const awaitsReview = (entry: AttendanceEntry) =>
  entry.status === "Pending" && !(entry.capture_method === "supervisor" && !entry.time_out) && !countsOnItsOwn(entry);

/**
 * Why "Verify all" leaves a waiting log out, or null when it takes it.
 * Only complete logs go in a batch; a time-in with no photo is confirmed
 * by itself.
 */
export function bulkSkipReason(entry: AttendanceEntry): string | null {
  if (!awaitsReview(entry)) return null;
  if (!entry.time_out) return "Still on the clock";
  // The chip beside it already says it was an offline time-in.
  if (entry.offline_time_in) return "Verify on its own";
  return null;
}

export function chipMatches(entry: AttendanceEntry, chip: Chip): boolean {
  switch (chip) {
    case "review":
      return awaitsReview(entry);
    case "counting":
      return countsOnItsOwn(entry);
    case "verified":
      return entry.status === "Verified";
    case "rejected":
      return entry.status === "Rejected" || entry.status === "Flagged";
    case "offline_photo":
      return Boolean(entry.offline_time_in) && !entry.offline_attestation;
    case "offline_attested":
      return Boolean(entry.offline_time_in) && Boolean(entry.offline_attestation);
    case "redo":
      return entry.photo_redo_status === "required";
    case "corrected":
      return Boolean(entry.time_correction_reason);
  }
}

/** Status chips widen each other, kind chips widen each other, and the two kinds narrow each other. */
export function passesChips(entry: AttendanceEntry, chips: Chip[]): boolean {
  const status = chips.filter((chip) => CHIPS.find((item) => item.value === chip)?.status);
  const kinds = chips.filter((chip) => !CHIPS.find((item) => item.value === chip)?.status);
  return (
    (status.length === 0 || status.some((chip) => chipMatches(entry, chip))) &&
    (kinds.length === 0 || kinds.some((chip) => chipMatches(entry, chip)))
  );
}

const time = (value: string | null | undefined) => (value ? new Date(value).getTime() || 0 : 0);
const dayOf = (entry: AttendanceEntry) => entry.date.slice(0, 10);

export function sortEntries(entries: AttendanceEntry[], sort: SortBy): AttendanceEntry[] {
  const newest = (a: AttendanceEntry, b: AttendanceEntry) =>
    dayOf(b).localeCompare(dayOf(a)) || time(b.time_in) - time(a.time_in) || b.id - a.id;
  return entries.slice().sort((a, b) => {
    if (sort === "waiting") {
      const wa = awaitsReview(a);
      const wb = awaitsReview(b);
      if (wa !== wb) return wa ? -1 : 1;
      // The longest-waiting first; what is not waiting, newest first.
      return wa ? dayOf(a).localeCompare(dayOf(b)) || time(a.time_in) - time(b.time_in) || a.id - b.id : newest(a, b);
    }
    if (sort === "intern") return a.student_name.localeCompare(b.student_name) || newest(a, b);
    if (sort === "hours") return (Number(b.hours) || 0) - (Number(a.hours) || 0) || newest(a, b);
    return newest(a, b);
  });
}

export type AttendanceGroup = { key: string; label: string; entries: AttendanceEntry[]; needsReview: number };

const STATUS_GROUPS: { key: string; label: string; test: (entry: AttendanceEntry) => boolean }[] = [
  { key: "review", label: "Needs review", test: awaitsReview },
  { key: "counting", label: "Counts on its own", test: countsOnItsOwn },
  { key: "open", label: "Not finished yet", test: (entry) => entry.status === "Pending" && !awaitsReview(entry) && !countsOnItsOwn(entry) },
  { key: "verified", label: "Verified", test: (entry) => entry.status === "Verified" },
  { key: "rejected", label: "Rejected", test: (entry) => entry.status === "Rejected" || entry.status === "Flagged" },
];

/**
 * The sorted logs in groups. Groups with something to review come first;
 * then days newest first, and names A–Z. A log is in one group only: an
 * intern in two teams is under both names together.
 */
export function groupEntries(
  sorted: AttendanceEntry[],
  by: GroupBy,
  helpers: { blockOf: (studentId: string) => string | null; teamsOf: (studentId: string) => string[]; dayLabel: (day: string) => string }
): AttendanceGroup[] {
  const groups = new Map<string, AttendanceGroup>();
  const order: string[] = [];
  const keyOf = (entry: AttendanceEntry): [string, string] => {
    if (by === "status") {
      const found = STATUS_GROUPS.find((group) => group.test(entry)) ?? STATUS_GROUPS[1];
      return [found.key, found.label];
    }
    if (by === "day") return [dayOf(entry), helpers.dayLabel(dayOf(entry))];
    if (by === "intern") return [String(entry.student_id), entry.student_name];
    if (by === "team") {
      const teams = helpers.teamsOf(String(entry.student_id));
      const label = teams.length ? teams.join(" and ") : "No team";
      return [label, label];
    }
    const block = helpers.blockOf(String(entry.student_id)) || "No block";
    return [block, block];
  };
  for (const entry of sorted) {
    const [key, label] = keyOf(entry);
    let group = groups.get(key);
    if (!group) {
      group = { key, label, entries: [], needsReview: 0 };
      groups.set(key, group);
      order.push(key);
    }
    group.entries.push(entry);
    if (awaitsReview(entry)) group.needsReview += 1;
  }
  const rank = (group: AttendanceGroup) => {
    if (by === "status") return STATUS_GROUPS.findIndex((item) => item.key === group.key);
    return group.needsReview > 0 ? 0 : 1;
  };
  return order
    .map((key) => groups.get(key)!)
    .sort((a, b) => {
      const byRank = rank(a) - rank(b);
      if (byRank !== 0 || by === "status") return byRank;
      if (by === "day") return b.key.localeCompare(a.key);
      // "No team" and "No block" after the named ones.
      const none = (group: AttendanceGroup) => (group.label === "No team" || group.label === "No block" ? 1 : 0);
      return none(a) - none(b) || a.label.localeCompare(b.label);
    });
}

/** The supervisor's choice on this device, or the default. */
export function readView(supervisorId: string | undefined): AttendanceView {
  if (!supervisorId) return DEFAULT_VIEW;
  try {
    const saved = JSON.parse(localStorage.getItem(`inb_attendance_view:${supervisorId}`) || "null");
    if (!saved || typeof saved !== "object") return DEFAULT_VIEW;
    return {
      group: GROUP_OPTIONS.some((item) => item.value === saved.group) ? saved.group : DEFAULT_VIEW.group,
      sort: SORT_OPTIONS.some((item) => item.value === saved.sort) ? saved.sort : DEFAULT_VIEW.sort,
      chips: Array.isArray(saved.chips) ? saved.chips.filter((chip: unknown) => CHIPS.some((item) => item.value === chip)) : [],
    };
  } catch {
    return DEFAULT_VIEW;
  }
}

export function saveView(supervisorId: string | undefined, view: AttendanceView): void {
  if (!supervisorId) return;
  try {
    localStorage.setItem(`inb_attendance_view:${supervisorId}`, JSON.stringify(view));
  } catch {
    /* private mode: the choice lasts for this visit only */
  }
}
