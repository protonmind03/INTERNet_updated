import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { API_URL, withStudentAuth } from "../../lib/api";

type Student = {
  id: number;
  student_id: string;
  email: string;
  name: string;
  program: string;
  company: string;
};

type Attendance = {
  id: number;
  student_id: string;
  date: string;
  time_in: string | null;
  break_time: string | null;
  time_out: string | null;
  hours: number | null;
  tasks: string | null;
  status: string;
  image_url: string | null;
};

type Notification = {
  id: number;
  student_id: string;
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
};

type DashboardData = {
  hoursRendered: number;
  requiredHours: number;
  daysLogged: number;
  activeTasks: number;
  completion: number;
  weeklyHours: {
    day: string;
    hours: number;
  }[];
  totalTasks: number;
  completedTasks: number;
};
function Dashboard() {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const navigate = useNavigate();

  const [showNotifications, setShowNotifications] =
    useState(false);
  
  const [dashboardData, setDashboardData] =
  useState<DashboardData | null>(null);

  const [student, setStudent] =
    useState<Student | null>(null);

  const [attendance, setAttendance] =
    useState<Attendance[]>([]);

  const [notifications, setNotifications] =
    useState<Notification[]>([]);

  const [showLogoutConfirm, setShowLogoutConfirm] =
    useState(false);

  const dropdownRef =
    useRef<HTMLDivElement>(null);

  const [currentTime, setCurrentTime] =
    useState(new Date());
  
  const [searchQuery, setSearchQuery] = useState("");
  
  const [searchFilter, setSearchFilter] =
  useState<"all" | "log" | "task">("all");

  const searchRef =
  useRef<HTMLDivElement | null>(null);

  /*
  |--------------------------------------------------------------------------
  | LOAD STUDENT
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
  | FETCH ATTENDANCE
  |--------------------------------------------------------------------------
  */

  useEffect(() => {
    if (!student?.student_id) return;

    const fetchAttendance = async () => {
      try {
        const response = await fetch(
          `${API_URL}/api/attendance/${student.student_id}`,
          withStudentAuth()
        );

        if (!response.ok) {
          throw new Error(
            "Failed to fetch attendance"
          );
        }

        const data = await response.json();

        console.log(
          "ATTENDANCE FROM DATABASE:",
          data.attendance
        );

        setAttendance(data.attendance || []);
      } catch (error) {
        console.error(
          "Error fetching attendance:",
          error
        );
      }
    };

    fetchAttendance();
  }, [student]);

  useEffect(() => {
  if (!student?.student_id) return;

  const fetchDashboard = async () => {
    try {
      const response = await fetch(
        `${API_URL}/api/dashboard/${student.student_id}`,
        withStudentAuth()
      );

      if (!response.ok) {
        throw new Error(
          "Failed to fetch dashboard data"
        );
      }

      const data: DashboardData =
        await response.json();

      console.log(
        "DASHBOARD FROM DATABASE:",
        data
      );

      setDashboardData(data);
    } catch (error) {
      console.error(
        "Error fetching dashboard data:",
        error
      );
    }
  };

  fetchDashboard();
}, [student]);

  /*
  |--------------------------------------------------------------------------
  | FETCH NOTIFICATIONS
  |--------------------------------------------------------------------------
  */

  useEffect(() => {
  if (!student?.student_id) return;

  const fetchNotifications = async () => {
    try {
      const response = await fetch(
        `${API_URL}/api/notifications/student/${student.student_id}`,
        withStudentAuth()
      );

      if (!response.ok) {
        throw new Error("Failed to fetch notifications");
      }

      const data = await response.json();

      console.log(
        "NOTIFICATIONS FROM DATABASE:",
        data.notifications
      );

      setNotifications(data.notifications || []);
    } catch (error) {
      console.error(
        "Error fetching notifications:",
        error
      );
    }
  };

  fetchNotifications();

  const interval = setInterval(() => {
    fetchNotifications();
  }, 5000);

  return () => clearInterval(interval);
}, [student]);
  /*
  |--------------------------------------------------------------------------
  | CLOCK
  |--------------------------------------------------------------------------
  */

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  /*
  |--------------------------------------------------------------------------
  | DATE
  |--------------------------------------------------------------------------
  */

  const formattedDate =
    currentTime.toLocaleDateString(
      "en-US",
      {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
      }
    );

  /*
  |--------------------------------------------------------------------------
  | GREETING
  |--------------------------------------------------------------------------
  */

  const currentHour =
    currentTime.getHours();

  let greeting = "Good morning";

  if (
    currentHour >= 12 &&
    currentHour < 18
  ) {
    greeting = "Good afternoon";
  } else if (currentHour >= 18) {
    greeting = "Good evening";
  }

  /*
  |--------------------------------------------------------------------------
  | AVATAR
  |--------------------------------------------------------------------------
  */

  const getInitials = (name: string) => {
    if (!name) return "ST";

    const parts =
      name.trim().split(/\s+/);

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
  | NOTIFICATION COUNT
  |--------------------------------------------------------------------------
  */

  const unreadCount =
    notifications.filter(
      (notification) =>
        !notification.is_read
    ).length;

  /*
  |--------------------------------------------------------------------------
  | LOGOUT
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
            <p className="text-sm font-semibold leading-tight text-white">
              INTERNet
            </p>

            <p className="text-[11px] leading-tight text-slate-400">
              OJT Monitoring System
            </p>
          </div>

        </div>

        <nav className="flex-1 space-y-1 px-3 pt-2">

          <a
            href="#"
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
              <path d="M3 9.5 12 3l9 6.5V21a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1Z" />
            </svg>

            Dashboard
          </a>

          <a
            href="#"
            onClick={(e) => {
              e.preventDefault();
              navigate("/daily-log");
            }}
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

          <button
            type="button"
            onClick={() => navigate("/student/feedback")}
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
              <path d="m12 2 3.1 6.3 6.9 1-5 4.9L18.2 21 12 17.8 5.8 21 7 14.2l-5-4.9 6.9-1Z" />
            </svg>
            Company Feedback
          </button>

        </nav>

        <div className="space-y-1 border-t border-white/10 px-3 py-2">

          <a
            href="#"
            onClick={(e) => {
              e.preventDefault();
              navigate("/profile");
            }}
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
              <circle cx="12" cy="8" r="4" />
              <path d="M4 21c1.5-4 5-6 8-6s6.5 2 8 6" />
            </svg>

            Profile
          </a>

          <button
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

            {/* NOTIFICATIONS */}

            <div
              className="relative"
              ref={dropdownRef}
            >

              <button
                type="button"
                onClick={() =>
                  setShowNotifications(
                    (prev) => !prev
                  )
                }
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

                {unreadCount > 0 && (
                  <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-red-500 ring-2 ring-orange-500" />
                )}

              </button>

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

                    <button
                      type="button"
                      onClick={() => {
                        setShowNotifications(false);
                        navigate("/notifications");
                      }}
                      className="text-xs font-medium text-blue-600 hover:underline"
                    >
                      See all
                    </button>

                  </div>

                  {/* DATABASE NOTIFICATIONS */}

                  {notifications.length === 0 ? (

                    <div className="px-4 py-6 text-center">

                      <p className="text-xs text-slate-400">
                        No notifications yet.
                      </p>

                    </div>

                  ) : (

                    notifications
                      .slice(0, 3)
                      .map((notification) => (

                        <button
                          key={notification.id}
                          type="button"
                          onClick={() => {
                            setShowNotifications(false);
                            navigate("/notifications");
                          }}
                          className="flex w-full items-start gap-3 border-b border-slate-100 px-4 py-3 text-left hover:bg-slate-50"
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

                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              width="14"
                              height="14"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                            >

                              {notification.type ===
                                "attendance" && (
                                <>
                                  <circle
                                    cx="12"
                                    cy="12"
                                    r="9"
                                  />
                                  <path d="M12 7v5l3 2" />
                                </>
                              )}

                              {notification.type ===
                                "task" && (
                                <>
                                  <path d="m9 11 3 3L22 4" />
                                  <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
                                </>
                              )}

                              {notification.type ===
                                "document" && (
                                <>
                                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
                                  <path d="M14 2v6h6" />
                                </>
                              )}

                              {notification.type ===
                                "evaluation" && (
                                <path d="m12 2 3.1 6.3 6.9 1-5 4.9L18.2 21 12 17.8 5.8 21 7 14.2l-5-4.9 6.9-1Z" />
                              )}

                              {notification.type ===
                                "comment" && (
                                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                              )}

                            </svg>

                          </span>

                          {/* CONTENT */}

                          <div className="min-w-0 flex-1">

                            <p className="text-xs font-medium text-slate-800">
                              {notification.title}
                            </p>

                            <p className="mt-0.5 line-clamp-2 text-[11px] text-slate-400">
                              {notification.message}
                            </p>

                            <p className="mt-0.5 text-[10px] text-slate-400">
                              {new Date(
                                notification.created_at
                              ).toLocaleString()}
                            </p>

                          </div>

                          {/* UNREAD */}

                          {!notification.is_read && (
                            <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-blue-500" />
                          )}

                        </button>

                      ))

                  )}

                  {/* FOOTER */}

                  <button
                    type="button"
                    onClick={() => {
                      setShowNotifications(false);
                      navigate("/notifications");
                    }}
                    className="w-full py-2.5 text-center text-xs font-medium text-blue-600 hover:bg-slate-50"
                  >
                    View all notifications
                  </button>

                </div>

              )}

            </div>

            {/* USER */}

            <div className="flex items-center gap-2 rounded-md bg-white/10 px-2 py-1">

              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-900 text-xs font-semibold text-white">
                {getInitials(
                  student?.name || ""
                )}
              </div>

              <div className="text-right leading-tight">

                <p className="text-xs font-semibold text-white">
                  {student?.name}
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

          {/* GREETING */}

          <div>

            <p className="text-xs font-medium text-slate-400">
              {formattedDate}
            </p>

            <h1 className="mt-1 text-2xl font-semibold text-slate-900">
              {greeting},{" "}
              {student?.name}
            </h1>

            <p className="text-sm text-slate-500">
              {student?.company} ·{" "}
              {student?.program}
            </p>

            <p className="mt-1 text-xs text-slate-400">
              Student ID:{" "}
              {student?.student_id}
            </p>

          </div>

          {/* ATTENDANCE */}

          <div className="flex items-center justify-between rounded-xl bg-gradient-to-r from-[#0c1322] to-[#16233f] px-4 py-2">

            <div>

              <p className="text-sm font-semibold text-white">
                Log your attendance today
              </p>

              <p className="mt-0.5 text-xs text-slate-300">
                Take a photo and record your time-in for verification
              </p>

            </div>

            <button
              onClick={() =>
                navigate("/daily-log")
              }
              className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-amber-400"
            >
              Log Attendance
            </button>

          </div>

          {/* STAT CARDS */}

          <div className="grid grid-cols-4 gap-2.5">

            <div className="rounded-xl border border-slate-200 bg-white px-4 py-2">

              <p className="text-[11px] font-medium tracking-wide text-slate-400">
                HOURS RENDERED
              </p>

              <p className="mt-1.5 text-2xl font-semibold text-slate-900">
  {dashboardData?.hoursRendered ?? 0}h
