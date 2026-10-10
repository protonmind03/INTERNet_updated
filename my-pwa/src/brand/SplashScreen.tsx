import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import BrandIcon from "./BrandIcon";
import Wordmark from "./Wordmark";
import { CheckGlyph } from "./RoadGlyph";
import { BRAND } from "./geometry";
import { ROLE_THEMES, getActiveRole } from "./roles";
import type { BrandRole } from "./roles";

type SplashScreenProps = {
  role: BrandRole;
  /** 0–100. When omitted the splash advances through the role's launch steps by itself. */
  progress?: number;
  /** Plays the exit (fade + slight zoom). */
  leaving?: boolean;
};

/** Decorative road that crosses the background — the OJT journey, lanes flowing. */
function BackgroundRoad({ color, lane }: { color: string; lane: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 400 800" preserveAspectRatio="xMidYMid slice" className="pointer-events-none absolute inset-0 h-full w-full">
      <path d="M-40 820 C 80 640, 40 520, 170 430 S 380 300, 330 120 S 300 -20, 440 -60" fill="none" stroke={color} strokeWidth="70" strokeLinecap="round" />
      <path className="inb-bg-lane" d="M-40 820 C 80 640, 40 520, 170 430 S 380 300, 330 120 S 300 -20, 440 -60" fill="none" stroke={lane} strokeWidth="6" strokeDasharray="130 90" strokeLinecap="round" />
    </svg>
  );
}

/** Prelaunch screen: the mark tells its story while INTERNet loads what this role needs. */
export function SplashScreen({ role, progress, leaving = false }: SplashScreenProps) {
  const t = ROLE_THEMES[role];
  const dark = t.surface === "dark";
  const steps = t.launchSteps;
  const [auto, setAuto] = useState(0);

  useEffect(() => {
    if (progress !== undefined) return;
    const id = window.setInterval(() => setAuto((p) => Math.min(p + 3, 100)), 60);
    return () => window.clearInterval(id);
  }, [progress]);

  const pct = Math.round(progress ?? auto);
  const stage = pct >= 100 ? steps.length : Math.floor((pct / 100) * steps.length);
  // Local edit: one steady line while the steps fill in below it. A sentence
  // that changed with every step was gone before anyone could read it.
  const msg = stage >= steps.length ? "You’re all set." : `Opening your ${t.portal.toLowerCase()}…`;
  const bg = dark ? t.colors.surface : "#F8FAFC";
  const accent = dark ? BRAND.amber : t.colors.accent;

  return (
    <div
      className={`fixed inset-0 z-[100] flex flex-col justify-between overflow-hidden px-7 pb-9 pt-16 ${leaving ? "inb-fade-out" : ""}`}
      style={{ background: dark ? `radial-gradient(120% 70% at 50% 32%, ${t.colors.surfaceRaised} 0%, ${bg} 62%)` : `radial-gradient(120% 70% at 50% 32%, #FFFFFF 0%, ${bg} 62%)` }}
      role="status"
      aria-live="polite"
      aria-label={`Loading INTERNet ${t.portal}`}
    >
      <div className="absolute inset-0 opacity-[0.07]">
        <BackgroundRoad color={dark ? "#FFFFFF" : BRAND.navy} lane={dark ? BRAND.navy : "#FFFFFF"} />
      </div>
      <div />
      <div className="relative mx-auto flex flex-col items-center gap-7 text-center">
        <span className="inb-pop inb-tile-sheen" style={{ display: "inline-flex", borderRadius: "22.5%", boxShadow: dark ? "0 24px 48px -16px rgba(0,0,0,.55)" : "0 24px 48px -18px rgba(26,35,126,.45)" }}>
          <BrandIcon size={132} tile={dark ? t.colors.surfaceRaised : BRAND.navy} animated />
        </span>
        <div className="flex flex-col items-center gap-3.5">
          <Wordmark height={40} tone={dark ? "onDark" : "onLight"} reveal />
          <span className="inb-fade-up inline-flex h-7 items-center rounded-full px-3 text-xs font-semibold" style={{ background: t.colors.tagBg, color: t.colors.tagText, animationDelay: "0.75s" }}>
            {t.portal}
          </span>
          <p className="inb-fade-up max-w-xs text-[15px] font-medium leading-snug" style={{ color: t.colors.muted, animationDelay: "0.85s" }}>
            {t.tagline}
          </p>
        </div>
      </div>
      <div className="inb-fade-up relative mx-auto flex w-full max-w-sm flex-col gap-4" style={{ animationDelay: "0.95s" }}>
        <ul className="flex flex-wrap justify-center gap-2">
          {steps.map((s, i) => {
            const done = i < stage;
            const active = i === stage;
            const style = done
              ? { background: t.colors.accent, color: t.colors.accentText }
              : active
                ? { background: t.colors.tagBg, color: dark ? BRAND.amber : t.colors.tagText, boxShadow: `inset 0 0 0 1.5px ${accent}` }
                : { background: dark ? "rgba(255,255,255,.07)" : "#E2E8F0", color: dark ? "#9AA3E0" : "#64748B" };
            return (
              <li key={s.label} className="inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-semibold transition-colors duration-200" style={style}>
                {done && <CheckGlyph size={13} />}
                {active && <span className="inb-live h-1.5 w-1.5 rounded-full" style={{ background: "currentColor" }} aria-hidden="true" />}
                {s.label}
              </li>
            );
          })}
        </ul>
        <div className="h-1.5 overflow-hidden rounded-full" style={{ background: dark ? "rgba(255,255,255,.14)" : "#E2E8F0" }}>
          <div className="inb-sheen h-full rounded-full transition-[width] duration-150" style={{ width: `${pct}%`, background: accent }} />
        </div>
        <p className="text-center text-xs font-medium" style={{ color: t.colors.muted }}>
          {msg}
        </p>
        <p className="pt-2 text-center text-xs" style={{ color: dark ? "#9AA3E0" : "#64748B" }}>
          Pangasinan State University · Lingayen Campus
        </p>
      </div>
    </div>
  );
}

