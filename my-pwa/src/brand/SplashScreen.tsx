import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import BrandIcon from "./BrandIcon";
import Wordmark from "./Wordmark";
import { BRAND } from "./geometry";
import { ROLE_THEMES, getActiveRole } from "./roles";
import type { BrandRole } from "./roles";

type SplashScreenProps = {
  role: BrandRole;
  /** 0–100. When omitted the splash advances through the role's launch steps on its own. */
  progress?: number;
  /** Fades the splash out. */
  leaving?: boolean;
};

/** Prelaunch screen. Shows the animated mark and walks through what INTERNet is loading for this role. */
export function SplashScreen({ role, progress, leaving = false }: SplashScreenProps) {
  const t = ROLE_THEMES[role];
  const dark = t.surface === "dark";
  const steps = t.launchSteps;
  const [auto, setAuto] = useState(0);

  useEffect(() => {
    if (progress !== undefined) return;
    const id = window.setInterval(() => setAuto((p) => Math.min(p + 4, 100)), 60);
    return () => window.clearInterval(id);
  }, [progress]);

  const pct = Math.round(progress ?? auto);
  const stage = pct >= 100 ? steps.length : Math.floor((pct / 100) * steps.length);
  const msg = stage >= steps.length ? "You’re all set." : steps[stage].message;

  return (
    <div
      className={`fixed inset-0 z-[100] flex flex-col justify-between px-7 pb-9 pt-16 ${leaving ? "inb-fade-out" : ""}`}
      style={{ background: dark ? t.colors.surface : "#F8FAFC" }}
      role="status"
      aria-live="polite"
      aria-label={`Loading INTERNet ${t.portal}`}
    >
      <div />
      <div className="inb-fade-up mx-auto flex flex-col items-center gap-6 text-center">
        <BrandIcon size={128} tile={dark ? t.colors.surfaceRaised : BRAND.navy} animated />
        <div className="flex flex-col items-center gap-3">
          <Wordmark height={40} tone={dark ? "onDark" : "onLight"} />
          <span className="rounded-full px-3 py-1 text-xs font-semibold" style={{ background: t.colors.tagBg, color: t.colors.tagText }}>
            {t.portal}
          </span>
          <p className="max-w-xs text-[15px] font-medium" style={{ color: t.colors.muted }}>
            {t.tagline}
          </p>
        </div>
      </div>
      <div className="mx-auto flex w-full max-w-sm flex-col gap-4">
        <ul className="flex flex-wrap justify-center gap-2">
          {steps.map((s, i) => {
            const done = i < stage;
            const active = i === stage;
            const style = done
              ? { background: t.colors.accent, color: t.colors.accentText }
              : active
                ? { background: t.colors.tagBg, color: dark ? BRAND.amber : t.colors.tagText, boxShadow: `inset 0 0 0 1.5px ${dark ? BRAND.amber : t.colors.accent}` }
                : { background: dark ? "rgba(255,255,255,.08)" : "#E2E8F0", color: dark ? "#9AA3E0" : "#64748B" };
            return (
              <li key={s.label} className="rounded-full px-3 py-1.5 text-xs font-semibold" style={style}>
                {s.label}
              </li>
            );
          })}
        </ul>
        <div className="h-1.5 overflow-hidden rounded-full" style={{ background: dark ? "rgba(255,255,255,.14)" : "#E2E8F0" }}>
          <div className="h-full rounded-full transition-[width] duration-150" style={{ width: `${pct}%`, background: dark ? BRAND.amber : t.colors.accent }} />
        </div>
        <div className="flex justify-between font-mono text-xs font-medium" style={{ color: t.colors.muted }}>
          <span>{msg}</span>
          <span>{pct}%</span>
        </div>
        <p className="pt-2 text-center text-xs" style={{ color: dark ? "#9AA3E0" : "#64748B" }}>
          Pangasinan State University · Lingayen Campus
        </p>
      </div>
    </div>
  );
}

type LaunchGateProps = {
  children: ReactNode;
  /** Minimum time the splash stays up, ms. */
  minDuration?: number;
  /** Show only once per browser session (sessionStorage). */
  oncePerSession?: boolean;
};

/**
 * Wrap <App /> with this in main.tsx. Shows the role-aware splash on cold start
 * (first open of the installed PWA or a new tab), then fades into the app.
 * Pages can end it early by dispatching: window.dispatchEvent(new Event("inb:ready")).
 */
export function LaunchGate({ children, minDuration = 1600, oncePerSession = true }: LaunchGateProps) {
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
    const finish = () => setPhase("leave");
    const timer = window.setTimeout(finish, reduce ? 500 : minDuration);
    return () => window.clearTimeout(timer);
  }, [phase, minDuration, reduce]);

  useEffect(() => {
    if (phase !== "leave") return;
    try {
      sessionStorage.setItem("inb_splash_seen", "1");
    } catch {
      /* private mode: show again next time */
    }
    const timer = window.setTimeout(() => setPhase("done"), 350);
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