</p>

<p className="mt-1 text-[11px] text-slate-400">
  of {dashboardData?.requiredHours ?? 90} hrs required
</p>

            </div>

            <div className="rounded-xl border border-slate-200 bg-white px-4 py-2">

              <p className="text-[11px] font-medium tracking-wide text-slate-400">
                DAYS LOGGED
              </p>

              <p className="mt-1.5 text-2xl font-semibold text-emerald-500">
  {dashboardData?.daysLogged ?? 0}
</p>

              <p className="mt-1 text-[11px] text-slate-400">
                this semester
              </p>

            </div>

            <div className="rounded-xl border border-slate-200 bg-white px-4 py-2">

              <p className="text-[11px] font-medium tracking-wide text-slate-400">
                ACTIVE TASKS
              </p>

              <p className="mt-1.5 text-2xl font-semibold text-amber-500">
  {dashboardData?.activeTasks ?? 0}
</p>

              <p className="mt-1 text-[11px] text-slate-400">
                pending completion
              </p>

            </div>

            <div className="rounded-xl border border-slate-200 bg-white px-4 py-2">

              <p className="text-[11px] font-medium tracking-wide text-slate-400">
                COMPLETION
              </p>

              <p className="mt-1.5 text-2xl font-semibold text-emerald-500">
  {dashboardData?.completion ?? 0}%
