import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { BrandLockup } from "../components/Brand";
import Icon, { type IconName } from "../components/Icon";
import { Button } from "../components/ui";
import { API_URL } from "../lib/api";

type Role = "student" | "supervisor" | "coordinator";

const ROLES: {
  role: Role;
  label: string;
  identifierLabel: string;
  identifierHint: string;
  home: string;
}[] = [
  {
    role: "student",
    label: "Student",
    identifierLabel: "Student ID or email",
    identifierHint: "Your student number or the email on your account",
    home: "/student/dashboard",
  },
  {
    role: "supervisor",
    label: "Supervisor",
    identifierLabel: "Company email",
    identifierHint: "The email your OJT coordinator registered for you",
    home: "/supervisor/dashboard",
  },
  {
    role: "coordinator",
    label: "Coordinator",
    identifierLabel: "Coordinator email",
    identifierHint: "Your university email",
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
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  // Set by the session guard when it sends an expired session back here.
  const [notice, setNotice] = useState(
    () => sessionStorage.getItem("session_notice") || ""
  );

  useEffect(() => {
    sessionStorage.removeItem("session_notice");
    document.title = "Sign in · INTERNet";
  }, []);

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

      navigate(
        data.must_change_password ? `/change-password?role=${role}` : current.home
      );
    } catch {
      setError("Can't reach the server. Check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-dvh bg-white">
      {/* BRAND PANEL */}
      <div className="relative hidden w-[46%] flex-col justify-between overflow-hidden bg-psu-900 p-10 text-white lg:flex">
        {/* Concentric rings, after the university seal. */}
        <svg
          aria-hidden="true"
          viewBox="0 0 600 600"
          className="pointer-events-none absolute -bottom-40 -right-40 w-[42rem] text-white/[0.06]"
          fill="none"
          stroke="currentColor"
        >
          <circle cx="300" cy="300" r="296" strokeWidth="2" />
          <circle cx="300" cy="300" r="236" strokeWidth="28" />
          <circle cx="300" cy="300" r="170" strokeWidth="2" />
        </svg>

        <BrandLockup portal="OJT Monitoring System" />

        <div className="relative max-w-md">
          <p className="text-sm font-semibold uppercase tracking-widest text-gold-300">
            Pangasinan State University
          </p>
          <h2 className="mt-3 text-4xl font-bold leading-tight tracking-tight">
            On-the-job training, tracked from the first day to the last hour.
          </h2>
          <ul className="mt-9 space-y-5">
            {HIGHLIGHTS.map((item) => (
              <li key={item.title} className="flex gap-4">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white/10 text-gold-300">
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

        <p className="relative text-sm text-psu-200">Lingayen Campus</p>
      </div>

      {/* SIGN-IN PANEL */}
      <div className="flex flex-1 flex-col items-center justify-center px-5 py-10">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <BrandLockup portal="OJT Monitoring System" tone="light" />
          </div>

          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Sign in</h1>
          <p className="mt-1 text-sm text-slate-600">Choose your role to continue.</p>

          <div
            role="tablist"
            aria-label="Role"
            className="mt-6 grid grid-cols-3 gap-1 rounded-xl bg-slate-100 p-1"
          >
            {ROLES.map((item) => (
              <button
                key={item.role}
                type="button"
                role="tab"
                aria-selected={role === item.role}
                onClick={() => chooseRole(item.role)}
                className={`rounded-lg px-2 py-2 text-sm font-semibold transition-colors ${
                  role === item.role
                    ? "bg-white text-psu-800 shadow-sm"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>

          {notice && !error && (
            <p
              role="status"
              className="mt-4 flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2.5 text-sm text-amber-900"
            >
              <Icon name="info" size={16} className="mt-0.5 shrink-0" />
              {notice}
            </p>
          )}
          {error && (
            <p
              role="alert"
              className="mt-4 flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2.5 text-sm text-red-700"
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
              <input
                id="login-identifier"
                type={role === "student" ? "text" : "email"}
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                value={identifier}
                onChange={(event) => setIdentifier(event.target.value)}
                className="field h-11"
              />
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
                <input
                  id="login-password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="field h-11 pr-16"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((shown) => !shown)}
                  aria-pressed={showPassword}
                  className="absolute inset-y-0 right-0 px-3 text-sm font-semibold text-slate-600 hover:text-slate-900"
                >
                  {showPassword ? "Hide" : "Show"}
                </button>
              </div>
            </div>

            <Button type="submit" size="lg" block busy={submitting}>
              {submitting ? "Signing in" : `Sign in as ${current.label.toLowerCase()}`}
            </Button>
          </form>

          <p className="mt-6 text-center text-sm text-slate-500">
            No account yet? Your OJT coordinator creates one for you.
          </p>
        </div>
      </div>
    </div>
  );
}
