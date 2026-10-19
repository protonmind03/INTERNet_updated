import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { BrandLockup, PsuSeal, type Role } from "../brand";
import { errorText } from "../brand/roles";
import { useRoleTheme } from "../brand/useRoleTheme";
import { IosInstallGuide } from "../components/InstallApp";
import { API_URL } from "../lib/api";
import { DOOR_COPY, DOOR_ROLES, lastDoorRole, rememberDoorRole, signedInRole } from "../lib/doors";
import { HOME_PATH, preloadHome } from "../lib/homePages";
import { useInstallPrompt } from "../lib/useInstallPrompt";

/*
|--------------------------------------------------------------------------
| THE THREE DOORS (Iteration 23)
|--------------------------------------------------------------------------
|
| /student/sign-in ("Badge-in"), /supervisor/sign-in ("Desk") and
| /coordinator/sign-in ("Console"). Each sets its role's palette and links
| its role's app manifest, and sends the sign-in to its role's own endpoint,
| with the rules unchanged. Someone already signed in, in any role, is taken
| to their own portal. A failed sign-in says only what the role's endpoint
| says: nothing about whether the address belongs to another role.
|
| Passkey sign-in is not offered: a sign-in challenge has no trainee yet,
| and the challenge table requires one (see docs/PROGRESS-ITER-18-23.md).
|
*/

// Local development only: the seeded demo accounts, so the form is ready to submit.
const DEV_ACCOUNTS: Record<Role, { identifier: string; password: string }> = {
  student: { identifier: "student.demo@internet.test", password: "StudentDemo123!" },
  supervisor: { identifier: "supervisor.demo@internet.test", password: "SupervisorDemo123!" },
  coordinator: { identifier: "coordinator@internet.psu.edu.ph", password: "Coordinator123!" },
};

type Phase = "idle" | "working" | "success" | "error";

function SignInForm({ role, onSignedIn, tone }: { role: Role; onSignedIn: (mustChange: boolean) => void; tone: "light" | "dark" }) {
  const copy = DOOR_COPY[role];
  const dev = import.meta.env.DEV ? DEV_ACCOUNTS[role] : null;
  const [id, setId] = useState(dev?.identifier ?? "");
  const [pw, setPw] = useState(dev?.password ?? "");
  const [show, setShow] = useState(false);
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
  const label = tone === "dark" ? "text-(--role-on-chrome)" : "text-(--role-ink)";
  const field =
    "door-field w-full min-h-[48px] rounded-(--inb-r-control) border bg-white px-3.5 text-[16px] text-(--land-ink) outline-none";

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-5">
      {notice && (
        <p role="status" className="m-0 rounded-(--inb-r-control) bg-(--status-warning-bg) px-3.5 py-3 text-sm text-(--status-warning-ink)">
          {notice}
        </p>
      )}
      <div className="flex flex-col gap-1.5">
        <label htmlFor="inb-login-id" className={`text-sm font-semibold ${label}`}>
          {copy.idLabel}
        </label>
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
          className={field}
          data-invalid={invalid || undefined}
        />
        <span id="inb-login-id-help" className={`text-[13px] ${tone === "dark" ? "door-muted-dark" : "door-muted"}`}>
          {copy.idHelp}
        </span>
      </div>
      <div className="flex flex-col gap-1.5">
        <div className="flex items-baseline justify-between gap-3">
          <label htmlFor="inb-login-pw" className={`text-sm font-semibold ${label}`}>
            Password
          </label>
          <a href={`/forgot-password?role=${role}`} className="door-link inline-flex min-h-11 items-center text-sm font-semibold">
            Forgot password?
          </a>
        </div>
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
            className={`${field} pr-20`}
            data-invalid={invalid || undefined}
          />
          <button
            type="button"
            onClick={() => setShow((value) => !value)}
            aria-label={show ? "Hide password" : "Show password"}
            aria-pressed={show}
            className="absolute right-1 top-1 h-10 min-w-16 rounded-lg px-3 text-sm font-semibold text-(--land-ink) hover:bg-(--land-paper-warm)"
          >
            {show ? "Hide" : "Show"}
          </button>
        </div>
        {caps && (
          <span id="inb-login-caps" role="status" className="text-[13px] font-semibold text-(--status-warning-ink)">
            Caps Lock is on
          </span>
        )}
      </div>
      {invalid && (
        <p role="alert" className="m-0 rounded-(--inb-r-control) bg-(--status-late-bg) px-3.5 py-3 text-sm leading-snug text-(--status-late-ink)">
          {error}
        </p>
      )}
      <div className={role === "student" ? "door-thumb" : ""}>
        <button
          type="submit"
          aria-busy={phase === "working"}
          disabled={phase === "working"}
          className="door-submit inb-press flex min-h-[52px] w-full items-center justify-center rounded-(--inb-r-control) text-base font-bold"
        >
          {phase === "working" ? "Signing you in…" : phase === "success" ? copy.welcome : copy.button}
        </button>
      </div>
    </form>
  );
}

