import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { API_URL, withStudentAuth } from "../../lib/api";

/* -------------------------------------------------------------------------- */
/* TYPES                                                                      */
/* -------------------------------------------------------------------------- */

interface Notification {
  id: number;
  title: string;
  message: string;
  type:
    | "attendance"
    | "task"
    | "document"
    | "evaluation"
    | "comment";
  is_read: boolean;
  created_at: string;
}

interface StudentDocument {
  id: number;
  doc_type: string;
  original_filename: string;
  size_bytes: number | string;
  status: "Pending" | "Approved" | "Rejected";
  review_notes: string | null;
  uploaded_at: string;
}

// Fallback list, used only if the coordinator-managed requirement list
// (GET /api/ojt-requirements) cannot be loaded.
const defaultRequiredDocumentTypes = [
  "Endorsement",
  "Medical",
  "MOA",
  "Waiver",
  "Insurance",
  "Consent",
  "OJT Evaluation Form (Supervisor)",
  "Mid-term Report",
  "Final Narrative Report",
];

function formatFileSize(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(0)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

/* -------------------------------------------------------------------------- */
/* DOCUMENTS PAGE                                                             */
/* -------------------------------------------------------------------------- */

export default function Documents() {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const navigate = useNavigate();
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [documents, setDocuments] = useState<StudentDocument[]>([]);
  const [documentsLoading, setDocumentsLoading] = useState(true);
  const [documentError, setDocumentError] = useState("");
  const [uploadMessage, setUploadMessage] = useState("");
  const [uploading, setUploading] = useState(false);
  const [requiredDocumentTypes, setRequiredDocumentTypes] = useState<string[]>(
    defaultRequiredDocumentTypes
  );
  const [docType, setDocType] = useState(defaultRequiredDocumentTypes[0]);
  const studentId = localStorage.getItem("student_id") || "";
  const studentName = (() => {
    try {
      return (
        JSON.parse(localStorage.getItem("student") || "{}").name || "Student"
      );
    } catch {
      return "Student";
    }
  })() as string;
  const studentInitials =
    studentName
      .split(" ")
      .map((part) => part[0])
      .filter(Boolean)
      .slice(0, 2)
      .join("")
      .toUpperCase() || "S";

  // Requirements are set by the OJT coordinator ("Set OJT Requirements").
  useEffect(() => {
    let cancelled = false;
    fetch(`${API_URL}/api/ojt-requirements`, withStudentAuth())
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        const names: string[] = (data?.requirements || []).map(
          (item: { name: string }) => item.name
        );
        if (!cancelled && names.length > 0) {
          setRequiredDocumentTypes(names);
          setDocType((current) =>
            names.includes(current) ? current : names[0]
          );
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const loadDocuments = useCallback(async () => {
    try {
      const response = await fetch(
        `${API_URL}/api/documents/student`,
        withStudentAuth()
      );
      const data = await response.json();
      if (response.status === 401) {
        localStorage.removeItem("student");
        localStorage.removeItem("student_id");
        localStorage.removeItem("student_token");
        navigate("/");
        return;
      }
      if (!response.ok) {
        throw new Error(data.message || "Failed to load documents.");
      }
      setDocuments(data.documents || []);
      setDocumentError("");
    } catch (error) {
      setDocumentError(
        error instanceof Error ? error.message : "Failed to load documents."
      );
    } finally {
      setDocumentsLoading(false);
    }
  }, [navigate]);

  useEffect(() => {
    if (!studentId || !localStorage.getItem("student_token")) {
      localStorage.removeItem("student");
      localStorage.removeItem("student_id");
      localStorage.removeItem("student_token");
      navigate("/");
      return;
    }
    void Promise.resolve().then(loadDocuments);
  }, [loadDocuments, navigate, studentId]);

  const handleDocumentUpload = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setDocumentError("");
    setUploadMessage("");
    if (file.size > 10 * 1024 * 1024) {
      setDocumentError("The selected file exceeds the 10 MB limit.");
      return;
    }

    const formData = new FormData();
    formData.append("file", file);
    formData.append("doc_type", docType);

    try {
      setUploading(true);
      const response = await fetch(
        `${API_URL}/api/documents`,
        withStudentAuth({ method: "POST", body: formData })
      );
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || "Failed to upload document.");
      }
      setUploadMessage("Document uploaded and sent to your supervisor for review.");
      await loadDocuments();
    } catch (error) {
      setDocumentError(
        error instanceof Error ? error.message : "Failed to upload document."
      );
    } finally {
      setUploading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("student");
    localStorage.removeItem("student_id");
    localStorage.removeItem("student_token");
    navigate("/");
  };

  /* ------------------------------------------------------------------------ */
  /* NOTIFICATIONS                                                            */
  /* ------------------------------------------------------------------------ */

  const [showNotifications, setShowNotifications] =
    useState(false);

  const [notifications, setNotifications] =
    useState<Notification[]>([]);

  const [unreadCount, setUnreadCount] = useState(0);

  const dropdownRef =
    useRef<HTMLDivElement | null>(null);

  /* ------------------------------------------------------------------------ */
  /* SEARCH                                                                   */
  /* ------------------------------------------------------------------------ */

  const [searchQuery, setSearchQuery] = useState("");

  const [searchFilter, setSearchFilter] =
    useState<"all" | "log" | "task">("all");

  const searchRef =
    useRef<HTMLDivElement | null>(null);

  /* ------------------------------------------------------------------------ */
  /* FETCH NOTIFICATIONS                                                      */
  /* ------------------------------------------------------------------------ */

  useEffect(() => {
    const fetchNotifications = async () => {
      const studentId = localStorage.getItem("student_id");
      if (!studentId) return;

      try {
        const response = await fetch(
          `${API_URL}/api/notifications/student/${studentId}`,
          withStudentAuth()
        );

        if (!response.ok) {
          throw new Error(
            "Failed to fetch notifications"
          );
        }

        const data = await response.json();

        const notificationData: Notification[] =
          Array.isArray(data)
            ? data
            : data.notifications || [];

        setNotifications(notificationData);

        setUnreadCount(
          notificationData.filter(
            (notification) =>
              !notification.is_read
          ).length
        );
      } catch (error) {
        console.error(
          "Error fetching notifications:",
          error
        );
      }
    };

    fetchNotifications();
  }, []);

  /* ------------------------------------------------------------------------ */
  /* CLOSE DROPDOWNS WHEN CLICKING OUTSIDE                                    */
  /* ------------------------------------------------------------------------ */

  useEffect(() => {
    const handleClickOutside = (
      event: MouseEvent
    ) => {
      const target = event.target as Node;

      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(target)
      ) {
        setShowNotifications(false);
      }

      if (
        searchRef.current &&
        !searchRef.current.contains(target)
      ) {
        setSearchQuery("");
        setSearchFilter("all");
      }
    };

    document.addEventListener(
      "mousedown",
      handleClickOutside
    );

    return () => {
      document.removeEventListener(
        "mousedown",
        handleClickOutside
      );
    };
  }, []);

  const submittedTypes = new Set(
    documents
      .filter((item) => item.status !== "Rejected")
      .map((item) => item.doc_type)
  );
  const missingTypes = requiredDocumentTypes.filter(
    (type) => !submittedTypes.has(type)
  );
  const approvedCount = documents.filter(
    (item) => item.status === "Approved"
  ).length;
  const pendingCount = documents.filter(
    (item) => item.status === "Pending"
  ).length;

  const handleDownloadDocument = async (item: StudentDocument) => {
    try {
      const response = await fetch(
        `${API_URL}/api/documents/${item.id}/file`,
        withStudentAuth()
      );
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || "Failed to download document.");
      }

      const objectUrl = URL.createObjectURL(await response.blob());
      const link = window.document.createElement("a");
      link.href = objectUrl;
      link.download = item.original_filename;
      link.click();
      URL.revokeObjectURL(objectUrl);
    } catch (error) {
      setDocumentError(
        error instanceof Error ? error.message : "Failed to download document."
      );
    }
  };

  return (
    <div className="flex h-screen">

      {/* ================================================================== */}
      {/* SIDEBAR                                                            */}
      {/* ================================================================== */}

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

        {/* LOGO */}

        <div className="flex items-center gap-2.5 px-4 py-3">

          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-500 font-bold text-slate-900">
            IN
          </div>

          <div>
            <p className="text-sm font-semibold leading-tight text-white">
              INTERNet
            </p>

            <p className="text-[11px] leading-tight text-slate-400">
              OJT Monitoring System
            </p>
          </div>

        </div>

        {/* NAVIGATION */}

        <nav className="flex-1 space-y-1 px-3 pt-2">

          {/* Dashboard */}

          <a
            href="/student/dashboard"
            className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-slate-400 hover:bg-white/5 hover:text-slate-200"
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
              <path d="M3 9.5 12 3l9 6.5V21a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1Z" />
            </svg>

            Dashboard
          </a>

          {/* Daily Log */}

          <a
            href="/daily-log"
            className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-slate-400 hover:bg-white/5 hover:text-slate-200"
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

            Daily Log
          </a>

          {/* My Tasks */}

          <button
            type="button"
            onClick={() => navigate("/task")}
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
              <path d="m9 11 3 3L22 4M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
            </svg>

            My Tasks
          </button>

          {/* OJT Schedule */}

          <button
            type="button"
            onClick={() => navigate("/schedule")}
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
              <rect
                x="3"
                y="4"
                width="18"
                height="18"
                rx="2"
              />

              <path d="M16 2v4M8 2v4M3 10h18" />
            </svg>

            OJT Schedule
          </button>

          {/* Documents */}

          <a
            href="/documents"
            className="flex items-center gap-3 rounded-lg border-l-2 border-amber-500 bg-white/5 px-3 py-2 text-sm font-medium text-amber-500"
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
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
              <path d="M14 2v6h6" />
            </svg>

            Documents
          </a>

          {/* Report Complaint */}

          <button
            type="button"
            onClick={() => navigate("/report")}
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
              <path d="M10.3 3.9 2.7 17a1.8 1.8 0 0 0 1.5 2.7h15.6a1.8 1.8 0 0 0 1.5-2.7L13.7 3.9a2 2 0 0 0-3.4 0Z" />
              <path d="M12 9v4M12 16.5h.01" />
            </svg>

            Report Complaint
          </button>

        </nav>

        {/* SIDEBAR BOTTOM */}

        <div className="space-y-1 border-t border-white/10 px-3 py-2">

          {/* Profile */}

          <button
            type="button"
            onClick={() => navigate("/profile")}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm text-slate-400 hover:bg-white/5 hover:text-slate-200"
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
              <circle cx="12" cy="8" r="4" />
              <path d="M4 21c1.5-4 5-6 8-6s6.5 2 8 6" />
            </svg>

            Profile
          </button>

          {/* Sign Out */}

          <button
            type="button"
            onClick={() => setShowLogoutConfirm(true)}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm text-red-400 hover:bg-white/5"
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
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <path d="M16 17l5-5-5-5M21 12H9" />
            </svg>

            Sign Out
          </button>

        </div>
      </aside>

      {/* ================================================================== */}
      {/* MAIN                                                               */}
      {/* ================================================================== */}

      <div className="flex flex-1 flex-col overflow-y-auto">

        {/* ================================================================= */}
        {/* TOP BAR                                                           */}
        {/* ================================================================= */}

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
            Pangasinan State University · Lingayen Campus
          </p>

          <div className="flex items-center gap-3">

            {/* ============================================================= */}
            {/* SEARCH                                                         */}
            {/* ============================================================= */}

            <div
              ref={searchRef}
              className="relative"
            >

              <div className="flex items-center gap-2 rounded-md bg-white/15 px-3 py-1.5 text-sm text-white focus-within:bg-white/25">

                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="15"
                  height="15"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  className="shrink-0"
                >
                  <circle
                    cx="11"
                    cy="11"
                    r="7"
                  />

                  <path d="m21 21-4.3-4.3" />
                </svg>

                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(
                      e.target.value
                    );

                    setSearchFilter("all");

                    setShowNotifications(false);
                  }}
                  placeholder="Search..."
                  className="w-36 bg-transparent text-xs text-white outline-none placeholder:text-white/70"
                />

                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => {
                      setSearchQuery("");
                      setSearchFilter("all");
                    }}
                    className="text-white/70 hover:text-white"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="13"
                      height="13"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path d="M18 6 6 18" />
                      <path d="m6 6 12 12" />
                    </svg>
                  </button>
                )}

              </div>

              {/* SEARCH DROPDOWN */}

              {searchQuery.trim() !== "" && (
                <div className="absolute right-0 top-11 z-50 w-80 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">

                  {/* RESULT HEADER */}

                  <div className="border-b border-slate-100 px-4 py-3">

                    <p className="text-xs font-semibold text-slate-800">
                      Search Results
                    </p>

                    <p className="mt-0.5 text-[10px] text-slate-400">
                      Results for "{searchQuery}"
                    </p>

                  </div>

                  {/* FILTER */}

                  <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5">

                    <span className="text-[10px] font-medium text-slate-400">
                      Filter
                    </span>

                    <div className="flex gap-1">

                      <button
                        type="button"
                        onClick={() =>
                          setSearchFilter("all")
                        }
                        className={`rounded-md px-2.5 py-1 text-[10px] font-medium ${
                          searchFilter === "all"
                            ? "bg-amber-100 text-amber-700"
                            : "text-slate-400 hover:bg-slate-100"
                        }`}
                      >
                        All
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          setSearchFilter("log")
                        }
                        className={`rounded-md px-2.5 py-1 text-[10px] font-medium ${
                          searchFilter === "log"
                            ? "bg-blue-100 text-blue-600"
                            : "text-slate-400 hover:bg-slate-100"
                        }`}
                      >
                        Log
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          setSearchFilter("task")
                        }
                        className={`rounded-md px-2.5 py-1 text-[10px] font-medium ${
                          searchFilter === "task"
                            ? "bg-amber-100 text-amber-600"
                            : "text-slate-400 hover:bg-slate-100"
                        }`}
                      >
                        Task
                      </button>

                    </div>
                  </div>

                  {/* RESULTS */}

                  <div className="max-h-64 overflow-y-auto p-2">

                    {/* DAILY LOG */}

                    {(searchFilter === "all" ||
                      searchFilter === "log") &&
                      (
                        "daily log".includes(
                          searchQuery.toLowerCase()
                        ) ||
                        "log".includes(
                          searchQuery.toLowerCase()
                        ) ||
                        "logs".includes(
                          searchQuery.toLowerCase()
                        ) ||
                        "attendance".includes(
                          searchQuery.toLowerCase()
                        )
                      ) && (

                        <button
                          type="button"
                          onClick={() => {
                            setSearchQuery("");
                            setSearchFilter("all");

                            navigate(
                              "/daily-log"
                            );
                          }}
                          className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left hover:bg-slate-50"
                        >

                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-500">

                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              width="17"
                              height="17"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="1.8"
                            >
                              <path d="M12 20h9" />
                              <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
                            </svg>

                          </div>

                          <div className="min-w-0 flex-1">

                            <p className="text-xs font-semibold text-slate-800">
                              Daily Log
                            </p>

                            <p className="mt-0.5 text-[10px] text-slate-400">
                              View and manage your OJT logs
                            </p>

                          </div>

                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            width="14"
                            height="14"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            className="text-slate-300"
                          >
                            <path d="m9 18 6-6-6-6" />
                          </svg>

                        </button>
                      )}

                    {/* MY TASKS */}

                    {(searchFilter === "all" ||
                      searchFilter === "task") &&
                      (
                        "my tasks".includes(
                          searchQuery.toLowerCase()
                        ) ||
                        "task".includes(
                          searchQuery.toLowerCase()
                        ) ||
                        "tasks".includes(
                          searchQuery.toLowerCase()
                        ) ||
                        "assignment".includes(
                          searchQuery.toLowerCase()
                        )
                      ) && (

                        <button
                          type="button"
                          onClick={() => {
                            setSearchQuery("");
                            setSearchFilter("all");

                            navigate("/task");
                          }}
                          className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left hover:bg-slate-50"
                        >

                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-50 text-amber-500">

                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              width="17"
                              height="17"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="1.8"
                            >
                              <path d="m9 11 3 3L22 4" />
                              <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
                            </svg>

                          </div>

                          <div className="min-w-0 flex-1">

                            <p className="text-xs font-semibold text-slate-800">
                              My Tasks
                            </p>

                            <p className="mt-0.5 text-[10px] text-slate-400">
                              View and manage your assigned tasks
                            </p>

                          </div>

                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            width="14"
                            height="14"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            className="text-slate-300"
                          >
                            <path d="m9 18 6-6-6-6" />
                          </svg>

                        </button>
                      )}

                    {/* NO RESULTS */}

                    {!(
                      (
                        (searchFilter === "all" ||
                          searchFilter === "log") &&
                        (
                          "daily log".includes(
                            searchQuery.toLowerCase()
                          ) ||
                          "log".includes(
                            searchQuery.toLowerCase()
                          ) ||
                          "logs".includes(
                            searchQuery.toLowerCase()
                          ) ||
                          "attendance".includes(
                            searchQuery.toLowerCase()
                          )
                        )
                      ) ||
                      (
                        (searchFilter === "all" ||
                          searchFilter === "task") &&
                        (
                          "my tasks".includes(
                            searchQuery.toLowerCase()
                          ) ||
                          "task".includes(
                            searchQuery.toLowerCase()
                          ) ||
                          "tasks".includes(
                            searchQuery.toLowerCase()
                          ) ||
                          "assignment".includes(
                            searchQuery.toLowerCase()
                          )
                        )
                      )
                    ) && (
                      <div className="px-4 py-7 text-center">

                        <div className="mx-auto flex h-9 w-9 items-center justify-center rounded-full bg-slate-100">

                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            width="16"
                            height="16"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            className="text-slate-400"
                          >
                            <circle
                              cx="11"
                              cy="11"
                              r="7"
                            />

                            <path d="m21 21-4.3-4.3" />
                          </svg>

                        </div>

                        <p className="mt-2 text-xs font-medium text-slate-600">
                          No results found
                        </p>

                        <p className="mt-1 text-[10px] text-slate-400">
                          Try searching for log or task.
                        </p>

                      </div>
                    )}

                  </div>
                </div>
              )}
            </div>

            {/* ============================================================= */}
            {/* NOTIFICATIONS                                                  */}
            {/* ============================================================= */}

            <div
              className="relative"
              ref={dropdownRef}
            >

              {/* BELL BUTTON */}

              <button
                type="button"
                onClick={() => {
                  setShowNotifications(
                    (prev) => !prev
                  );

                  setSearchQuery("");
                  setSearchFilter("all");
                }}
                className="relative rounded-md p-1.5 text-white hover:bg-white/15"
                aria-label="Notifications"
              >

                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.75"
                >
                  <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
                  <path d="M13.7 21a2 2 0 0 1-3.4 0" />
                </svg>

                {/* UNREAD RED DOT */}

                {unreadCount > 0 && (
                  <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-red-500 ring-2 ring-orange-500" />
                )}

              </button>

              {/* =========================================================== */}
              {/* NOTIFICATION DROPDOWN                                      */}
              {/* =========================================================== */}

              {showNotifications && (

                <div className="absolute right-0 top-10 z-[100] w-80 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl">

                  {/* HEADER */}

                  <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">

                    <div>

                      <p className="text-sm font-semibold text-slate-800">
                        Notifications
                      </p>

                      <p className="text-[11px] text-slate-400">
                        {unreadCount === 0
                          ? "You're all caught up"
                          : `You have ${unreadCount} unread ${
                              unreadCount === 1
                                ? "notification"
                                : "notifications"
                            }`}
                      </p>

                    </div>

                    {/* SEE ALL */}

                    <button
                      type="button"
                      onClick={() => {
                        setShowNotifications(false);
                        navigate(
                          "/notifications"
                        );
                      }}
                      className="text-xs font-medium text-blue-600 hover:underline"
                    >
                      See all
                    </button>

                  </div>

                  {/* ======================================================= */}
                  {/* NOTIFICATION LIST                                      */}
                  {/* ======================================================= */}

                  {notifications.length === 0 ? (

                    <div className="px-4 py-7 text-center">

                      <div className="mx-auto flex h-9 w-9 items-center justify-center rounded-full bg-slate-100">

                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          width="16"
                          height="16"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.75"
                          className="text-slate-400"
                        >
                          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
                          <path d="M13.7 21a2 2 0 0 1-3.4 0" />
                        </svg>

                      </div>

                      <p className="mt-2 text-xs text-slate-400">
                        No notifications yet.
                      </p>

                    </div>

                  ) : (

                    <div className="max-h-80 overflow-y-auto">

                      {notifications
                        .slice(0, 3)
                        .map(
                          (
                            notification
                          ) => (

                            <button
                              key={
                                notification.id
                              }
                              type="button"
                              onClick={() => {
                                setShowNotifications(
                                  false
                                );

                                navigate(
                                  "/notifications"
                                );
                              }}
                              className={`flex w-full items-start gap-3 border-b border-slate-100 px-4 py-3 text-left hover:bg-slate-50 ${
                                !notification.is_read
                                  ? "bg-blue-50/30"
                                  : ""
                              }`}
                            >

                              {/* ICON */}

                              <span
                                className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                                  notification.type ===
                                  "attendance"
                                    ? "bg-amber-50 text-amber-500"
                                    : notification.type ===
                                      "task"
                                    ? "bg-blue-50 text-blue-500"
                                    : notification.type ===
                                      "document"
                                    ? "bg-emerald-50 text-emerald-500"
                                    : notification.type ===
                                      "evaluation"
                                    ? "bg-red-50 text-red-500"
                                    : "bg-slate-100 text-slate-500"
                                }`}
                              >

                                <NotificationIcon
                                  type={
                                    notification.type
                                  }
                                />

                              </span>

                              {/* CONTENT */}

                              <div className="min-w-0 flex-1">

                                <p className="text-xs font-medium text-slate-800">

                                  {
                                    notification.title
                                  }

                                </p>

                                <p className="mt-0.5 line-clamp-2 text-[11px] text-slate-400">

                                  {
                                    notification.message
                                  }

                                </p>

                                <p className="mt-0.5 text-[10px] text-slate-400">

                                  {new Date(
                                    notification.created_at
                                  ).toLocaleString()}

                                </p>

                              </div>

                              {/* UNREAD DOT */}

                              {!notification.is_read && (
                                <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-blue-500" />
                              )}

                            </button>
                          )
                        )}

                    </div>
                  )}

                  {/* BOTTOM VIEW ALL */}

                  {notifications.length > 3 && (

                    <button
                      type="button"
                      onClick={() => {
                        setShowNotifications(
                          false
                        );

                        navigate(
                          "/notifications"
                        );
                      }}
                      className="w-full border-t border-slate-100 px-4 py-2.5 text-center text-xs font-medium text-blue-600 hover:bg-slate-50"
                    >
                      View all notifications
                    </button>

                  )}

                </div>
              )}

            </div>

            {/* ============================================================= */}
            {/* USER                                                           */}
            {/* ============================================================= */}

            <div className="flex items-center gap-2 rounded-md bg-white/10 px-2 py-1">

              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-900 text-xs font-semibold text-white">
                {studentInitials}
              </div>

              <div className="text-right leading-tight">

                <p className="text-xs font-semibold text-white">
                  {studentName}
                </p>

                <p className="text-[10px] text-white/80">
                  OJT Student
                </p>

              </div>

            </div>

          </div>
        </header>

        {/* ================================================================= */}
        {/* CONTENT                                                           */}
        {/* ================================================================= */}

        <main className="flex-1 space-y-3 p-4">

          {/* PAGE HEADER */}

          <div>

            <h1 className="text-xl font-semibold text-slate-900">
              Documents & Attachments
            </h1>

            <p className="text-sm text-slate-400">
              Upload and manage your OJT requirements and submissions
            </p>

          </div>

          {/* UPLOAD AREA */}

          <div className="max-w-md">
            <label
              htmlFor="document-type"
              className="mb-1.5 block text-xs font-medium text-slate-600"
            >
              Document type
            </label>
            <select
              id="document-type"
              value={docType}
              onChange={(event) => setDocType(event.target.value)}
              disabled={uploading}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
            >
              {requiredDocumentTypes.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </div>

          {documentError && (
            <p role="alert" className="text-sm text-red-600">
              {documentError}
            </p>
          )}
          {uploadMessage && (
            <p role="status" className="text-sm text-emerald-700">
              {uploadMessage}
            </p>
          )}

          <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 bg-white py-6 text-center hover:border-slate-400 hover:bg-slate-50">

            <input
              type="file"
              className="hidden"
              accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
              disabled={uploading}
              onChange={handleDocumentUpload}
            />

            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-500">

              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M12 16V4M6 10l6-6 6 6" />
                <path d="M4 20h16" />
              </svg>

            </span>

            <p className="text-sm font-medium text-slate-700">
              {uploading ? "Uploading document..." : "Click to upload"}
            </p>

            <p className="text-xs text-slate-400">
              PDF, DOCX, JPG, PNG — max 10 MB
            </p>

          </label>

          {/* TWO COLUMN LAYOUT */}

          <div className="grid grid-cols-3 gap-3">

            {/* UPLOADED DOCUMENTS */}

            <div className="col-span-2">

              <p className="mb-2 text-sm font-semibold text-slate-800">
                Uploaded Documents
              </p>

              <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
                {documentsLoading ? (
                  <p className="px-4 py-6 text-sm text-slate-500">
                    Loading documents...
                  </p>
                ) : documents.length === 0 ? (
                  <p className="px-4 py-6 text-sm text-slate-500">
                    No documents uploaded yet.
                  </p>
                ) : (
                  documents.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between gap-3 px-4 py-3"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-slate-800">
                          {item.original_filename}
                        </p>
                        <p className="text-xs text-slate-500">
                          {item.doc_type} · {formatFileSize(Number(item.size_bytes))} ·{" "}
                          {new Date(item.uploaded_at).toLocaleDateString()}
                        </p>
                        {item.review_notes && (
                          <p className="mt-1 text-xs text-red-600">
                            Review note: {item.review_notes}
                          </p>
                        )}
                      </div>
                      <div className="flex shrink-0 items-center gap-3">
                        <span
                          className={`text-xs font-medium ${
                            item.status === "Approved"
                              ? "text-emerald-600"
                              : item.status === "Rejected"
                                ? "text-red-600"
                                : "text-amber-600"
                          }`}
                        >
                          {item.status}
                        </span>
                        <button
                          type="button"
                          onClick={() => void handleDownloadDocument(item)}
                          className="rounded p-1 text-slate-500 hover:bg-slate-100"
                          aria-label={`Download ${item.original_filename}`}
                        >
                          <DownloadIcon />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* RIGHT COLUMN */}

            <div className="space-y-3">

              {/* STILL REQUIRED */}

              <div className="rounded-xl border border-slate-200 bg-white p-4">

                <p className="mb-2 text-sm font-semibold text-slate-800">
                  Still Required
                </p>

                <ul className="space-y-3">
                  {missingTypes.length === 0 ? (
                    <li className="text-sm text-emerald-600">
                      All required document types have been submitted.
                    </li>
                  ) : (
                    missingTypes.map((type) => (
                      <RequiredItem key={type} text={type} />
                    ))
                  )}
                </ul>

                <p className="mt-2.5 border-t border-slate-100 pt-3 text-xs text-slate-400">
                  {missingTypes.length} of {requiredDocumentTypes.length} required
                  document types still missing.
                </p>

              </div>

              {/* DOCUMENT SUMMARY */}

              <div className="rounded-xl border border-slate-200 bg-white p-4">

                <p className="mb-2 text-sm font-semibold text-slate-800">
                  Document Summary
                </p>

                <ul className="space-y-2 text-sm">

                  <SummaryItem
                    label="Total uploaded"
                    value={String(documents.length)}
                  />

                  <SummaryItem
                    label="Approved"
                    value={String(approvedCount)}
                    valueClass="text-emerald-500"
                  />

                  <SummaryItem
                    label="Pending review"
                    value={String(pendingCount)}
                    valueClass="text-amber-500"
                  />

                  <SummaryItem
                    label="Missing"
                    value={String(missingTypes.length)}
                    valueClass="text-red-500"
                  />

                </ul>

              </div>

            </div>

          </div>

        </main>
      </div>

      {showLogoutConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 px-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-50">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                className="text-red-500"
              >
                <path d="M10.3 3.9 2.7 17a1.8 1.8 0 0 0 1.5 2.7h15.6a1.8 1.8 0 0 0 1.5-2.7L13.7 3.9a2 2 0 0 0-3.4 0Z" />
                <path d="M12 9v4" />
                <path d="M12 16.5h.01" />
              </svg>
            </div>
            <div className="mt-4 text-center">
              <h2 className="text-lg font-semibold text-slate-900">
                Sign out?
              </h2>
              <p className="mt-1.5 text-sm leading-relaxed text-slate-500">
                Are you sure you want to sign out of your INTERNet account?
              </p>
            </div>
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

/* ========================================================================== */
/* NOTIFICATION ICON                                                          */
/* ========================================================================== */

function NotificationIcon({
  type,
}: {
  type:
    | "attendance"
    | "task"
    | "document"
    | "evaluation"
    | "comment";
}) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >

      {type === "attendance" && (
        <>
          <circle
            cx="12"
            cy="12"
            r="9"
          />

          <path d="M12 7v5l3 2" />
        </>
      )}

      {type === "task" && (
        <>
          <path d="m9 11 3 3L22 4" />

          <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
        </>
      )}

      {type === "document" && (
        <>
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />

          <path d="M14 2v6h6" />
        </>
      )}

      {type === "evaluation" && (
        <path d="m12 2 3.1 6.3 6.9 1-5 4.9L18.2 21 12 17.8 5.8 21 7 14.2l-5-4.9 6.9-1Z" />
      )}

      {type === "comment" && (
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      )}

    </svg>
  );
}

/* ========================================================================== */
/* DOWNLOAD ICON                                                              */
/* ========================================================================== */

function DownloadIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      className="text-slate-400"
    >
      <path d="M12 16V4M12 16l-4-4M12 16l4-4" />
      <path d="M4 20h16" />
    </svg>
  );
}

/* ========================================================================== */
/* REQUIRED ITEM                                                              */
/* ========================================================================== */

function RequiredItem({
  text,
}: {
  text: string;
}) {
  return (
    <li className="flex items-start gap-2.5">

      <span className="mt-0.5 h-4 w-4 shrink-0 rounded border-2 border-red-300" />

      <div>

        <p className="text-sm text-slate-700">
          {text}
        </p>

        <p className="text-xs text-red-400">
          Missing
        </p>

      </div>

    </li>
  );
}

/* ========================================================================== */
/* SUMMARY ITEM                                                               */
/* ========================================================================== */

function SummaryItem({
  label,
  value,
  valueClass = "text-slate-800",
}: {
  label: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <li className="flex items-center justify-between">

      <span className="text-slate-500">
        {label}
      </span>

      <span
        className={`font-medium ${valueClass}`}
      >
        {value}
      </span>

    </li>
  );
}