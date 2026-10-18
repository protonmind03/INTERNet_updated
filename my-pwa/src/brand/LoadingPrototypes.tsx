import { useEffect, useState, type ReactNode } from "react";
import { SAMPLE, TIMINGS, greeting, type PortalRole, type Prototype, type Timing } from "./loadingPrototypeData";
import { CheckGlyph } from "./RoadGlyph";
import { BRAND, GLYPH } from "./geometry";
import { ROLE_THEMES } from "./roles";

/*
|--------------------------------------------------------------------------
| THE LOADING SCREEN AFTER SIGN-IN: THREE PROTOTYPES
|--------------------------------------------------------------------------
|
| Iteration 14 (roadmap 8.3, workstream C). Three ways to show what happens
| between "Sign in" and the first page, to be tried on a phone before one
| is chosen. They live here and in the brand preview only; none of them is
| wired into sign-in.
|
|   P1  Road to today     the road glyph draws itself while the role's first
|                         data loads, with two milestones: "Signing you in",
|                         "Getting today ready".
|   P2  Shaped skeleton   the first page's real layout at once, as quiet
|                         placeholders that fill in place. No spinner.
|   P3  The one thing     a greeting and the single most useful fact for the
|                         role ("3 logs wait for you") as soon as it is
|                         known, then the page.
|
| All three: nothing is shown when the data is already there within a
| frame (a cached start), nothing is held back once it has arrived, and
| with reduced motion nothing moves (it appears or changes in place).
|
| The data is simulated: how long it takes is chosen on the preview page.
|
*/

type Phase =
  /** The first frame: nothing is drawn yet, so a cached start shows no loader at all. */
  | "first-frame"
  | "signing-in"
  | "loading"
  | "ready"
  | "failed";

/**
 * The simulated start: the portal's code (about a third of the wait, at
 * least 150 ms unless cached), then the role's first data. `factAt` is when
 * the one fact P3 shows is known: the count arrives before the whole page.
 */
function useStart(timing: Timing, run: number): { phase: Phase; factKnown: boolean; elapsed: number; total: number } {
  const total = TIMINGS.find((item) => item.id === timing)?.ms ?? 1500;
  const [phase, setPhase] = useState<Phase>(timing === "cached" ? "ready" : "first-frame");
  const [factKnown, setFactKnown] = useState(timing === "cached");
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    // Ready before the first frame (the initial state): straight to the page.
    if (timing === "cached") return;
    const started = performance.now();
    const timers: number[] = [];
    const frame = requestAnimationFrame(() => setPhase((current) => (current === "first-frame" ? "signing-in" : current)));
    const codeDone = Math.max(150, Math.round(total * 0.35));
    timers.push(window.setTimeout(() => setPhase("loading"), codeDone));
    timers.push(window.setTimeout(() => setFactKnown(timing !== "fail"), Math.round(codeDone + (total - codeDone) * 0.4)));
    timers.push(window.setTimeout(() => setPhase(timing === "fail" ? "failed" : "ready"), total));
    const tick = window.setInterval(() => setElapsed(performance.now() - started), 50);
    timers.push(window.setTimeout(() => window.clearInterval(tick), total + 50));
    return () => {
      cancelAnimationFrame(frame);
      for (const timer of timers) window.clearTimeout(timer);
      window.clearInterval(tick);
    };
  }, [timing, run, total]);

  return { phase, factKnown, elapsed, total };
}

/*
| THE FIRST PAGE, as each role sees it once loaded. P2 draws the same boxes
| empty first, so nothing moves when the words arrive.
*/

type Block = { key: string; label: string; value: string; detail?: string; tone?: "accent" | "plain" };

const FIRST_PAGE: Record<PortalRole, { title: string; tiles: Block[]; list: { title: string; rows: string[] } }> = {
  student: {
    title: "Today",
    tiles: [
      { key: "in", label: "Time in", value: "8:02 AM", detail: "Camera check passed", tone: "accent" },
      { key: "hours", label: "Hours verified", value: "312 of 486", detail: "64% of the way" },
    ],
    list: { title: "Tasks due this week", rows: ["File the October delivery receipts", "Update the supplier list", "Weekly report, week of Oct 12"] },
  },
  supervisor: {
    title: "Review",
    tiles: [
      { key: "logs", label: "Logs to verify", value: "3", detail: "Oldest since yesterday", tone: "accent" },
      { key: "tasks", label: "Tasks to review", value: "1", detail: "Submitted this morning" },
    ],
    list: { title: "Waiting longest", rows: ["Ana Cruz · Log for Oct 17", "Ben Lim · Log for Oct 17", "Ana Cruz · Weekly report"] },
  },
  coordinator: {
    title: "Dashboard",
    tiles: [
      { key: "attention", label: "Need attention", value: "2", detail: "No time-in for 3 days", tone: "accent" },
      { key: "active", label: "Active students", value: "128", detail: "In 14 companies" },
    ],
    list: { title: "Recent concerns", rows: ["Late supervisor sign-off · BSIT 4A", "Schedule change request · BSCS 4B", "Missing MOA · Northwind Trading"] },
  },
};