</p>
              <p className="mt-1 text-[11px] text-slate-400">
                overall progress
              </p>

            </div>

          </div>

          {/* PROGRESS + LOGS */}


            <div className="col-span-2 space-y-3">

              {/* OJT PROGRESS */}

              <div className="rounded-xl border border-slate-200 bg-white p-3">

                <div className="flex items-center justify-between">

                  <p className="text-sm font-semibold text-slate-800">
                    OJT Progress
                  </p>

                 <span className="text-xs font-medium text-slate-400">
  {dashboardData?.hoursRendered ?? 0} /{" "}
  {dashboardData?.requiredHours ?? 90} hrs
</span>

                </div>

                <div className="mt-2.5 h-2.5 w-full overflow-hidden rounded-full bg-slate-100">

                  <div
                    className="h-full rounded-full bg-gradient-to-r from-[#0c1322] to-emerald-400"
                    style={{
  width: `${Math.min(
    dashboardData?.completion ?? 0,
    100
  )}%`,
}}
                  />

                </div>

                <div className="mt-3 flex items-center justify-between text-xs text-slate-400">

                  <span>
                    Started: June 2026
                  </span>

                  <span>
                    Target: Nov 2026
                  </span>

                </div>

              </div>

              {/* WEEK CHART */}

<div className="rounded-xl border border-slate-200 bg-white p-3">

  <p className="text-sm font-semibold text-slate-800">
    This Week
  </p>

  <div className="mt-3 flex items-end justify-between gap-2.5 px-2">

    {dashboardData?.weeklyHours?.map((item) => (

      <div
        key={item.day}
        className="flex flex-1 flex-col items-center gap-2"
      >

        {/* HOURS */}

        <span className="text-xs text-slate-500">
          {item.hours}h
        </span>

        {/* BAR */}

        <div className="flex h-24 w-full items-end">

          <div
            className="w-full rounded-md bg-[#0c1322]"
            style={{
              height: `${Math.min(
                (item.hours / 10) * 100,
                100
              )}%`,
            }}
          />

        </div>

        {/* DAY */}

        <span className="text-xs text-slate-400">
          {item.day}
        </span>

      </div>

    ))}

  </div>

  {/* WEEK TOTAL */}

  <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3 text-xs">

    <span className="text-slate-400">
      Total:{" "}
      {(
        dashboardData?.weeklyHours?.reduce(
          (total, item) =>
            total + item.hours,
          0
        ) ?? 0
      ).toFixed(1)} hrs
    </span>

    <span className="font-medium text-emerald-500">
      This week
    </span>

  </div>

