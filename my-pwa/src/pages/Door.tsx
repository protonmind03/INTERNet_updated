import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { BrandIcon, PsuSeal, Wordmark, type Role } from "../brand";
import { BRAND } from "../brand/geometry";
import { errorText } from "../brand/roles";
import { useRoleTheme } from "../brand/useRoleTheme";
import { IosInstallGuide } from "../components/InstallApp";
import { API_URL } from "../lib/api";
import { DOOR_COPY, lastDoorRole, rememberDoorRole, signedInRole } from "../lib/doors";
import { HOME_PATH, preloadHome } from "../lib/homePages";
import { rememberChoice } from "../lib/keepSignedIn";
import { useInstallPrompt } from "../lib/useInstallPrompt";
import { useMediaQuery } from "../lib/useMediaQuery";

/*
|--------------------------------------------------------------------------
| THE THREE SIGN-IN PAGES (PSU redesign, Section 6)
|--------------------------------------------------------------------------
|
| /student/sign-in, /supervisor/sign-in and /coordinator/sign-in. Each sets
| its role's palette, links its role's app manifest and signs in at its
| role's own endpoint, with the rules unchanged (lockout, the forced
| password change, someone already signed in taken to their own portal).
| A failed sign-in says only what the role's endpoint says.
|
| Three looks, one form (the revision): on a computer (1024 px and up) the
| trainee's form is a time card beside the road to graduation, with the
| hand-off to the phone by QR code, since time-in needs the phone's
| camera; the supervisor's sits on a clipboard beside today's register;
| the coordinator's is a credential card under the university's seal, over
| the console, blurred. Phones and tablets keep one form with each role's
| own header. Each fits one screen.
|
| Nothing on a sign-in page leads away from it: no link to the website and
| none to the other roles' doors, in a browser or installed. Passkey
| sign-in is not offered: a sign-in challenge has no trainee yet
| (docs/PROGRESS-ITER-18-23.md); passkeys confirm the steps of a day.
|
*/

// Local development only: the seeded demo accounts, so the form is ready to submit.
const DEV_ACCOUNTS: Record<Role, { identifier: string; password: string }> = {
  student: { identifier: "student.demo@internet.test", password: "StudentDemo123!" },
  supervisor: { identifier: "supervisor.demo@internet.test", password: "SupervisorDemo123!" },
  coordinator: { identifier: "coordinator.demo@internet.test", password: "CoordinatorDemo123!" },
};

/** Each role's words on its sign-in page. */
const WORDS: Record<Role, { lead: string; phoneTitle: string; deskLead: string; help: string }> = {
  student: {
    lead: "Sign in to clock in and log your day.",
    phoneTitle: "Welcome back.",
    deskLead: "Use the student ID or email on your account.",
    help: "New here or locked out?",
  },
  supervisor: {
    lead: "Sign in to review your trainees' hours.",
    phoneTitle: "Good day, supervisor.",
    deskLead: "Verify your trainees' days, tasks and documents.",
    help: "Locked out?",
  },
  coordinator: {
    lead: "Sign in to manage your cohort.",
    phoneTitle: "Coordinator console",
    deskLead: "Oversee every OJT journey across the program.",
    help: "Locked out?",
  },
};

const CHIP_ICON: Record<Role, string> = {
  student: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM5 21a7 7 0 0 1 14 0",
  supervisor: "M5 12l4 4L19 6",
  coordinator: "M5 20V11M12 20V5M19 20v-7",
};

