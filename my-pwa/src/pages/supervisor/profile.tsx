import { useCallback, useEffect, useState } from "react";
import Icon from "../../components/Icon";
import PasswordForm from "../../components/PasswordForm";
import { Button, Card, ErrorNotice } from "../../components/ui";
import { BrandLoader } from "../../brand";
import SupervisorLayout from "../../layouts/SupervisorLayout";
import { API_URL, withSupervisorAuth } from "../../lib/api";
import { getInitials } from "../../lib/format";
import { updateStoredAccount, useAccount } from "../../lib/session";
import { errorText, toast } from "../../lib/toast";

type SupervisorProfile = {
  supervisor_id: string;
  email: string;
  name: string;
  company: string | null;
  department: string | null;
};

export default function SupervisorProfilePage() {
  const account = useAccount("supervisor");
  const supervisorId = account?.supervisor_id;

  const [profile, setProfile] = useState<SupervisorProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [department, setDepartment] = useState("");
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!supervisorId) return;
    try {
      const response = await fetch(
        `${API_URL}/api/supervisors/${encodeURIComponent(supervisorId)}/profile`,
        withSupervisorAuth()
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || "Could not load your profile.");
      setProfile(data.supervisor);
      setName(data.supervisor.name);
      setEmail(data.supervisor.email);
      setDepartment(data.supervisor.department || "");
      setError("");
    } catch (loadError) {
      setError(errorText(loadError, "Could not load your profile."));
    } finally {
      setLoading(false);
    }
  }, [supervisorId]);

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
    if (!supervisorId) return;
    if (!name.trim()) {
      setFormError("Enter your full name.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setFormError("Enter a valid email address.");
      return;
    }
    setSaving(true);
    setFormError("");
    try {
      const response = await fetch(
        `${API_URL}/api/supervisors/${encodeURIComponent(supervisorId)}/profile`,
        withSupervisorAuth({
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: name.trim(),
            email: email.trim(),
            department: department.trim() || null,
          }),
        })
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || "Your profile could not be saved.");
      setProfile(data.supervisor);
      // The header reads the stored account; keep it in step.
      updateStoredAccount("supervisor", {
        name: data.supervisor.name,
        email: data.supervisor.email,
        department: data.supervisor.department,
      });
      toast.success("Profile saved.");
    } catch (saveError) {
      setFormError(errorText(saveError, "Your profile could not be saved."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <SupervisorLayout title="Profile" subtitle="Your account details and password.">
      {error && (
        <div className="mb-5">
          <ErrorNotice message={error} onRetry={() => void load()} />
        </div>
      )}

      <div className="grid items-start gap-5 lg:grid-cols-3">
        <Card className="p-5">
          {loading || !profile ? (
            <BrandLoader role="supervisor" process="profile" />
          ) : (
            <>
              <div className="flex items-center gap-4">
                <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-psu-900 text-xl font-bold text-gold-300">
                  {getInitials(profile.name, "SV")}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-base font-semibold text-slate-900">
                    {profile.name}
                  </p>
                  <p className="truncate text-sm text-slate-500">{profile.supervisor_id}</p>
                </div>
              </div>
              <dl className="mt-5 space-y-3 border-t border-slate-100 pt-4 text-sm">
                <div className="flex justify-between gap-4">
                  <dt className="text-slate-500">Company</dt>
                  <dd className="text-right font-medium text-slate-900">
                    {profile.company || "Not set"}
                  </dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-slate-500">Department</dt>
                  <dd className="text-right font-medium text-slate-900">
                    {profile.department || "Not set"}
                  </dd>
                </div>
              </dl>
              <p className="mt-4 flex gap-2 text-sm text-slate-500">
                <Icon name="info" size={16} className="mt-0.5 shrink-0 text-slate-400" />
                Your company is set by the OJT coordinator.
              </p>
            </>
          )}
        </Card>

        <div className="space-y-5 lg:col-span-2">
          <Card>
            <form onSubmit={save} className="p-4 sm:p-5" noValidate>
              <h2 className="text-sm font-semibold text-slate-900">Account details</h2>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor="profile-name"
                    className="mb-1.5 block text-sm font-medium text-slate-700"
                  >
                    Full name
                  </label>
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
                </div>
                <div>
                  <label
                    htmlFor="profile-email"
                    className="mb-1.5 block text-sm font-medium text-slate-700"
                  >
                    Email
                  </label>
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
                </div>
                <div className="sm:col-span-2">
                  <label
                    htmlFor="profile-department"
                    className="mb-1.5 block text-sm font-medium text-slate-700"
                  >
                    Department <span className="font-normal text-slate-400">(optional)</span>
                  </label>
                  <input
                    id="profile-department"
                    type="text"
                    maxLength={150}
                    value={department}
                    disabled={loading}
                    onChange={(event) => setDepartment(event.target.value)}
                    className="field"
                  />
                </div>
              </div>
              {formError && (
                <p role="alert" className="mt-3 text-sm text-red-600">
                  {formError}
                </p>
              )}
              <Button type="submit" busy={saving} doneLabel="Saved" failed={Boolean(formError)} disabled={!changed} className="mt-4">
                {saving ? "Saving" : "Save changes"}
              </Button>
            </form>
          </Card>

          {supervisorId && <PasswordForm role="supervisor" accountId={supervisorId} />}
        </div>
      </div>
    </SupervisorLayout>
  );
}
