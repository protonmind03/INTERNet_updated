import { useState } from "react";
import PasswordForm from "../../components/PasswordForm";
import PrivacyWarnings from "../../components/PrivacyWarnings";
import { Button, Card, FormError, FormField } from "../../components/ui";
import DirectorLayout from "../../layouts/DirectorLayout";
import { updateStoredAccount, useAccount } from "../../lib/session";
import { errorText, toast } from "../../lib/toast";
import { directorWrite } from "./request";

/** The Director's own account: name, email and password. */
export default function DirectorProfile() {
  const account = useAccount("director");
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
      const data = await directorWrite<{ director: { name: string; email: string } }>(
        `/api/directors/${encodeURIComponent(account.director_id)}/profile`,
        "PUT",
        { name: name.trim(), email: email.trim() }
      );
      updateStoredAccount("director", { name: data.director.name, email: data.director.email });
      toast.success("Profile saved.");
    } catch (saveError) {
      setError(errorText(saveError, "Your profile could not be saved. Try again."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <DirectorLayout title="Profile">
      <div className="max-w-2xl space-y-4">
        <PrivacyWarnings role="director" />
        <Card>
          <form onSubmit={save} className="space-y-4 p-4 sm:p-5" noValidate>
            <h2 className="text-sm font-semibold text-slate-900">Name and email</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label="Full name" htmlFor="director-name">
                <input id="director-name" className="field" maxLength={150} autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} />
              </FormField>
              <FormField label="Email" htmlFor="director-email">
                <input id="director-email" type="email" className="field" maxLength={150} autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} />
              </FormField>
            </div>
            <FormError message={error} />
            <Button type="submit" busy={saving} doneLabel="Saved" failed={Boolean(error)} disabled={!changed}>
              Save changes
            </Button>
          </form>
        </Card>
        <PasswordForm role="director" accountId={account.director_id} />
        <p className="px-1 text-sm text-slate-600">Changing your password signs you out on your other devices.</p>
      </div>
    </DirectorLayout>
  );
}
