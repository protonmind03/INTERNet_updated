import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import CoordinatorLayout from "./CoordinatorLayout";
import {
  API_URL,
  PASSWORD_POLICY_HINT,
  passwordPolicyError,
  storeRotatedToken,
  withCoordinatorAuth,
} from "../../lib/api";

type CoordinatorProfile = {
  coordinator_id: string;
  email: string;
  name: string;
  department: string | null;
};

export default function CoordinatorProfilePage() {
  const navigate = useNavigate();
  const [profile, setProfile] = useState<CoordinatorProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [department, setDepartment] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileMessage, setProfileMessage] = useState("");
  const [profileError, setProfileError] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState("");
  const [passwordError, setPasswordError] = useState("");

  const coordinatorId = localStorage.getItem("coordinator_id");

  useEffect(() => {
    if (!coordinatorId || !localStorage.getItem("coordinator_token")) {
      navigate("/");
      return;
    }

    const controller = new AbortController();
    const load = async () => {
      try {
        setLoading(true);
        setLoadError("");
        const response = await fetch(
          `${API_URL}/api/coordinators/${encodeURIComponent(coordinatorId)}/profile`,
          withCoordinatorAuth({ signal: controller.signal })
        );
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.message || "Failed to load profile.");
        }

        const nextProfile = data.coordinator as CoordinatorProfile;
        setProfile(nextProfile);
        setName(nextProfile.name);
        setEmail(nextProfile.email);
        setDepartment(nextProfile.department || "");
      } catch (error) {
        if (controller.signal.aborted) return;
        setLoadError(
          error instanceof Error ? error.message : "Unable to load profile."
        );
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };

    void load();
    return () => controller.abort();
  }, [coordinatorId, navigate]);

  const saveProfile = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setProfileMessage("");
    setProfileError("");

    if (!name.trim() || !email.trim()) {
      setProfileError("Name and email are required.");
      return;
    }

    try {
      setSavingProfile(true);
      const response = await fetch(
        `${API_URL}/api/coordinators/${encodeURIComponent(coordinatorId || "")}/profile`,
        withCoordinatorAuth({
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: name.trim(),
            email: email.trim(),
            department: department.trim(),
          }),
        })
      );
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || "Failed to update profile.");
      }

      const updated = data.coordinator as CoordinatorProfile;
      setProfile(updated);
      localStorage.setItem("coordinator", JSON.stringify(updated));
      window.dispatchEvent(
        new CustomEvent("coordinator-profile-updated", { detail: updated })
      );
      setProfileMessage("Profile updated.");
    } catch (error) {
      setProfileError(
        error instanceof Error ? error.message : "Unable to update profile."
      );
    } finally {
      setSavingProfile(false);
    }
  };

  const changePassword = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPasswordMessage("");
    setPasswordError("");

    if (!currentPassword || !newPassword || !confirmPassword) {
      setPasswordError("Fill in all three password fields.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError("New password and confirmation don't match.");
      return;
    }
    const policyError = passwordPolicyError(newPassword);
    if (policyError) {
      setPasswordError(policyError);
      return;
    }

    try {
      setSavingPassword(true);
      const response = await fetch(
        `${API_URL}/api/coordinators/${encodeURIComponent(coordinatorId || "")}/password`,
        withCoordinatorAuth({
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
        throw new Error(data.message || "Failed to change password.");
      }

      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      storeRotatedToken("coordinator", data.token);
      setPasswordMessage(data.message || "Password updated.");
    } catch (error) {
      setPasswordError(
        error instanceof Error ? error.message : "Unable to change password."
      );
    } finally {
      setSavingPassword(false);
    }
  };

  return (
    <CoordinatorLayout
      title="Profile & Account"
      subtitle="Update your coordinator contact details and password"
      breadcrumb={["Coordinator", "Account", "Profile"]}
    >
      {loading ? (
        <p className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-400">
          Loading profile...
        </p>
      ) : loadError ? (
        <p role="alert" className="rounded-xl border border-red-200 bg-white p-4 text-sm text-red-700">
          {loadError}
        </p>
      ) : profile ? (
        <div className="grid max-w-4xl gap-4 lg:grid-cols-2">
          <form
            onSubmit={saveProfile}
            className="space-y-4 rounded-xl border border-slate-200 bg-white p-5"
          >
            <div>
              <h2 className="text-sm font-semibold text-slate-800">Personal information</h2>
              <p className="mt-1 text-xs text-slate-400">
                Coordinator ID: {profile.coordinator_id}
              </p>
            </div>
            <label className="block text-xs font-medium text-slate-600">
              Full name
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                autoComplete="name"
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                required
              />
            </label>
            <label className="block text-xs font-medium text-slate-600">
              Email
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="email"
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                required
              />
            </label>
            <label className="block text-xs font-medium text-slate-600">
              Department
              <input
                value={department}
                onChange={(event) => setDepartment(event.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
            </label>
            {profileError && <p role="alert" className="text-xs text-red-600">{profileError}</p>}
            {profileMessage && <p role="status" className="text-xs text-emerald-700">{profileMessage}</p>}
            <button
              type="submit"
              disabled={savingProfile}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-60"
            >
              {savingProfile ? "Saving..." : "Save profile"}
            </button>
          </form>

          <form
            onSubmit={changePassword}
            className="space-y-4 rounded-xl border border-slate-200 bg-white p-5"
          >
            <div>
              <h2 className="text-sm font-semibold text-slate-800">Change password</h2>
              <p className="mt-1 text-xs text-slate-400">
                {PASSWORD_POLICY_HINT} Changing it signs out your other devices.
              </p>
            </div>
            <label className="block text-xs font-medium text-slate-600">
              Current password
              <input
                type="password"
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
                autoComplete="current-password"
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                required
              />
            </label>
            <label className="block text-xs font-medium text-slate-600">
              New password
              <input
                type="password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                autoComplete="new-password"
                minLength={6}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                required
              />
            </label>
            <label className="block text-xs font-medium text-slate-600">
              Confirm new password
              <input
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                autoComplete="new-password"
                minLength={6}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                required
              />
            </label>
            {passwordError && <p role="alert" className="text-xs text-red-600">{passwordError}</p>}
            {passwordMessage && <p role="status" className="text-xs text-emerald-700">{passwordMessage}</p>}
            <button
              type="submit"
              disabled={savingPassword}
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-60"
            >
              {savingPassword ? "Updating..." : "Update password"}
            </button>
          </form>
        </div>
      ) : null}
    </CoordinatorLayout>
  );
}