function Glyph({ d, size = 16 }: { d: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

type Phase = "idle" | "working" | "success" | "error";

function SignInForm({ role, onSignedIn }: { role: Role; onSignedIn: (mustChange: boolean) => void }) {
  const copy = DOOR_COPY[role];
  const dev = import.meta.env.DEV ? DEV_ACCOUNTS[role] : null;
  const [id, setId] = useState(dev?.identifier ?? "");
  const [pw, setPw] = useState(dev?.password ?? "");
  const [show, setShow] = useState(false);
  const [keep, setKeep] = useState(true);
  const [caps, setCaps] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState("");
  const [notice] = useState(() => sessionStorage.getItem("session_notice") || "");

  useEffect(() => {
    sessionStorage.removeItem("session_notice");
  }, []);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (phase === "working" || phase === "success") return;
    if (!id.trim() || !pw) {
      setError(!id.trim() ? `Enter your ${copy.idLabel.toLowerCase()}.` : "Enter your password.");
      setPhase("error");
      return;
    }
    setPhase("working");
    setError("");
    preloadHome(role);
    try {
      const response = await fetch(`${API_URL}/api/login/${role}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: id.trim(), password: pw }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(typeof data.message === "string" ? data.message : copy.wrong);
      const account = data[role];
      localStorage.setItem(role, JSON.stringify(account));
      localStorage.setItem(`${role}_id`, String(account[`${role}_id`]));
      localStorage.setItem(`${role}_token`, data.token);
      localStorage.setItem("active_role", role);
      rememberChoice(keep);
      window.dispatchEvent(new Event("internet-auth-changed"));
      rememberDoorRole(role);
      try {
        sessionStorage.removeItem("inb_splash_seen");
      } catch {
        /* private mode: nothing to clear */
      }
      setPhase("success");
      onSignedIn(Boolean(data.must_change_password));
    } catch (err) {
      setError(errorText(err, copy.wrong));
      setPhase("error");
    }
  };

  const invalid = phase === "error" && Boolean(error);

  return (
    <form onSubmit={submit} noValidate className="signin-form">
      {notice && (
        <p role="status" className="signin-notice">
          {notice}
        </p>
      )}
      <div className="signin-field">
        <label htmlFor="inb-login-id">{copy.idLabel}</label>
        <input
          id="inb-login-id"
          name="username"
          type={copy.idMode}
          inputMode={copy.idMode === "email" ? "email" : "text"}
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          placeholder={copy.idPlaceholder}
          value={id}
          onChange={(event) => setId(event.target.value)}
          aria-invalid={invalid}
          aria-describedby="inb-login-id-help"
          data-invalid={invalid || undefined}
        />
        <span id="inb-login-id-help" className="signin-help">
          {copy.idHelp}
        </span>
      </div>
      <div className="signin-field">
        <label htmlFor="inb-login-pw">Password</label>
        <div className="relative">
          <input
            id="inb-login-pw"
            name="password"
            type={show ? "text" : "password"}
            autoComplete="current-password"
            placeholder="Your password"
            value={pw}
            onChange={(event) => setPw(event.target.value)}
            onKeyDown={(event) => setCaps(event.getModifierState("CapsLock"))}
            onKeyUp={(event) => setCaps(event.getModifierState("CapsLock"))}
            onBlur={() => setCaps(false)}
            aria-invalid={invalid}
            aria-describedby={caps ? "inb-login-caps" : undefined}
            data-invalid={invalid || undefined}
            className="pr-20"
          />
          <button type="button" onClick={() => setShow((value) => !value)} aria-label={show ? "Hide password" : "Show password"} aria-pressed={show} className="signin-show">
            {show ? "Hide" : "Show"}
          </button>
        </div>
        {caps && (
          <span id="inb-login-caps" role="status" className="signin-caps">
            Caps Lock is on
          </span>
        )}
      </div>
      <div className="signin-row">
        <label className="signin-keep">
          <input type="checkbox" checked={keep} onChange={(event) => setKeep(event.target.checked)} />
          Keep me signed in
        </label>
        <a href={`/forgot-password?role=${role}`} className="signin-link">
          Forgot password?
        </a>
      </div>
      {invalid && (
        <p role="alert" className="signin-error">
          {error}
        </p>
      )}
      <button type="submit" aria-busy={phase === "working"} disabled={phase === "working"} className="signin-submit inb-press">
        {phase === "working" ? "Signing you in…" : phase === "success" ? copy.welcome : "Sign in"}
      </button>
    </form>
  );
}

/** Install: the browser's own button where it offers one; the steps where it does not. */
function InstallBlock({ role, asked }: { role: Role; asked: boolean }) {
  const { install, installed, needsIosSteps } = useInstallPrompt();
  if (installed) return null;
  if (install) {
    return (
      <button type="button" onClick={() => void install()} className="signin-install inb-press">
        <Glyph d="M12 3v12M7 10l5 5 5-5M5 21h14" size={18} />
        Install {DOOR_COPY[role].appName}
      </button>
    );
  }
  if (!asked) return null;
  return (
    <div className="signin-install-help" role="note">
      <p className="m-0 font-semibold">Install {DOOR_COPY[role].appName}</p>
      {needsIosSteps ? (
        <ol className="m-0 mt-2 list-decimal pl-5">
          <li>In Safari, tap Share.</li>
          <li>Tap Add to Home Screen.</li>
          <li>Tap Add.</li>
        </ol>
      ) : (
        <p className="m-0 mt-2">
          Chrome or Edge: choose Install in the address bar or the browser&rsquo;s menu. On Android, the menu (three dots), then Install app. Safari on a Mac: File, then Add to Dock.
        </p>
      )}
    </div>
  );
}

/** The quiet lines under every form: help and the university. Nothing leads away to the website or another door. */
function FormFooter({ role }: { role: Role }) {
  return (
    <div className="signin-foot">
      <p className="m-0">
        {WORDS[role].help}{" "}
        <a href="/help" className="signin-link signin-link--ink">
          Get help
        </a>
      </p>
      <p className="signin-seal-line">
        <PsuSeal size={22} clearSpace={false} />
        Pangasinan State University · Lingayen Campus
      </p>
    </div>
  );
}

function Logo({ tone = "onDark" }: { tone?: "onDark" | "onLight" }) {
  return (
    <span className="signin-logo">
      <BrandIcon size={30} tile={tone === "onDark" ? BRAND.amber : BRAND.navy} fg={tone === "onDark" ? BRAND.navy : BRAND.amber} />
      <Wordmark height={15} tone={tone} />
    </span>
  );
}

/** Today's date as a time card prints it: "SAT 25 OCT 2026". */
function cardDate(): string {
  const parts = new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", weekday: "short", day: "2-digit", month: "short", year: "numeric" }).formatToParts(new Date());
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("weekday")} ${get("day")} ${get("month")} ${get("year")}`.toUpperCase();
}

/*
| Phones and tablets: one form, three faces. Each role keeps its own
| header: the trainee's lane to graduation, the supervisor's clipboard,
| the coordinator's seal.
*/
function PhoneTemplate({ role, form, extra }: { role: Role; form: ReactNode; extra: ReactNode }) {
  return (
    <main className={`signin-phone signin-phone--${role}`}>
      <header className="signin-phone-head">
        <span className="signin-phone-top">
          <Logo />
          <span className="signin-chip">
            <span className="signin-chip-icon">
              <Glyph d={CHIP_ICON[role]} size={13} />
            </span>
            {DOOR_COPY[role].name}
          </span>
        </span>
        {role === "coordinator" && (
          <span className="signin-phone-seal" aria-hidden="true">
            <PsuSeal size={56} clearSpace={false} onDark />
          </span>
        )}
        <h1 id="door-title" className="signin-welcome">
          {WORDS[role].phoneTitle}
        </h1>
        <p className="signin-lead">{WORDS[role].lead}</p>
        {role === "student" && (
          <svg className="signin-lane" viewBox="0 0 140 170" aria-hidden="true">
            <path d="M24 170 L104 0" className="signin-lane-edge" />
            <path d="M92 170 L138 0" className="signin-lane-dash" />
          </svg>
        )}
      </header>
      <section className="signin-sheet" aria-labelledby="door-title">
        {role === "supervisor" && <span className="signin-clip" aria-hidden="true" />}
        {form}
        {extra}
        <FormFooter role={role} />
      </section>
    </main>
  );
}

const ROAD_PATH = "M10 100 C 140 100, 170 30, 290 40 S 450 80, 510 18";
const ROAD_DONE = "M10 100 C 140 100, 170 30, 290 40";

/** The trainee on a computer: the road to graduation, and the form as a time card. */
function TraineeDesk({ form, extra }: { form: ReactNode; extra: ReactNode }) {
  const [qr, setQr] = useState("");
  useEffect(() => {
    let active = true;
    const url = new URL("/student/sign-in", window.location.origin).href;
    void import("qrcode")
      .then(({ default: QRCode }) => QRCode.toString(url, { type: "svg", margin: 1, errorCorrectionLevel: "M" }))
      .then((svg) => active && setQr(svg))
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);
  return (
    <main className="signin-desk signin-desk--student">
      <aside className="signin-panel">
        {/* Decoration: a rising sun of rings, and lane lines running down the panel. */}
        <span className="signin-sun" aria-hidden="true">
          <span />
          <span />
          <span />
        </span>
        <span className="signin-lanes" aria-hidden="true" />
        <div className="signin-panel-top">
          <Logo />
          <span className="signin-panel-tag">
            <span className="signin-panel-tag-dot" aria-hidden="true" />
            Trainee portal
          </span>
        </div>
        <div className="signin-panel-copy">
          <p className="signin-kicker">On-the-job training · PSU Lingayen</p>
          <h2 className="signin-panel-title">
            Your road to graduation, <em>one verified day</em> at a time.
          </h2>
          {/* The road: three milestones, the trainee part of the way along. Example figures only. */}
          <div className="signin-road" aria-hidden="true">
            <svg viewBox="0 0 520 120" preserveAspectRatio="none">
              <path d={ROAD_PATH} className="signin-road-bed" />
              <path d={ROAD_PATH} className="signin-road-lane" />
              <path d={ROAD_DONE} className="signin-road-done" pathLength={1} />
            </svg>
            <span className="signin-traveller" />
            <span className="signin-mile signin-mile--1">
              <b>Day 1</b>
              <i>Timed in</i>
            </span>
            <span className="signin-mile signin-mile--2">
              <b>Midterm</b>
              <i>Reports in</i>
            </span>
            <span className="signin-mile signin-mile--3">
              <b>Completion</b>
              <i>Hours verified</i>
            </span>
            <span className="signin-you">You are here</span>
            <span className="signin-float signin-float--check">
              <span className="signin-float-icon">
                <Glyph d="M5 12l4 4L19 6" size={14} />
              </span>
              <span>
                <b>Camera check passed</b>
                <i>Timed in 7:58 AM</i>
              </span>
            </span>
            <span className="signin-float signin-float--ring">
              <svg viewBox="0 0 44 44" className="signin-ring">
                <circle cx="22" cy="22" r="18" className="signin-ring-track" />
                <circle cx="22" cy="22" r="18" className="signin-ring-fill" pathLength={100} />
              </svg>
              <span>
                <b>412 of 486 h</b>
                <i>Finish · Nov 28</i>
              </span>
            </span>
          </div>
          <ul className="signin-features">
            <li style={{ ["--i" as string]: 0 }}>
              <Glyph d="M12 7v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" />
              <span>
                <b>Attendance with proof</b>
                <i>A camera check each time-in</i>
              </span>
            </li>
            <li style={{ ["--i" as string]: 1 }}>
              <Glyph d="M9 11l3 3 8-8M20 12v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h9" />
              <span>
                <b>Tasks and documents</b>
                <i>Hand in, see the review</i>
              </span>
            </li>
            <li style={{ ["--i" as string]: 2 }}>
              <Glyph d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
              <span>
                <b>Progress you can see</b>
                <i>Your finish date, updated</i>
              </span>
            </li>
          </ul>
        </div>
        <div className="signin-handoff">
          <span className="signin-qr" aria-hidden="true">
            <span dangerouslySetInnerHTML={{ __html: qr }} />
            <span className="signin-qr-scan" />
          </span>
          <span>
            <b>Time in from your phone</b>
            <i>The daily camera check works best on a phone. Scan to open INTERNet there, then install it.</i>
          </span>
        </div>
      </aside>
      <section className="signin-side" aria-labelledby="door-title">
        <div className="signin-card signin-card--timecard">
          <span className="signin-punch" aria-hidden="true" />
          <div className="signin-card-head">
            <span>
              <h1 id="door-title" className="signin-title">
                Sign in
              </h1>
              <p className="signin-sub">{WORDS.student.deskLead}</p>
            </span>
            <span className="signin-stamp" aria-hidden="true">
              <i>Time card</i>
              <b>{cardDate()}</b>
            </span>
          </div>
          {form}
          {extra}
          <FormFooter role="student" />
        </div>
      </section>
    </main>
  );
}

const REGISTER_EXAMPLE = [
  { who: "Ana", time: "7:58", state: "in" },
  { who: "Ben", time: "8:12", state: "late" },
  { who: "Cara", time: "8:00", state: "in" },
  { who: "Dan", time: "8:03", state: "offline" },
  { who: "Eli", time: "—", state: "out" },
] as const;

/** The time on the register's head, in Manila, kept to the minute. */
function useManilaClock(): string {
  const format = () => new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }).format(new Date());
  const [now, setNow] = useState(format);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(format()), 20_000);
    return () => window.clearInterval(timer);
  }, []);
  return now;
}

