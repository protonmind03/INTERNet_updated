import { useEffect, useState } from "react";
import type { BrandRole } from "./roles";

/*
| The data and settings of the loading prototypes (LoadingPrototypes.tsx),
| apart from the components so the brand preview can share them.
*/

/** The three portals: the prototypes are for after sign-in. */
export type PortalRole = Exclude<BrandRole, "guest">;

export type Prototype = "p1" | "p2" | "p3";
/** How long the role's first data takes; "fail" never arrives. */
export type Timing = "cached" | "fast" | "usual" | "slow" | "fail";

export const PROTOTYPES: { id: Prototype; name: string; idea: string; principle: string }[] = [
  {
    id: "p1",
    name: "P1 · Road to today",
    idea: "The road glyph draws itself while the first data loads, with two milestones.",
    principle: "Feedback that shows progress, not just activity",
  },
  {
    id: "p2",
    name: "P2 · Shaped skeleton",
    idea: "The first page's layout appears at once as quiet placeholders that fill in place.",
    principle: "Perceived performance through layout stability",
  },
  {
    id: "p3",
    name: "P3 · The one thing",
    idea: "A greeting and the single most useful fact for the role, then the page.",
    principle: "Recognition over recall; purpose before chrome",
  },
];

export const TIMINGS: { id: Timing; label: string; ms: number }[] = [
  { id: "cached", label: "Cached (0 s)", ms: 0 },
  { id: "fast", label: "Fast (0.4 s)", ms: 400 },
  { id: "usual", label: "Usual (1.5 s)", ms: 1500 },
  { id: "slow", label: "Slow 3G (4 s)", ms: 4000 },
  { id: "fail", label: "Fails", ms: 2500 },
];

/** The sample person and the one fact each role is shown first. */
export const SAMPLE: Record<PortalRole, { name: string; fact: string; factDetail: string }> = {
  student: { name: "Ana", fact: "You timed in at 8:02 AM.", factDetail: "312 of 486 hours verified" },
  supervisor: { name: "Mr. Reyes", fact: "3 logs wait for you.", factDetail: "The oldest since yesterday, 5:10 PM" },
  coordinator: { name: "Dr. Santos", fact: "2 students need attention.", factDetail: "No time-in for 3 working days" },
};

export function greeting(): string {
  const hour = Number(new Intl.DateTimeFormat("en-US", { hour: "numeric", hour12: false, timeZone: "Asia/Manila" }).format(new Date()));
  return hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
}

/** True when the device asks for less motion, or the preview is set to show that. */
export function useReducedMotion(forced: boolean): boolean {
  const [system, setSystem] = useState(() => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false);
  useEffect(() => {
    const query = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (!query) return;
    const change = () => setSystem(query.matches);
    query.addEventListener("change", change);
    return () => query.removeEventListener("change", change);
  }, []);
  return forced || system;
}

