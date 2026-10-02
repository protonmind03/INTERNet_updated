import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  API_URL,
  passwordPolicyError,
  storeRotatedToken,
  withSupervisorAuth,
} from "../../lib/api";

interface SupervisorProfile {
  supervisor_id: string;
  email: string;
  name: string;
  company: string | null;
  department: string | null;
}

const NAV_ITEMS = [
  { label: "Dashboard", path: "/supervisor/dashboard" },
  { label: "Attendance", path: "/supervisor/attendance" },
  { label: "My Interns", path: "/supervisor/interns" },
  { label: "Tasks", path: "/supervisor/tasks" },
  { label: "Documents", path: "/supervisor/documents" },
  { label: "Evaluation", path: "/supervisor/evaluation" },
  { label: "Complaints", path: "/supervisor/complaints" },
];

export default function SupervisorProfilePage() {
  const navigate = useNavigate();

  const [profile, setProfile] = useState<SupervisorProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [department, setDepartment] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileMsg, setProfileMsg] = useState("");
  const [profileErr, setProfileErr] = useState("");

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordMsg, setPasswordMsg] = useState("");
  const [passwordErr, setPasswordErr] = useState("");

  useEffect(() => {
    const supervisorId = localStorage.getItem("supervisor_id");
    if (!supervisorId) {
      navigate("/");
      return;
    }

    const load = async () => {
      try {
        setLoading(true);
        const response = await fetch(
          `${API_URL}/api/supervisors/${supervisorId}/profile`,
          withSupervisorAuth()
        );
        const data = await response.json();

        if (!response.ok) {
          setError(data.message || "Failed to load profile.");
          return;
        }

        setProfile(data.supervisor);
        setName(data.supervisor.name);
        setEmail(data.supervisor.email);
        setDepartment(data.supervisor.department || "");
      } catch {
        setError("Unable to connect to the server.");
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [navigate]);

  const handleLogout = () => {
    localStorage.removeItem("supervisor");
    localStorage.removeItem("supervisor_id");
    localStorage.removeItem("supervisor_token");
    navigate("/");
  };

  const handleSaveProfile = async () => {
    setProfileMsg("");
    setProfileErr("");

    if (!name.trim() || !email.trim()) {
      setProfileErr("Name and email can't be empty.");
      return;
    }

    try {
      setSavingProfile(true);
      const supervisorId = localStorage.getItem("supervisor_id");

      const response = await fetch(
        `${API_URL}/api/supervisors/${supervisorId}/profile`,
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

      const data = await response.json();

      if (!response.ok) {
        setProfileErr(data.message || "Failed to update profile.");
        return;
      }

      setProfile(data.supervisor);

      const cached = localStorage.getItem("supervisor");
      if (cached) {
        try {
          const parsed = JSON.parse(cached);
          localStorage.setItem(
            "supervisor",
            JSON.stringify({
              ...parsed,
              name: data.supervisor.name,
              email: data.supervisor.email,
            })
          );
        } catch {
          // ignore malformed cache
        }
      }

      setProfileMsg("Profile updated.");
    } catch {
      setProfileErr("Unable to connect to the server.");
    } finally {
      setSavingProfile(false);
    }
  };

  const handleChangePassword = async () => {
    setPasswordMsg("");
    setPasswordErr("");

    if (!currentPassword || !newPassword || !confirmPassword) {
      setPasswordErr("Fill in all three password fields.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordErr("New password and confirmation don't match.");
      return;
    }
    const policyError = passwordPolicyError(newPassword);
    if (policyError) {
      setPasswordErr(policyError);
      return;
    }

    try {
      setSavingPassword(true);
      const supervisorId = localStorage.getItem("supervisor_id");

      const response = await fetch(
        `${API_URL}/api/supervisors/${supervisorId}/password`,
        withSupervisorAuth({
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
        setPasswordErr(data.message || "Failed to update password.");
        return;
      }

      storeRotatedToken("supervisor", data.token);
      setPasswordMsg(data.message || "Password updated.");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch {
      setPasswordErr("Unable to connect to the server.");
    } finally {
      setSavingPassword(false);
    }
  };

  const initials = (profile?.name || "SP")
    .split(" ")
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div className="flex h-screen bg-slate-50">
      {mobileNavOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-900/50 md:hidden"
          onClick={() => setMobileNavOpen(false)}
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-50 w-60 flex-col bg-[#0c1322] text-slate-300 transition-transform duration-200 md:static md:z-auto md:flex md:translate-x-0 md:shrink-0 ${
          mobileNavOpen ? "flex translate-x-0" : "hidden -translate-x-full md:flex"
        }`}
      >
        <button
          type="button"
          onClick={() => setMobileNavOpen(false)}
          className="absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:bg-white/10 hover:text-white md:hidden"
        >
          ✕
        </button>

        <div className="flex items-center gap-2.5 px-4 py-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-500 font-bold text-slate-900">
            IN
          </div>
          <div>
            <p className="text-sm font-semibold leading-tight text-white">
              INTERNet
            </p>
            <p className="text-[11px] leading-tight text-slate-400">
              Supervisor Portal
            </p>
          </div>
        </div>

        <nav className="flex-1 space-y-1 px-3 pt-2">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.path}
              type="button"
              onClick={() => navigate(item.path)}
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm text-slate-400 hover:bg-white/5 hover:text-slate-200"
            >
              {item.label}
            </button>
          ))}
        </nav>

        <div className="space-y-1 border-t border-white/10 px-3 py-2">
          <button
            type="button"
            className="flex w-full items-center gap-3 rounded-lg border-l-2 border-amber-500 bg-white/5 px-3 py-2 text-left text-sm font-medium text-amber-500"
          >
            Profile
          </button>
          <button
            type="button"
            onClick={() => setShowLogoutConfirm(true)}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm text-red-400 hover:bg-white/5"
          >
            Sign Out
          </button>
        </div>
      </aside>

      <div className="flex flex-1 flex-col overflow-y-auto">
        <header className="flex items-center justify-between bg-gradient-to-r from-amber-500 to-orange-500 px-4 py-2.5">
          <button
            type="button"
            onClick={() => setMobileNavOpen(true)}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-white md:hidden"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <p className="hidden text-sm font-medium text-white md:block">
            {profile?.company || "Company"} · Supervisor Portal
          </p>
          <button
            type="button"
            onClick={() => setShowLogoutConfirm(true)}
            className="text-sm font-medium text-white md:hidden"
          >
            Sign Out
          </button>
        </header>

        <main className="flex-1 space-y-4 p-4 md:p-6">
          <div>
            <h1 className="text-xl font-semibold text-slate-900">
              My Profile
            </h1>
            <p className="text-sm text-slate-400">
              View and update your account information
            </p>
          </div>

          {loading && (
            <div className="rounded-xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-400">
              Loading profile...
            </div>
          )}

          {!loading && error && (
            <div className="rounded-xl border border-red-200 bg-white p-10 text-center text-sm text-red-400">
              {error}
            </div>
          )}

          {!loading && !error && profile && (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              <div className="rounded-xl border border-slate-200 bg-white p-5 lg:col-span-1">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-amber-100 text-lg font-semibold text-amber-600">
                  {initials}
                </div>
                <p className="mt-3 text-base font-semibold text-slate-900">
                  {profile.name}
                </p>
                <p className="text-xs text-slate-400">
                  {profile.supervisor_id}
                </p>

                <div className="mt-4 space-y-2 border-t border-slate-100 pt-4 text-sm">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Company</span>
                    <span className="text-slate-700">
                      {profile.company || "—"}
                    </span>
                  </div>
                </div>
                <p className="mt-4 text-[11px] text-slate-400">
                  Company is managed by your OJT coordinator.
                </p>
              </div>

              <div className="space-y-4 lg:col-span-2">
                <div className="rounded-xl border border-slate-200 bg-white p-5">
                  <p className="text-sm font-semibold text-slate-800">
                    Account Information
                  </p>

                  {profileErr && (
                    <div className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">
                      {profileErr}
                    </div>
                  )}
                  {profileMsg && (
                    <div className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-600">
                      {profileMsg}
                    </div>
                  )}

                  <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-500">
                        Full Name
                      </label>
                      <input
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-amber-400 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-500">
                        Email
                      </label>
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-amber-400 focus:outline-none"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="mb-1 block text-xs font-medium text-slate-500">
                        Department
                      </label>
                      <input
                        type="text"
                        value={department}
                        onChange={(e) => setDepartment(e.target.value)}
                        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-amber-400 focus:outline-none"
                      />
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleSaveProfile}
                    disabled={savingProfile}
                    className="mt-4 rounded-lg bg-[#0c1322] px-4 py-2 text-sm font-semibold text-white hover:bg-[#16233f] disabled:opacity-60"
                  >
                    {savingProfile ? "Saving..." : "Save Changes"}
                  </button>
                </div>

                <div className="rounded-xl border border-slate-200 bg-white p-5">
                  <p className="text-sm font-semibold text-slate-800">
                    Change Password
                  </p>

                  {passwordErr && (
                    <div className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">
                      {passwordErr}
                    </div>
                  )}
                  {passwordMsg && (
                    <div className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-600">
                      {passwordMsg}
                    </div>
                  )}

                  <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-500">
                        Current Password
                      </label>
                      <input
                        type="password"
                        value={currentPassword}
                        onChange={(e) => setCurrentPassword(e.target.value)}
                        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-amber-400 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-500">
                        New Password
                      </label>
                      <input
                        type="password"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-amber-400 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-500">
                        Confirm New Password
                      </label>
                      <input
                        type="password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-amber-400 focus:outline-none"
                      />
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleChangePassword}
                    disabled={savingPassword}
                    className="mt-4 rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                  >
                    {savingPassword ? "Updating..." : "Update Password"}
                  </button>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>

      {showLogoutConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 px-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl">
            <h2 className="text-lg font-semibold text-slate-900">
              Sign out?
            </h2>
            <p className="mt-1.5 text-sm text-slate-500">
              Are you sure you want to sign out?
            </p>
            <div className="mt-6 flex gap-2.5">
              <button
                type="button"
                onClick={() => setShowLogoutConfirm(false)}
                className="flex-1 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50"
              >
                No, Stay
              </button>
              <button
                type="button"
                onClick={handleLogout}
                className="flex-1 rounded-lg bg-red-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-600"
              >
                Yes, Sign Out
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