</div>

            {/* RECENT LOGS */}

            <div className="rounded-xl border border-slate-200 bg-white p-3">

              <div className="flex items-center justify-between">

                <p className="text-sm font-semibold text-slate-800">
                  Recent Logs
                </p>

                <button
  onClick={() => navigate("/daily-log")}
  className="text-xs font-medium text-blue-600 hover:underline"
>
  View all
</button>

              </div>

              <ul className="mt-3 divide-y divide-slate-100">

                {attendance.length === 0 ? (

                  <li className="py-4 text-center text-xs text-slate-400">
                    No attendance records yet.
                  </li>

                ) : (

                  attendance
                    .slice(0, 5)
                    .map((log) => (

                      <li
                        key={log.id}
                        className="flex items-center justify-between py-2"
                      >

                        <div>

                          <p className="text-sm text-slate-700">
                            {log.date}
                          </p>

                          <p className="text-xs text-slate-400">
                            {log.time_in || "—"}{" "}
                            –{" "}
                            {log.time_out || "—"}{" "}
                            ·{" "}
                            {log.hours ?? 0}h
                          </p>

                        </div>

                        <span
                          className={`text-xs font-medium ${
                            log.status ===
                            "Verified"
                              ? "text-emerald-500"
                              : log.status ===
                                "Rejected"
                              ? "text-red-500"
                              : "text-amber-500"
                          }`}
                        >
                          {log.status}
                        </span>

                      </li>

                    ))

                )}

              </ul>

            </div>

          </div>

        </main>

      </div>

      {/* LOGOUT MODAL */}

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
                onClick={() =>
                  setShowLogoutConfirm(false)
                }
                className="flex-1 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50"
              >
                No, Stay
              </button>

              <button
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

export default Dashboard;