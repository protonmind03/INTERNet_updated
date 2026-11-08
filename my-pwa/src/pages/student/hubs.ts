import type { IconName } from "../../components/Icon";
import { currentEntry } from "../../lib/navMatch";

/*
|--------------------------------------------------------------------------
| THE TRAINEE'S FOLDERS (revisions, November 2026)
|--------------------------------------------------------------------------
|
| The trainee's pages are grouped into four folders, each drawn like the
| coordinator's student record (pages/student/StudentFolder.tsx): the
| folder's name on its label tab, its parts as tabs on the rim, the open
| part inside.
|
|   Attendance   Days · Schedule · My progress · Time record
|   Tasks        Tasks · Documents · Completion
|   Reports      Daily · Weekly · Monthly · Narrative
|   Support      Messages · Announcements · Resolution Center
|
| Revised again (change1108): Reports left Tasks to become a folder of its
| own, so Daily, Weekly and Monthly are the folder's tabs instead of tabs
| inside a tab. Tasks is the work given to the trainee; Reports is what the
| trainee writes.
|
| Every part keeps its own address, so old links, notifications and Back
| still work; the folder only groups them. The side menu and the phone's
| dock list only the folders (Today, Attendance, Tasks, Reports, Support):
| a folder's parts are its tabs, never repeated in a menu.
|
*/

export type HubTab = {
  label: string;
  /** Where the tab goes; a query names a view of that page (/schedule?view=progress). */
  path: string;
  icon: IconName;
  /** A shorter name for the phone's row of tabs, when the name is long. */
  short?: string;
  /** One line about what this part is for, under the folder's name. */
  blurb: string;
};

export type HubId = "attendance" | "tasks" | "reports" | "support";

export type Hub = {
  id: HubId;
  label: string;
  icon: IconName;
  tabs: HubTab[];
  /** Addresses that belong to the folder without a tab of their own. */
  also?: string[];
};

export const HUBS: Hub[] = [
  {
    id: "attendance",
    label: "Attendance",
    icon: "clock",
    tabs: [
      { label: "Days", path: "/daily-log", icon: "clock", blurb: "Each day you timed in, and what to fix" },
      { label: "Schedule", path: "/schedule", icon: "calendar", blurb: "Your OJT days by week or month" },
      { label: "My progress", path: "/schedule?view=progress", icon: "trend-up", blurb: "Your hours, milestones and pace" },
      { label: "Time record", path: "/time-record", icon: "printer", blurb: "Your Daily Time Record (CS Form 48), ready to print" },
    ],
  },
  {
    id: "tasks",
    label: "Tasks",
    icon: "tasks",
    tabs: [
      { label: "Tasks", path: "/task", icon: "tasks", blurb: "Work assigned by your supervisor" },
      { label: "Documents", path: "/documents", icon: "document", blurb: "Requirements to upload and their review" },
      { label: "Completion", path: "/student/completion", icon: "check-circle", blurb: "What is left before your OJT is done" },
    ],
  },
  {
    id: "reports",
    label: "Reports",
    icon: "note",
    tabs: [
      { label: "Daily", path: "/journal", icon: "calendar", blurb: "A report for each day, with events and photos" },
      { label: "Weekly", path: "/journal?view=weekly", icon: "note", blurb: "Your weekly report, reviewed by your supervisor" },
      { label: "Monthly", path: "/journal?view=monthly", icon: "chart", blurb: "Your month, put together, in your own words" },
      { label: "Narrative", path: "/student/narrative", icon: "book", blurb: "Your Narrative Report on Internship Training" },
    ],
  },
  {
    id: "support",
    label: "Support",
    icon: "chat",
    tabs: [
      { label: "Messages", path: "/messages", icon: "chat", blurb: "Your conversations" },
      { label: "Announcements", path: "/announcements", icon: "megaphone", blurb: "From your coordinator and supervisor" },
      { label: "Resolution Center", short: "Resolution", path: "/student/resolution", icon: "flag", blurb: "Concerns, feedback and your internship evaluation" },
    ],
    also: ["/student/feedback"],
  },
];

/** The folder an address belongs to, and which of its tabs is open; null outside the folders. */
export function hubFor(pathname: string, search: string): { hub: Hub; tab: HubTab | null } | null {
  for (const hub of HUBS) {
    const key = currentEntry(
      hub.tabs.map((tab) => ({ key: tab.path, path: tab.path })),
      pathname,
      search
    );
    if (key) return { hub, tab: hub.tabs.find((tab) => tab.path === key) ?? null };
    if ((hub.also ?? []).some((path) => pathname === path)) return { hub, tab: null };
  }
  return null;
}

/** Every address of a folder except its first tab's, for the menus' "this is current too". */
export function hubAddresses(id: HubId): string[] {
  const hub = HUBS.find((item) => item.id === id);
  if (!hub) return [];
  return [...hub.tabs.slice(1).map((tab) => tab.path.split("?")[0]), ...(hub.also ?? [])];
}
