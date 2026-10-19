import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import AccountDetailsForm from "../../components/AccountDetailsForm";
import Icon from "../../components/Icon";
import InstallApp from "../../components/InstallApp";
import CueSettingsCard from "../../components/CueSettingsCard";
import NotificationPreferences from "../../components/NotificationPreferences";
import PasswordForm from "../../components/PasswordForm";
import { Button, Card, ConfirmDialog, ErrorNotice } from "../../components/ui";
import ProfileGroups, { CompletionRing, type ProfileGroup } from "./ProfileGroups";
import PasskeysCard from "./PasskeysCard";
import { BrandLoader } from "../../brand";
import StudentLayout from "../../layouts/StudentLayout";
import { API_URL, withStudentAuth } from "../../lib/api";
import { formatLongDate, getInitials } from "../../lib/format";
import { signOut as endSession, updateStoredAccount, useAccount } from "../../lib/session";
import { errorText, toast } from "../../lib/toast";
import CompletionChecklist from "./CompletionChecklist";
import ContactDetails, { CoordinatorCard, SupervisorCard, type Contact, type Coordinator, type Supervisor } from "./ContactDetails";
import { PrivacyCard } from "./Privacy";
import OfflineReadyCard from "./OfflineReadyCard";
import SignatureCard from "./SignatureCard";
import { resolutionPath } from "./resolutionTabs";

type StudentProfile = {
  student_id: string;
  email: string;
  name: string;
  program: string | null;
  company: string | null;
  required_hours: number;
} & Contact;

