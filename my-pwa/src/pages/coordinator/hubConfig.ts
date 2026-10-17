import { createContext, useContext } from "react";

/*
|--------------------------------------------------------------------------
| THE COORDINATOR'S HUBS
|--------------------------------------------------------------------------
|
| Roadmap 5.1. Pages about one subject live together as tabs of one page:
|
|   Companies         Companies · Supervisors · Site visits
|   Documents         Submissions · Requirements
|   Students          Students · Terms (with the term switcher)
|   Resolution Center Concerns · Evaluations · Appeals (icon left of the bell)
|   Profile settings  Account · Coordinators · Audit log · What is switched on
|                     (a section list on the left, from the avatar)
|
| Each tab is the old page, unchanged, drawn inside the hub (CoordinatorHub
| puts it there; the layout draws the tabs). The tab is in the address
| (?tab=, or ?section= for Profile settings), and every old address
| redirects to its tab, keeping what else it carried (?focus= from a
| notification, an audit filter), so bookmarks and stored links still work.
|
*/

export type HubKey = "companies" | "documents" | "students" | "resolution" | "settings";

export type HubTab = { id: string; label: string };

export type Hub = {
  title: string;
  path: string;
  /** The address parameter that names the tab. */
  param: "tab" | "section";
  /** Tabs across the top, or a list of sections on the left. */
  kind: "tabs" | "sections";
  tabs: HubTab[];
};

export const HUBS: Record<HubKey, Hub> = {
  companies: {
    title: "Companies",
    path: "/coordinator/companies",
    param: "tab",
    kind: "tabs",
    tabs: [
      { id: "companies", label: "Companies" },
      { id: "supervisors", label: "Supervisors" },
      { id: "site-visits", label: "Site visits" },
    ],
  },
  documents: {
    title: "Documents",
    path: "/coordinator/documents",
    param: "tab",
    kind: "tabs",
    tabs: [
      { id: "submissions", label: "Submissions" },
      { id: "requirements", label: "Requirements" },
    ],
  },
  students: {
    title: "Students",
    path: "/coordinator/students",
    param: "tab",
    kind: "tabs",
    tabs: [
      { id: "students", label: "Students" },
      { id: "terms", label: "Terms" },
    ],
  },
  resolution: {
    title: "Resolution Center",
    path: "/coordinator/resolution",
    param: "tab",
    kind: "tabs",
    tabs: [
      { id: "concerns", label: "Concerns" },
      { id: "evaluations", label: "Evaluations" },
      { id: "appeals", label: "Appeals" },
    ],
  },
  settings: {
    title: "Profile settings",
    path: "/coordinator/profile",
    param: "section",
    kind: "sections",
    tabs: [
      { id: "account", label: "Account" },
      { id: "coordinators", label: "Coordinators" },
      { id: "audit", label: "Audit log" },
      { id: "status", label: "What is switched on" },
    ],
  },
};

/** Where each page that moved used to be, and the tab it is now. */
export const MOVED: { from: string; hub: HubKey; tab: string }[] = [
  { from: "/coordinator/supervisors", hub: "companies", tab: "supervisors" },
  { from: "/coordinator/site-visits", hub: "companies", tab: "site-visits" },
  { from: "/coordinator/requirements", hub: "documents", tab: "requirements" },
  { from: "/coordinator/terms", hub: "students", tab: "terms" },
  { from: "/coordinator/complaints", hub: "resolution", tab: "concerns" },
  { from: "/coordinator/evaluations", hub: "resolution", tab: "evaluations" },
  { from: "/coordinator/appeals", hub: "resolution", tab: "appeals" },
  { from: "/coordinator/coordinators", hub: "settings", tab: "coordinators" },
  { from: "/coordinator/audit", hub: "settings", tab: "audit" },
];

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

export const HubContext = createContext<{ hub: HubKey; tab: string } | null>(null);

/** The hub the page is drawn in, if any. */
export const useHub = () => useContext(HubContext);
