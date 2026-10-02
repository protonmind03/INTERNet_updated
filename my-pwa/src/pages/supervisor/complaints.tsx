import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  API_URL,
  downloadProtectedUpload,
  withSupervisorAuth,
} from "../../lib/api";

interface Supervisor {
  supervisor_id: string;
  name: string;
  company: string;
}

interface Intern {
  student_id: string;
  name: string;
}

interface Complaint {
  id: number;
  reported_student_name: string | null;
  category: string;
  description: string;
  status: "Pending" | "In Review" | "Resolved" | "Dismissed";
  resolution_notes: string | null;
  evidence_url?: string | null;
  created_at: string;
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

const STATUS_STYLES: Record<string, string> = {
  Pending: "bg-amber-50 text-amber-600",
  "In Review": "bg-blue-50 text-blue-600",
  Resolved: "bg-emerald-50 text-emerald-600",
  Dismissed: "bg-slate-100 text-slate-500",
};

const CATEGORIES = [
  "Attendance Discrepancy",
  "Behavioral Concern",
  "Task Non-Compliance",
  "Workplace Incident",
  "Other",
];

export default function SupervisorComplaints() {
  const navigate = useNavigate();
  const [supervisor, setSupervisor] = useState<Supervisor | null>(null);
  const [interns, setInterns] = useState<Intern[]>([]);
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [loading, setLoading] = useState(true);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  const [showFileModal, setShowFileModal] = useState(false);
  const [studentId, setStudentId] = useState("");
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [description, setDescription] = useState("");
  const [evidence, setEvidence] = useState<File | null>(null);
  const [filing, setFiling] = useState(false);
  const [fileErr, setFileErr] = useState("");

  useEffect(() => {
    const saved = localStorage.getItem("supervisor");
    if (!saved) {
      navigate("/");
      return;
    }
    setSupervisor(JSON.parse(saved));
  }, [navigate]);

  const loadComplaints = async (supervisorId: string) => {
    try {
      setLoading(true);
      const response = await fetch(
        `${API_URL}/api/complaints/supervisor/${supervisorId}`,
        withSupervisorAuth()
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Failed to load complaints.");
      setComplaints(data.complaints || []);
    } catch {
      // stays empty
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!supervisor) return;

    fetch(
      `${API_URL}/api/supervisor/${supervisor.supervisor_id}/interns`,
      withSupervisorAuth()
    )
      .then((r) => r.json())
      .then((data) => setInterns(data.interns || []))
      .catch(() => {});

    loadComplaints(supervisor.supervisor_id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supervisor]);

  const handleLogout = () => {
    localStorage.removeItem("supervisor");
    localStorage.removeItem("supervisor_id");
    localStorage.removeItem("supervisor_token");
    navigate("/");
  };

  const handleFile = async () => {
    setFileErr("");

    if (!description.trim()) {
      setFileErr("Please describe the concern.");
      return;
    }

    try {
      setFiling(true);
      const internName =
        interns.find((i) => i.student_id === studentId)?.name || null;

      // Multipart so an optional evidence file can be attached
      // (use case "File Complaint" includes "Attach Evidence/File").
      const formData = new FormData();
      if (internName) formData.append("reported_student_name", internName);
      formData.append("category", category);
      formData.append("description", description.trim());
      if (evidence) formData.append("evidence", evidence);

      const response = await fetch(`${API_URL}/api/complaints/supervisor`, withSupervisorAuth({
        method: "POST",
        body: formData,
      }));

      const data = await response.json();

      if (!response.ok) {
        setFileErr(data.message || "Failed to file complaint.");
        return;
      }

      setShowFileModal(false);
      setStudentId("");
      setDescription("");
      setEvidence(null);
      if (supervisor) loadComplaints(supervisor.supervisor_id);
    } catch {
      setFileErr("Unable to connect to the server.");
    } finally {
      setFiling(false);
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
            const active = item.path === "/supervisor/complaints";
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
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-xl font-semibold text-slate-900">
                Complaints & Incidents
              </h1>
              <p className="text-sm text-slate-400">
                File a concern and track ones you've already reported
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowFileModal(true)}
              className="rounded-lg bg-[#0c1322] px-4 py-2 text-sm font-semibold text-white hover:bg-[#16233f]"
            >
              + File Complaint
            </button>
          </div>

          <div className="space-y-2.5">
            {loading && (
              <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-400">
                Loading...
              </div>
            )}

            {!loading && complaints.length === 0 && (
              <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-400">
                You haven't filed any complaints.
              </div>
            )}

            {!loading &&
              complaints.map((c) => (
                <div
                  key={c.id}
                  className="rounded-xl border border-slate-200 bg-white p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-800">
                        {c.category}
                        {c.reported_student_name && (
                          <span className="ml-2 text-xs font-normal text-slate-400">
                            about {c.reported_student_name}
                          </span>
                        )}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {c.description}
                      </p>
                      <p className="mt-1.5 text-xs text-slate-400">
                        {new Date(c.created_at).toLocaleDateString()}
                      </p>
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${
                        STATUS_STYLES[c.status]
                      }`}
                    >
                      {c.status}
                    </span>
                  </div>
                  {c.resolution_notes && (
                    <p className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
                      Coordinator note: {c.resolution_notes}
                    </p>
                  )}
                  {c.evidence_url && (
                    <button
                      type="button"
                      onClick={() =>
                        downloadProtectedUpload(
                          c.evidence_url as string,
                          "supervisor"
                        ).catch(() =>
                          setFileErr("Unable to download the evidence file.")
                        )
                      }
                      className="mt-2 text-xs font-medium text-indigo-600 hover:underline"
                    >
                      Download evidence
                    </button>
                  )}
                </div>
              ))}
          </div>
        </main>
      </div>

      {showFileModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 px-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <h2 className="text-lg font-semibold text-slate-900">
              File a Complaint
            </h2>

            {fileErr && (
              <div className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">
                {fileErr}
              </div>
            )}

            <div className="mt-4 space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">
                  About which student? (optional)
                </label>
                <select
                  value={studentId}
                  onChange={(e) => setStudentId(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-slate-400 focus:outline-none"
                >
                  <option value="">General / not student-specific</option>
                  {interns.map((i) => (
                    <option key={i.student_id} value={i.student_id}>
                      {i.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
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

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">
                  Description
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={4}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-slate-400 focus:outline-none"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">
                  Evidence (optional)
                </label>
                <input
                  type="file"
                  accept=".jpg,.jpeg,.png,.pdf,.doc,.docx"
                  onChange={(e) => setEvidence(e.target.files?.[0] || null)}
                  className="block w-full text-xs text-slate-500 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-slate-700"
                />
                <p className="mt-1 text-[11px] text-slate-400">
                  JPG, PNG, PDF, DOC, or DOCX up to 5 MB.
                </p>
              </div>
            </div>

            <div className="mt-6 flex gap-2.5">
              <button
                type="button"
                onClick={() => setShowFileModal(false)}
                className="flex-1 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleFile}
                disabled={filing}
                className="flex-1 rounded-lg bg-[#0c1322] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#16233f] disabled:opacity-60"
              >
                {filing ? "Filing..." : "Submit"}
              </button>
            </div>
          </div>
        </div>
      )}

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
