import { useState } from "react";
import { Button, Card } from "./ui";
import {
  API_URL,
  PASSWORD_POLICY_HINT,
  passwordPolicyError,
  storeRotatedToken,
  withRoleAuth,
} from "../lib/api";
import { errorText, toast } from "../lib/toast";

/** The "Change password" card, the same in every portal's profile page. */
export default function PasswordForm({
  role,
  accountId,
}: {
  role: "student" | "supervisor" | "coordinator";
  accountId: string;
}) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!current || !next || !confirm) {
      setError("Fill in all three password fields.");
      return;
    }
    if (next !== confirm) {
      setError("The new password and its confirmation don't match.");
      return;
    }
    const policyError = passwordPolicyError(next);
    if (policyError) {
      setError(policyError);
      return;
    }
    setSaving(true);
    setError("");
    try {
      const response = await fetch(
        `${API_URL}/api/${role}s/${encodeURIComponent(accountId)}/password`,
        withRoleAuth(role, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ current_password: current, new_password: next }),
        })
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || "Your password could not be changed.");
      // Changing the password signs every other device out and returns a
      // fresh token for this one.
      storeRotatedToken(role, data.token);
      toast.success("Password changed. Other devices have been signed out.");
      setCurrent("");
      setNext("");
      setConfirm("");
    } catch (saveError) {
      setError(errorText(saveError, "Your password could not be changed."));
    } finally {
      setSaving(false);
    }
  };

  const type = show ? "text" : "password";
  const fields = [
    { id: "current-password", label: "Current password", value: current, set: setCurrent, auto: "current-password" },
    { id: "new-password", label: "New password", value: next, set: setNext, auto: "new-password" },
    { id: "confirm-password", label: "Confirm new password", value: confirm, set: setConfirm, auto: "new-password" },
  ];

  return (
    <Card>
      <form onSubmit={submit} className="p-4 sm:p-5" noValidate>
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-slate-900">Change password</h2>
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input
              type="checkbox"
              checked={show}
              onChange={(event) => setShow(event.target.checked)}
              className="h-4 w-4 rounded border-slate-300 accent-psu-700"
            />
            Show passwords
          </label>
        </div>
        <p className="mt-1 text-sm text-slate-500">{PASSWORD_POLICY_HINT}</p>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          {fields.map((field) => (
            <div key={field.id}>
              <label
                htmlFor={field.id}
                className="mb-1.5 block text-sm font-medium text-slate-700"
              >
                {field.label}
              </label>
              <input
                id={field.id}
                type={type}
                autoComplete={field.auto}
                value={field.value}
                onChange={(event) => field.set(event.target.value)}
                className="field"
              />
            </div>
          ))}
        </div>
        {error && (
          <p role="alert" className="mt-3 text-sm text-red-600">
            {error}
          </p>
        )}
        <Button type="submit" variant="secondary" busy={saving} className="mt-4">
          {saving ? "Updating" : "Update password"}
        </Button>
      </form>
    </Card>
  );
}
