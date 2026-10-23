/*
|--------------------------------------------------------------------------
| THE COORDINATOR'S HUBS
|--------------------------------------------------------------------------
|
| Roadmap 5.1. Pages about one subject live together as tabs of one page.
| Since the PSU redesign's menu review, a hub only joins pages that sit in
| the same group of the coordinator's menu (layouts/CoordinatorLayout.tsx),
| so a tab never belongs to another group than its page:
|
|   Decide   Resolution Center   Concerns · Appeals
|   People   Companies           Companies · Supervisors
|   Term     Documents           Submissions · Deliverables
|
| Evaluations, Site visits, Terms, Coordinators, Audit log and System
| status were tabs of hubs in other groups; each is its own page again,
| and its old tab address is sent there (DEPARTED). The tab is in the
| address (?tab=), and every older address redirects to its tab (MOVED),
| keeping what else it carried (?focus= from a notification, an audit
| filter), so bookmarks and stored links still work.
|
| No imports here: the backend test reads this file without the app's
| packages installed. The React context is in hubConfig.ts.
|
*/

export type HubKey = "companies" | "documents" | "resolution";

export type HubTab = { id: string; label: string };

export type Hub = {
  title: string;
  path: string;
  /** The address parameter that names the tab. */
  param: "tab";
  tabs: HubTab[];
};

export const HUBS: Record<HubKey, Hub> = {
  companies: {
    title: "Companies",
    path: "/coordinator/companies",
    param: "tab",
    tabs: [
      { id: "companies", label: "Companies" },
      { id: "supervisors", label: "Supervisors" },
    ],
  },
  documents: {
    title: "Documents",
    path: "/coordinator/documents",
    param: "tab",
    tabs: [
      { id: "submissions", label: "Submissions" },
      { id: "requirements", label: "Deliverables" },
    ],
  },
  resolution: {
    title: "Resolution Center",
    path: "/coordinator/resolution",
    param: "tab",
    tabs: [
      { id: "concerns", label: "Concerns" },
      { id: "appeals", label: "Appeals" },
    ],
  },
};

/** Where each page that moved used to be, and the tab it is now. */
export const MOVED: { from: string; hub: HubKey; tab: string }[] = [
  { from: "/coordinator/supervisors", hub: "companies", tab: "supervisors" },
  { from: "/coordinator/requirements", hub: "documents", tab: "requirements" },
  { from: "/coordinator/complaints", hub: "resolution", tab: "concerns" },
  { from: "/coordinator/appeals", hub: "resolution", tab: "appeals" },
];

/**
 * Tabs that left their hub to be pages of their own: the old tab address
 * and where it goes now. The address's other parameters go along.
 */
export const DEPARTED: { path: string; param: "tab" | "section"; value: string; to: string }[] = [
  { path: "/coordinator/resolution", param: "tab", value: "evaluations", to: "/coordinator/evaluations" },
  { path: "/coordinator/companies", param: "tab", value: "site-visits", to: "/coordinator/site-visits" },
  { path: "/coordinator/students", param: "tab", value: "terms", to: "/coordinator/terms" },
  { path: "/coordinator/students", param: "tab", value: "students", to: "/coordinator/students" },
  { path: "/coordinator/profile", param: "section", value: "coordinators", to: "/coordinator/coordinators" },
  { path: "/coordinator/profile", param: "section", value: "audit", to: "/coordinator/audit" },
  { path: "/coordinator/profile", param: "section", value: "status", to: "/coordinator/status" },
  { path: "/coordinator/profile", param: "section", value: "account", to: "/coordinator/profile" },
];

/** A departed tab's new address, with what else the old one carried; null for any other address. */
export function departedTo(pathname: string, search: string): string | null {
  const params = new URLSearchParams(search);
  const move = DEPARTED.find((item) => item.path === pathname && params.get(item.param) === item.value);
  if (!move) return null;
  params.delete(move.param);
  const rest = params.toString();
  return rest ? `${move.to}?${rest}` : move.to;
}

/** The tab an address asks for, or the hub's first. */
export function tabOf(hub: HubKey, params: URLSearchParams): string {
  const wanted = params.get(HUBS[hub].param);
  return HUBS[hub].tabs.find((tab) => tab.id === wanted)?.id ?? HUBS[hub].tabs[0].id;
}

/** A tab's address. The first tab is the hub's own address. */
export function tabPath(hub: HubKey, tab: string): string {
  const { path, param, tabs } = HUBS[hub];
  return tab === tabs[0].id ? path : `${path}?${param}=${encodeURIComponent(tab)}`;
}

/**
 * An old address's new one: the hub's address with the tab, and whatever
 * else the old one carried. Pure, so the tests can check every move.
 */
export function movedTo(from: string, search: string): string | null {
  const move = MOVED.find((item) => item.from === from);
  if (!move) return null;
  const { path, param } = HUBS[move.hub];
  const params = new URLSearchParams(search);
  params.set(param, move.tab);
  return `${path}?${params.toString()}`;
}
