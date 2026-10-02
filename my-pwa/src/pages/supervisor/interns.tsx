import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { API_URL, withSupervisorAuth } from "../../lib/api";

interface Intern {
  student_id: string;
  name: string;
  email: string;
  program: string | null;
  company: string | null;
  required_hours: number;
  hours_rendered: number;
  active_tasks: number;
  tasks_awaiting_review: number;
  completion: number;
}

interface Supervisor {
  supervisor_id: string;
  name: string;
  company: string;
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

export default function SupervisorInterns() {
  const navigate = useNavigate();
  const [supervisor, setSupervisor] = useState<Supervisor | null>(null);
  const [interns, setInterns] = useState<Intern[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [search, setSearch] = useState("");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem("supervisor");
    if (!saved) {
      navigate("/");
      return;
    }
    setSupervisor(JSON.parse(saved));
  }, [navigate]);

  useEffect(() => {
    if (!supervisor) return;

    const load = async () => {
      try {
        setLoading(true);
        const response = await fetch(
          `${API_URL}/api/supervisor/${supervisor.supervisor_id}/interns`,
          withSupervisorAuth()
        );
        const data = await response.json();
        if (!response.ok) throw new Error(data.message || "Failed to load interns.");
        setInterns(data.interns || []);
        setLoadError("");
      } catch (error) {
        setLoadError(
          error instanceof Error ? error.message : "Failed to load interns."
        );
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [supervisor]);

  const handleLogout = () => {
    localStorage.removeItem("supervisor");
    localStorage.removeItem("supervisor_id");
    localStorage.removeItem("supervisor_token");
    navigate("/");
  };

  const filtered = interns.filter(
    (i) =>
      i.name.toLowerCase().includes(search.toLowerCase()) ||
      i.student_id.toLowerCase().includes(search.toLowerCase())
  );

  const initials = (name: string) =>
    name
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

      {/* SIDEBAR */}
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
          {NAV_ITEMS.map((item) => {
            const active = item.path === "/supervisor/interns";
            return (
              <button
                key={item.path}
                type="button"
                onClick={() => navigate(item.path)}
                className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm ${
                  active
                    ? "border-l-2 border-amber-500 bg-white/5 font-medium text-amber-500"
                    : "text-slate-400 hover:bg-white/5 hover:text-slate-200"
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </nav>

        <div className="space-y-1 border-t border-white/10 px-3 py-2">
          <button
            type="button"
            onClick={() => navigate("/supervisor/profile")}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm text-slate-400 hover:bg-white/5 hover:text-slate-200"
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

      {/* MAIN */}
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
            {supervisor?.company || "Company"} · Supervisor Portal
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
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-xl font-semibold text-slate-900">
                My Interns
              </h1>
              <p className="text-sm text-slate-400">
                Students currently assigned to you
              </p>
            </div>
            <input
              type="text"
              placeholder="Search interns..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-56 rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-slate-400 focus:outline-none"
            />
          </div>

          {loadError && (
            <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              {loadError}
            </p>
          )}

          {loading && (
            <div className="rounded-xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-400">
              Loading interns...
            </div>
          )}

          {!loading && filtered.length === 0 && (
            <div className="rounded-xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-400">
              No interns assigned to you yet.
            </div>
          )}

          {!loading && filtered.length > 0 && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {filtered.map((intern) => (
                <div
                  key={intern.student_id}
                  className="rounded-xl border border-slate-200 bg-white p-4"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-100 text-sm font-semibold text-amber-600">
                      {initials(intern.name)}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-800">
                        {intern.name}
                      </p>
                      <p className="truncate text-xs text-slate-400">
                        {intern.program || "—"}
                      </p>
                    </div>
                  </div>

                  <div className="mt-3">
                    <div className="flex items-center justify-between text-xs text-slate-500">
                      <span>Progress</span>
                      <span>
                        {intern.hours_rendered}/{intern.required_hours}h
                      </span>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full rounded-full bg-amber-500"
                        style={{ width: `${intern.completion}%` }}
                      />
                    </div>
                  </div>

                  <div className="mt-3 flex items-center gap-2 text-xs">
                    <span className="rounded-full bg-slate-100 px-2 py-1 text-slate-500">
                      {intern.active_tasks} active tasks
                    </span>
                    {intern.tasks_awaiting_review > 0 && (
                      <span className="rounded-full bg-amber-50 px-2 py-1 text-amber-600">
                        {intern.tasks_awaiting_review} to review
                      </span>
                    )}
                  </div>
                </div>
              ))}
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
