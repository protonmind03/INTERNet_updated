import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { BrandIcon, PsuSeal, Wordmark, type Role } from "../brand";
import { BRAND } from "../brand/geometry";
import { errorText } from "../brand/roles";
import { useRoleTheme } from "../brand/useRoleTheme";
import { IosInstallGuide } from "../components/InstallApp";
import { API_URL } from "../lib/api";
import { DOOR_COPY, DOOR_ROLES, lastDoorRole, rememberDoorRole, signedInRole } from "../lib/doors";
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
| Phones and tablets: one template. Only the flat header colour, the role
| chip, the ID label and the accent change. Computers (1024 px and up): a
| layout per role. The trainee's hands off to the phone with a QR code,
| since time-in needs the phone's camera; the supervisor's frames the
| review queue; the coordinator's is a card over the console, blurred.
|
| Installed (display-mode standalone), there is no link back to the
| website. Passkey sign-in is not offered: a sign-in challenge has no
| trainee yet (docs/PROGRESS-ITER-18-23.md); passkeys confirm the steps of
| a day.
|
*/

// Local development only: the seeded demo accounts, so the form is ready to submit.
const DEV_ACCOUNTS: Record<Role, { identifier: string; password: string }> = {
  student: { identifier: "student.demo@internet.test", password: "StudentDemo123!" },
  supervisor: { identifier: "supervisor.demo@internet.test", password: "SupervisorDemo123!" },
  coordinator: { identifier: "coordinator@internet.psu.edu.ph", password: "Coordinator123!" },
};

