import { useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { API_URL } from "../lib/api";

type Role = "student" | "supervisor" | "coordinator";

export default function ForgotPassword() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");
  const initialRole = searchParams.get("role");
  const [role, setRole] = useState<Role>(
    initialRole === "supervisor" || initialRole === "coordinator"
      ? initialRole
      : "student"
  );
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setMessage("");
    if (token && password !== confirmation) {
      setError("The passwords do not match.");
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch(
        `${API_URL}/api/auth/password-reset/${token ? "confirm" : "request"}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            token ? { token, password } : { role, email }
          ),
        }
      );
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || "Password recovery failed.");
      }
      setMessage(data.message);
      if (token) {
        setPassword("");
        setConfirmation("");
      }
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to complete password recovery."
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-10">
      <section className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-7 shadow-sm">
        <h1 className="text-xl font-semibold text-slate-900">
          {token ? "Set a new password" : "Reset your password"}
        </h1>
        <p className="mt-2 text-sm text-slate-500">
          {token
            ? "Choose a strong password to restore access to your account."
            : "Enter the email address associated with your account. If it matches an active account, we will email a secure reset link."}
        </p>

        <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
          {!token && (
            <>
              <label className="block text-sm font-medium text-slate-700">
                Account type
                <select
                  value={role}
                  onChange={(event) => setRole(event.target.value as Role)}
                  className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2"
                >
                  <option value="student">Student</option>
                  <option value="supervisor">Supervisor</option>
                  <option value="coordinator">Coordinator</option>
                </select>
              </label>
              <label className="block text-sm font-medium text-slate-700">
                Email address
                <input
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2"
                />
              </label>
            </>
          )}

          {token && (
            <>
              <label className="block text-sm font-medium text-slate-700">
                New password
                <input
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={12}
                  maxLength={128}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2"
                />
              </label>
              <label className="block text-sm font-medium text-slate-700">
                Confirm password
                <input
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={12}
                  maxLength={128}
                  value={confirmation}
                  onChange={(event) => setConfirmation(event.target.value)}
                  className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2"
                />
              </label>
              <p className="text-xs text-slate-500">
                Use 12–128 characters, including uppercase, lowercase, and a number.
              </p>
            </>
          )}

          {error && (
            <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
              {error}
            </p>
          )}
          {message && (
            <p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700">
              {message}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting
              ? "Please wait..."
              : token
                ? "Update password"
                : "Send reset link"}
          </button>
        </form>

        <Link
          to="/"
          className="mt-5 inline-block text-sm font-medium text-indigo-700 hover:underline"
        >
          Back to sign in
        </Link>
      </section>
    </main>
  );
}
