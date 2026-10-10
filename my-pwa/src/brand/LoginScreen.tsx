import { useEffect, useRef, useState } from "react";
import type { CSSProperties, FormEvent, ReactNode } from "react";
import BrandIcon from "./BrandIcon";
import Wordmark from "./Wordmark";
import RoadGlyph, { CheckGlyph } from "./RoadGlyph";
import { BRAND } from "./geometry";
import { errorText } from "./roles";
import type { Role } from "./roles";
import { useInstallPrompt } from "../lib/useInstallPrompt";

/* ------------------------------------------------------------------ */
/*  Copy and colours per role — edit wording here, not in the layout   */
/* ------------------------------------------------------------------ */
type Feature = { title: string; desc: string; icon: string };
export const LOGIN_ROLES: Record<Role, {
  label: string; panel: string; tile: string; accent: string; accentText: string; dot: string; link: string; tabLine: string;
  idLabel: string; idPlaceholder: string; idHelp: string; idMode: "text" | "email";
  hint: string; button: string; welcome: string; portal: string; tagline: string; wrong: string; features: Feature[];
}> = {
  student: {
    label: "Student", panel: "linear-gradient(160deg, #283593 0%, #1A237E 55%, #121A5E 100%)", tile: BRAND.raised,
    accent: BRAND.amber, accentText: BRAND.ink, dot: BRAND.amberOnLight, link: BRAND.navy, tabLine: BRAND.amber,
    idLabel: "Student ID or email", idPlaceholder: "e.g. 24-LN-0664", idHelp: "Your student number or the email on your account", idMode: "text",
    hint: "Time in, track your hours, submit tasks and documents.", button: "Sign in as student", welcome: "Welcome back, trainee",
    portal: "Student Portal", tagline: "Your road to graduation, one verified day at a time.",
    wrong: "That student ID and password don’t match. Check them or reset your password.",
    features: [
      { title: "Attendance with proof", desc: "Time in with a photo; your supervisor verifies each day.", icon: "M12 7v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" },
      { title: "Tasks and documents", desc: "Submit work and requirements, see what’s due next.", icon: "M9 11l3 3 8-8M20 12v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h9" },
      { title: "Progress you can see", desc: "Verified hours on the road to your required total.", icon: "M4 20V10M10 20V4M16 20v-7M22 20H2" },
    ],
  },
  supervisor: {
    label: "Supervisor", panel: "linear-gradient(160deg, #1A237E 0%, #121A5E 55%, #0B1140 100%)", tile: BRAND.navy,
    accent: BRAND.amber, accentText: BRAND.ink, dot: BRAND.navy, link: BRAND.navy, tabLine: BRAND.amber,
    idLabel: "Work email", idPlaceholder: "name@company.com", idHelp: "The email your OJT coordinator registered for you", idMode: "email",
    hint: "Verify time-ins, assign tasks and evaluate your interns.", button: "Sign in as supervisor", welcome: "Welcome back",
    portal: "Supervisor Portal", tagline: "Guide, verify and evaluate your interns.",
    wrong: "That email and password don’t match. Check them or reset your password.",
    features: [
      { title: "One review queue", desc: "Time-ins, tasks, documents and absences in one place.", icon: "M3 6h18M3 12h18M3 18h12" },
      { title: "Approve in a keystroke", desc: "Move with the arrow keys, press A to approve.", icon: "M9 11l3 3 8-8M3 12a9 9 0 1 0 18 0" },
      { title: "Evaluate with context", desc: "Hours, tasks and history beside every rating.", icon: "M12 3l2.6 5.6 6.1.7-4.5 4.2 1.2 6L12 16.8 6.6 19.5l1.2-6L3.3 9.3l6.1-.7z" },
    ],
  },
  coordinator: {
    label: "Coordinator", panel: "linear-gradient(160deg, #4F46E5 0%, #3730A3 55%, #1E1B4B 100%)", tile: BRAND.navy,
    accent: BRAND.indigo, accentText: BRAND.white, dot: BRAND.indigo, link: "#4338CA", tabLine: BRAND.indigo,
    // Local edit: coordinators sign in by email only, so the field says so.
    idLabel: "Coordinator email", idPlaceholder: "name@psu.edu.ph", idHelp: "Your PSU coordinator account", idMode: "email",
    hint: "Monitor the program, requirements and analytics.", button: "Sign in as coordinator", welcome: "Welcome back",
    portal: "Coordinator Portal", tagline: "Oversee every OJT journey across the program.",
    wrong: "That email and password don’t match. Check them or reset your password.",
    features: [
      { title: "Program monitoring", desc: "Attendance, hours and flags across every company.", icon: "M3 12h4l3-8 4 16 3-8h4" },
      { title: "Requirements and documents", desc: "Schedules, submissions and compliance in one view.", icon: "M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9zM14 3v6h6" },
      { title: "Analytics and reports", desc: "Trends you can export as a PDF.", icon: "M4 20V10M10 20V4M16 20v-7M22 20H2" },
    ],
  },
};

