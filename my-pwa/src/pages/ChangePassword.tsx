import { useState } from "react";
import { Navigate, useNavigate, useSearchParams } from "react-router-dom";
import {
  API_URL,
  PASSWORD_POLICY_HINT,
  passwordPolicyError,
  storeRotatedToken,
  withRoleAuth,
} from "../lib/api";

type Role = "student" | "supervisor" | "coordinator";

const roles: Record<Role, { plural: string; home: string }> = {
  student: { plural: "students", home: "/student/dashboard" },
  supervisor: { plural: "supervisors", home: "/supervisor/dashboard" },
  coordinator: { plural: "coordinators", home: "/coordinator/dashboard" },
};

/**
 * Shown right after login when the account still has a password that
 * someone else chose. The API rejects everything else until it is replaced.
 */
export default function ChangePassword() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const roleParam = params.get("role");
  const role = roleParam && roleParam in roles ? (roleParam as Role) : null;

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const accountId = role ? localStorage.getItem(`${role}_id`) : null;
  if (!role || !accountId || !localStorage.getItem(`${role}_token`)) {
    return <Navigate to="/" replace />;
  }

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");

    if (!currentPassword || !newPassword || !confirmation) {
      setError("Fill in all three password fields.");
      return;
    }
    if (newPassword !== confirmation) {
      setError("New password and confirmation don't match.");
      return;
    }
    const policyError = passwordPolicyError(newPassword);
    if (policyError) {
      setError(policyError);
      return;
    }

    try {
      setSubmitting(true);
      const response = await fetch(
        `${API_URL}/api/${roles[role].plural}/${encodeURIComponent(accountId)}/password`,
        withRoleAuth(role, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            current_password: currentPassword,
            new_password: newPassword,
          }),
        })
      );
      const data = await response.json();
      if (!response.ok) {
        setError(data.message || "Failed to update password.");
        return;
      }
      storeRotatedToken(role, data.token);
      navigate(roles[role].home, { replace: true });
    } catch {
      setError("Unable to connect to the server.");
    } finally {
      setSubmitting(false);
    }
  };

  const inputClass =
    "mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:border-slate-400 focus:outline-none";

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-10">
      <section className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-7 shadow-sm">
        <h1 className="text-xl font-semibold text-slate-900">
          Set your own password
        </h1>
        <p className="mt-2 text-sm text-slate-500">
          Your account still uses a password that was chosen for you. Replace
          it before continuing. {PASSWORD_POLICY_HINT}
        </p>

        <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
          <label className="block text-sm font-medium text-slate-700">
            Current password
            <input
              type="password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              className={inputClass}
            />
          </label>
          <label className="block text-sm font-medium text-slate-700">
            New password
            <input
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              className={inputClass}
            />
          </label>
          <label className="block text-sm font-medium text-slate-700">
            Confirm new password
            <input
              type="password"
              autoComplete="new-password"
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              className={inputClass}
            />
          </label>

          {error && (
            <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-lg bg-[#0c1322] py-2 text-sm font-semibold text-white hover:bg-[#16233f] disabled:opacity-60"
          >
            {submitting ? "Updating..." : "Update password and continue"}
          </button>
        </form>
      </section>
    </main>
  );
}
