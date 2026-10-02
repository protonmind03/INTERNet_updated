import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { API_URL, withStudentAuth } from "../../lib/api";

interface Student {
  id: number;
  student_id: string;
  email: string;
  name: string;
  program: string;
  company: string;
}

interface Notification {
  id: number;
  student_id?: string;
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

type FilterType = "all" | "unread";

export default function Notifications() {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const navigate = useNavigate();

  const [student] = useState<Student | null>(() => {
    const savedStudent = localStorage.getItem("student");
    if (!savedStudent) return null;
    try {
      return JSON.parse(savedStudent) as Student;
    } catch {
      return null;
    }
  });

  const [notifications, setNotifications] =
    useState<Notification[]>([]);

  const [activeFilter, setActiveFilter] =
    useState<FilterType>("all");

  /*
  |--------------------------------------------------------------------------
  | LOAD STUDENT
  |--------------------------------------------------------------------------
  */

  useEffect(() => {
    if (!student) {
      localStorage.removeItem("student");
      localStorage.removeItem("student_id");
      localStorage.removeItem("student_token");
      localStorage.removeItem("student_name");
      navigate("/");
    }
  }, [navigate, student]);

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
          throw new Error(
            `Failed to fetch notifications: ${response.status}`
          );
        }

        const data = await response.json();

        console.log(
          "NOTIFICATIONS FROM DATABASE:",
          data.notifications
        );