export default function StudentProfilePage() {
  const account = useAccount("student");
  const studentId = account?.student_id;

  const [profile, setProfile] = useState<StudentProfile | null>(null);
  const [coordinator, setCoordinator] = useState<Coordinator | null>(null);
  const [supervisor, setSupervisor] = useState<Supervisor | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [profileError, setProfileError] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  const navigate = useNavigate();
  const [confirmSignOut, setConfirmSignOut] = useState(false);
  // The signature row's hint: when it was saved, or "Not set".
  const [signatureHint, setSignatureHint] = useState("");
  useEffect(() => {
    let active = true;
    fetch(`${API_URL}/api/student/signature`, withStudentAuth())
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => active && setSignatureHint(data?.signature ? `Saved ${formatLongDate(data.signature.created_at)}` : "Not set"))
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);


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
      setCoordinator(data.coordinator ?? null);
      setSupervisor(data.supervisor ?? null);
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

  // The header ring: how much of the profile is filled in (mobile, emergency contact, signature).
  const checks = [Boolean(profile?.phone), Boolean(profile?.emergency_contact_name && profile?.emergency_contact_phone), signatureHint.startsWith("Saved")];
  const done = checks.filter(Boolean).length;

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
      // The answer has the name and email only; keep the rest as it was.
      setProfile((current) => (current ? { ...current, ...data.student } : data.student));
      // Other pages read the stored account; keep it in step.
      updateStoredAccount("student", { name: data.student.name, email: data.student.email });
      toast.success("Profile saved.");
    } catch (saveError) {
      setProfileError(errorText(saveError, "Your profile could not be saved."));
    } finally {
      setSavingProfile(false);
    }
  };


  // Iteration 21: the page is grouped. Each group holds the same forms as before.
  const groups: ProfileGroup[] = [
    {
      id: "account",
      title: "Account",
      hint: profile?.email ?? "Name, email, password",
      content: (
        <>
          <Card>
            <form onSubmit={saveProfile} className="p-4 sm:p-5" noValidate>
              <h3 className="text-sm font-semibold text-slate-900">Name and email</h3>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="profile-name" className="mb-1.5 block text-sm font-medium text-slate-700">
                    Full name
                  </label>
                  <input id="profile-name" type="text" autoComplete="name" maxLength={150} value={name} disabled={loading} onChange={(event) => setName(event.target.value)} className="field" />
                </div>
                <div>
                  <label htmlFor="profile-email" className="mb-1.5 block text-sm font-medium text-slate-700">
                    Email
                  </label>
                  <input id="profile-email" type="email" autoComplete="email" maxLength={150} value={email} disabled={loading} onChange={(event) => setEmail(event.target.value)} className="field" />
                </div>
              </div>
              {profileError && (
                <p role="alert" className="mt-3 text-sm text-red-600">
                  {profileError}
                </p>
              )}
              <Button type="submit" busy={savingProfile} doneLabel="Saved" failed={Boolean(profileError)} disabled={!profileChanged} className="mt-4">
                {savingProfile ? "Saving" : "Save changes"}
              </Button>
            </form>
          </Card>
          {studentId && <PasswordForm role="student" accountId={studentId} />}
          <p className="px-1 text-sm text-slate-600">Changing your password signs you out on your other devices.</p>
        </>
      ),
    },
    {
      id: "contact",
      title: "Contact",
      hint: profile ? (profile.phone ? profile.phone : "Missing") : "",
      missing: Boolean(profile && !profile.phone),
      content: (
        <>
          {studentId && profile && (
            <ContactDetails
              key={studentId}
              studentId={studentId}
              contact={profile}
              onSaved={(contact) => setProfile((current) => (current ? { ...current, ...contact } : current))}
            />
          )}
          <AccountDetailsForm role="student" viewer="student" title="How you prefer to be reached" />
        </>
      ),
    },
    {
      id: "placement",
      title: "Placement",
      hint: profile?.company || "Not assigned",
      content: (
        <>
          <Card className="p-5">
            <dl className="space-y-3 text-sm">
              <Row label="Program">{profile?.program || "Not set"}</Row>
              <Row label="Company">{profile?.company || "Not assigned"}</Row>
              <Row label="Required hours">{profile ? `${profile.required_hours} h` : ""}</Row>
            </dl>
            <p className="mt-4 flex gap-2 text-sm text-slate-600">
              <Icon name="info" size={16} className="mt-0.5 shrink-0 text-slate-500" />
              Set by your OJT coordinator.
            </p>
          </Card>
          <SupervisorCard supervisor={supervisor} />
          <CoordinatorCard coordinator={coordinator} />
          <p className="px-1 text-sm text-slate-600">
            Something wrong at your placement?{" "}
            <Link to={resolutionPath("concerns")} className="font-semibold text-psu-700 hover:underline">
              Report a concern
            </Link>
          </p>
        </>
      ),
    },
    { id: "signature", title: "Signature", hint: signatureHint, content: <SignatureCard /> },
    {
      id: "security",
      title: "Security and device",
      hint: "Passkeys, this device, offline use",
      content: (
        <>
          <PasskeysCard />
          <InstallApp />
          {studentId && <OfflineReadyCard studentId={studentId} />}
        </>
      ),
    },
    {
      id: "notifications",
      title: "Notifications",
      hint: "Push and email, by kind",
      content: (
        <>
          <NotificationPreferences role="student" />
          <CueSettingsCard />
        </>
      ),
    },
    { id: "privacy", title: "Privacy and data", hint: "The notice, your consent, your data", content: studentId ? <PrivacyCard studentId={studentId} /> : null },
    { id: "completion", title: "Completion", hint: "What is left, and the review", content: <CompletionChecklist /> },
  ];

  return (
    <StudentLayout title="Profile" subtitle="Your account, placement, signature and settings.">
      {error && (
        <div className="mb-5">
          <ErrorNotice message={error} onRetry={() => void load()} />
        </div>
      )}

      <Card className="mb-5 p-4 sm:p-5">
        {loading || !profile ? (
          <BrandLoader role="student" process="profile" />
        ) : (
          <div className="flex items-center gap-4">
            <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-psu-700 text-lg font-bold text-white">{getInitials(profile.name, "ST")}</span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-base font-semibold text-slate-900">{profile.name}</p>
              <p className="truncate text-sm text-slate-600">{profile.student_id}</p>
              <p className="truncate text-sm text-slate-600">{[profile.program, profile.company].filter(Boolean).join(" · ") || "Placement not set yet"}</p>
            </div>
            <CompletionRing done={done} total={checks.length} />
          </div>
        )}
      </Card>

      <ProfileGroups groups={groups} onSignOut={() => setConfirmSignOut(true)} />

      <ConfirmDialog
        open={confirmSignOut}
        title="Sign out?"
        message="You will need your password to sign in again. Steps recorded offline and not yet sent are erased."
        confirmLabel="Sign out"
        cancelLabel="Stay signed in"
        tone="danger"
        onConfirm={() => {
          endSession("student");
          navigate("/", { replace: true });
        }}
        onCancel={() => setConfirmSignOut(false)}
      />
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