/** Install: the browser's own button where it offers one; the steps where it does not. */
function InstallBlock({ role, asked }: { role: Role; asked: boolean }) {
  const { install, installed, needsIosSteps } = useInstallPrompt();
  if (installed) return null;
  if (install) {
    return (
      <button type="button" onClick={() => void install()} className="door-install inb-press flex min-h-12 w-full items-center justify-center gap-2 rounded-(--inb-r-control) text-sm font-semibold">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 3v12M7 10l5 5 5-5M5 21h14" />
        </svg>
        Install {DOOR_COPY[role].appName}
      </button>
    );
  }
  if (!asked) return null;
  return (
    <div className="door-install-help rounded-(--inb-r-card) p-4 text-sm leading-relaxed" role="note">
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

function OtherDoors({ role }: { role: Role }) {
  return (
    <p className="m-0 text-center text-sm">
      Not {DOOR_COPY[role].article}?{" "}
      {DOOR_ROLES.filter((other) => other !== role).map((other, index) => (
        <span key={other}>
          {index > 0 && " · "}
          <a className="door-link inline-flex min-h-11 items-center font-semibold" href={`/${other}/sign-in`}>
            {DOOR_COPY[other].name} door
          </a>
        </span>
      ))}
    </p>
  );
}

function HomeLink({ tone }: { tone: "light" | "dark" }) {
  return (
    <a href="/" className={`door-link inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold ${tone === "dark" ? "door-link--dark" : ""}`}>
      <span aria-hidden="true">←</span> INTERNet home
    </a>
  );
}

/** The trainee's door: an ID card, with the seal at its corner and the button in the thumb's reach. */
function BadgeIn({ form, extra }: { form: ReactNode; extra: ReactNode }) {
  return (
    <main className="door door--badge min-h-dvh">
      <div className="mx-auto flex w-full max-w-md flex-col gap-5 px-4 pb-6 pt-[max(1.25rem,env(safe-area-inset-top))]">
        <HomeLink tone="light" />
        <section className="door-card" aria-labelledby="door-title">
          <span className="door-card-slot" aria-hidden="true" />
          <div className="door-card-head">
            <div className="min-w-0">
              <p className="door-kicker">INTERNet Trainee</p>
              <h1 id="door-title" className="door-title">
                Badge in
              </h1>
              <p className="door-sub">Pangasinan State University · Lingayen Campus</p>
            </div>
            <PsuSeal size={44} clearSpace={false} />
          </div>
          {form}
        </section>
        {extra}
      </div>
    </main>
  );
}

const QUEUE_PREVIEW = [
  { who: "Trainee 1", what: "Time in · 7:58 AM", tag: "Photo" },
  { who: "Trainee 2", what: "Task · Inventory sheet", tag: "Task" },
  { who: "Trainee 3", what: "Absence · Morning", tag: "Absence" },
  { who: "Trainee 1", what: "Time out · 5:02 PM", tag: "Day" },
];

/** The supervisor's door: a desk, the review queue on the left on a tablet or computer. */
function Desk({ form, extra }: { form: ReactNode; extra: ReactNode }) {
  return (
    <main className="door door--desk min-h-dvh md:grid md:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      <aside className="door-desk-preview hidden md:flex" aria-label="Your review queue (an example)">
        <div className="flex items-center gap-3">
          <PsuSeal size={36} clearSpace={false} />
          <p className="m-0 text-sm font-semibold">INTERNet Supervisor</p>
        </div>
        <div className="mt-auto">
          <p className="door-kicker">Your review queue</p>
          <p className="m-0 mt-2 max-w-sm text-[15px] leading-relaxed">Time-ins, tasks, documents and absences wait here until you verify them.</p>
          <ul className="door-queue" aria-hidden="true">
            {QUEUE_PREVIEW.map((row, index) => (
              <li key={index}>
                <span className="font-semibold">{row.who}</span>
                <span className="door-queue-what">{row.what}</span>
                <span className="door-queue-tag">{row.tag}</span>
              </li>
            ))}
          </ul>
          <p className="m-0 mt-3 text-[13px]">An example: your own queue shows after you sign in.</p>
        </div>
      </aside>
      <div className="flex flex-col justify-center px-4 py-8 md:px-12">
        <div className="mx-auto flex w-full max-w-md flex-col gap-5">
          <HomeLink tone="light" />
          <div className="flex items-center gap-3 md:hidden">
            <PsuSeal size={36} clearSpace={false} />
            <p className="m-0 text-sm font-semibold text-(--role-ink)">INTERNet Supervisor</p>
          </div>
          <div>
            <h1 className="door-title">Sign in to your desk</h1>
            <p className="door-sub">Verify your trainees&rsquo; days, tasks and documents.</p>
          </div>
          {form}
          <p className="door-help m-0 text-sm leading-relaxed">
            No account, or locked out? Supervisor accounts are made by the OJT coordinator at the OJT office, PSU Lingayen Campus. Ask them.
          </p>
          {extra}
        </div>
      </div>
    </main>
  );
}

/** Only "Service reachable", from /api/health; nothing at all until it answers. */
function ServiceStatus() {
  const [reachable, setReachable] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    fetch(`${API_URL}/api/health`, { signal: controller.signal })
      .then((response) => setReachable(response.ok))
      .catch(() => setReachable(false));
    return () => controller.abort();
  }, []);
  return (
    <p className="door-status m-0" role="status" aria-live="polite">
      {reachable && (
        <>
          <span className="door-status-dot" aria-hidden="true" />
          Service reachable
        </>
      )}
    </p>
  );
}