/** Each role's words on its sign-in page. */
const WORDS: Record<Role, { lead: string; deskTitle: string; deskLead: string; help: string }> = {
  student: {
    lead: "Sign in to clock in and log your day.",
    deskTitle: "Sign in",
    deskLead: "Use the student ID or email on your account.",
    help: "New here or locked out?",
  },
  supervisor: {
    lead: "Sign in to review your trainees' hours.",
    deskTitle: "Sign in to your desk",
    deskLead: "Verify your trainees' days, tasks and documents.",
    help: "Locked out?",
  },
  coordinator: {
    lead: "Sign in to manage your cohort.",
    deskTitle: "Coordinator console",
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

/** True inside the installed app: no way back to the website. */
function useStandalone(): boolean {
  const query = useMediaQuery("(display-mode: standalone)");
  return query || (typeof navigator !== "undefined" && (navigator as Navigator & { standalone?: boolean }).standalone === true);
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

/** The quiet lines under every form: help, the other doors, the seal. */
function FormFooter({ role, standalone }: { role: Role; standalone: boolean }) {
  return (
    <div className="signin-foot">
      <p className="m-0">
        {WORDS[role].help}{" "}
        <a href="/help" className="signin-link signin-link--ink">
          Get help
        </a>
      </p>
      <p className="m-0">
        Not {DOOR_COPY[role].article}?{" "}
        {DOOR_ROLES.filter((other) => other !== role).map((other, index) => (
          <span key={other}>
            {index > 0 && " · "}
            <a className="signin-link signin-link--quiet" href={`/${other}/sign-in`}>
              {DOOR_COPY[other].name}
            </a>
          </span>
        ))}
      </p>
      <p className="signin-seal-line">
        <PsuSeal size={24} clearSpace={false} />
        Pangasinan State University · Lingayen Campus
        {!standalone && (
          <>
            {" · "}
            <a href="/" className="signin-link signin-link--quiet">
              INTERNet home
            </a>
          </>
        )}
      </p>
    </div>
  );
}

/** Phones and tablets: one template, the role's flat header over a white sheet. */
function PhoneTemplate({ role, form, extra, standalone }: { role: Role; form: ReactNode; extra: ReactNode; standalone: boolean }) {
  return (
    <main className="signin-phone">
      <header className="signin-phone-head">
        <span className="signin-chip">
          <span className="signin-chip-icon">
            <Glyph d={CHIP_ICON[role]} size={14} />
          </span>
          {DOOR_COPY[role].name}
        </span>
        <h1 id="door-title" className="signin-welcome">
          Welcome back.
        </h1>
        <p className="signin-lead">{WORDS[role].lead}</p>
        <svg className="signin-lane" viewBox="0 0 120 160" aria-hidden="true">
          <path d="M20 160 L90 0" className="signin-lane-edge" />
          <path d="M80 160 L118 0" className="signin-lane-dash" />
        </svg>
      </header>
      <section className="signin-sheet" aria-labelledby="door-title">
        {form}
        {extra}
        <FormFooter role={role} standalone={standalone} />
      </section>
    </main>
  );
}

function Logo() {
  return (
    <span className="signin-logo">
      <BrandIcon size={30} tile={BRAND.amber} fg={BRAND.navy} />
      <Wordmark height={15} tone="onDark" />
    </span>
  );
}

/** The trainee on a computer: what the computer is for, and the hand-off to the phone. */
function TraineeDesk({ form, extra, standalone }: { form: ReactNode; extra: ReactNode; standalone: boolean }) {
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
    <main className="signin-desk">
      <aside className="signin-panel">
        <Logo />
        <div className="signin-panel-copy">
          <p className="signin-kicker">Student portal</p>
          <h2 className="signin-panel-title">
            Your road to graduation, <em>one verified day</em> at a time.
          </h2>
          <ul className="signin-features">
            <li>
              <Glyph d="M12 7v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" /> Attendance with proof
            </li>
            <li>
              <Glyph d="M9 11l3 3 8-8M20 12v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h9" /> Tasks and documents
            </li>
            <li>
              <Glyph d="M4 20V10M10 20V4M16 20v-7M22 20H2" /> Progress you can see
            </li>
          </ul>
        </div>
        <div className="signin-handoff">
          <span className="signin-qr" aria-hidden="true" dangerouslySetInnerHTML={{ __html: qr }} />
          <span>
            <b>Time in from your phone</b>
            <i>Your daily camera check works best on a phone. Scan to open INTERNet there, then install it.</i>
          </span>
        </div>
      </aside>
      <section className="signin-side" aria-labelledby="door-title">
        <div className="signin-side-inner">
          <h1 id="door-title" className="signin-title">
            {WORDS.student.deskTitle}
          </h1>
          <p className="signin-sub">{WORDS.student.deskLead}</p>
          {form}
          {extra}
          <p className="signin-note">
            <b>On a computer you can</b> check your hours, submit tasks and documents, write your journal and print your time record.
          </p>
          <FormFooter role="student" standalone={standalone} />
        </div>
      </section>
    </main>
  );
}

const QUEUE_EXAMPLE = [
  { tag: "Time-in", what: "7:58 AM · camera check" },
  { tag: "Task", what: "Inventory sheet · 2 files" },
  { tag: "Document", what: "MOA copy" },
  { tag: "Absence", what: "Friday, morning" },
];

/** The supervisor on a computer: the review queue beside the form. */
function SupervisorDesk({ form, extra, standalone }: { form: ReactNode; extra: ReactNode; standalone: boolean }) {
  return (
    <main className="signin-desk signin-desk--wide">
      <aside className="signin-panel">
        <Logo />
        <div className="signin-panel-copy">
          <p className="signin-kicker">Your review queue</p>
          <h2 className="signin-panel-title">Guide, verify and evaluate your interns.</h2>
          <div className="signin-queue" aria-label="An example of the review queue">
            <p className="signin-queue-head">
              <b>Review</b>
              <i>an example</i>
            </p>
            <ul>
              {QUEUE_EXAMPLE.map((row) => (
                <li key={row.tag}>
                  <span className="signin-queue-tag">{row.tag}</span>
                  <span className="min-w-0 truncate">{row.what}</span>
                  <span className="signin-queue-status">Pending</span>
                </li>
              ))}
            </ul>
          </div>
          <p className="signin-verify">
            <span>Verify all</span> offline time-ins are confirmed one by one
          </p>
          <ul className="signin-pills">
            <li>One review queue</li>
            <li>Reject the photo or the day</li>
            <li>Tasks for teams</li>
            <li>Message the coordinator</li>
          </ul>
        </div>
      </aside>
      <section className="signin-side" aria-labelledby="door-title">
        <div className="signin-side-inner">
          <h1 id="door-title" className="signin-title">
            {WORDS.supervisor.deskTitle}
          </h1>
          <p className="signin-sub">{WORDS.supervisor.deskLead}</p>
          {form}
          {extra}
          <p className="signin-tip">
            <b>On a shared office computer?</b> Leave &ldquo;Keep me signed in&rdquo; off.
          </p>
          <FormFooter role="supervisor" standalone={standalone} />
        </div>
      </section>
    </main>
  );
}

/** The coordinator on a computer: a card over the console, blurred, with the tools only they have. */
function CoordinatorDesk({ form, extra, standalone }: { form: ReactNode; extra: ReactNode; standalone: boolean }) {
  return (
    <main className="signin-console">
      <div className="signin-console-bg" aria-hidden="true">
        <span className="signin-console-side">
          {Array.from({ length: 12 }, (_, i) => (
            <i key={i} />
          ))}
        </span>
        <span className="signin-console-main">
          <i className="bar" />
          <i />
          <i />
          <i />
          <i />
          <i className="wide" />
        </span>
      </div>
      <div className="signin-console-row">
        <section className="signin-card" aria-labelledby="door-title">
          <div className="signin-card-head">
            <Logo />
            <h1 id="door-title" className="signin-card-title">
              {WORDS.coordinator.deskTitle}
            </h1>
            <p>{WORDS.coordinator.deskLead}</p>
          </div>
          <div className="signin-card-body">
            {form}
            {extra}
            <FormFooter role="coordinator" standalone={standalone} />
          </div>
        </section>
        <ul className="signin-tools" aria-label="In the console">
          <li>
            <b>What needs you, first</b>
            <i>Appeals, flagged logs and who to nudge.</i>
          </li>
          <li>
            <b>One filter for everything</b>
            <i>Term, college, program, block, company or supervisor.</i>
          </li>
          <li>
            <b>Every change is recorded</b>
            <i>The audit log keeps who changed what, and when.</i>
          </li>
          <li>
            <b>Reports to go</b>
            <i>Analytics export as a PDF for the dean.</i>
          </li>
        </ul>
      </div>
    </main>
  );
}

export default function Door({ role }: { role: Role }) {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  // Read once, when the door opens: signing in here must not trigger it.
  const [alreadySignedIn] = useState(signedInRole);
  const computer = useMediaQuery("(min-width: 1024px)");
  const standalone = useStandalone();
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
  if (!computer) return <PhoneTemplate role={role} form={form} extra={extra} standalone={standalone} />;
  if (role === "student") return <TraineeDesk form={form} extra={extra} standalone={standalone} />;
  if (role === "supervisor") return <SupervisorDesk form={form} extra={extra} standalone={standalone} />;
  return <CoordinatorDesk form={form} extra={extra} standalone={standalone} />;
}

/** "/": a signed-in person's portal, otherwise the door they used last. */
export function DoorRedirect() {
  const signed = signedInRole();
  return <Navigate to={signed ? HOME_PATH[signed] : `/${lastDoorRole()}/sign-in`} replace />;
}