/** The supervisor on a computer: the form on a clipboard, beside today's register. */
function SupervisorDesk({ form, extra }: { form: ReactNode; extra: ReactNode }) {
  const now = useManilaClock();
  return (
    <main className="signin-desk signin-desk--supervisor">
      <section className="signin-side" aria-labelledby="door-title">
        <div className="signin-side-top">
          <Logo tone="onLight" />
          <span className="signin-side-tag">Supervisor desk</span>
        </div>
        <div className="signin-side-middle">
          <div className="signin-card signin-card--clipboard">
            <span className="signin-clip" aria-hidden="true" />
            <div className="signin-clipboard-head">
              <h1 id="door-title" className="signin-title">
                Sign in
              </h1>
              <p className="signin-sub">{WORDS.supervisor.deskLead}</p>
            </div>
            {form}
            {extra}
            <p className="signin-tip">
              <Glyph d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" size={15} />
              <span>
                <b>On a shared office computer?</b> Leave &ldquo;Keep me signed in&rdquo; off.
              </span>
            </p>
            <FormFooter role="supervisor" />
          </div>
        </div>
      </section>
      <aside className="signin-panel">
        <span className="signin-watermark" aria-hidden="true">
          <Glyph d="M9 12l2 2 4-4M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" size={420} />
        </span>
        <div className="signin-panel-copy">
          <p className="signin-kicker">Supervisor desk</p>
          <h2 className="signin-panel-title">
            Guide, verify and <em>evaluate</em> your interns.
          </h2>
          <ul className="signin-stats" aria-label="An example of a supervisor's morning">
            <li style={{ ["--i" as string]: 0 }}>
              <b>4/5</b>
              <i>in today</i>
            </li>
            <li style={{ ["--i" as string]: 1 }}>
              <b>6</b>
              <i>to verify</i>
            </li>
            <li style={{ ["--i" as string]: 2 }}>
              <b>92%</b>
              <i>on time</i>
            </li>
          </ul>
          <div className="signin-board" aria-label="An example of today's register">
            <p className="signin-board-head">
              <b>Today&rsquo;s register</b>
              <span className="signin-board-live">
                <span className="signin-board-dot" aria-hidden="true" />
                {now}
              </span>
            </p>
            <ul>
              {REGISTER_EXAMPLE.map((row, index) => (
                <li key={row.who} data-state={row.state} style={{ ["--i" as string]: index }}>
                  <span className="signin-avatar">{row.who.slice(0, 1)}</span>
                  <span className="signin-board-who">{row.who}</span>
                  <span className="signin-board-time">{row.time}</span>
                  <span className="signin-board-state">{row.state === "in" ? "Verified" : row.state === "late" ? "Late 12 min" : row.state === "offline" ? "Confirm" : "Not in yet"}</span>
                </li>
              ))}
            </ul>
            <p className="signin-verify">
              <span>Verify all 2</span> offline time-ins are confirmed one by one
            </p>
          </div>
        </div>
        <ul className="signin-pills">
          <li>One review queue</li>
          <li>Tasks for teams</li>
          <li>Final evaluations</li>
          <li>Certified time records</li>
        </ul>
      </aside>
    </main>
  );
}