/** The page: real content, or (P2) the same boxes empty. */
function FirstPage({ role, empty, calm }: { role: PortalRole; empty: boolean; calm: boolean }) {
  const page = FIRST_PAGE[role];
  const t = ROLE_THEMES[role];
  // A placeholder: the box the words will fill, shimmering only when motion is allowed.
  const bar = (width: string, height = "0.85rem") => (
    <span aria-hidden="true" className={`block rounded ${calm ? "" : "inb-proto-shimmer"} bg-slate-200`} style={{ width, height }} />
  );
  return (
    <div className="flex h-full flex-col bg-slate-50" aria-busy={empty || undefined}>
      <div className="px-4 pb-3 pt-4" style={{ background: t.surface === "dark" ? t.colors.surface : "#FFFFFF" }}>
        <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: t.surface === "dark" ? t.colors.muted : "#64748B" }}>
          {t.portal}
        </p>
        <h3 className="mt-0.5 text-lg font-bold" style={{ color: t.surface === "dark" ? "#FFFFFF" : BRAND.ink }}>
          {page.title}
        </h3>
      </div>
      <div className="grid grid-cols-2 gap-2.5 p-3">
        {page.tiles.map((tile) => (
          <div key={tile.key} className="h-[88px] rounded-xl bg-white p-3 ring-1 ring-slate-200">
            {empty ? (
              <div className="flex flex-col gap-2">
                {bar("60%", "0.7rem")}
                {bar("45%", "1.3rem")}
                {bar("75%", "0.7rem")}
              </div>
            ) : (
              <>
                <p className="text-[11.5px] text-slate-600">{tile.label}</p>
                <p className={`mt-0.5 text-xl font-bold ${tile.tone === "accent" ? "text-psu-800" : "text-slate-900"}`}>{tile.value}</p>
                {tile.detail && <p className="mt-0.5 truncate text-[11.5px] text-slate-600">{tile.detail}</p>}
              </>
            )}
          </div>
        ))}
      </div>
      <div className="mx-3 rounded-xl bg-white p-3 ring-1 ring-slate-200">
        {empty ? bar("50%", "0.8rem") : <p className="text-sm font-semibold text-slate-900">{page.list.title}</p>}
        <ul className="mt-2 divide-y divide-slate-100">
          {page.list.rows.map((row) => (
            <li key={row} className="flex h-11 items-center">
              {empty ? bar(`${55 + (row.length % 30)}%`) : <span className="truncate text-[13.5px] text-slate-800">{row}</span>}
            </li>
          ))}
        </ul>
      </div>
      {empty && <span className="sr-only">Loading {page.title}</span>}
    </div>
  );
}

/** What all three show when the data does not arrive. */
function Failed({ role, onRetry }: { role: PortalRole; onRetry: () => void }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 bg-slate-50 px-8 text-center" role="alert">
      <p className="text-base font-semibold text-slate-900">Today could not be loaded.</p>
      <p className="text-sm text-slate-600">
        Check the connection and try again. What was kept on this phone is still in the {ROLE_THEMES[role].portal.toLowerCase()}.
      </p>
      <button type="button" onClick={onRetry} className="mt-1 h-11 rounded-lg bg-psu-700 px-5 text-sm font-semibold text-white">
        Try again
      </button>
    </div>
  );
}

/*
| P1 · ROAD TO TODAY
*/

