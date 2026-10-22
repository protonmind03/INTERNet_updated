import type { ReactNode } from "react";

/*
|--------------------------------------------------------------------------
| ONE MOTIF PER ROLE (PSU redesign, Section 13.4)
|--------------------------------------------------------------------------
|
| Each portal borrows one real object and shows it in one or two places,
| never everywhere:
|
|   Trainee      a time card: the day's punch row under a tear line, the
|                lane-dash strip under the header, OJT hours as a road
|   Supervisor   a logbook: today's register, underlined tabs, the grey
|                "Verified" rubber stamp
|   Coordinator  a route map: the cohort as a transit line on grid paper,
|                "Needs you" as a departures board, a split fact card
|
| These are drawings only; the pages give them real data. The CSS is in
| brand.css ("PSU redesign").
|
*/

/* ---------- Shared: the stamp ---------- */

export type StampTone = "good" | "grey" | "bad" | "info";

/** A word in a 2 px border, turned a little, in a status colour ("On time", "Verified"). */
export function Stamp({ children, tone = "good", tilt = false }: { children: ReactNode; tone?: StampTone; tilt?: boolean }) {
  return <span className={`inb-stamp inb-stamp--${tone} ${tilt ? "inb-stamp--tilt" : ""}`}>{children}</span>;
}

/* ---------- Trainee ---------- */

/** The yellow lane dashes along the bottom of the trainee's header. */
export function LaneDash() {
  return <div aria-hidden="true" className="lane-dash" />;
}

export type Punch = { label: string; time: string | null };

/** The day's punch row: In, Lunch, Back, Out, with "--:--" for a step not done. */
export function PunchRow({ punches }: { punches: Punch[] }) {
  return (
    <div className="punch-row" role="list" aria-label="Today's punches">
      {punches.map((punch) => (
        <div key={punch.label} role="listitem">
          <span className="punch-label">{punch.label}</span>
          <span className="punch-time" data-empty={punch.time ? undefined : ""}>
            {punch.time ?? "--:--"}
            {!punch.time && <span className="sr-only"> not yet</span>}
          </span>
        </div>
      ))}
    </div>
  );
}

/** The dashed tear line with half-circle notches between the card's top and its punch row. */
export function TearLine() {
  return <div aria-hidden="true" className="time-card-tear" />;
}

/**
 * OJT hours as a road: verified hours paved, a pin where they stand, a flag
 * at the requirement. Labels under it are the caller's.
 */
export function HoursRoad({ done, required, label }: { done: number; required: number; label: string }) {
  const share = required > 0 ? Math.max(0, Math.min(1, done / required)) : 0;
  return (
    <div className="hours-road" role="img" aria-label={label}>
      <div className="hours-road-done" style={{ width: `${share * 100}%` }} />
      <div className="hours-road-lane" />
      <svg className="hours-road-pin" style={{ left: `${Math.max(3, Math.min(97, share * 100))}%` }} width="22" height="28" viewBox="0 0 22 28" aria-hidden="true">
        <path d="M11 27C11 27 2 16.5 2 10.5a9 9 0 0 1 18 0C20 16.5 11 27 11 27Z" fill="currentColor" stroke="#FFFFFF" strokeWidth="2" />
        <circle cx="11" cy="10.5" r="3.2" fill="#FFFFFF" />
      </svg>
      <svg className="hours-road-flag" width="18" height="22" viewBox="0 0 18 22" aria-hidden="true">
        <path d="M2 21V2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <path d="M3 2h13v9H3z" fill="#FFFFFF" stroke="currentColor" strokeWidth="1.5" />
        <path d="M3 2h4.3v3H3zM11.6 2H16v3h-4.4zM7.3 5h4.3v3H7.3zM3 8h4.3v3H3zM11.6 8H16v3h-4.4z" fill="currentColor" />
      </svg>
    </div>
  );
}

/* ---------- Supervisor ---------- */

export type RegisterEntry = { key: string; initials: string; name: string; time: string | null };