        setNotifications(
          data.notifications || []
        );
      } catch (error) {
        console.error(
          "FETCH NOTIFICATIONS ERROR:",
          error
        );
      }
    };

    fetchNotifications();
    window.addEventListener("internet-notification", fetchNotifications);
    return () => {
      window.removeEventListener("internet-notification", fetchNotifications);
    };
  }, [student]);

  /*
  |--------------------------------------------------------------------------
  | STUDENT NAME
  |--------------------------------------------------------------------------
  */

  const studentName =
    student?.name || "Student";

  /*
  |--------------------------------------------------------------------------
  | INITIALS
  |--------------------------------------------------------------------------
  */

  const initials = studentName
    .trim()
    .split(/\s+/)
    .map((name) => name.charAt(0))
    .join("")
    .slice(0, 2)
    .toUpperCase();

  /*
  |--------------------------------------------------------------------------
  | UNREAD COUNT
  |--------------------------------------------------------------------------
  */

  const unreadCount =
    notifications.filter(
      (notification) =>
        !notification.is_read
    ).length;

  /*
  |--------------------------------------------------------------------------
  | FILTER NOTIFICATIONS
  |--------------------------------------------------------------------------
  */

  const displayedNotifications =
    activeFilter === "all"
      ? notifications
      : notifications.filter(
          (notification) =>
            !notification.is_read
        );

  /*
  |--------------------------------------------------------------------------
  | MARK ONE AS READ
  |--------------------------------------------------------------------------
  */

  const markAsRead = async (
    id: number
  ) => {
    try {
      const response = await fetch(
        `${API_URL}/api/notifications/${id}/read`,
        withStudentAuth({
          method: "PUT",
          headers: {
            "Content-Type":
              "application/json",
          },
        })
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.message ||
            "Failed to mark notification as read."
        );
      }

      setNotifications((current) =>
        current.map((notification) =>
          notification.id === id
            ? {
                ...notification,
                is_read: true,
              }
            : notification
        )
      );
    } catch (error) {
      console.error(
        "MARK READ ERROR:",
        error
      );
    }
  };

  /*
  |--------------------------------------------------------------------------
  | MARK ALL AS READ
  |--------------------------------------------------------------------------
  */

  const markAllAsRead = async () => {
    if (!student?.student_id) {
      return;
    }

    if (unreadCount === 0) {
      return;
    }

    try {
      const response = await fetch(
        `${API_URL}/api/notifications/student/${student.student_id}/read-all`,
        withStudentAuth({
          method: "PUT",
          headers: {
            "Content-Type":
              "application/json",
          },
        })
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.message ||
            "Failed to mark notifications as read."
        );
      }

      setNotifications((current) =>
        current.map((notification) => ({
          ...notification,
          is_read: true,
        }))
      );
    } catch (error) {
      console.error(
        "MARK ALL READ ERROR:",
        error
      );
    }
  };

  /*
  |--------------------------------------------------------------------------
  | ICONS
  |--------------------------------------------------------------------------
  */

  const getIcon = (
    type: Notification["type"]
  ) => {
    switch (type) {
      case "attendance":
        return (
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <circle
              cx="12"
              cy="12"
              r="9"
            />

            <path d="M12 7v5l3 2" />
          </svg>
        );

      case "task":
        return (
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="m9 11 3 3L22 4" />

            <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
          </svg>
        );

      case "document":
        return (
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />

            <path d="M14 2v6h6" />
          </svg>
        );

      case "evaluation":
        return (
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="m12 2 3.1 6.3 6.9 1-5 4.9L18.2 21 12 17.8 5.8 21 7 14.2l-5-4.9 6.9-1Z" />
          </svg>
        );

      case "comment":
        return (
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
        );

      default:
        return null;
    }
  };

  /*
  |--------------------------------------------------------------------------
  | ICON STYLE
  |--------------------------------------------------------------------------
  */

  const getIconStyle = (
    type: Notification["type"]
  ) => {
    switch (type) {
      case "attendance":
        return "bg-amber-50 text-amber-500";

      case "task":
        return "bg-blue-50 text-blue-500";

      case "document":
        return "bg-emerald-50 text-emerald-500";

      case "evaluation":
        return "bg-red-50 text-red-500";

      case "comment":
        return "bg-slate-100 text-slate-500";

      default:
        return "bg-slate-100 text-slate-500";
    }
  };

  /*
  |--------------------------------------------------------------------------
  | LOGOUT
  |--------------------------------------------------------------------------
  */

  const handleLogout = () => {
    localStorage.removeItem("student");
    localStorage.removeItem("student_id");
    localStorage.removeItem("student_token");
    localStorage.removeItem("student_name");

    navigate("/");
  };

  /*
  |--------------------------------------------------------------------------
  | PAGE
  |--------------------------------------------------------------------------
  */

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

          <button
            type="button"
            onClick={() =>
              navigate(
                "/student/dashboard"
              )
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

          {/* Daily Log */}

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

          {/* My Tasks */}

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

          {/* Schedule */}

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

          {/* Documents */}

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

          {/* Report */}

          <button
            type="button"
            onClick={() =>
              navigate("/report")
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
              <path d="M10.3 3.9 2.7 17a1.8 1.8 0 0 0 1.5 2.7h15.6a1.8 1.8 0 0 0 1.5-2.7L13.7 3.9a1.8 1.8 0 0 0-3.4 0Z" />

              <path d="M12 9v4M12 16.5h.01" />
            </svg>

            Report Complaint

          </button>

        </nav>

        {/* BOTTOM */}

        <div className="space-y-1 border-t border-white/10 px-3 py-2">

          {/* Profile */}

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

          {/* Sign Out */}

          <button
            type="button"
            onClick={handleLogout}
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

            <button
              type="button"
              className="flex items-center gap-2 rounded-md bg-white/15 px-3 py-1.5 text-sm text-white hover:bg-white/25"
            >

              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <circle
                  cx="11"
                  cy="11"
                  r="7"
                />

                <path d="m21 21-4.3-4.3" />
              </svg>

              Search

            </button>

            {/* NOTIFICATION BELL */}

            <button
              type="button"
              onClick={() =>
                navigate("/notifications")
              }
              aria-label="Notifications"
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

              {unreadCount > 0 && (
                <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-red-500 ring-2 ring-orange-500" />
              )}

            </button>

            {/* STUDENT */}

            <div className="flex items-center gap-2 rounded-md bg-white/10 px-2 py-1">

              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-900 text-xs font-semibold text-white">
                {initials}
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

        {/* CONTENT */}

        <main className="flex-1 space-y-3 p-4">

          {/* PAGE HEADER */}

          <div className="flex items-center justify-between">

            <div>

              <h1 className="text-xl font-semibold text-slate-900">
                Notifications
              </h1>

              <p className="text-sm text-slate-400">
                Updates on your attendance, tasks, and documents
              </p>

            </div>

            <button
              type="button"
              onClick={markAllAsRead}
              disabled={unreadCount === 0}
              className={`text-xs font-medium ${
                unreadCount === 0
                  ? "cursor-not-allowed text-slate-300"
                  : "text-blue-600 hover:underline"
              }`}
            >
              Mark all as read
            </button>

          </div>

          {/* FILTER TABS */}

          <div className="flex items-center gap-2">

            <button
              type="button"
              onClick={() =>
                setActiveFilter("all")
              }
              className={
                activeFilter === "all"
                  ? "rounded-lg bg-[#0c1322] px-4 py-1.5 text-sm font-medium text-white"
                  : "rounded-lg border border-slate-200 bg-white px-4 py-1.5 text-sm text-slate-500 hover:bg-slate-50"
              }
            >
              All
            </button>

            <button
              type="button"
              onClick={() =>
                setActiveFilter("unread")
              }
              className={
                activeFilter === "unread"
                  ? "rounded-lg bg-[#0c1322] px-4 py-1.5 text-sm font-medium text-white"
                  : "rounded-lg border border-slate-200 bg-white px-4 py-1.5 text-sm text-slate-500 hover:bg-slate-50"
              }
            >
              Unread

              {unreadCount > 0 && (
                <span className="ml-1 rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                  {unreadCount}
                </span>
              )}

            </button>

          </div>

          {/* NOTIFICATION LIST */}

          <div className="space-y-2">

            {displayedNotifications.length ===
            0 ? (

              <div className="rounded-xl border border-slate-200 bg-white py-8 text-center">

                <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-400">

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

                </div>

                <p className="mt-2 text-xs text-slate-400">
                  {activeFilter === "unread"
                    ? "You're all caught up 🎉"
                    : "No notifications yet."}
                </p>

              </div>

            ) : (

              displayedNotifications.map(
                (notification) => (

                  <button
                    key={notification.id}
                    type="button"
                    onClick={() =>
                      !notification.is_read &&
                      markAsRead(
                        notification.id
                      )
                    }
                    className={`flex w-full items-start gap-3 rounded-xl border border-slate-200 bg-white p-3 text-left transition hover:bg-slate-50 ${
                      notification.is_read
                        ? "opacity-70"
                        : ""
                    }`}
                  >

                    {/* ICON */}

                    <span
                      className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${getIconStyle(
                        notification.type
                      )}`}
                    >
                      {getIcon(
                        notification.type
                      )}
                    </span>

                    {/* CONTENT */}

                    <div className="min-w-0 flex-1">

                      <div className="flex items-start justify-between">

                        <p className="text-sm font-medium text-slate-800">
                          {notification.title}
                        </p>

                        {!notification.is_read && (
                          <span className="ml-2 mt-1 h-2 w-2 shrink-0 rounded-full bg-blue-500" />
                        )}

                      </div>

                      <p className="mt-0.5 text-xs text-slate-500">
                        {notification.message}
                      </p>

                      <p className="mt-1 text-xs text-slate-400">
                        {new Date(
                          notification.created_at
                        ).toLocaleString()}
                      </p>

                    </div>

                  </button>

                )
              )

            )}

          </div>

        </main>

      </div>

    </div>
  );
}
