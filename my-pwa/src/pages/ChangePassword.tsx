import { toast } from "../lib/toast";
import { useState } from "react";
import { Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { useRoleTheme } from "../brand/useRoleTheme";
import { Button, FormError, FormField } from "../components/ui";
import AuthShell from "../layouts/AuthShell";
import {
  API_URL,
  PASSWORD_POLICY_HINT,
  passwordPolicyError,
  storeRotatedToken,
  withRoleAuth,
} from "../lib/api";
import { signOut as endSession } from "../lib/session";
import { HOME_PATH } from "../lib/homePages";

type Role = "student" | "supervisor" | "coordinator" | "director" | "admin";

/**
 * Every role whose account can be made with a temporary password. The Director
 * and the IT administrator were missing: their first sign-in was sent here, then
 * on to the landing page, and every page of their portal sent them back.
 */
const roles: Record<Role, { plural: string; home: string; givenBy: string }> = {
  student: { plural: "students", home: HOME_PATH.student, givenBy: "your OJT coordinator gave you" },
  supervisor: { plural: "supervisors", home: HOME_PATH.supervisor, givenBy: "your OJT coordinator gave you" },
  coordinator: { plural: "coordinators", home: HOME_PATH.coordinator, givenBy: "you were given" },
  director: { plural: "directors", home: HOME_PATH.director, givenBy: "you were given" },
  admin: { plural: "admins", home: HOME_PATH.admin, givenBy: "you were given" },
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
  // Iteration 23: themed as the role's door.
  useRoleTheme(role ?? "guest");

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [showPasswords, setShowPasswords] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const accountId = role ? localStorage.getItem(`${role}_id`) : null;
  if (!role || !accountId || !localStorage.getItem(`${role}_token`)) {
    return <Navigate to="/" replace />;
  }

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!currentPassword || !newPassword || !confirmation) {
      return setError("Fill in all three password fields.");
    }
    if (newPassword !== confirmation) {
      return setError("The new password and its confirmation don't match.");
    }
    if (newPassword === currentPassword) {
      return setError("The new password must be different from the current one.");
    }
    const policyError = passwordPolicyError(newPassword);
    if (policyError) return setError(policyError);

    setSubmitting(true);
    setError("");
    try {
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
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(data.message || "Your password could not be changed.");
        return;
      }
      storeRotatedToken(role, data.token);
      toast.success("Password changed.");
      navigate(roles[role].home, { replace: true });
    } catch {
      setError("Can't reach the server. Check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const type = showPasswords ? "text" : "password";

  return (
    <AuthShell
      title="Set your own password"
      description={`Your account still has the password ${roles[role].givenBy}. Replace it to continue. ${PASSWORD_POLICY_HINT}`}
    >
      <form className="mt-6 space-y-4" onSubmit={submit} noValidate>
        <FormField
          label="Current password"
          htmlFor="change-current"
          hint="The one you just signed in with."
        >
          <input
            id="change-current"
            type={type}
            autoComplete="current-password"
            value={currentPassword}
            onChange={(event) => setCurrentPassword(event.target.value)}
            className="field h-11"
          />
        </FormField>
        <FormField label="New password" htmlFor="change-new">
          <input
            id="change-new"
            type={type}
            autoComplete="new-password"
            maxLength={128}
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
            className="field h-11"
          />
        </FormField>
        <FormField label="Confirm new password" htmlFor="change-confirmation">
          <input
            id="change-confirmation"
            type={type}
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

        <FormError message={error} />

        <Button type="submit" size="lg" block busy={submitting} failed={Boolean(error)}>
          {submitting ? "Saving" : "Save and continue"}
        </Button>
        <button
          type="button"
          onClick={() => {
            // Nothing can be sent until the password is changed, so what is
            // waiting is kept for the next sign-in.
            endSession(role, { keepWaiting: true });
            navigate("/", { replace: true });
          }}
          className="block w-full text-center text-sm font-semibold text-slate-600 hover:underline"
        >
          Sign out
        </button>
      </form>
    </AuthShell>
  );
}
