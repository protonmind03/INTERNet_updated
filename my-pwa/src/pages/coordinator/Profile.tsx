import { useCallback, useEffect, useState } from "react";
import PasswordForm from "../../components/PasswordForm";
import { Button, Card, ErrorNotice, FormError, FormField } from "../../components/ui";
import { BrandLoader } from "../../brand";
import CoordinatorLayout from "../../layouts/CoordinatorLayout";
import { updateStoredAccount, useAccount, type CoordinatorAccount } from "../../lib/session";
import { errorText, toast } from "../../lib/toast";
import { coordinatorRequest } from "./request";

export default function CoordinatorProfilePage() {
  const account = useAccount("coordinator");
  const coordinatorId = account?.coordinator_id;

  const [profile, setProfile] = useState<CoordinatorAccount | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [department, setDepartment] = useState("");
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!coordinatorId) return;
    try {
      const data = await coordinatorRequest<{ coordinator: CoordinatorAccount }>(
        `/api/coordinators/${encodeURIComponent(coordinatorId)}/profile`
      );
      setProfile(data.coordinator);
      setName(data.coordinator.name);
      setEmail(data.coordinator.email);
      setDepartment(data.coordinator.department || "");
      setError("");
    } catch (loadError) {
      setError(errorText(loadError, "Could not load your profile."));
    } finally {
      setLoading(false);
    }
  }, [coordinatorId]);

  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  const changed =
    profile !== null &&
    (name.trim() !== profile.name ||
      email.trim() !== profile.email ||
      department.trim() !== (profile.department || ""));

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!coordinatorId) return;
    if (!name.trim()) return setFormError("Enter your full name.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      return setFormError("Enter a valid email address.");
    }
    setSaving(true);
    setFormError("");
    try {
      const data = await coordinatorRequest<{ coordinator: CoordinatorAccount }>(
        `/api/coordinators/${encodeURIComponent(coordinatorId)}/profile`,
        {
          method: "PUT",
          body: { name: name.trim(), email: email.trim(), department: department.trim() },
        }
      );
      setProfile(data.coordinator);
      // The sidebar reads the stored account; keep it in step.
      updateStoredAccount("coordinator", data.coordinator);
      toast.success("Profile saved.");
    } catch (saveError) {
      setFormError(errorText(saveError, "Your profile could not be saved."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <CoordinatorLayout title="Profile" subtitle="Your account details, password and test accounts.">
      <div className="max-w-3xl space-y-5">
        {error && <ErrorNotice message={error} onRetry={() => void load()} />}

        <Card>
          <form onSubmit={save} className="p-4 sm:p-5" noValidate>
            <h2 className="text-sm font-semibold text-slate-900">Account details</h2>
            {loading && (
              <div className="mt-3">
                <BrandLoader variant="inline" role="coordinator" process="profile" />
              </div>
            )}
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <FormField label="Full name" htmlFor="profile-name">
                <input
                  id="profile-name"
                  type="text"
                  autoComplete="name"
                  maxLength={150}
                  value={name}
                  disabled={loading}
                  onChange={(event) => setName(event.target.value)}
                  className="field"
                />
              </FormField>
              <FormField label="Email" htmlFor="profile-email" hint="You sign in with this.">
                <input
                  id="profile-email"
                  type="email"
                  autoComplete="email"
                  maxLength={150}
                  value={email}
                  disabled={loading}
                  onChange={(event) => setEmail(event.target.value)}
                  className="field"
                />
              </FormField>
              <FormField
                label="Department"
                htmlFor="profile-department"
                optional
                className="sm:col-span-2"
              >
                <input
                  id="profile-department"
                  type="text"
                  maxLength={150}
                  value={department}
                  disabled={loading}
                  onChange={(event) => setDepartment(event.target.value)}
                  className="field"
                />
              </FormField>
            </div>
            <div className="mt-3">
              <FormError message={formError} />
            </div>
            <Button type="submit" busy={saving} doneLabel="Saved" failed={Boolean(formError)} disabled={!changed} className="mt-4">
              {saving ? "Saving" : "Save changes"}
            </Button>
          </form>
        </Card>

        {coordinatorId && <PasswordForm role="coordinator" accountId={coordinatorId} />}
      </div>
    </CoordinatorLayout>
  );
}
