import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  API_URL,
  downloadProtectedUpload,
  withStudentAuth,
} from "../../lib/api";

type TaskStatus = "Pending" | "In Progress" | "Submitted" | "Reviewed";
type Priority = "High" | "Medium" | "Low";

interface Task {
  id: number;
  student_id: number;
  title: string;
  description: string;
  assigned_by: string;
  assigned_by_id?: string;
  priority: Priority;
  status: TaskStatus;
  due_date: string;
  created_at: string;
  submission_notes?: string | null;
  submission_file?: string | null;
  submitted_at?: string | null;
  review_notes?: string | null;
  review_rating?: number | null;
  reviewed_at?: string | null;
}

interface Student {
  id?: number;
  student_id?: string;
  email?: string;
  name?: string;
  program?: string;
  company?: string;
}

const statusColor: Record<TaskStatus, string> = {
  Pending: "text-slate-400",
  "In Progress": "text-blue-500",
  Submitted: "text-emerald-500",
  Reviewed: "text-blue-500",
};

const priorityColor: Record<Priority, string> = {
  High: "text-red-500",
  Medium: "text-amber-500",
  Low: "text-emerald-500",
};

export default function MyTasks() {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const navigate = useNavigate();

  const [tasks, setTasks] = useState<Task[]>([]);
  const [activeFilter, setActiveFilter] = useState<"All" | TaskStatus>(
    "All"
  );

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [attachmentError, setAttachmentError] = useState("");

  const [student, setStudent] = useState<Student | null>(null);

  // Logout confirmation
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  // Notification dropdown
  const [showNotifications, setShowNotifications] = useState(false);

  // Reference for notification dropdown
  const notificationRef = useRef<HTMLDivElement | null>(null);

  const [searchQuery, setSearchQuery] = useState("");
  
  const [searchFilter, setSearchFilter] =
  useState<"all" | "log" | "task">("all");

  const searchRef =
  useRef<HTMLDivElement | null>(null);

  const downloadSubmission = async (filePath: string) => {
    setAttachmentError("");
    try {
      await downloadProtectedUpload(filePath, "student");
    } catch (downloadError) {
      setAttachmentError(
        downloadError instanceof Error
          ? downloadError.message
          : "Unable to download the attachment."
      );
    }
  };

  // Submit-task modal
  const [submitTask, setSubmitTask] = useState<Task | null>(null);
  const [submitNotes, setSubmitNotes] = useState("");
  const [submitFile, setSubmitFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");


  /*
  |--------------------------------------------------------------------------
  | LOAD LOGGED-IN STUDENT
  |--------------------------------------------------------------------------
  */

  useEffect(() => {
    const savedStudent = localStorage.getItem("student");

    if (!savedStudent) {
      navigate("/");
      return;
    }

    try {
      const loggedInStudent: Student = JSON.parse(savedStudent);

      setStudent(loggedInStudent);
    } catch (err) {
      console.error("Error reading student data:", err);

      localStorage.removeItem("student");
      localStorage.removeItem("student_id");
      localStorage.removeItem("student_token");

      navigate("/");
    }
  }, [navigate]);

  /*
  |--------------------------------------------------------------------------
  | FETCH TASKS
  |--------------------------------------------------------------------------
  */

  const fetchTasks = async () => {
    try {
      setLoading(true);
      setError("");

      const studentId = localStorage.getItem("student_id");

      if (!studentId) {
        setError("Student ID not found. Please log in again.");
        setLoading(false);
        return;
      }

      const response = await fetch(
        `${API_URL}/api/tasks/student/${studentId}`,
        withStudentAuth()
      );

      if (!response.ok) {
        throw new Error("Failed to fetch tasks.");
      }

      const data: Task[] = await response.json();

      setTasks(data);
    } catch (err) {
      console.error("Error loading tasks:", err);
      setError("Unable to load tasks.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTasks();
  }, []);

  /*
  |--------------------------------------------------------------------------
  | SUBMIT COMPLETED TASK
  |--------------------------------------------------------------------------
  */

  const openSubmitModal = (task: Task) => {
    setSubmitTask(task);
    setSubmitNotes("");
    setSubmitFile(null);
    setSubmitError("");
  };

  const handleSubmitTask = async () => {
    if (!submitTask) return;

    setSubmitError("");

    if (!submitNotes.trim() && !submitFile) {
      setSubmitError(
        "Add a note or attach a file describing your completed work."
      );
      return;
    }

    try {
      setSubmitting(true);

      const formData = new FormData();
      formData.append("submission_notes", submitNotes.trim());
      if (submitFile) {
        formData.append("attachment", submitFile);
      }

      const response = await fetch(
        `${API_URL}/api/tasks/${submitTask.id}/submit`,
        withStudentAuth({
          method: "POST",
          body: formData,
        })
      );

      const data = await response.json();

      if (!response.ok) {
        setSubmitError(data.message || "Failed to submit task.");
        return;
      }

      setSubmitTask(null);
      fetchTasks();
    } catch (err) {
      console.error("SUBMIT TASK ERROR:", err);
      setSubmitError("Unable to connect to the server.");
    } finally {
      setSubmitting(false);
    }
  };

  /*
  |--------------------------------------------------------------------------
  | CLOSE NOTIFICATION DROPDOWN WHEN CLICKING OUTSIDE
  |--------------------------------------------------------------------------
  */

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        notificationRef.current &&
        !notificationRef.current.contains(event.target as Node)
      ) {
        setShowNotifications(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  /*
  |--------------------------------------------------------------------------
  | FILTER TASKS
  |--------------------------------------------------------------------------
  */

  const filteredTasks =
    activeFilter === "All"
      ? tasks
      : tasks.filter((task) => task.status === activeFilter);

  /*
  |--------------------------------------------------------------------------
  | STATISTICS
  |--------------------------------------------------------------------------
  */

  const total = tasks.length;

  const pending = tasks.filter(
    (task) => task.status === "Pending"
  ).length;

  const submitted = tasks.filter(
    (task) => task.status === "Submitted"
  ).length;

  const reviewed = tasks.filter(
    (task) => task.status === "Reviewed"
  ).length;

  /*
  |--------------------------------------------------------------------------
  | STUDENT INITIALS
  |--------------------------------------------------------------------------
  */

  const getInitials = (name: string) => {
    if (!name) return "ST";

    const parts = name.trim().split(/\s+/);

    if (parts.length === 1) {
      return parts[0].substring(0, 2).toUpperCase();
    }

    return (
      parts[0][0] +
      parts[parts.length - 1][0]
    ).toUpperCase();
  };

  /*
  |--------------------------------------------------------------------------
  | SIGN OUT
  |--------------------------------------------------------------------------
  */

  const handleLogout = () => {
    localStorage.removeItem("student");
    localStorage.removeItem("student_id");
    localStorage.removeItem("student_token");

    navigate("/");
  };

  return (
    <div className="flex h-screen bg-slate-50">

      {/* =========================================================
          SIDEBAR
      ========================================================= */}

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

        {/* Logo */}

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

        {/* Navigation */}

        <nav className="flex-1 space-y-1 px-3 pt-2">

          {/* Dashboard */}

          <button
            type="button"
            onClick={() => navigate("/student/dashboard")}
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
              <path d="M3 9.5 12 3l9 6.5V21a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1Z" />
            </svg>

            Dashboard
          </button>

          {/* Daily Log */}

          <button
            type="button"
            onClick={() => navigate("/daily-log")}
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

            Daily Log
          </button>

          {/* My Tasks - ACTIVE */}

          <button
            type="button"
            onClick={() => navigate("/task")}
            className="flex w-full items-center gap-3 rounded-lg border-l-2 border-amber-500 bg-white/5 px-3 py-2 text-sm font-medium text-amber-500"
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

          <button
            type="button"
            onClick={() => navigate("/documents")}
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
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
              <path d="M14 2v6h6" />
            </svg>

            Documents
          </button>

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

        {/* BOTTOM SIDEBAR */}

        <div className="space-y-1 border-t border-white/10 px-3 py-2">

          {/* PROFILE */}

          <button
            type="button"
            onClick={() => navigate("/profile")}
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
              <circle cx="12" cy="8" r="4" />
              <path d="M4 21c1.5-4 5-6 8-6s6.5 2 8 6" />
            </svg>

            Profile
          </button>

          {/* SIGN OUT */}

          <button
            type="button"
            onClick={() => setShowLogoutConfirm(true)}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-red-400 hover:bg-white/5"
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

      {/* =========================================================
          MAIN CONTENT
      ========================================================= */}

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
            Pangasinan State University · Lingayen Campus
          </p>

          <div className="flex items-center gap-3">

           {/* SEARCH */}
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
        setSearchQuery(e.target.value);
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
                navigate("/daily-log");
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

            {/* =====================================================
                NOTIFICATION BELL + DROPDOWN
            ===================================================== */}

            <div
              ref={notificationRef}
              className="relative"
            >

              {/* Bell Button */}

              <button
                type="button"
                onClick={() =>
                  setShowNotifications((prev) => !prev)
                }
                className="relative rounded-md p-1.5 text-white hover:bg-white/15"
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

                {/* Red notification dot */}

                <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-red-500 ring-2 ring-orange-500" />
              </button>

              {/* Notification Dropdown */}

              {showNotifications && (
                <div className="absolute right-0 top-11 z-50 w-80 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">

                  {/* Dropdown Header */}

                  <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">

                    <div>
                      <h3 className="text-sm font-semibold text-slate-900">
                        Notifications
                      </h3>

                      <p className="text-[11px] text-slate-400">
                        Your latest updates
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => setShowNotifications(false)}
                      className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
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
                        <path d="M18 6 6 18" />
                        <path d="m6 6 12 12" />
                      </svg>
                    </button>

                  </div>

                  {/* Notification Items */}

                  <div className="max-h-80 overflow-y-auto">

                    {/* Notification 1 */}

                    <button
                      type="button"
                      className="flex w-full gap-3 border-b border-slate-100 px-4 py-3 text-left hover:bg-slate-50"
                    >

                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-50 text-amber-500">

                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          width="17"
                          height="17"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.8"
                        >
                          <path d="M12 6v6l4 2" />
                          <circle cx="12" cy="12" r="9" />
                        </svg>

                      </div>

                      <div className="min-w-0 flex-1">

                        <p className="text-xs font-semibold text-slate-800">
                          New task assigned
                        </p>

                        <p className="mt-0.5 text-xs leading-relaxed text-slate-500">
                          Your supervisor assigned you a new task.
                        </p>

                        <p className="mt-1 text-[10px] text-slate-400">
                          Just now
                        </p>

                      </div>

                      <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-amber-500" />

                    </button>

                    {/* Notification 2 */}

                    <button
                      type="button"
                      className="flex w-full gap-3 border-b border-slate-100 px-4 py-3 text-left hover:bg-slate-50"
                    >

                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-50 text-blue-500">

                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          width="17"
                          height="17"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.8"
                        >
                          <path d="M4 4h16v16H4z" />
                          <path d="m4 7 8 5 8-5" />
                        </svg>

                      </div>

                      <div className="min-w-0 flex-1">

                        <p className="text-xs font-semibold text-slate-800">
                          Supervisor update
                        </p>

                        <p className="mt-0.5 text-xs leading-relaxed text-slate-500">
                          You received an update from your supervisor.
                        </p>

                        <p className="mt-1 text-[10px] text-slate-400">
                          1 hour ago
                        </p>

                      </div>

                      <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-blue-500" />

                    </button>

                    {/* Notification 3 */}

                    <button
                      type="button"
                      className="flex w-full gap-3 px-4 py-3 text-left hover:bg-slate-50"
                    >

                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-500">

                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          width="17"
                          height="17"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.8"
                        >
                          <path d="m5 12 4 4L19 6" />
                        </svg>

                      </div>

                      <div className="min-w-0 flex-1">

                        <p className="text-xs font-semibold text-slate-800">
                          Task reviewed
                        </p>

                        <p className="mt-0.5 text-xs leading-relaxed text-slate-500">
                          Your submitted task has been reviewed.
                        </p>

                        <p className="mt-1 text-[10px] text-slate-400">
                          Yesterday
                        </p>

                      </div>

                    </button>

                  </div>

                  {/* View All */}

                  <div className="border-t border-slate-100 p-2">

                    <button
                      type="button"
                      onClick={() => navigate("/notifications")}
                      className="w-full rounded-lg py-2 text-xs font-medium text-amber-600 hover:bg-amber-50"
                    >
                      View all notifications
                    </button>

                  </div>

                </div>
              )}

            </div>

            {/* STUDENT */}

            <div className="flex items-center gap-2 rounded-md bg-white/10 px-2 py-1">

              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-900 text-xs font-semibold text-white">
                {getInitials(student?.name || "")}
              </div>

              <div className="text-right leading-tight">

                <p className="text-xs font-semibold text-white">
                  {student?.name || "Student"}
                </p>

                <p className="text-[10px] text-white/80">
                  OJT Student
                </p>

              </div>

            </div>

          </div>

        </header>

        {/* CONTENT */}

        <main className="flex-1 space-y-3 p-4">

          {/* Page Header */}

          <div>

            <h1 className="text-xl font-semibold text-slate-900">
              My Tasks
            </h1>

            <p className="text-sm text-slate-400">
              Tasks assigned by your company supervisor
            </p>

            {student?.student_id && (
              <p className="mt-1 text-xs text-slate-400">
                Student ID: {student.student_id}
              </p>
            )}

          </div>

          {/* =====================================================
              STAT CARDS
          ===================================================== */}

          <div className="grid grid-cols-4 gap-3">

            <div className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-center">

              <p className="text-2xl font-semibold text-slate-900">
                {total}
              </p>

              <p className="mt-0.5 text-xs text-slate-400">
                Total
              </p>

            </div>

            <div className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-center">

              <p className="text-2xl font-semibold text-amber-500">
                {pending}
              </p>

              <p className="mt-0.5 text-xs text-slate-400">
                Pending
              </p>

            </div>

            <div className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-center">

              <p className="text-2xl font-semibold text-emerald-500">
                {submitted}
              </p>

              <p className="mt-0.5 text-xs text-slate-400">
                Submitted
              </p>

            </div>

            <div className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-center">

              <p className="text-2xl font-semibold text-blue-500">
                {reviewed}
              </p>

              <p className="mt-0.5 text-xs text-slate-400">
                Reviewed
              </p>

            </div>

          </div>

          {/* =====================================================
              FILTER TABS
          ===================================================== */}

          <div className="flex items-center gap-2">

            {(
              [
                "All",
                "Pending",
                "In Progress",
                "Submitted",
                "Reviewed",
              ] as const
            ).map((filter) => (

              <button
                key={filter}
                type="button"
                onClick={() => setActiveFilter(filter)}
                className={
                  activeFilter === filter
                    ? "rounded-lg bg-[#0c1322] px-4 py-1.5 text-sm font-medium text-white"
                    : "rounded-lg border border-slate-200 bg-white px-4 py-1.5 text-sm text-slate-500 hover:bg-slate-50"
                }
              >
                {filter}
              </button>

            ))}

          </div>

          {/* =====================================================
              TASK LIST
          ===================================================== */}

          <div className="space-y-2.5">

            {loading && (
              <div className="rounded-xl border border-slate-200 bg-white p-8 text-center">

                <p className="text-sm text-slate-400">
                  Loading tasks...
                </p>

              </div>
            )}

            {!loading && error && (
              <div className="rounded-xl border border-red-200 bg-white p-8 text-center">

                <p className="text-sm text-red-400">
                  {error}
                </p>

              </div>
            )}

            {attachmentError && (
              <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {attachmentError}
              </div>
            )}

            {!loading &&
              !error &&
              filteredTasks.length === 0 && (

                <div className="rounded-xl border border-slate-200 bg-white p-8 text-center">

                  <p className="text-sm text-slate-400">
                    No tasks found.
                  </p>

                </div>

              )}

            {!loading &&
              !error &&
              filteredTasks.map((task) => (

                <div
                  key={task.id}
                  className="rounded-xl border border-slate-200 bg-white p-3"
                >

                  <div className="flex items-start justify-between">

                    <p className="text-sm font-semibold text-slate-800">
                      {task.title}
                    </p>

                    <span
                      className={`text-xs font-medium ${
                        statusColor[task.status]
                      }`}
                    >
                      {task.status}
                    </span>

                  </div>

                  <p className="mt-1 text-xs text-slate-500">
                    {task.description}
                  </p>

                  <div className="mt-2 flex items-center justify-between text-xs">

                    <span className="text-slate-400">

                      Assigned by{" "}

                      <span className="text-blue-600">
                        {task.assigned_by}
                      </span>

                    </span>

                    <div className="flex items-center gap-3">

                      <span
                        className={`font-medium ${
                          priorityColor[task.priority]
                        }`}
                      >
                        {task.priority}
                      </span>

                      <span className="flex items-center gap-1 text-slate-400">

                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          width="12"
                          height="12"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
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

                        Due {task.due_date}

                      </span>

                    </div>

                  </div>

                  {(task.status === "Pending" ||
                    task.status === "In Progress") && (
                    <button
                      type="button"
                      onClick={() => openSubmitModal(task)}
                      className="mt-3 rounded-lg bg-[#0c1322] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#16233f]"
                    >
                      Submit completed work
                    </button>
                  )}

                  {task.status === "Submitted" && (
                    <div className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
                      <p className="font-medium">
                        Submitted — waiting for your supervisor to review.
                      </p>
                      {task.submission_notes && (
                        <p className="mt-1 text-emerald-600">
                          Your note: {task.submission_notes}
                        </p>
                      )}
                      {task.submission_file && (
                        <button
                          type="button"
                          onClick={() => void downloadSubmission(task.submission_file!)}
                          className="mt-1 inline-block font-medium text-blue-600 hover:underline"
                        >
                          Download your attachment
                        </button>
                      )}
                    </div>
                  )}

                  {task.status === "Reviewed" && (
                    <div className="mt-3 rounded-lg bg-blue-50 px-3 py-2 text-xs text-blue-700">
                      <p className="font-medium">
                        Reviewed by your supervisor.
                      </p>
                      {task.review_notes && (
                        <p className="mt-1 text-blue-600">
                          Feedback: {task.review_notes}
                        </p>
                      )}
                    </div>
                  )}

                </div>

              ))}

          </div>

        </main>

      </div>

      {/* =========================================================
          LOGOUT MODAL
      ========================================================= */}

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

      {/* =========================================================
          SUBMIT TASK MODAL
      ========================================================= */}

      {submitTask && (

        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 px-4 backdrop-blur-sm">

          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl">

            <h2 className="text-lg font-semibold text-slate-900">
              Submit "{submitTask.title}"
            </h2>

            <p className="mt-1 text-sm text-slate-500">
              Describe what you completed, and attach a file if needed.
            </p>

            {submitError && (
              <div className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">
                {submitError}
              </div>
            )}

            <div className="mt-4 space-y-3">

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">
                  Notes
                </label>

                <textarea
                  value={submitNotes}
                  onChange={(e) => setSubmitNotes(e.target.value)}
                  rows={3}
                  placeholder="What did you complete?"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:border-slate-400 focus:outline-none"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">
                  Attachment (optional)
                </label>

                <input
                  type="file"
                  onChange={(e) =>
                    setSubmitFile(e.target.files?.[0] || null)
                  }
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-600"
                />
              </div>

            </div>

            <div className="mt-6 flex gap-2.5">

              <button
                type="button"
                onClick={() => setSubmitTask(null)}
                className="flex-1 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={handleSubmitTask}
                disabled={submitting}
                className="flex-1 rounded-lg bg-[#0c1322] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#16233f] disabled:opacity-60"
              >
                {submitting ? "Submitting..." : "Submit"}
              </button>

            </div>

          </div>

        </div>

      )}

    </div>
  );
}