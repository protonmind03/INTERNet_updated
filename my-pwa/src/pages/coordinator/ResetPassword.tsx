import { useState } from "react";
import { Button, ConfirmDialog, FormError } from "../../components/ui";
import { PASSWORD_POLICY_HINT, passwordPolicyError } from "../../lib/api";
import { errorText, toast } from "../../lib/toast";
import { coordinatorRequest } from "./request";

/** A random password that satisfies the password policy. */
function suggestPassword(): string {
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lower = "abcdefghijkmnpqrstuvwxyz";
  const digits = "23456789";
  const all = upper + lower + digits;
  const random = new Uint32Array(14);
  crypto.getRandomValues(random);
  const characters = Array.from(random, (value, index) => {
    const alphabet = index === 0 ? upper : index === 1 ? lower : index === 2 ? digits : all;
    return alphabet[value % alphabet.length];
  });
  // Move the three guaranteed characters away from the front.
  return characters.reverse().join("");
}

/**
 * Lets the coordinator set a temporary password for someone who is locked
 * out and cannot use the emailed reset link. Shown inside the edit dialog
 * of a student or supervisor.
 */
export default function ResetPassword({
  kind,
  accountId,
  name,
}: {
  kind: "students" | "supervisors";
  accountId: string;
  name: string;
}) {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);

  const review = () => {
    const policy = passwordPolicyError(password);
    if (policy) return setError(policy);
    setError("");
    setConfirming(true);
  };

  const reset = async () => {
    setSaving(true);
    try {
      await coordinatorRequest(
        `/api/coordinator/${kind}/${encodeURIComponent(accountId)}/reset-password`,
        { method: "POST", body: { password } }
      );
      toast.success(`Password reset for ${name}. Give them the temporary password.`);
      setConfirming(false);
      setOpen(false);
      setPassword("");
    } catch (resetError) {
      setConfirming(false);
      setError(errorText(resetError, "The password could not be reset."));
    } finally {
      setSaving(false);
    }
  };

  if (!open) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 px-3.5 py-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-slate-800">Locked out?</p>
          <p className="text-sm text-slate-500">
            Set a temporary password if they can't use the email reset.
          </p>
        </div>
        <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
          Reset password
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-lg border border-slate-200 px-3.5 py-3">
      <label htmlFor="reset-temp-password" className="block text-sm font-medium text-slate-800">
        Temporary password for {name}
      </label>
      <div className="flex gap-2">
        <input
          id="reset-temp-password"
          type="text"
          autoComplete="off"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className="field font-mono"
        />
        <Button variant="secondary" onClick={() => setPassword(suggestPassword())}>
          Generate
        </Button>
      </div>
      <p className="text-xs text-slate-500">
        {PASSWORD_POLICY_HINT} They are signed out everywhere and must choose their own password
        when they next sign in.
      </p>
      <FormError message={error} />
      <div className="flex gap-2">
        <Button size="sm" variant="danger" onClick={review} disabled={!password}>
          Reset password
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            setOpen(false);
            setPassword("");
            setError("");
          }}
        >
          Cancel
        </Button>
      </div>

      <ConfirmDialog
        open={confirming}
        title={`Reset ${name}'s password?`}
        message="Their current password stops working at once. Make sure you have copied the temporary password; it is not shown again."
        confirmLabel="Reset password"
        tone="danger"
        busy={saving}
        onConfirm={() => void reset()}
        onCancel={() => setConfirming(false)}
      />
    </div>
  );
}
