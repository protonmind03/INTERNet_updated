import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { API_URL, withStudentAuth } from "../../lib/api";

type Tab = "student" | "supervisor";

type Student = {
  id: number;
  student_id: string;
  email: string;
  name: string;
  program: string;
  company: string;
};

type Complaint = {
  id: number;
  report_type: Tab;
  reported_student_name: string | null;
  supervisor_name: string | null;
  company_name: string | null;
  category: string;
  description: string;
  status: string;
  resolution_notes: string | null;
  resolved_at: string | null;
  created_at: string;
};

export default function ReportComplaint() {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const navigate = useNavigate();
  
  const [activeTab, setActiveTab] =
    useState<Tab>("student");

  const [student, setStudent] =
    useState<Student | null>(null);

  const [showLogoutConfirm, setShowLogoutConfirm] =
    useState(false);

  const [reportedStudentName, setReportedStudentName] =
    useState("");

  const [reportedProgramSection, setReportedProgramSection] =
    useState("");

  const [supervisorName, setSupervisorName] =
    useState("");

  const [companyName, setCompanyName] =
    useState("");

  const [category, setCategory] =
    useState("Attendance / Tardiness");

  const [description, setDescription] =
    useState("");

  const [evidence, setEvidence] =
    useState<File | null>(null);

  const [submitting, setSubmitting] =
    useState(false);

  const [message, setMessage] =
    useState("");

  const [error, setError] =
    useState("");

  const [pastReports, setPastReports] =
    useState<Complaint[]>([]);

  const [reportsLoading, setReportsLoading] =
    useState(true);

  const [reportsError, setReportsError] =
    useState("");

  const [reportsRefresh, setReportsRefresh] =
    useState(0);
  
  const [searchQuery, setSearchQuery] = useState("");
  
  const [searchFilter, setSearchFilter] =
  useState<"all" | "log" | "task">("all");

  const searchRef =
  useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const studentId = student?.student_id;
    if (!studentId) return;

    const controller = new AbortController();
    const loadPastReports = async () => {
      setReportsLoading(true);
      setReportsError("");

      try {
        const response = await fetch(
          `${API_URL}/api/complaints/student/${encodeURIComponent(studentId)}`,
          withStudentAuth({ signal: controller.signal })
        );
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.message || "Failed to load your reports.");
        }

        setPastReports(
          Array.isArray(data.complaints) ? data.complaints : []
        );
      } catch (loadError) {
        if (controller.signal.aborted) return;
        console.error("LOAD STUDENT COMPLAINTS ERROR:", loadError);
        setReportsError(
          loadError instanceof Error
            ? loadError.message
            : "Unable to load your reports."
        );
      } finally {
        if (!controller.signal.aborted) {
          setReportsLoading(false);
        }
      }
    };

    void loadPastReports();
    return () => controller.abort();
  }, [student?.student_id, reportsRefresh]);

  /*
  |--------------------------------------------------------------------------
  | LOAD SIGNED-IN STUDENT
  |--------------------------------------------------------------------------
  */

  useEffect(() => {
    const savedStudent =
      localStorage.getItem("student");

    if (!savedStudent) {
      navigate("/");
      return;
    }

    try {
      const loggedInStudent: Student =
        JSON.parse(savedStudent);

      setStudent(loggedInStudent);
    } catch (error) {
      console.error(
        "Error reading student data:",
        error
      );

      localStorage.removeItem("student");
      localStorage.removeItem("student_id");
      localStorage.removeItem("student_token");

      navigate("/");
    }
  }, [navigate]);

  /*
  |--------------------------------------------------------------------------
  | INITIALS
  |--------------------------------------------------------------------------
  */

  const getInitials = (name: string) => {
    if (!name) return "ST";

    const parts = name
      .trim()
      .split(/\s+/);

    if (parts.length === 1) {
      return parts[0]
        .substring(0, 2)
        .toUpperCase();
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

  /*
  |--------------------------------------------------------------------------
  | SUBMIT COMPLAINT
  |--------------------------------------------------------------------------
  */

  const handleSubmit = async () => {
    setMessage("");
    setError("");

    if (!student?.student_id) {
      setError(
        "Unable to identify the signed-in student."
      );
      return;
    }

    /*
    |----------------------------------------------------------------------
    | VALIDATION - REPORT A STUDENT
    |----------------------------------------------------------------------
    */

    if (activeTab === "student") {
      if (!reportedStudentName.trim()) {
        setError(
          "Reported student name is required."
        );
        return;
      }

      if (!reportedProgramSection.trim()) {
        setError(
          "Program / Section is required."
        );
        return;
      }
    }

    /*
    |----------------------------------------------------------------------
    | VALIDATION - REPORT SUPERVISOR / COMPANY
    |----------------------------------------------------------------------
    */

    if (activeTab === "supervisor") {
      if (!supervisorName.trim()) {
        setError(
          "Supervisor name is required."
        );
        return;
      }

      if (!companyName.trim()) {
        setError(
          "Company / Host Institution is required."
        );
        return;
      }
    }

    /*
    |----------------------------------------------------------------------
    | VALIDATION - DESCRIPTION
    |----------------------------------------------------------------------
    */

    if (!description.trim()) {
      setError(
        "Complaint description is required."
      );
      return;
    }

    try {
      setSubmitting(true);

      const formData = new FormData();

      /*
      |----------------------------------------------------------------------
      | STUDENT WHO IS SUBMITTING
      |
      | This is NOT the reported student's ID.
      | It identifies the currently signed-in student.
      |----------------------------------------------------------------------
      */

      formData.append(
        "student_id",
        student.student_id
      );

      /*
      |----------------------------------------------------------------------
      | REPORT TYPE
      |----------------------------------------------------------------------
      */

      formData.append(
        "report_type",
        activeTab
      );

      /*
      |----------------------------------------------------------------------
      | REPORTED STUDENT
      |
      | Student ID has intentionally been removed.
      |----------------------------------------------------------------------
      */

      if (activeTab === "student") {
        formData.append(
          "reported_student_name",
          reportedStudentName.trim()
        );

        formData.append(
          "reported_program_section",
          reportedProgramSection.trim()
        );
      }

      /*
      |----------------------------------------------------------------------
      | SUPERVISOR / COMPANY
      |----------------------------------------------------------------------
      */

      if (activeTab === "supervisor") {
        formData.append(
          "supervisor_name",
          supervisorName.trim()
        );

        formData.append(
          "company_name",
          companyName.trim()
        );
      }

      /*
      |----------------------------------------------------------------------
      | COMPLAINT
      |----------------------------------------------------------------------
      */

      formData.append(
        "category",
        category
      );

      formData.append(
        "description",
        description.trim()
      );

      /*
      |----------------------------------------------------------------------
      | FILE
      |----------------------------------------------------------------------
      */

      if (evidence) {
        formData.append(
          "evidence",
          evidence
        );
      }

      /*
      |----------------------------------------------------------------------
      | SEND REQUEST
      |----------------------------------------------------------------------
      */

      const response = await fetch(
        `${API_URL}/api/complaints`,
        withStudentAuth({
          method: "POST",
          body: formData,
        })
      );

      /*
      |----------------------------------------------------------------------
      | SAFE RESPONSE HANDLING
      |
      | Prevents:
      | "Unexpected end of JSON input"
      |
      | The backend might return an empty response or non-JSON response.
      |----------------------------------------------------------------------
      */

      const responseText =
        await response.text();

      let data: any = {};

      if (responseText.trim()) {
        try {
          data = JSON.parse(responseText);
        } catch (parseError) {
          console.error(
            "Invalid JSON response from server:",
            responseText,
            parseError
          );

          if (!response.ok) {
            throw new Error(
              `Server returned an invalid response (${response.status}).`
            );
          }

          throw new Error(
            "Server returned an invalid response."
          );
        }
      }

      /*
      |----------------------------------------------------------------------
      | CHECK HTTP STATUS
      |----------------------------------------------------------------------
      */

      if (!response.ok) {
        throw new Error(
          data?.message ||
            data?.error ||
            `Failed to submit complaint. Server returned ${response.status}.`
        );
      }

      /*
      |----------------------------------------------------------------------
      | SUCCESS
      |----------------------------------------------------------------------
      */

      setMessage(
        "Complaint submitted successfully."
      );
      setReportsRefresh((refresh) => refresh + 1);

      /*
      |----------------------------------------------------------------------
      | CLEAR FORM
      |----------------------------------------------------------------------
      */

      setReportedStudentName("");
      setReportedProgramSection("");
      setSupervisorName("");
      setCompanyName("");
      setDescription("");
      setEvidence(null);

    } catch (error) {
      console.error(
        "SUBMIT COMPLAINT ERROR:",
        error
      );

      setError(
        error instanceof Error
          ? error.message
          : "Failed to submit complaint."
      );
    } finally {
      setSubmitting(false);
    }
  };

  /*
  |--------------------------------------------------------------------------
  | RENDER
  |--------------------------------------------------------------------------
  */

  return (
    <div className="flex h-screen bg-slate-50">

      {/* ================================================================ */}
      {/* SIDEBAR                                                         */}
      {/* ================================================================ */}

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

          {/* DASHBOARD */}

          <button
            type="button"
            onClick={() =>
              navigate("/student/dashboard")
            }
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

          {/* DAILY LOG */}

          <button
            type="button"
            onClick={() =>
              navigate("/daily-log")
            }
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

          {/* MY TASKS */}

          <button
            type="button"
            onClick={() =>
              navigate("/task")
            }
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

          {/* OJT SCHEDULE */}

          <button
            type="button"
            onClick={() =>
              navigate("/schedule")
            }
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

          {/* DOCUMENTS */}

          <button
            type="button"
            onClick={() =>
              navigate("/documents")
            }
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

          {/* REPORT COMPLAINT */}

          <button
            type="button"
            onClick={() =>
              navigate("/report")
            }
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
              <circle
                cx="12"
                cy="8"
                r="4"
              />

              <path d="M4 21c1.5-4 5-6 8-6s6.5 2 8 6" />
            </svg>

            Profile
          </button>

          {/* SIGN OUT */}

          <button
            type="button"
            onClick={() =>
              setShowLogoutConfirm(true)
            }
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

      {/* ================================================================ */}
      {/* MAIN                                                            */}
      {/* ================================================================ */}

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

            {/* NOTIFICATION */}

            <button
              type="button"
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

              <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-red-500 ring-2 ring-orange-500" />
            </button>

            {/* SIGNED-IN USER */}

            <div className="flex items-center gap-2 rounded-md bg-white/10 px-2 py-1">

              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-900 text-xs font-semibold text-white">
                {getInitials(
                  student?.name || ""
                )}
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

        {/* ================================================================ */}
        {/* CONTENT                                                         */}
        {/* ================================================================ */}

        <main className="flex-1 space-y-3 p-4">

          {/* PAGE HEADER */}

          <div>
            <h1 className="text-xl font-semibold text-slate-900">
              Report a Complaint
            </h1>

            <p className="text-sm text-slate-400">
              File a formal complaint about a student,
              supervisor, or partner company
            </p>
          </div>

          {/* TABS */}

          <div className="flex gap-2">

            <button
              type="button"
              onClick={() => {
                setActiveTab("student");
                setError("");
                setMessage("");
                setCategory(
                  "Attendance / Tardiness"
                );
              }}
              className={`rounded-lg px-4 py-2 text-sm font-medium ${
                activeTab === "student"
                  ? "bg-[#0c1322] text-white"
                  : "border border-slate-200 bg-white text-slate-500 hover:bg-slate-50"
              }`}
            >
              Report a Student
            </button>

            <button
              type="button"
              onClick={() => {
                setActiveTab("supervisor");
                setError("");
                setMessage("");
                setCategory(
                  "Unsafe Working Conditions"
                );
              }}
              className={`rounded-lg px-4 py-2 text-sm ${
                activeTab === "supervisor"
                  ? "bg-[#0c1322] font-medium text-white"
                  : "border border-slate-200 bg-white text-slate-500 hover:bg-slate-50"
              }`}
            >
              Report a Supervisor / Company
            </button>

          </div>

          {/* SUCCESS MESSAGE */}

          {message && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-600">
              {message}
            </div>
          )}

          {/* ERROR MESSAGE */}

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
              {error}
            </div>
          )}

          <div className="grid grid-cols-3 gap-3">

            {/* ======================================================== */}
            {/* FORM                                                       */}
            {/* ======================================================== */}

            <div className="col-span-2 rounded-xl border border-slate-200 bg-white p-4">

              {/* STUDENT FORM */}

              {activeTab === "student" && (
                <div className="space-y-2.5">

                  {/* REPORTED STUDENT NAME */}

                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-500">
                      Student Name
                    </label>

                    <input
                      type="text"
                      value={reportedStudentName}
                      onChange={(e) =>
                        setReportedStudentName(
                          e.target.value
                        )
                      }
                      placeholder="Enter the name of the student involved"
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:border-slate-400 focus:outline-none"
                    />
                  </div>

                  {/* PROGRAM / SECTION */}

                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-500">
                      Program / Section
                    </label>

                    <input
                      type="text"
                      value={reportedProgramSection}
                      onChange={(e) =>
                        setReportedProgramSection(
                          e.target.value
                        )
                      }
                      placeholder="e.g. BS Information Technology - 4A"
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:border-slate-400 focus:outline-none"
                    />
                  </div>

                  {/* CATEGORY */}

                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-500">
                      Complaint Category
                    </label>

                    <select
                      value={category}
                      onChange={(e) =>
                        setCategory(e.target.value)
                      }
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:border-slate-400 focus:outline-none"
                    >
                      <option>
                        Attendance / Tardiness
                      </option>

                      <option>
                        Unprofessional Behavior
                      </option>

                      <option>
                        Task Non-completion
                      </option>

                      <option>
                        Harassment
                      </option>

                      <option>
                        Other
                      </option>
                    </select>
                  </div>

                  {/* DESCRIPTION */}

                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-500">
                      Description
                    </label>

                    <textarea
                      rows={5}
                      value={description}
                      onChange={(e) =>
                        setDescription(
                          e.target.value
                        )
                      }
                      placeholder="Describe what happened, including date and time if possible"
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:border-slate-400 focus:outline-none"
                    />
                  </div>

                </div>
              )}

              {/* ====================================================== */}
              {/* SUPERVISOR FORM                                         */}
              {/* ====================================================== */}

              {activeTab === "supervisor" && (
                <div className="space-y-2.5">

                  {/* SUPERVISOR NAME */}

                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-500">
                      Supervisor Name
                    </label>

                    <input
                      type="text"
                      value={supervisorName}
                      onChange={(e) =>
                        setSupervisorName(
                          e.target.value
                        )
                      }
                      placeholder="Enter the name of your supervisor"
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:border-slate-400 focus:outline-none"
                    />
                  </div>

                  {/* COMPANY */}

                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-500">
                      Company / Host Institution
                    </label>

                    <input
                      type="text"
                      value={companyName}
                      onChange={(e) =>
                        setCompanyName(
                          e.target.value
                        )
                      }
                      placeholder="e.g. TechCorp Solutions Inc."
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:border-slate-400 focus:outline-none"
                    />
                  </div>

                  {/* CATEGORY */}

                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-500">
                      Complaint Category
                    </label>

                    <select
                      value={category}
                      onChange={(e) =>
                        setCategory(e.target.value)
                      }
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:border-slate-400 focus:outline-none"
                    >
                      <option>
                        Unsafe Working Conditions
                      </option>

                      <option>
                        Unpaid / Excessive Hours
                      </option>

                      <option>
                        Lack of Supervision
                      </option>

                      <option>
                        Harassment
                      </option>

                      <option>
                        Task Unrelated to Course
                      </option>

                      <option>
                        Other
                      </option>
                    </select>
                  </div>

                  {/* DESCRIPTION */}

                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-500">
                      Description
                    </label>

                    <textarea
                      rows={5}
                      value={description}
                      onChange={(e) =>
                        setDescription(
                          e.target.value
                        )
                      }
                      placeholder="Describe what happened, including date and time if possible"
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:border-slate-400 focus:outline-none"
                    />
                  </div>

                </div>
              )}

              {/* ====================================================== */}
              {/* FILE UPLOAD                                             */}
              {/* ====================================================== */}

              <div className="mt-2">

                <label className="mb-1 block text-xs font-medium text-slate-500">
                  Supporting Evidence (optional)
                </label>

                <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border-2 border-dashed border-slate-300 bg-slate-50 py-4 text-center hover:border-slate-400">

                  <input
                    type="file"
                    accept=".jpg,.jpeg,.png,.pdf,.doc,.docx"
                    className="hidden"
                    onChange={(e) => {
                      setEvidence(
                        e.target.files?.[0] ||
                          null
                      );
                    }}
                  />

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
                    <path d="M12 16V4M6 10l6-6 6 6" />
                    <path d="M4 20h16" />
                  </svg>

                  <span className="text-xs text-slate-500">
                    {evidence
                      ? evidence.name
                      : "Click to upload photos, screenshots, or documents"}
                  </span>

                </label>

              </div>

              {/* ====================================================== */}
              {/* BUTTONS                                                 */}
              {/* ====================================================== */}

              <div className="mt-3 flex justify-end gap-2">

                <button
                  type="button"
                  onClick={() => {
                    setReportedStudentName("");
                    setReportedProgramSection("");
                    setSupervisorName("");
                    setCompanyName("");
                    setDescription("");
                    setEvidence(null);
                    setError("");
                    setMessage("");
                  }}
                  className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>

                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={submitting}
                  className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {submitting
                    ? "Submitting..."
                    : "Submit Complaint"}
                </button>

              </div>

            </div>

            {/* ======================================================== */}
            {/* SIDE INFO                                                  */}
            {/* ======================================================== */}

            <div className="space-y-3">

              <div className="rounded-xl border border-slate-200 bg-white p-4">

                <p className="mb-2 text-sm font-semibold text-slate-800">
                  Before you submit
                </p>

                <ul className="space-y-2 text-xs text-slate-500">

                  <li>
                    • Complaints are reviewed by
                    the OJT Coordinator within
                    3–5 business days.
                  </li>

                  <li>
                    • You'll be notified once a
                    resolution or follow-up is
                    available.
                  </li>

                  <li>
                    • False or malicious reports
                    may result in disciplinary
                    action.
                  </li>

                  <li>
                    • For urgent safety concerns,
                    contact your coordinator
                    directly.
                  </li>

                </ul>

              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-4">

                <p className="mb-2 text-sm font-semibold text-slate-800">
                  Your Past Reports
                </p>

                {reportsLoading ? (
                  <p className="text-xs text-slate-400">
                    Loading your reports...
                  </p>
                ) : reportsError ? (
                  <div role="alert" className="text-xs text-red-600">
                    <p>{reportsError}</p>
                    <button
                      type="button"
                      onClick={() => setReportsRefresh((refresh) => refresh + 1)}
                      className="mt-2 font-medium underline"
                    >
                      Try again
                    </button>
                  </div>
                ) : pastReports.length === 0 ? (
                  <p className="text-xs text-slate-400">
                    You haven't filed any complaints yet.
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {pastReports.map((report) => (
                      <li
                        key={report.id}
                        className="rounded-lg border border-slate-100 p-3"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-xs font-semibold text-slate-800">
                              {report.category}
                            </p>
                            <p className="mt-1 text-[11px] text-slate-400">
                              Filed {new Date(report.created_at).toLocaleString()}
                              {report.report_type === "student" &&
                                report.reported_student_name &&
                                ` · About ${report.reported_student_name}`}
                              {report.report_type === "supervisor" &&
                                report.supervisor_name &&
                                ` · About ${report.supervisor_name}`}
                            </p>
                          </div>
                          <span className="shrink-0 rounded-full bg-slate-100 px-2 py-1 text-[10px] font-medium text-slate-600">
                            {report.status}
                          </span>
                        </div>
                        <p className="mt-2 line-clamp-3 text-xs text-slate-600">
                          {report.description}
                        </p>
                        {report.resolution_notes && (
                          <p className="mt-2 rounded bg-emerald-50 p-2 text-xs text-emerald-700">
                            Coordinator update: {report.resolution_notes}
                          </p>
                        )}
                      </li>
                    ))}
                  </ul>
                )}

              </div>

            </div>

          </div>

        </main>

      </div>

      {/* ================================================================ */}
      {/* LOGOUT CONFIRMATION                                             */}
      {/* ================================================================ */}

      {showLogoutConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 px-4 backdrop-blur-sm">

          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl">

            {/* ICON */}

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

            {/* TEXT */}

            <div className="mt-4 text-center">

              <h2 className="text-lg font-semibold text-slate-900">
                Sign out?
              </h2>

              <p className="mt-1.5 text-sm leading-relaxed text-slate-500">
                Are you sure you want to sign
                out of your INTERNet account?
              </p>

            </div>

            {/* BUTTONS */}

            <div className="mt-6 flex gap-2.5">

              <button
                type="button"
                onClick={() =>
                  setShowLogoutConfirm(false)
                }
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