/* ------------------------------------------------------------------ */
/*  PWA install prompt (Chrome/Edge/Android). Hidden when unavailable. */
/*  Local edit: the kit's own hook lived here and only heard the      */
/*  browser's offer while this screen was open. It moved to           */
/*  lib/useInstallPrompt.ts, which catches the offer at start-up so   */
/*  the Profile pages can use it too.                                 */
/* ------------------------------------------------------------------ */

function DecoRoad({ opacity }: { opacity: number }) {
  const d = "M-80 960 C 140 760, 60 600, 300 500 S 760 380, 640 160 S 600 -40, 820 -90";
  return (
    <svg aria-hidden="true" viewBox="0 0 720 900" preserveAspectRatio="xMidYMid slice" className="pointer-events-none absolute inset-0 h-full w-full" style={{ opacity }}>
      <path d={d} fill="none" stroke="#FFFFFF" strokeWidth="120" strokeLinecap="round" />
      <path className="inb-bg-lane" d={d} fill="none" stroke="#0F172A" strokeWidth="9" strokeDasharray="130 90" strokeLinecap="round" />
    </svg>
  );
}

function FeatureIcon({ d, size = 20 }: { d: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={BRAND.amber} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/*  LoginScreen                                                        */
/* ------------------------------------------------------------------ */
export type LoginScreenProps = {
  /**
   * Do the real sign-in here (the page's existing request + session storage).
   * Resolve when it worked; throw an Error with a user-facing message when it did not
   * (a plain "wrong credentials" response can just `throw new Error()` — the role's wording is used).
   */
  onSubmit: (role: Role, identifier: string, password: string) => Promise<void>;
  /** Called ~0.7 s after success, while "Welcome back" shows — navigate (or show the role splash) here. */
  onSignedIn?: (role: Role) => void;
  initialRole?: Role;
  /** Notified when the user switches role (e.g. to remember the last choice). */
  onRoleChange?: (role: Role) => void;
  /** Where "Forgot password?" goes. Receives the current role. */
  forgotHref?: (role: Role) => string;
  /** One-line message above the form (e.g. "Your session expired. Sign in again."). */
  notice?: ReactNode;
  /** Optional slot under the button (e.g. extra links). */
  footer?: ReactNode;
  /** Local addition: starting values for the two fields for a role (fills the demo logins in development). */
  prefill?: (role: Role) => { identifier: string; password: string } | null;
};

type Phase = "idle" | "working" | "success" | "error";

/**
 * The INTERNet sign-in page — one component, three layouts:
 *   phone   (< 768 px)  brand header + white sheet
 *   tablet  (768–1023)  brand band + overlapping card
 *   desktop (≥ 1024 px) brand panel left, form right
 */
export default function LoginScreen({ onSubmit, onSignedIn, initialRole = "student", onRoleChange, forgotHref = () => "/forgot-password", notice, footer, prefill }: LoginScreenProps) {
  const [role, setRole] = useState<Role>(initialRole);
  const [id, setId] = useState(() => prefill?.(initialRole)?.identifier ?? "");
  const [pw, setPw] = useState(() => prefill?.(initialRole)?.password ?? "");
  // Local addition: warn when Caps Lock is on while the password is typed.
  const [caps, setCaps] = useState(false);
  const [show, setShow] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [shakeKey, setShakeKey] = useState(0);
  const timer = useRef<number | undefined>(undefined);
  const { install } = useInstallPrompt();
  const r = LOGIN_ROLES[role];

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const pick = (next: Role) => {
    if (phase === "working") return;
    setRole(next);
    const filled = prefill?.(next);
    if (filled) {
      setId(filled.identifier);
      setPw(filled.password);
    }
    setError(null);
    setPhase("idle");
    onRoleChange?.(next);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (phase === "working" || phase === "success") return;
    if (!id.trim() || !pw) {
      setError(!id.trim() ? `Enter your ${r.idLabel.toLowerCase()}.` : "Enter your password.");
      setPhase("error");
      setShakeKey((k) => k + 1);
      return;
    }
    setPhase("working");
    setError(null);
    try {
      await onSubmit(role, id.trim(), pw);
      setPhase("success");
      timer.current = window.setTimeout(() => onSignedIn?.(role), 700);
    } catch (err) {
      const msg = err instanceof Error && err.message ? errorText(err) : r.wrong;
      setError(msg);
      setPhase("error");
      setShakeKey((k) => k + 1);
    }
  };

  const invalid = phase === "error" && !!error;
  const fieldStyle: CSSProperties = { borderColor: invalid ? "#FCA5A5" : "#CBD5E1", borderRadius: "var(--inb-r-control)" };
  const fieldCls = "w-full min-h-[48px] border bg-white px-3.5 text-[15px] text-slate-900 outline-none transition-shadow focus:border-[#1A237E] focus:shadow-[0_0_0_3px_rgba(26,35,126,.15)]";

  return (
    // Local edit: the typeface is self-hosted (@fontsource-variable), whose
    // family name ends in "Variable"; it used to come from Google Fonts.
    <div className="min-h-screen bg-white text-slate-900 lg:flex" style={{ fontFamily: "'Bricolage Grotesque Variable', 'Bricolage Grotesque', system-ui, sans-serif" }}>
      {/* ---------------- brand panel ---------------- */}
      <section
        aria-label={`INTERNet ${r.portal}`}
        className="relative overflow-hidden px-6 pb-14 pt-[max(3.25rem,env(safe-area-inset-top))] text-center md:px-16 md:pb-28 md:pt-16 md:text-left lg:flex lg:min-h-screen lg:w-1/2 lg:flex-col lg:justify-between lg:px-16 lg:py-14"
        style={{ background: r.panel, transition: "background .45s var(--inb-ease-out)" }}
      >
        <DecoRoad opacity={0.09} />
        {/* phone: stacked mark */}
        <div className="relative flex flex-col items-center gap-3.5 md:hidden">
          <BrandIcon size={58} tile={r.tile} />
          <Wordmark height={24} tone="onDark" />
        </div>
        {/* tablet + desktop: lockup */}
        <div className="relative hidden items-center gap-4 md:flex">
          <BrandIcon size={56} tile={r.tile} />
          <Wordmark height={28} tone="onDark" />
        </div>

        <div className="relative mx-auto mt-4 flex max-w-[680px] flex-col gap-4 md:mx-0 md:mt-12 lg:mt-0 lg:max-w-[540px] lg:gap-6">
          <span className="hidden font-mono text-[13px] font-semibold tracking-[0.16em] text-[#FACC15] md:block">PANGASINAN STATE UNIVERSITY</span>
          <h1 className="m-0 hidden text-[40px] font-extrabold leading-[1.08] tracking-[-0.025em] text-white md:block lg:text-[48px]">
            On-the-job training, tracked from the first day to the last hour.
          </h1>
          <p key={role} className="inb-fade-up m-0 text-sm leading-snug text-[#C7CDF0] md:text-[17px] lg:text-lg">
            {r.tagline}
          </p>
          {/* tablet: feature chips */}
          <ul key={`${role}-chips`} className="inb-fade-up m-0 hidden list-none flex-wrap gap-2.5 p-0 pt-1 md:flex lg:hidden">
            {r.features.map((f) => (
              <li key={f.title} className="inline-flex h-9 items-center gap-2 rounded-full bg-white/10 pl-2.5 pr-3.5 text-sm font-semibold text-white ring-1 ring-inset ring-white/15">
                <FeatureIcon d={f.icon} size={18} />
                {f.title}
              </li>
            ))}
          </ul>
          {/* desktop: feature list */}
          <ul key={`${role}-list`} className="inb-fade-up m-0 hidden list-none flex-col gap-5 p-0 pt-1 lg:flex">
            {r.features.map((f) => (
              <li key={f.title} className="flex items-start gap-3.5">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/10 ring-1 ring-inset ring-white/15">
                  <FeatureIcon d={f.icon} />
                </span>
                <span className="flex flex-col gap-0.5">
                  <span className="text-[17px] font-semibold text-white">{f.title}</span>
                  <span className="text-[14.5px] leading-snug text-[#C7CDF0]">{f.desc}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className="relative hidden justify-between text-sm text-[#9AA3E0] lg:flex">
          <span>Pangasinan State University · Lingayen Campus</span>
          <span>{r.portal}</span>
        </div>
      </section>

      {/* ---------------- form ---------------- */}
      <main className="relative -mt-7 rounded-t-[28px] bg-white px-[22px] pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-7 md:mx-auto md:-mt-24 md:mb-10 md:max-w-[560px] md:rounded-3xl md:p-10 md:shadow-[0_30px_60px_-24px_rgba(15,23,42,.35)] lg:m-0 lg:flex lg:w-1/2 lg:max-w-none lg:items-center lg:justify-center lg:rounded-none lg:p-12 lg:shadow-none">
        <form onSubmit={submit} noValidate className="mx-auto flex w-full max-w-[420px] flex-col gap-[18px] md:gap-5 lg:gap-[22px]">
          <div className="flex flex-col gap-1.5">
            <h2 className="m-0 text-[26px] font-extrabold tracking-[-0.02em] md:text-[28px] lg:text-[30px]">Sign in</h2>
            <p className="m-0 text-[15px] text-slate-600">Choose your role to continue.</p>
          </div>

          {notice && (
            <div role="status" className="flex gap-2.5 rounded-[10px] bg-amber-50 px-3.5 py-3 text-sm text-amber-900 ring-1 ring-inset ring-amber-200">
              {notice}
            </div>
          )}

          <div role="group" aria-label="Role" className="grid grid-cols-3 gap-1 rounded-xl bg-slate-100 p-1">
            {(Object.keys(LOGIN_ROLES) as Role[]).map((k) => {
              const on = k === role;
              return (
                <button
                  key={k}
                  type="button"
                  aria-pressed={on}
                  onClick={() => pick(k)}
                  className="inb-press min-h-[44px] rounded-[9px] text-sm font-semibold"
                  style={on ? { background: "#FFFFFF", color: BRAND.ink, boxShadow: `0 1px 2px rgba(15,23,42,.12), inset 0 -2px 0 ${LOGIN_ROLES[k].tabLine}` } : { background: "transparent", color: "#475569" }}
                >
                  {LOGIN_ROLES[k].label}
                </button>
              );
            })}
          </div>
          <p className="-mt-1.5 m-0 flex items-start gap-2 text-[13px] text-slate-600">
            <span className="mt-[5px] h-2 w-2 shrink-0 rounded-full" style={{ background: r.dot }} aria-hidden="true" />
            {r.hint}
          </p>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="inb-login-id" className="text-sm font-semibold text-slate-800">{r.idLabel}</label>
            <input
              id="inb-login-id"
              name="username"
              type={r.idMode}
              inputMode={r.idMode === "email" ? "email" : "text"}
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              placeholder={r.idPlaceholder}
              value={id}
              onChange={(e) => setId(e.target.value)}
              aria-invalid={invalid}
              aria-describedby="inb-login-id-help"
              className={fieldCls}
              style={fieldStyle}
            />
            <span id="inb-login-id-help" className="text-[12.5px] text-slate-500">{r.idHelp}</span>
          </div>

          <div className="flex flex-col gap-1.5">
            <div className="flex items-baseline justify-between">
              <label htmlFor="inb-login-pw" className="text-sm font-semibold text-slate-800">Password</label>
              <a href={forgotHref(role)} className="text-sm font-semibold no-underline hover:underline" style={{ color: r.link }}>Forgot password?</a>
            </div>
            <div className="relative">
              <input
                id="inb-login-pw"
                name="password"
                type={show ? "text" : "password"}
                autoComplete="current-password"
                placeholder="Your password"
                value={pw}
                onChange={(e) => setPw(e.target.value)}
                onKeyDown={(e) => setCaps(e.getModifierState("CapsLock"))}
                onKeyUp={(e) => setCaps(e.getModifierState("CapsLock"))}
                onBlur={() => setCaps(false)}
                aria-describedby={caps ? "inb-login-caps" : undefined}
                aria-invalid={invalid}
                className={`${fieldCls} pr-20`}
                style={fieldStyle}
              />
              <button
                type="button"
                onClick={() => setShow((s) => !s)}
                aria-label={show ? "Hide password" : "Show password"}
                aria-pressed={show}
                className="absolute right-1 top-1 h-10 min-w-16 rounded-lg px-3 text-sm font-semibold text-slate-700 hover:bg-slate-100"
              >
                {show ? "Hide" : "Show"}
              </button>
            </div>
            {caps && (
              <span id="inb-login-caps" role="status" className="text-[12.5px] font-semibold text-amber-700">
                Caps Lock is on
              </span>
            )}
          </div>

          {invalid && (
            <div role="alert" className="inb-fade-up flex items-start gap-2.5 rounded-[10px] bg-red-50 px-3.5 py-3 text-sm leading-snug text-red-800 shadow-[inset_3px_0_0_#DC2626]">
              <span className="font-extrabold" aria-hidden="true">!</span>
              <span>{error}</span>
            </div>
          )}

          <button
            key={shakeKey}
            type="submit"
            data-state={phase === "error" ? "idle" : phase}
            aria-busy={phase === "working"}
            disabled={phase === "working"}
            className={`inb-press flex min-h-[52px] items-center justify-center gap-2.5 text-base font-bold ${shakeKey > 0 && phase === "error" ? "inb-shake" : ""}`}
            style={{ background: r.accent, color: r.accentText, borderRadius: "var(--inb-r-control)", transition: "background-color .3s" }}
          >
            {phase === "working" && (<><RoadGlyph size={20} /><span>Signing you in…</span></>)}
            {phase === "success" && (<><CheckGlyph size={18} /><span>{r.welcome}</span></>)}
            {(phase === "idle" || phase === "error") && <span>{r.button}</span>}
          </button>

          {install && (
            <button type="button" onClick={() => void install()} className="inb-press flex min-h-[44px] items-center justify-center gap-2 rounded-[10px] border border-slate-200 bg-white text-sm font-semibold text-slate-700">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3v12M7 10l5 5 5-5M5 21h14" /></svg>
              Install INTERNet on this device
            </button>
          )}

          {footer}
          <p className="m-0 text-center text-sm text-slate-500">No account yet? Your OJT coordinator creates one for you.</p>
          <p className="m-0 text-center text-xs text-slate-400 md:hidden">Pangasinan State University · Lingayen Campus</p>
        </form>
      </main>
    </div>
  );
}