type LaunchGateProps = {
  children: ReactNode;
  /** Longest the splash stays up when no page reports that it is ready, ms. */
  minDuration?: number;
  /** Show only once per browser session (sessionStorage). */
  oncePerSession?: boolean;
};

/**
 * Wrap <App /> with this in main.tsx. Shows the role-aware splash on a cold start, then fades into the app.
 * Pages can end it early: window.dispatchEvent(new Event("inb:ready")).
 *
 * Local edit: the landing pages now send "inb:ready" once their first data is
 * in (lib/launch.ts), so the wait is as long as the load. minDuration is the
 * fallback for pages that never send it (the login page), lowered from 2300.
 * A ready signal that arrives almost at once is held to MIN_VISIBLE so the
 * screen does not flash.
 */
const MIN_VISIBLE = 450;

export function LaunchGate({ children, minDuration = 1200, oncePerSession = true }: LaunchGateProps) {
  const reduce = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const seen = (() => {
    try {
      return oncePerSession && sessionStorage.getItem("inb_splash_seen") === "1";
    } catch {
      return false;
    }
  })();
  const [phase, setPhase] = useState<"show" | "leave" | "done">(seen ? "done" : "show");
  const [role] = useState<BrandRole>(getActiveRole);

  useEffect(() => {
    if (phase !== "show") return;
    const shownAt = performance.now();
    let early = 0;
    const finish = () => setPhase("leave");
    const ready = () => {
      window.clearTimeout(early);
      early = window.setTimeout(finish, Math.max(0, MIN_VISIBLE - (performance.now() - shownAt)));
    };
    const timer = window.setTimeout(finish, reduce ? 500 : minDuration);
    window.addEventListener("inb:ready", ready);
    return () => {
      window.clearTimeout(timer);
      window.clearTimeout(early);
      window.removeEventListener("inb:ready", ready);
    };
  }, [phase, minDuration, reduce]);

  useEffect(() => {
    if (phase !== "leave") return;
    try {
      sessionStorage.setItem("inb_splash_seen", "1");
    } catch {
      /* private mode: show again next time */
    }
    const timer = window.setTimeout(() => setPhase("done"), 330);
    return () => window.clearTimeout(timer);
  }, [phase]);

  return (
    <>
      {children}
      {phase !== "done" && <SplashScreen role={role} leaving={phase === "leave"} progress={phase === "leave" ? 100 : undefined} />}
    </>
  );
}

export default SplashScreen;
