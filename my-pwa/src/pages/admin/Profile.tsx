import { useState } from "react";
import Icon from "../../components/Icon";
import PasswordForm from "../../components/PasswordForm";
import { Button, Card, FormError, FormField } from "../../components/ui";
import AdminLayout from "../../layouts/AdminLayout";
import { updateStoredAccount, useAccount } from "../../lib/session";
import { errorText, toast } from "../../lib/toast";
import { adminRequest } from "./request";

/** The administrator's own account: name, email and password. */
export default function AdminProfile() {
  const account = useAccount("admin");
  const [name, setName] = useState(account?.name ?? "");
  const [email, setEmail] = useState(account?.email ?? "");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  if (!account) return null;
  const changed = name.trim() !== account.name || email.trim() !== account.email;

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const data = await adminRequest<{ admin: { name: string; email: string } }>(`/api/admins/${encodeURIComponent(account.admin_id)}/profile`, {
        method: "PUT",
        body: { name: name.trim(), email: email.trim() },
      });
      updateStoredAccount("admin", { name: data.admin.name, email: data.admin.email });
      toast.success("Profile saved.");
    } catch (saveError) {
      setError(errorText(saveError, "Your profile could not be saved. Try again."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <AdminLayout title="Profile">
      <div className="max-w-2xl space-y-4">
        {/* Passkeys are for trainees only for now (Phase 1.7 leaves them out); a long, unique password is the guard. */}
        <p className="flex items-start gap-2 rounded-xl bg-white px-4 py-3 text-sm text-slate-700 ring-1 ring-inset ring-(--role-hairline)">
          <Icon name="lock" size={16} className="mt-0.5 shrink-0 text-psu-700" />
          This account can lock out anyone and see the audit log. Use a long password used nowhere else, and sign out on shared computers.
        </p>
        <Card>
          <form onSubmit={save} className="space-y-4 p-4 sm:p-5" noValidate>
            <h2 className="text-sm font-semibold text-slate-900">Name and email</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label="Full name" htmlFor="admin-name">
                <input id="admin-name" className="field" maxLength={150} autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} />
              </FormField>
              <FormField label="Email" htmlFor="admin-email">
                <input id="admin-email" type="email" className="field" maxLength={150} autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} />
              </FormField>
            </div>
            <FormError message={error} />
            <Button type="submit" busy={saving} doneLabel="Saved" failed={Boolean(error)} disabled={!changed}>
              Save changes
            </Button>
          </form>
        </Card>
        <PasswordForm role="admin" accountId={account.admin_id} />
        <p className="px-1 text-sm text-slate-600">Changing your password signs you out on your other devices.</p>
      </div>
    </AdminLayout>
  );
}
