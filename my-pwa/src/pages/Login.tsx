import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { BrandLockup, ROLE_THEMES, SplashScreen } from "../brand";
import Icon, { type IconName } from "../components/Icon";
import { Button } from "../components/ui";
import { API_URL } from "../lib/api";
import { useInstallPrompt } from "../lib/install";

type Role = "student" | "supervisor" | "coordinator";

const ROLES: {
  role: Role;
  label: string;
  icon: IconName;
  /** What this role does in the system, shown under the role tabs. */
  blurb: string;
  identifierLabel: string;
  identifierHint: string;
  identifierIcon: IconName;
  home: string;
}[] = [
  {
    role: "student",
    label: "Student",
    icon: "user",
    blurb: "Time in, tasks, documents and your OJT hours.",
    identifierLabel: "Student ID or email",
    identifierHint: "Your student number or the email on your account",
    identifierIcon: "user",
    home: "/student/dashboard",
  },
  {
    role: "supervisor",
    label: "Supervisor",
    icon: "briefcase",
    blurb: "Verify attendance, assign tasks and evaluate your interns.",
    identifierLabel: "Company email",
    identifierHint: "The email your OJT coordinator registered for you",
    identifierIcon: "mail",
    home: "/supervisor/dashboard",
  },
  {
    role: "coordinator",
    label: "Coordinator",
    icon: "clipboard",
    blurb: "Students, supervisors, requirements and programme analytics.",
    identifierLabel: "Coordinator email",
    identifierHint: "Your university email",
    identifierIcon: "mail",
    home: "/coordinator/dashboard",
  },
];

// Local development only: the seeded demo accounts, so the form is ready to
// submit. None of this is included in a production build.
const DEV_ACCOUNTS: Record<Role, { email: string; password: string }> = {
  student: { email: "student.demo@internet.test", password: "StudentDemo123!" },
  supervisor: { email: "supervisor.demo@internet.test", password: "SupervisorDemo123!" },
  coordinator: { email: "coordinator@internet.psu.edu.ph", password: "Coordinator123!" },
};

const HIGHLIGHTS: { icon: IconName; title: string; text: string }[] = [
  {
    icon: "clock",
    title: "Attendance with proof",
    text: "Interns time in with a photo; supervisors verify each day.",
  },
  {
    icon: "tasks",
    title: "Tasks and documents",
    text: "Assign work, submit requirements and review them in one place.",
  },
  {
    icon: "star",
    title: "Progress you can see",
    text: "Hours, evaluations and concerns reach the coordinator as they happen.",
  },
];