const CONSOLE_TOOLS = [
  { title: "What needs you, first", glyph: "M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" },
  { title: "One filter for everything", glyph: "M3 5h18l-7 8v6l-4 2v-8z" },
  { title: "Every change recorded", glyph: "M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2M9 13l2 2 4-4" },
  { title: "Reports for the dean", glyph: "M4 20V10M10 20V4M16 20v-7M22 20H2" },
];

/** The coordinator on a computer: a credential card over the console, the university's seal on top. */
function CoordinatorDesk({ form, extra }: { form: ReactNode; extra: ReactNode }) {
  return (
    <main className="signin-console">
      {/* Soft lights drifting behind everything, and rings around the card like a seal's edge. */}
      <span className="signin-aurora" aria-hidden="true">
        <span />
        <span />
        <span />
      </span>
      <span className="signin-floor" aria-hidden="true" />
      <span className="signin-orbits" aria-hidden="true">
        <span className="signin-orbit signin-orbit--1">
          <i />
        </span>
        <span className="signin-orbit signin-orbit--2">
          <i />
        </span>
        <span className="signin-orbit signin-orbit--3">
          <i />
        </span>
      </span>
      {/* The console behind, drawn and blurred: an example, not anyone's data. */}
      <div className="signin-console-back" aria-hidden="true">
        <span className="signin-console-side" />
        <span className="signin-console-main">
          <span className="signin-console-bar" />
          <span className="signin-console-row">
            <span />
            <span />
            <span />
          </span>
          <span className="signin-console-chart">
            {[62, 80, 54, 90, 72, 86, 66, 94].map((height, index) => (
              <em key={index} style={{ height: `${height}%` }} />
            ))}
          </span>
        </span>
      </div>
      <header className="signin-console-top">
        <Logo />
        <span className="signin-console-office">
          <b>Office of the OJT Coordinator</b>
          <i>Pangasinan State University · Lingayen Campus</i>
        </span>
      </header>
      <section className="signin-credential" aria-labelledby="door-title">
        <span className="signin-credential-seal" aria-hidden="true">
          <PsuSeal size={72} clearSpace={false} />
        </span>
        <p className="signin-credential-kicker">Coordinator console</p>
        <h1 id="door-title" className="signin-title">
          Sign in
        </h1>
        <p className="signin-sub">{WORDS.coordinator.deskLead}</p>
        {form}
        {extra}
        <FormFooter role="coordinator" />
      </section>
      <ul className="signin-console-tools" aria-label="In the console">
        {CONSOLE_TOOLS.map((tool) => (
          <li key={tool.title}>
            <span className="signin-tools-icon">
              <Glyph d={tool.glyph} size={16} />
            </span>
            {tool.title}
          </li>
        ))}
      </ul>
    </main>
  );
}

