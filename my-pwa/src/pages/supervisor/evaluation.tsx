import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { API_URL, withSupervisorAuth } from "../../lib/api";

interface Intern {
  student_id: string;
  name: string;
}

interface Supervisor {
  supervisor_id: string;
  name: string;
  company: string;
}

interface PastEvaluation {
  id: number;
  student_id: string;
  category: string;
  rating: number;
  comments: string | null;
  eval_date: string;
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

const CATEGORIES = [
  "Overall Performance",
  "Work Quality",
  "Punctuality & Attendance",
  "Communication Skills",
  "Initiative",
];

export default function SupervisorEvaluation() {
  const navigate = useNavigate();
  const [supervisor, setSupervisor] = useState<Supervisor | null>(null);
  const [interns, setInterns] = useState<Intern[]>([]);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  const [studentId, setStudentId] = useState("");
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [rating, setRating] = useState(0);
  const [comments, setComments] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitMsg, setSubmitMsg] = useState("");
  const [submitErr, setSubmitErr] = useState("");

  const [history, setHistory] = useState<PastEvaluation[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

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

    fetch(
      `${API_URL}/api/supervisor/${supervisor.supervisor_id}/interns`,
      withSupervisorAuth()
    )
      .then((r) => r.json())
      .then((data) => setInterns(data.interns || []))
      .catch(() => {});
  }, [supervisor]);

  useEffect(() => {
    if (!studentId) {
      setHistory([]);
      return;
    }

    setLoadingHistory(true);
    fetch(
      `${API_URL}/api/evaluations/student/${studentId}`,
      withSupervisorAuth()
    )
      .then((r) => r.json())
      .then((data) => setHistory(data.evaluations || []))
      .catch(() => {})
      .finally(() => setLoadingHistory(false));
  }, [studentId]);

  const handleLogout = () => {
    localStorage.removeItem("supervisor");
    localStorage.removeItem("supervisor_id");
    localStorage.removeItem("supervisor_token");
    navigate("/");
  };

  const handleSubmit = async () => {
    setSubmitMsg("");
    setSubmitErr("");

    if (!studentId) {
      setSubmitErr("Choose a student to evaluate.");
      return;
    }
    if (rating === 0) {
      setSubmitErr("Select a star rating.");
      return;
    }

    try {
      setSubmitting(true);
      const response = await fetch(`${API_URL}/api/evaluations`, withSupervisorAuth({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          student_id: studentId,
          evaluator_type: "supervisor",
          evaluator_id: supervisor?.supervisor_id,
          evaluator_name: supervisor?.name,
          category,
          rating,
          comments: comments.trim() || null,
        }),
      }));

      const data = await response.json();

      if (!response.ok) {
        setSubmitErr(data.message || "Failed to submit evaluation.");
        return;
      }

      setSubmitMsg("Evaluation submitted.");
      setRating(0);
      setComments("");
      setHistory((prev) => [data.evaluation, ...prev]);
    } catch {
      setSubmitErr("Unable to connect to the server.");
    } finally {
      setSubmitting(false);
    }
  };

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
          {NAV_ITEMS.map((item) => {
            const active = item.path === "/supervisor/evaluation";
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
          <div>
            <h1 className="text-xl font-semibold text-slate-900">
              Evaluate a Student
            </h1>
            <p className="text-sm text-slate-400">
              Rate an intern's performance during their training
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="rounded-xl border border-slate-200 bg-white p-5">
              {submitErr && (
                <div className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">
                  {submitErr}
                </div>
              )}
              {submitMsg && (
                <div className="mb-3 rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-600">
                  {submitMsg}
                </div>
              )}

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">
                  Student
                </label>
                <select
                  value={studentId}
                  onChange={(e) => setStudentId(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-slate-400 focus:outline-none"
                >
                  <option value="">Select a student...</option>
                  {interns.map((i) => (
                    <option key={i.student_id} value={i.student_id}>
                      {i.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="mt-4">
                <label className="mb-1 block text-xs font-medium text-slate-500">
                  Category
                </label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-slate-400 focus:outline-none"
                >
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>

              <div className="mt-4">
                <label className="mb-1 block text-xs font-medium text-slate-500">
                  Rating
                </label>
                <div className="flex gap-1">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setRating(n)}
                      className={`text-2xl ${
                        n <= rating ? "text-amber-400" : "text-slate-200"
                      }`}
                    >
                      ★
                    </button>
                  ))}
                </div>
              </div>

              <div className="mt-4">
                <label className="mb-1 block text-xs font-medium text-slate-500">
                  Comments (optional)
                </label>
                <textarea
                  value={comments}
                  onChange={(e) => setComments(e.target.value)}
                  rows={3}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-slate-400 focus:outline-none"
                />
              </div>

              <button
                type="button"
                onClick={handleSubmit}
                disabled={submitting}
                className="mt-4 rounded-lg bg-[#0c1322] px-4 py-2 text-sm font-semibold text-white hover:bg-[#16233f] disabled:opacity-60"
              >
                {submitting ? "Submitting..." : "Submit Evaluation"}
              </button>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-5">
              <p className="text-sm font-semibold text-slate-800">
                Past Evaluations
              </p>
              <p className="text-xs text-slate-400">
                {studentId
                  ? "For the selected student"
                  : "Select a student to see their history"}
              </p>

              <div className="mt-3 space-y-2.5">
                {loadingHistory && (
                  <p className="text-xs text-slate-400">Loading...</p>
                )}
                {!loadingHistory && studentId && history.length === 0 && (
                  <p className="text-xs text-slate-400">
                    No evaluations yet for this student.
                  </p>
                )}
                {!loadingHistory &&
                  history.map((h) => (
                    <div
                      key={h.id}
                      className="rounded-lg border border-slate-100 p-3"
                    >
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-semibold text-slate-700">
                          {h.category}
                        </p>
                        <span className="text-amber-400 text-xs">
                          {"★".repeat(h.rating)}
                          <span className="text-slate-200">
                            {"★".repeat(5 - h.rating)}
                          </span>
                        </span>
                      </div>
                      {h.comments && (
                        <p className="mt-1 text-xs text-slate-500">
                          {h.comments}
                        </p>
                      )}
                      <p className="mt-1 text-[11px] text-slate-400">
                        {new Date(h.eval_date).toLocaleDateString()}
                      </p>
                    </div>
                  ))}
              </div>
            </div>
          </div>
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
