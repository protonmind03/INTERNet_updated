import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { API_URL, withSupervisorAuth } from "../../lib/api";
import NotificationBell from "../../components/NotificationBell";

type Supervisor = {
  id: number;
  supervisor_id: string;
  email: string;
  name: string;
  company: string;
  department: string;
};

type InternSummary = {
  student_id: string;
  name: string;
  program: string;
  hoursLogged: number;
  hoursRequired: number;
  activeTasks: number;
};

type PendingLog = {
  id: number;
  student_id: string;
  student_name: string;
  date: string;
  time_in: string | null;
  time_out: string | null;
  hours: number | null;
};

type Deadline = {
  id: number;
  title: string;
  description: string;
  due_date: string;
};

type SupervisorDashboardData = {
  totalInterns: number;
  pendingAttendance: number;
  activeTasks: number;
  pendingEvaluations: number;
  interns: InternSummary[];
  pendingLogs: PendingLog[];
  deadlines: Deadline[];
};

function SupervisorDashboard() {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const navigate = useNavigate();

  const [supervisor, setSupervisor] = useState<Supervisor | null>(null);
  const [data, setData] = useState<SupervisorDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<number | null>(null);

  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const profileDropdownRef = useRef<HTMLDivElement>(null);

  const [currentTime, setCurrentTime] = useState(new Date());

  /*
  |--------------------------------------------------------------------------
  | LOAD SUPERVISOR
  |--------------------------------------------------------------------------
  */

  useEffect(() => {
    const saved = localStorage.getItem("supervisor");

    if (!saved) {
      navigate("/");
      return;
    }

    try {
      setSupervisor(JSON.parse(saved));
    } catch (error) {
      console.error("Error reading supervisor data:", error);
      localStorage.removeItem("supervisor");
      localStorage.removeItem("supervisor_id");
      localStorage.removeItem("supervisor_token");
      navigate("/");
    }
  }, [navigate]);

  /*
  |--------------------------------------------------------------------------
  | FETCH DASHBOARD DATA
  |--------------------------------------------------------------------------
  */

  const fetchDashboard = async () => {
    if (!supervisor?.supervisor_id) return;

    try {
      const response = await fetch(
        `${API_URL}/api/supervisor/dashboard/${supervisor.supervisor_id}`,
        withSupervisorAuth()
      );

      if (!response.ok) {
        throw new Error("Failed to fetch supervisor dashboard");
      }

      const json: SupervisorDashboardData = await response.json();
      setData(json);
    } catch (error) {
      console.error("Error fetching supervisor dashboard:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboard();
    const interval = setInterval(fetchDashboard, 15000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supervisor]);

  /*
  |--------------------------------------------------------------------------
  | CLOCK
  |--------------------------------------------------------------------------
  */

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        profileDropdownRef.current &&
        !profileDropdownRef.current.contains(e.target as Node)
      ) {
        setShowProfileMenu(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () =>
      document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  /*
  |--------------------------------------------------------------------------
  | HELPERS
  |--------------------------------------------------------------------------
  */

  const formattedDate = currentTime.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const currentHour = currentTime.getHours();
  let greeting = "Good morning";
  if (currentHour >= 12 && currentHour < 18) greeting = "Good afternoon";
  else if (currentHour >= 18) greeting = "Good evening";

  const getInitials = (name: string) => {
    if (!name) return "SV";
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  };

  const daysAway = (dueDate: string) => {
    const diff = Math.ceil(
      (new Date(dueDate).getTime() - currentTime.getTime()) / (1000 * 60 * 60 * 24)
    );
    if (diff < 0) return "Overdue";
    if (diff === 0) return "Today";
    return `${diff}d away`;
  };

  const urgencyStyle = (dueDate: string) => {
    const diff = Math.ceil(
      (new Date(dueDate).getTime() - currentTime.getTime()) / (1000 * 60 * 60 * 24)
    );
    if (diff <= 3) return "bg-red-50 text-red-500";
    if (diff <= 14) return "bg-amber-50 text-amber-500";
    return "bg-emerald-50 text-emerald-600";
  };

  const avgCompletion = useMemo(() => {
    if (!data?.interns?.length) return 0;
    const total = data.interns.reduce(
      (sum, i) => sum + Math.min((i.hoursLogged / i.hoursRequired) * 100, 100),
      0
    );
    return Math.round(total / data.interns.length);
  }, [data]);

  /*
  |--------------------------------------------------------------------------
  | QUICK APPROVE FROM DASHBOARD
  |--------------------------------------------------------------------------
  */

  const quickApprove = async (log: PendingLog) => {
    setProcessingId(log.id);
    try {
      const response = await fetch(`${API_URL}/api/attendance/${log.id}/status`, withSupervisorAuth({
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "Verified" }),
      }));

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.message || "Failed to approve log.");
      }

      setData((prev) =>
        prev
          ? {
              ...prev,
              pendingAttendance: Math.max(prev.pendingAttendance - 1, 0),
              pendingLogs: prev.pendingLogs.filter((l) => l.id !== log.id),
            }
          : prev
      );
    } catch (error) {
      console.error("Error approving log:", error);
      alert(
        error instanceof Error
          ? error.message
          : "Something went wrong approving this log."
      );
    } finally {
      setProcessingId(null);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("supervisor");
    localStorage.removeItem("supervisor_id");
    localStorage.removeItem("supervisor_token");
    navigate("/");
  };

  return (
    <div className="flex h-screen bg-slate-50">

      {/* SIDEBAR */}
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
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
        <div className="flex items-center gap-2.5 px-4 py-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-500 font-bold text-slate-900">
            IN
          </div>
          <div>
            <p className="text-sm font-semibold leading-tight text-white">INTERNet</p>
            <p className="text-[11px] leading-tight text-slate-400">Supervisor Portal</p>
          </div>
        </div>

        <nav className="flex-1 space-y-1 px-3 pt-2">
          <a
            href="#"
            className="flex items-center gap-3 rounded-lg border-l-2 border-amber-500 bg-white/5 px-3 py-2 text-sm font-medium text-amber-500"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
              <path d="M3 9.5 12 3l9 6.5V21a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1Z" />
            </svg>
            Dashboard
          </a>

          <button
  type="button"
  onClick={() => navigate("/supervisor/attendance")}
  className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-slate-400 hover:bg-white/5 hover:text-slate-200"
>
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="17"
    height="17"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.75"
  >
    <path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
  </svg>

  Attendance Approval

  {!!data?.pendingAttendance && (
    <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[11px] font-semibold text-white">
      {data.pendingAttendance}
    </span>
  )}
</button>

          <button
            type="button"
            onClick={() => navigate("/supervisor/interns")}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-slate-400 hover:bg-white/5 hover:text-slate-200"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
              <circle cx="9" cy="8" r="3" />
              <path d="M2 20c1.2-3.2 4-5 7-5s5.8 1.8 7 5" />
              <circle cx="17" cy="7" r="2.5" />
              <path d="M16 15c2.4.3 4.2 1.8 5 5" />
            </svg>
            My Interns
          </button>

          <button
            type="button"
            onClick={() => navigate("/supervisor/tasks")}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-slate-400 hover:bg-white/5 hover:text-slate-200"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
              <path d="m9 11 3 3L22 4M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
            </svg>
            Assign Tasks
          </button>

          <button
            type="button"
            onClick={() => navigate("/supervisor/documents")}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-slate-400 hover:bg-white/5 hover:text-slate-200"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
              <path d="M14 2v6h6M8 13h8M8 17h8" />
            </svg>
            Student Documents
          </button>

          <button
            type="button"
            onClick={() => navigate("/supervisor/evaluation")}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-slate-400 hover:bg-white/5 hover:text-slate-200"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
              <path d="m12 2 3.1 6.3 6.9 1-5 4.9L18.2 21 12 17.8 5.8 21 7 14.2l-5-4.9 6.9-1Z" />
            </svg>
            Evaluations
          </button>

          <button
            type="button"
            onClick={() => navigate("/supervisor/complaints")}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-slate-400 hover:bg-white/5 hover:text-slate-200"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
              <path d="M10.3 3.9 2.7 17a1.8 1.8 0 0 0 1.5 2.7h15.6a1.8 1.8 0 0 0 1.5-2.7L13.7 3.9a2 2 0 0 0-3.4 0Z" />
              <path d="M12 9v4M12 16.5h.01" />
            </svg>
            Complaints
          </button>
        </nav>

        <div className="space-y-1 border-t border-white/10 px-3 py-2">
          <button
            type="button"
            onClick={() => navigate("/supervisor/profile")}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-slate-400 hover:bg-white/5 hover:text-slate-200"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
              <circle cx="12" cy="8" r="4" />
              <path d="M4 21c1.5-4 5-6 8-6s6.5 2 8 6" />
            </svg>
            Profile
          </button>

          <button
            onClick={handleLogout}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-red-400 hover:bg-white/5"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <path d="M16 17l5-5-5-5M21 12H9" />
            </svg>
            Sign Out
          </button>
        </div>
      </aside>

      {/* MAIN */}
      <div className="flex flex-1 flex-col overflow-y-auto">

        {/* TOP BAR */}
        <header className="flex items-center justify-between bg-gradient-to-r from-amber-500 to-orange-500 px-4 py-2">
          <button
            type="button"
            onClick={() => setMobileNavOpen(true)}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-white md:hidden"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>

          <p className="hidden text-sm font-medium text-white md:block">
            {supervisor?.company || "Company"} · Supervisor Portal
          </p>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => navigate("/supervisor/attendance?search=1")}
              className="flex items-center gap-2 rounded-md bg-white/15 px-3 py-1.5 text-sm text-white hover:bg-white/25"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="7" />
                <path d="m21 21-4.3-4.3" />
              </svg>
              Search
            </button>

            <NotificationBell
              role="supervisor"
              viewAllPath="/supervisor/notifications"
              buttonClassName="relative rounded-md p-1.5 text-white hover:bg-white/15"
            />

            {/* PROFILE */}
            <div className="relative" ref={profileDropdownRef}>
              <button
                type="button"
                onClick={() => setShowProfileMenu((prev) => !prev)}
                className="flex items-center gap-2 rounded-md bg-white/10 px-2 py-1 hover:bg-white/20"
              >
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-900 text-xs font-semibold text-white">
                  {getInitials(supervisor?.name || "")}
                </div>
                <div className="text-right leading-tight">
                  <p className="text-xs font-semibold text-white">{supervisor?.name}</p>
                  <p className="text-[10px] text-white/80">Supervisor</p>
                </div>
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  className={`text-white/70 transition-transform ${showProfileMenu ? "rotate-180" : ""}`}
                >
                  <path d="m6 9 6 6 6-6" />
                </svg>
              </button>

              {showProfileMenu && (
                <div className="absolute right-0 top-10 z-[100] w-56 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl">
                  <button
                    type="button"
                    onClick={() => {
                      setShowProfileMenu(false);
                      navigate("/supervisor/profile");
                    }}
                    className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm text-slate-600 hover:bg-slate-50"
                  >
                    View Profile
                  </button>
                  <div className="border-t border-slate-100">
                    <button
                      type="button"
                      onClick={handleLogout}
                      className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm text-red-500 hover:bg-red-50"
                    >
                      Sign Out
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* CONTENT */}
        <main className="flex-1 space-y-3 p-4">

          {/* Greeting */}
          <div>
            <p className="text-xs font-medium text-slate-400">{formattedDate}</p>
            <h1 className="mt-1 text-2xl font-semibold text-slate-900">
              {greeting}, {supervisor?.name}
            </h1>
            <p className="text-sm text-slate-500">
              {supervisor?.company} · {supervisor?.department}
            </p>
          </div>

          {/* Pending approval banner */}
          {!!data?.pendingAttendance && (
            <div className="flex items-center justify-between rounded-xl bg-gradient-to-r from-[#0c1322] to-[#16233f] px-4 py-2">
              <div>
                <p className="text-sm font-semibold text-white">
                  {data.pendingAttendance} attendance{" "}
                  {data.pendingAttendance === 1 ? "log needs" : "logs need"} your approval
                </p>
                <p className="mt-0.5 text-xs text-slate-300">
                  Review time-ins, time-outs, and submitted tasks before they're marked verified.
                </p>
              </div>
              <button
                onClick={() => navigate("/supervisor/attendance")}
                className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-amber-400"
              >
                Review Now
              </button>
            </div>
          )}

          {/* Stat cards */}
          <div className="grid grid-cols-4 gap-2.5">
            <div className="rounded-xl border border-slate-200 bg-white px-4 py-2">
              <p className="text-[11px] font-medium tracking-wide text-slate-400">MY INTERNS</p>
              <p className="mt-1.5 text-2xl font-semibold text-slate-900">
                {data?.totalInterns ?? 0}
              </p>
              <p className="mt-1 text-[11px] text-slate-400">under your supervision</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white px-4 py-2">
              <p className="text-[11px] font-medium tracking-wide text-slate-400">PENDING ATTENDANCE</p>
              <p className="mt-1.5 text-2xl font-semibold text-amber-500">
                {data?.pendingAttendance ?? 0}
              </p>
              <p className="mt-1 text-[11px] text-slate-400">awaiting your review</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white px-4 py-2">
              <p className="text-[11px] font-medium tracking-wide text-slate-400">ACTIVE TASKS</p>
              <p className="mt-1.5 text-2xl font-semibold text-blue-500">
                {data?.activeTasks ?? 0}
              </p>
              <p className="mt-1 text-[11px] text-slate-400">assigned across interns</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white px-4 py-2">
              <p className="text-[11px] font-medium tracking-wide text-slate-400">AVG. COMPLETION</p>
              <p className="mt-1.5 text-2xl font-semibold text-emerald-500">{avgCompletion}%</p>
              <p className="mt-1 text-[11px] text-slate-400">across all interns</p>
            </div>
          </div>

          {/* Interns + Pending / Deadlines */}
          <div className="grid grid-cols-3 gap-3">

            {/* My Interns */}
            <div className="col-span-2 rounded-xl border border-slate-200 bg-white p-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-slate-800">My Interns</p>
                <button
                  onClick={() => navigate("/supervisor/interns")}
                  className="text-xs font-medium text-blue-600 hover:underline"
                >
                  View all
                </button>
              </div>

              <div className="mt-2 divide-y divide-slate-100">
                {loading ? (
                  <p className="py-4 text-center text-xs text-slate-400">Loading interns…</p>
                ) : !data?.interns?.length ? (
                  <p className="py-4 text-center text-xs text-slate-400">
                    No interns assigned yet.
                  </p>
                ) : (
                  data.interns.map((intern) => {
                    const pct = Math.min(
                      (intern.hoursLogged / intern.hoursRequired) * 100,
                      100
                    );
                    return (
                      <div key={intern.student_id} className="flex items-center gap-3 py-2.5">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-900 text-xs font-semibold text-white">
                          {getInitials(intern.name)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between">
                            <p className="truncate text-sm font-medium text-slate-800">
                              {intern.name}
                            </p>
                            <span className="text-xs text-slate-400">
                              {intern.hoursLogged}/{intern.hoursRequired}h
                            </span>
                          </div>
                          <p className="text-xs text-slate-400">{intern.program}</p>
                          <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                            <div
                              className="h-full rounded-full bg-gradient-to-r from-[#0c1322] to-emerald-400"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                        <span className="shrink-0 rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-600">
                          {intern.activeTasks} tasks
                        </span>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Right column: pending logs + deadlines */}
            <div className="space-y-3">

              {/* Pending logs quick approve */}
              <div className="rounded-xl border border-slate-200 bg-white p-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-slate-800">Pending Approvals</p>
                  <button
                    onClick={() => navigate("/supervisor/attendance")}
                    className="text-xs font-medium text-blue-600 hover:underline"
                  >
                    View all
                  </button>
                </div>

                <div className="mt-2 space-y-2">
                  {loading ? (
                    <p className="py-3 text-center text-xs text-slate-400">Loading…</p>
                  ) : !data?.pendingLogs?.length ? (
                    <p className="py-3 text-center text-xs text-slate-400">
                      Nothing pending. You're all caught up 🎉
                    </p>
                  ) : (
                    data.pendingLogs.slice(0, 4).map((log) => (
                      <div
                        key={log.id}
                        className="flex items-center justify-between rounded-lg border border-slate-100 px-2.5 py-2"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-xs font-medium text-slate-700">
                            {log.student_name}
                          </p>
                          <p className="text-[11px] text-slate-400">
                            {log.date} · {log.time_in || "—"}–{log.time_out || "—"}
                          </p>
                        </div>
                        <button
                          onClick={() => quickApprove(log)}
                          disabled={processingId === log.id || !log.time_out}
                          title={
                            log.time_out
                              ? undefined
                              : "Available after the student times out"
                          }
                          className="shrink-0 rounded-md bg-emerald-500 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {processingId === log.id ? "…" : "Approve"}
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Upcoming deadlines */}
              <div className="rounded-xl border border-slate-200 bg-white p-3">
                <p className="text-sm font-semibold text-slate-800">Upcoming Deadlines</p>

                <div className="mt-2 space-y-2">
                  {loading ? (
                    <p className="py-3 text-center text-xs text-slate-400">Loading…</p>
                  ) : !data?.deadlines?.length ? (
                    <p className="py-3 text-center text-xs text-slate-400">
                      No upcoming deadlines.
                    </p>
                  ) : (
                    data.deadlines.map((d) => (
                      <div key={d.id} className="rounded-lg border border-slate-100 px-2.5 py-2">
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-xs font-medium text-slate-700">{d.title}</p>
                          <span
                            className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${urgencyStyle(
                              d.due_date
                            )}`}
                          >
                            {daysAway(d.due_date)}
                          </span>
                        </div>
                        <p className="mt-0.5 text-[11px] text-slate-400">{d.description}</p>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>

        </main>
      </div>
    </div>
  );
}

export default SupervisorDashboard;