export default function Door({ role }: { role: Role }) {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  // Read once, when the door opens: signing in here must not trigger it.
  const [alreadySignedIn] = useState(signedInRole);
  const computer = useMediaQuery("(min-width: 1024px)");
  useRoleTheme(role);

  useEffect(() => {
    document.title = `${DOOR_COPY[role].name} sign-in · INTERNet`;
  }, [role]);

  if (alreadySignedIn) return <Navigate to={HOME_PATH[alreadySignedIn]} replace />;

  const onSignedIn = (must: boolean) => {
    window.setTimeout(() => navigate(must ? `/change-password?role=${role}` : HOME_PATH[role]), 400);
  };
  const form = <SignInForm role={role} onSignedIn={onSignedIn} />;
  const extra = (
    <>
      <InstallBlock role={role} asked={params.get("install") === "1"} />
      {role === "student" && <IosInstallGuide />}
    </>
  );
  if (!computer) return <PhoneTemplate role={role} form={form} extra={extra} />;
  if (role === "student") return <TraineeDesk form={form} extra={extra} />;
  if (role === "supervisor") return <SupervisorDesk form={form} extra={extra} />;
  return <CoordinatorDesk form={form} extra={extra} />;
}

/** "/": a signed-in person's portal, otherwise the door they used last. */
export function DoorRedirect() {
  const signed = signedInRole();
  return <Navigate to={signed ? HOME_PATH[signed] : `/${lastDoorRole()}/sign-in`} replace />;
}
