import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import Icon from "../components/Icon";
import { Button, FormError, FormField } from "../components/ui";
import AuthShell from "../layouts/AuthShell";
import { API_URL, PASSWORD_POLICY_HINT, passwordPolicyError } from "../lib/api";

type Role = "student" | "supervisor" | "coordinator";

/**
 * Two steps on one route: asking for a reset link (no token in the URL),
 * and choosing the new password (the emailed link carries a token).
 */
export default function ForgotPassword() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");
  const initialRole = searchParams.get("role");

  const [role, setRole] = useState<Role>(
    initialRole === "supervisor" || initialRole === "coordinator" ? initialRole : "student"
  );
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [showPasswords, setShowPasswords] = useState(false);
  const [done, setDone] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (token) {
      const policy = passwordPolicyError(password);
      if (policy) return setError(policy);
      if (password !== confirmation) return setError("The two passwords don't match.");
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      return setError("Enter the email address on your account.");
    }

    setSubmitting(true);
    setError("");
    try {
      const response = await fetch(
        `${API_URL}/api/auth/password-reset/${token ? "confirm" : "request"}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(token ? { token, password } : { role, email: email.trim() }),
        }
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || "Password recovery failed.");
      setDone(data.message || "Done.");
    } catch (requestError) {
      setError(
        requestError instanceof TypeError
          ? "Can't reach the server. Check your connection and try again."
          : requestError instanceof Error
            ? requestError.message
            : "Password recovery failed."
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthShell
      title={token ? "Choose a new password" : "Reset your password"}
      description={
        token
          ? PASSWORD_POLICY_HINT
          : "Enter the email on your account. If it matches an active account, a reset link is sent to it."
      }
    >
      {done ? (
        <div className="mt-6">
          <p
            role="status"
            className="flex items-start gap-2 rounded-lg bg-emerald-50 px-3 py-2.5 text-sm text-emerald-900"
          >
            <Icon name="check-circle" size={16} className="mt-0.5 shrink-0" />
            {done}
          </p>
          <Link
            to="/"
            className="mt-5 inline-flex h-10 w-full items-center justify-center rounded-lg bg-psu-700 text-sm font-semibold text-white hover:bg-psu-800"
          >
            Back to sign in
          </Link>
        </div>
      ) : (
        <form className="mt-6 space-y-4" onSubmit={submit} noValidate>
          {token ? (
            <>
              <FormField label="New password" htmlFor="reset-password">
                <input
                  id="reset-password"
                  type={showPasswords ? "text" : "password"}
                  autoComplete="new-password"
                  maxLength={128}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="field h-11"
                />
              </FormField>
              <FormField label="Confirm new password" htmlFor="reset-confirmation">
                <input
                  id="reset-confirmation"
                  type={showPasswords ? "text" : "password"}
                  autoComplete="new-password"
                  maxLength={128}
                  value={confirmation}
                  onChange={(event) => setConfirmation(event.target.value)}
                  className="field h-11"
                />
              </FormField>
              <label className="flex items-center gap-2 text-sm text-slate-600">
                <input
                  type="checkbox"
                  checked={showPasswords}
                  onChange={(event) => setShowPasswords(event.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 accent-psu-700"
                />
                Show passwords
              </label>
            </>
          ) : (
            <>
              <FormField label="I am a" htmlFor="reset-role">
                <select
                  id="reset-role"
                  value={role}
                  onChange={(event) => setRole(event.target.value as Role)}
                  className="field h-11"
                >
                  <option value="student">Student</option>
                  <option value="supervisor">Supervisor</option>
                  <option value="coordinator">Coordinator</option>
                </select>
              </FormField>
              <FormField label="Email address" htmlFor="reset-email">
                <input
                  id="reset-email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className="field h-11"
                />
              </FormField>
            </>
          )}

          <FormError message={error} />

          <Button type="submit" size="lg" block busy={submitting}>
            {submitting ? "Please wait" : token ? "Save new password" : "Send reset link"}
          </Button>

          <Link
            to="/"
            className="block text-center text-sm font-semibold text-psu-700 hover:underline"
          >
            Back to sign in
          </Link>
        </form>
      )}
    </AuthShell>
  );
}