/** Today's register: initials over time-in times, "—" in red for anyone not in yet. */
export function Register({ entries }: { entries: RegisterEntry[] }) {
  return (
    <div className="register" role="list" aria-label="Today's register">
      {entries.map((entry) => (
        <div key={entry.key} role="listitem" className={entry.time ? "" : "register-out"} aria-label={`${entry.name}: ${entry.time ? `in at ${entry.time}` : "not in yet"}`}>
          <span className="register-who" aria-hidden="true">
            {entry.initials}
          </span>
          <span className="register-time" aria-hidden="true">
            {entry.time ?? "—"}
          </span>
        </div>
      ))}
    </div>
  );
}

export type UnderlineTab<T extends string> = { value: T; label: string; count?: number };

/** Tabs drawn as underlined words, not pills (the supervisor's motif). */
export function UnderlineTabs<T extends string>({
  tabs,
  value,
  onChange,
  label,
}: {
  tabs: readonly UnderlineTab<T>[];
  value: T;
  onChange: (value: T) => void;
  label: string;
}) {
  return (
    <div role="tablist" aria-label={label} className="u-tabs">
      {tabs.map((tab) => (
        <button
          key={tab.value}
          type="button"
          role="tab"
          aria-selected={tab.value === value}
          onClick={() => onChange(tab.value)}
          className="u-tab"
        >
          {tab.label}
          {tab.count !== undefined && <span className="u-tab-count">{tab.count}</span>}
        </button>
      ))}
    </div>
  );
}

/* ---------- Coordinator ---------- */

export type Station = { key: string; initials: string; name: string; hours: number; state: "behind" | "on-the-way" | "almost-done" };

/**
 * The cohort as a transit line: each station is a trainee at their verified
 * hours, ringed red (behind), navy (on the way) or green (almost done). Only
 * a sample of stations is drawn, spread along the line; the counts are the
 * caller's text.
 */
export function RouteLine({ stations, required, onOpen }: { stations: Station[]; required: number; onOpen?: (key: string) => void }) {
  return (
    <div className="route-line" role="list" aria-label="Trainees along the required hours">
      <div className="route-line-track" aria-hidden="true" />
      {stations.map((station) => {
        const share = required > 0 ? Math.max(0, Math.min(1, station.hours / required)) : 0;
        const ring = station.state === "behind" ? "route-station--behind" : station.state === "almost-done" ? "route-station--done" : "";
        const words = station.state === "behind" ? "behind" : station.state === "almost-done" ? "almost done" : "on the way";
        const style = { left: `calc(16px + (100% - 32px) * ${share})` };
        const name = `${station.name}, ${Math.round(station.hours)} of ${required} hours, ${words}`;
        return onOpen ? (
          <button key={station.key} type="button" role="listitem" aria-label={name} className={`route-station ${ring}`} style={style} onClick={() => onOpen(station.key)}>
            <span aria-hidden="true">{station.initials}</span>
          </button>
        ) : (
          <span key={station.key} role="listitem" aria-label={name} className={`route-station ${ring}`} style={style}>
            <span aria-hidden="true">{station.initials}</span>
          </span>
        );
      })}
    </div>
  );
}

/** One row of the departures board: a code column, the title and its line, and an action. */
export function DeparturesRow({ code, title, detail, age, action, first = false }: { code: string; title: string; detail?: string; age?: string; action: ReactNode; first?: boolean }) {
  return (
    <div className={`departures-row ${first ? "departures-row--first" : ""}`}>
      <span className="departures-code">{code}</span>
      <span className="min-w-0">
        <span className="block truncate text-[14.5px] font-semibold text-slate-900">{title}</span>
        {(detail || age) && (
          <span className="block truncate text-[12.5px] text-slate-600">{[detail, age].filter(Boolean).join(" · ")}</span>
        )}
      </span>
      <span className="shrink-0">{action}</span>
    </div>
  );
}

/** Figures side by side in one card, split by hairlines instead of boxed tiles. */
export function SplitFacts({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`split-facts card-hairline rounded-2xl ${className}`}>{children}</div>;
}
