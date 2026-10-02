import { useCallback, useEffect, useState } from "react";
import Icon from "../../components/Icon";
import PasswordForm from "../../components/PasswordForm";
import { Button, Card, ErrorNotice, Skeleton } from "../../components/ui";
import StudentLayout from "../../layouts/StudentLayout";
import { API_URL, withStudentAuth } from "../../lib/api";
import { getInitials } from "../../lib/format";
import { updateStoredAccount, useAccount } from "../../lib/session";
import { errorText, toast } from "../../lib/toast";

type StudentProfile = {
  student_id: string;
  email: string;
  name: string;
  program: string | null;
  company: string | null;
  required_hours: number;
};

export default function StudentProfilePage() {
  const account = useAccount("student");
  const studentId = account?.student_id;

  const [profile, setProfile] = useState<StudentProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [profileError, setProfileError] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);


  const load = useCallback(async () => {
    if (!studentId) return;
    try {
      const response = await fetch(
        `${API_URL}/api/students/${encodeURIComponent(studentId)}/profile`,
        withStudentAuth()
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || "Could not load your profile.");
      setProfile(data.student);
      setName(data.student.name);
      setEmail(data.student.email);
      setError("");
    } catch (loadError) {
      setError(errorText(loadError, "Could not load your profile."));
    } finally {
      setLoading(false);
    }
  }, [studentId]);

  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  const profileChanged =
    profile !== null && (name.trim() !== profile.name || email.trim() !== profile.email);

  const saveProfile = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!studentId) return;
    if (!name.trim()) {
      setProfileError("Enter your full name.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setProfileError("Enter a valid email address.");
      return;
    }
    setSavingProfile(true);
    setProfileError("");
    try {
      const response = await fetch(
        `${API_URL}/api/students/${encodeURIComponent(studentId)}/profile`,
        withStudentAuth({
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: name.trim(), email: email.trim() }),
        })
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || "Your profile could not be saved.");
      setProfile(data.student);
      // Other pages read the stored account; keep it in step.
      updateStoredAccount("student", { name: data.student.name, email: data.student.email });
      toast.success("Profile saved.");
    } catch (saveError) {
      setProfileError(errorText(saveError, "Your profile could not be saved."));
    } finally {
      setSavingProfile(false);
    }
  };


  return (
    <StudentLayout title="Profile" subtitle="Your account details and password.">
      {error && (
        <div className="mb-5">
          <ErrorNotice message={error} onRetry={() => void load()} />
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="p-5 lg:self-start">
          {loading || !profile ? (
            <div className="space-y-3">
              <Skeleton className="h-16 w-16 rounded-full" />
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-4 w-1/2" />
            </div>
          ) : (
            <>
              <div className="flex items-center gap-4">
                <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-psu-700 text-xl font-bold text-white">
                  {getInitials(profile.name, "ST")}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-base font-semibold text-slate-900">
                    {profile.name}
                  </p>
                  <p className="truncate text-sm text-slate-500">{profile.student_id}</p>
                </div>
              </div>
              <dl className="mt-5 space-y-3 border-t border-slate-100 pt-4 text-sm">
                <Row label="Program">{profile.program || "Not set"}</Row>
                <Row label="Company">{profile.company || "Not assigned"}</Row>
                <Row label="Required hours">{profile.required_hours} h</Row>
              </dl>
              <p className="mt-4 flex gap-2 text-sm text-slate-500">
                <Icon name="info" size={16} className="mt-0.5 shrink-0 text-slate-400" />
                Program, company and hours are set by your OJT coordinator.
              </p>
            </>
          )}
        </Card>

        <div className="space-y-5 lg:col-span-2">
          <Card>
            <form onSubmit={saveProfile} className="p-4 sm:p-5" noValidate>
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
              </div>
              {profileError && (
                <p role="alert" className="mt-3 text-sm text-red-600">
                  {profileError}
                </p>
              )}
              <Button
                type="submit"
                busy={savingProfile}
                disabled={!profileChanged}
                className="mt-4"
              >
                {savingProfile ? "Saving" : "Save changes"}
              </Button>
            </form>
          </Card>

          {studentId && <PasswordForm role="student" accountId={studentId} />}
        </div>
      </div>
    </StudentLayout>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-slate-500">{label}</dt>
      <dd className="text-right font-medium text-slate-900">{children}</dd>
    </div>
  );
}