function RoadToToday({ role, phase, calm, elapsed, total }: { role: PortalRole; phase: Phase; calm: boolean; elapsed: number; total: number }) {
  const t = ROLE_THEMES[role];
  const dark = t.surface === "dark";
  const fg = dark ? "#FFFFFF" : BRAND.navy;
  // How much of the road is paved: half by the end of signing in, then on
  // toward nine tenths while the data comes, and the rest when it lands.
  const signed = phase === "loading" || phase === "ready";
  const paved = phase === "ready" ? 100 : signed ? Math.min(90, 50 + (elapsed / Math.max(total, 1)) * 45) : Math.min(50, (elapsed / Math.max(total * 0.35, 150)) * 50);
  const steps = [
    { label: "Signing you in", done: signed },
    { label: role === "coordinator" ? "Getting the programme ready" : "Getting today ready", done: phase === "ready" },
  ];
  return (
    <div
      className="flex h-full flex-col items-center justify-center gap-8 px-8"
      style={{ background: dark ? `radial-gradient(120% 70% at 50% 35%, ${t.colors.surfaceRaised} 0%, ${t.colors.surface} 65%)` : "#F8FAFC" }}
      role="status"
      aria-live="polite"
    >
      <svg width="132" height="138" viewBox={GLYPH.road.viewBox} aria-hidden="true" style={{ color: fg }}>
        <polyline points="158,-72 214,-588 590,-72 646,-588" fill="none" stroke="currentColor" strokeOpacity=".16" strokeWidth="184" strokeLinecap="round" strokeLinejoin="round" />
        <polyline
          points="158,-72 214,-588 590,-72 646,-588"
          pathLength={100}
          fill="none"
          stroke={dark ? BRAND.amber : BRAND.navy}
          strokeWidth="184"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray="100 100"
          // With reduced motion the road is shown whole; the words carry the progress.
          strokeDashoffset={calm ? 0 : 100 - paved}
          style={{ transition: calm ? "none" : "stroke-dashoffset 300ms ease-out" }}
        />
      </svg>
      <ol className="flex w-full max-w-[15rem] flex-col gap-3">
        {steps.map((step, index) => {
          const current = !step.done && (index === 0 || steps[index - 1].done);
          return (
            <li key={step.label} className="flex items-center gap-3 text-[15px]" style={{ color: dark ? (step.done || current ? "#FFFFFF" : t.colors.muted) : step.done || current ? BRAND.ink : "#64748B" }}>
              <span className="grid h-6 w-6 shrink-0 place-items-center">
                {step.done ? (
                  <CheckGlyph size={22} color={dark ? BRAND.amber : "#15803D"} />
                ) : (
                  <span className={`h-2.5 w-2.5 rounded-full ${current && !calm ? "inb-proto-pulse" : ""}`} style={{ background: current ? (dark ? BRAND.amber : BRAND.navy) : dark ? "rgba(255,255,255,.25)" : "#CBD5E1" }} />
                )}
              </span>
              <span className={step.done ? "" : current ? "font-semibold" : ""}>{step.label}</span>
              <span className="sr-only">{step.done ? " (done)" : current ? " (now)" : ""}</span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/*
| P3 · THE ONE THING
*/

function OneThing({ role, factKnown, calm }: { role: PortalRole; factKnown: boolean; calm: boolean }) {
  const t = ROLE_THEMES[role];
  const dark = t.surface === "dark";
  const sample = SAMPLE[role];
  return (
    <div
      className="flex h-full flex-col justify-center gap-3 px-8"
      style={{ background: dark ? t.colors.surface : "#F8FAFC" }}
      role="status"
      aria-live="polite"
    >
      <p className="text-[15px]" style={{ color: dark ? t.colors.muted : "#475569" }}>
        {greeting()}, {sample.name}.
      </p>
      {/* The fact's line is kept from the start, so it does not push anything when it arrives. */}
      <div className="min-h-[5.5rem]">
        {factKnown ? (
          <div className={calm ? "" : "inb-proto-rise"}>
            <p className="text-[26px] font-bold leading-tight" style={{ color: dark ? "#FFFFFF" : BRAND.ink }}>
              {sample.fact}
            </p>
            <p className="mt-1.5 text-sm" style={{ color: dark ? t.colors.muted : "#475569" }}>
              {sample.factDetail}
            </p>
          </div>
        ) : (
          <p className="text-[26px] font-bold leading-tight" style={{ color: dark ? "rgba(255,255,255,.35)" : "#CBD5E1" }} aria-hidden="true">
            …
          </p>
        )}
      </div>
    </div>
  );
}

/** One prototype in a phone-sized frame, from sign-in to the first page. */
export function PrototypeRun({
  prototype,
  role,
  timing,
  run,
  calm,
  onRetry,
}: {
  prototype: Prototype;
  role: PortalRole;
  timing: Timing;
  run: number;
  calm: boolean;
  onRetry: () => void;
}) {
  const { phase, factKnown, elapsed, total } = useStart(timing, run);
  // P3 keeps its fact on screen a moment after the page is ready only when the page
  // is not ready yet: it never holds the page back.
  const shown: ReactNode =
    phase === "first-frame" ? null : phase === "failed" ? (
      <Failed role={role} onRetry={onRetry} />
    ) : phase === "ready" ? (
      <div className={calm ? "h-full" : "inb-proto-fade h-full"}>
        <FirstPage role={role} empty={false} calm={calm} />
      </div>
    ) : prototype === "p1" ? (
      <RoadToToday role={role} phase={phase} calm={calm} elapsed={elapsed} total={total} />
    ) : prototype === "p2" ? (
      <FirstPage role={role} empty calm={calm} />
    ) : (
      <OneThing role={role} factKnown={factKnown} calm={calm} />
    );
  return <div className="h-full w-full">{shown}</div>;
}

