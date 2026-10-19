import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import Wordmark from "./Wordmark";
import PsuSeal from "./PsuSeal";
import { GLYPH } from "./geometry";
import { ROLE_THEMES, applyRoleTheme, getActiveRole } from "./roles";
import type { BrandRole } from "./roles";
import { ROLE_CHROME_DARK } from "./tokens";

/*
|--------------------------------------------------------------------------
| THE SPLASH: "SEAL TO ROUTE"
|--------------------------------------------------------------------------
|
| Iteration 19. 1.1 s in all, on the role's own chrome (brand.css
| [data-role]):
|
|   0 to 300 ms     the chrome fills the screen; the PSU seal fades in,
|                   40 px, in the top third (on its white disc when the
|                   chrome is dark);
|   300 to 800 ms   the INTERNet route draws itself (the road glyph's own
|                   path) in --role-primary and ends on a --role-accent pin;
|   800 to 1100 ms  the wordmark settles and the role's name appears under
|                   it; then a 160 ms cross-fade into the app.
|
| Shown only on a cold start of the installed app (standalone display), at
| most once a session, and never for longer than 1.2 s. Under reduced
| motion the end frame is shown for 300 ms instead. The timings are the
| CSS in brand.css (.inb-s2r-*).
|
*/

/** The route of the INTERNet "N": the road glyph's polyline (brand/RoadGlyph.tsx). */
const ROUTE_POINTS = GLYPH.road.markup.match(/points="([^"]+)"/)?.[1] ?? "158,-72 214,-588 590,-72 646,-588";
const ROUTE_END = ROUTE_POINTS.trim().split(/\s+/).pop()!.split(",").map(Number);

type SplashScreenProps = {
  role: BrandRole;
  /** Plays the 160 ms cross-fade out. */
  leaving?: boolean;
  /** The end frame at once, without motion (reduced motion). */
  still?: boolean;
  /** Drawn in place inside a frame instead of over the whole screen (brand preview). */
  inline?: boolean;
};

export function SplashScreen({ role, leaving = false, still = false, inline = false }: SplashScreenProps) {
  const theme = ROLE_THEMES[role];
  const dark = role !== "guest" ? ROLE_CHROME_DARK[role] : true;
  const name = role === "student" ? "Trainee" : role === "guest" ? "OJT monitoring and analytics" : theme.tag;
  return (
    <div
      data-role={role === "guest" ? undefined : role}
      className={`inb-s2r ${inline ? "relative h-full min-h-[480px] w-full" : "fixed inset-0 z-[100]"} ${still ? "inb-s2r--still" : ""} ${leaving ? "inb-s2r--leave" : ""}`}
      role="status"
      aria-live="polite"
      aria-label={`Loading INTERNet ${theme.portal}`}
    >
      <div className="inb-s2r-seal">
        <PsuSeal size={40} onDark={dark} clearSpace={false} />
      </div>
      <div className="inb-s2r-centre">
        <svg className="inb-s2r-route" viewBox={GLYPH.road.viewBox} width="120" height="125" aria-hidden="true">
          <polyline points={ROUTE_POINTS} pathLength={100} className="inb-s2r-path" />
          <circle cx={ROUTE_END[0]} cy={ROUTE_END[1]} r="70" className="inb-s2r-pin" />
        </svg>
        <div className="inb-s2r-word">
          <Wordmark height={30} tone={dark ? "onDark" : "onLight"} />
        </div>
        <p className="inb-s2r-role">{name}</p>
      </div>
      <p className="inb-s2r-footer">A system proposal for Pangasinan State University – Lingayen Campus</p>
    </div>
  );
}

/** Whether the app was opened from the Home Screen or as an installed app. */
function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return (
      window.matchMedia?.("(display-mode: standalone)").matches ||
      window.matchMedia?.("(display-mode: fullscreen)").matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true
    );
  } catch {
    return false;
  }
}

/** The fade starts at 1040 ms and ends at 1200: the most the splash may hold the app. The end frame alone under reduced motion. */
const FADE_START_MS = 1040;
const STILL_MS = 300;
const FADE_MS = 160;

type LaunchGateProps = {
  children: ReactNode;
};

/**
 * Wrap <App /> with this in main.tsx. On a cold start of the installed app
 * it shows the splash over the app for at most 1.2 s, then fades it out.
 * In a browser tab, and after the first time in a session, it shows nothing.
 */
export function LaunchGate({ children }: LaunchGateProps) {
  const [role] = useState<BrandRole>(getActiveRole);
  const [still] = useState(() => typeof window !== "undefined" && Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches));
  const [phase, setPhase] = useState<"show" | "leave" | "done">(() => {
    if (!isStandalone()) return "done";
    try {
      return sessionStorage.getItem("inb_splash_seen") === "1" ? "done" : "show";
    } catch {
      return "show";
    }
  });

  useEffect(() => {
    applyRoleTheme(role);
  }, [role]);

  useEffect(() => {
    if (phase === "show") {
      const timer = window.setTimeout(() => setPhase("leave"), still ? STILL_MS : FADE_START_MS);
      return () => window.clearTimeout(timer);
    }
    if (phase === "leave") {
      try {
        sessionStorage.setItem("inb_splash_seen", "1");
      } catch {
        /* private mode: shown again next time */
      }
      const timer = window.setTimeout(() => setPhase("done"), FADE_MS);
      return () => window.clearTimeout(timer);
    }
  }, [phase, still]);

  return (
    <>
      {children}
      {phase !== "done" && <SplashScreen role={role} still={still} leaving={phase === "leave"} />}
    </>
  );
}

export default SplashScreen;