/** The coordinator's door: the console, in the Royal Seal's dark chrome. */
function Console({ form, extra }: { form: ReactNode; extra: ReactNode }) {
  return (
    <main className="door door--console min-h-dvh">
      <div className="mx-auto flex w-full max-w-xl flex-col gap-6 px-4 pb-8 pt-[max(1.25rem,env(safe-area-inset-top))] md:pt-12">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <HomeLink tone="dark" />
          <ServiceStatus />
        </div>
        <div className="door-console-lockup">
          <BrandLockup withSeal tone="onDark" size={28} />
        </div>
        <section className="door-console-panel" aria-labelledby="door-title">
          <p className="door-kicker">INTERNet Coordinator</p>
          <h1 id="door-title" className="door-title">
            Console sign-in
          </h1>
          <p className="door-sub">The program&rsquo;s monitoring, records and settings.</p>
          <div className="mt-5">{form}</div>
        </section>
        {extra}
      </div>
    </main>
  );
}

export default function Door({ role }: { role: Role }) {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  // Read once, when the door opens: signing in here must not trigger it.
  const [alreadySignedIn] = useState(signedInRole);
  useRoleTheme(role);

  useEffect(() => {
    document.title = `${DOOR_COPY[role].name} sign-in · INTERNet`;
  }, [role]);

  if (alreadySignedIn) return <Navigate to={HOME_PATH[alreadySignedIn]} replace />;

  const onSignedIn = (must: boolean) => {
    window.setTimeout(() => navigate(must ? `/change-password?role=${role}` : HOME_PATH[role]), 400);
  };
  const tone = role === "coordinator" ? "dark" : "light";
  const form = <SignInForm role={role} onSignedIn={onSignedIn} tone={tone} />;
  const extra = (
    <>
      <InstallBlock role={role} asked={params.get("install") === "1"} />
      <OtherDoors role={role} />
      {role === "student" && <IosInstallGuide />}
    </>
  );
  if (role === "student") return <BadgeIn form={form} extra={extra} />;
  if (role === "supervisor") return <Desk form={form} extra={extra} />;
  return <Console form={form} extra={extra} />;
}

/** "/": a signed-in person's portal, otherwise the door they used last. */
export function DoorRedirect() {
  const signed = signedInRole();
  return <Navigate to={signed ? HOME_PATH[signed] : `/${lastDoorRole()}/sign-in`} replace />;
}