export default function Login() {
  const navigate = useNavigate();

  const [role, setRole] = useState<Role>("student");
  const [identifier, setIdentifier] = useState(
    import.meta.env.DEV ? DEV_ACCOUNTS.student.email : ""
  );
  const [password, setPassword] = useState(
    import.meta.env.DEV ? DEV_ACCOUNTS.student.password : ""
  );
  const [showPassword, setShowPassword] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const install = useInstallPrompt();
  const noteCapsLock = (event: React.KeyboardEvent<HTMLInputElement>) =>
    setCapsLock(event.getModifierState("CapsLock"));
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  // After a successful sign-in the role's launch screen shows briefly, then the portal opens.
  const [launch, setLaunch] = useState<{ role: Role; to: string } | null>(null);
  // Set by the session guard when it sends an expired session back here.
  const [notice, setNotice] = useState(
    () => sessionStorage.getItem("session_notice") || ""
  );

  useEffect(() => {
    sessionStorage.removeItem("session_notice");
    document.title = "Sign in · INTERNet";
  }, []);

  useEffect(() => {
    if (!launch) return;
    const timer = window.setTimeout(() => navigate(launch.to), 1200);
    return () => window.clearTimeout(timer);
  }, [launch, navigate]);

  const current = ROLES.find((item) => item.role === role)!;

  const chooseRole = (next: Role) => {
    if (next === role) return;
    setRole(next);
    setError("");
    setIdentifier(import.meta.env.DEV ? DEV_ACCOUNTS[next].email : "");
    setPassword(import.meta.env.DEV ? DEV_ACCOUNTS[next].password : "");
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setNotice("");
    if (!identifier.trim() || !password) {
      setError(`Enter your ${current.identifierLabel.toLowerCase()} and password.`);
      return;
    }

    setSubmitting(true);
    setError("");
    try {
      const response = await fetch(`${API_URL}/api/login/${role}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: identifier.trim(), password }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(data.message || "That email or password is not correct.");
        return;
      }

      const account = data[role];
      localStorage.setItem(role, JSON.stringify(account));
      localStorage.setItem(`${role}_id`, String(account[`${role}_id`]));
      localStorage.setItem(`${role}_token`, data.token);
      localStorage.setItem("active_role", role);
      window.dispatchEvent(new Event("internet-auth-changed"));

      try {
        sessionStorage.removeItem("inb_splash_seen");
      } catch {
        /* private mode: nothing to clear */
      }
      setLaunch({
        role,
        to: data.must_change_password ? `/change-password?role=${role}` : current.home,
      });
    } catch {
      setError("Can't reach the server. Check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-dvh flex-col bg-white lg:flex-row">
      {launch && <SplashScreen role={launch.role} />}

      {/* BRAND PANEL (desktops) */}
      <div className="surface-brand relative hidden w-[46%] flex-col justify-between overflow-hidden p-10 text-white lg:flex xl:p-12">
        <SealRings className="-bottom-40 -right-40 w-[42rem]" />
        {/* A gold edge where the panel meets the form. */}
        <span
          aria-hidden="true"
          className="absolute inset-y-0 right-0 w-px bg-linear-to-b from-transparent via-gold-400/60 to-transparent"
        />

        <BrandLockup tone="onDark" size={28} tagline={null} />

        <div className="relative max-w-md">
          <p className="inline-flex items-center gap-2 text-sm font-semibold uppercase tracking-widest text-gold-300">
            <span aria-hidden="true" className="h-px w-6 bg-gold-400" />
            Pangasinan State University
          </p>
          <h2 className="mt-4 text-4xl font-bold leading-[1.15] tracking-tight">
            On-the-job training, tracked from the first day to the{" "}
            <span className="text-gold-300">last hour</span>.
          </h2>
          <ul className="mt-9 space-y-3">
            {HIGHLIGHTS.map((item) => (
              <li
                key={item.title}
                className="flex gap-4 rounded-xl bg-white/[0.06] p-3.5 ring-1 ring-inset ring-white/10"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gold-400/15 text-gold-300 ring-1 ring-inset ring-gold-300/25">
                  <Icon name={item.icon} size={20} />
                </span>
                <div>
                  <p className="font-semibold">{item.title}</p>
                  <p className="text-sm text-psu-100">{item.text}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div className="relative flex flex-wrap items-center justify-between gap-x-6 gap-y-1 border-t border-white/10 pt-5 text-sm text-psu-200">
          <p>Lingayen Campus</p>
          <p>{ROLE_THEMES.guest.portal}</p>
        </div>
      </div>

      {/* BRAND BAND (phones and tablets) */}
      <header className="surface-brand relative overflow-hidden px-6 pb-14 pt-[max(2rem,env(safe-area-inset-top))] text-white lg:hidden">
        <SealRings className="-right-24 -top-24 w-80" />
        <div className="relative mx-auto w-full max-w-sm">
          <BrandLockup tone="onDark" size={22} tagline={null} />
          <p className="mt-6 text-xs font-semibold uppercase tracking-widest text-gold-300">
            Pangasinan State University
          </p>
          <p className="mt-1.5 text-xl font-bold leading-snug tracking-tight">
            On-the-job training, tracked from the first day to the last hour.
          </p>
        </div>
      </header>

      {/* SIGN-IN PANEL */}
      <main className="login-stage relative -mt-6 flex flex-1 flex-col items-center rounded-t-3xl bg-white px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-7 lg:mt-0 lg:justify-center lg:rounded-none lg:bg-slate-50 lg:px-8 lg:py-10">
        <div className="w-full max-w-sm animate-page-in lg:max-w-md lg:rounded-2xl lg:border lg:border-slate-200/80 lg:bg-white lg:p-8 lg:shadow-raised">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Sign in</h1>
          <p className="mt-1 text-sm text-slate-600">Choose your role to continue.</p>

          <div
            role="tablist"
            aria-label="Role"
            className="mt-5 grid grid-cols-3 gap-1 rounded-xl bg-slate-100 p-1 ring-1 ring-inset ring-slate-200/70"
          >
            {ROLES.map((item) => {
              const active = role === item.role;
              return (
                <button
                  key={item.role}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => chooseRole(item.role)}
                  className={`flex flex-col items-center gap-1 rounded-lg px-1 py-2 text-sm font-semibold transition-colors duration-200 ${
                    active
                      ? "bg-white text-psu-800 shadow-sm ring-1 ring-psu-600/10"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  <Icon
                    name={item.icon}
                    size={18}
                    className={active ? "text-psu-600" : "text-slate-400"}
                  />
                  {item.label}
                </button>
              );
            })}
          </div>
          <p key={role} className="mt-2.5 animate-fade-in text-center text-xs text-slate-500">
            {current.blurb}
          </p>

          {notice && !error && (
            <p
              role="status"
              className="mt-4 flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2.5 text-sm text-amber-900 ring-1 ring-inset ring-amber-600/15"
            >
              <Icon name="info" size={16} className="mt-0.5 shrink-0" />
              {notice}
            </p>
          )}
          {error && (
            <p
              role="alert"
              className="mt-4 flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2.5 text-sm text-red-700 ring-1 ring-inset ring-red-600/15"
            >
              <Icon name="alert" size={16} className="mt-0.5 shrink-0" />
              {error}
            </p>
          )}

          <form onSubmit={submit} className="mt-5 space-y-4" noValidate>
            <div>
              <label
                htmlFor="login-identifier"
                className="mb-1.5 block text-sm font-medium text-slate-700"
              >
                {current.identifierLabel}
              </label>
              <div className="relative">
                <Icon
                  name={current.identifierIcon}
                  size={17}
                  className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
                />
                <input
                  id="login-identifier"
                  type={role === "student" ? "text" : "email"}
                  autoComplete="username"
                  autoCapitalize="none"
                  spellCheck={false}
                  value={identifier}
                  onChange={(event) => setIdentifier(event.target.value)}
                  className="field h-12 pl-10"
                />
              </div>
              <p className="mt-1 text-xs text-slate-500">{current.identifierHint}</p>
            </div>

            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <label
                  htmlFor="login-password"
                  className="block text-sm font-medium text-slate-700"
                >
                  Password
                </label>
                <Link
                  to={`/forgot-password?role=${role}`}
                  className="text-sm font-semibold text-psu-700 hover:underline"
                >
                  Forgot password?
                </Link>
              </div>
              <div className="relative">
                <Icon
                  name="lock"
                  size={17}
                  className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
                />
                <input
                  id="login-password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  onKeyDown={noteCapsLock}
                  onKeyUp={noteCapsLock}
                  onBlur={() => setCapsLock(false)}
                  aria-describedby={capsLock ? "login-caps-lock" : undefined}
                  className="field h-12 pl-10 pr-16"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((shown) => !shown)}
                  aria-pressed={showPassword}
                  className="absolute inset-y-0 right-0 rounded-r-lg px-3.5 text-sm font-semibold text-slate-600 hover:text-slate-900"
                >
                  {showPassword ? "Hide" : "Show"}
                </button>
              </div>
              {capsLock && (
                <p
                  id="login-caps-lock"
                  role="status"
                  className="mt-1.5 flex items-center gap-1.5 text-xs font-medium text-amber-700"
                >
                  <Icon name="alert" size={14} className="shrink-0" />
                  Caps Lock is on
                </p>
              )}
            </div>

            <Button type="submit" size="lg" block busy={submitting} failed={Boolean(error)} busyProcess="signIn">
              {submitting ? "Signing in" : `Sign in as ${current.label.toLowerCase()}`}
            </Button>
          </form>

          <p className="mt-5 flex items-start gap-2.5 rounded-lg bg-psu-50/70 px-3 py-2.5 text-sm text-slate-600 ring-1 ring-inset ring-psu-600/10">
            <Icon name="info" size={16} className="mt-0.5 shrink-0 text-psu-600" />
            No account yet? Your OJT coordinator creates one for you.
          </p>

          {install && (
            <button
              type="button"
              onClick={() => void install()}
              className="mt-3 flex w-full items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-left transition-colors hover:border-psu-300 hover:bg-psu-50/50"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-psu-50 text-psu-700 ring-1 ring-inset ring-psu-600/10">
                <Icon name="download" size={17} />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-slate-800">
                  Install INTERNet
                </span>
                <span className="block text-xs text-slate-500">
                  Open it from your home screen like any other app.
                </span>
              </span>
            </button>
          )}
        </div>

        <p className="mt-6 text-center text-xs text-slate-500">
          INTERNet · {ROLE_THEMES.guest.portal}
          <span className="lg:hidden"> · PSU Lingayen Campus</span>
        </p>
      </main>
    </div>
  );
}

/** Concentric rings, after the university seal. */
function SealRings({ className }: { className: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 600 600"
      className={`pointer-events-none absolute text-white/[0.06] ${className}`}
      fill="none"
      stroke="currentColor"
    >
      <circle cx="300" cy="300" r="296" strokeWidth="2" />
      <circle cx="300" cy="300" r="236" strokeWidth="28" />
      <circle cx="300" cy="300" r="170" strokeWidth="2" />
    </svg>
  );
}
