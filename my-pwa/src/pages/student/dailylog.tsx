import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { API_URL, withStudentAuth } from "../../lib/api";
import { isWithinDateRange } from "../../lib/dateRange";
import DateRangeFilter from "../../components/DateRangeFilter";

/*
|--------------------------------------------------------------------------
| TYPES
|--------------------------------------------------------------------------
*/

type Status = "Verified" | "Pending" | "Flagged" | "Rejected";

interface AttendanceLog {
  id: number;
  student_id: number | string;
  date: string;
  time_in: string | null;
  break_time: string | null;
  break_end_time: string | null;
  time_out: string | null;
  hours: number | null;
  note: string | null;
  status: Status;
  image_url: string | null;
  review_notes?: string | null;
  verified_at?: string | null;
}

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

/*
|--------------------------------------------------------------------------
| COMPONENT
|--------------------------------------------------------------------------
*/

export default function DailyLog() {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const navigate = useNavigate();

  /*
  |--------------------------------------------------------------------------
  | MODAL STATES
  |--------------------------------------------------------------------------
  */

  const [showLogoutConfirm, setShowLogoutConfirm] =
    useState(false);

  const [showLogModal, setShowLogModal] =
    useState(false);

  const [showBreakConfirm, setShowBreakConfirm] =
    useState(false);

 const [showBackToWorkConfirm, setShowBackToWorkConfirm] =
  useState(false);
  
  const [showTimeOutConfirm, setShowTimeOutConfirm] =
    useState(false);

  const [showNotifications, setShowNotifications] =
    useState(false);

  /*
  |--------------------------------------------------------------------------
  | DATA STATES
  |--------------------------------------------------------------------------
  */

  const [notifications, setNotifications] =
    useState<Notification[]>([]);

  const [attendanceLogs, setAttendanceLogs] =
    useState<AttendanceLog[]>([]);

  const [student, setStudent] =
    useState<Student | null>(null);

  /*
  |--------------------------------------------------------------------------
  | UI STATES
  |--------------------------------------------------------------------------
  */

  const [unreadCount, setUnreadCount] =
    useState(0);

  const [filter, setFilter] =
    useState<"All" | Status>("All");

  const [loading, setLoading] =
    useState(true);

  const [saving, setSaving] =
    useState(false);

  const [search, setSearch] =
    useState("");

  const [dateFrom, setDateFrom] =
    useState("");

  const [dateTo, setDateTo] =
    useState("");

  const [currentTime, setCurrentTime] =
    useState(new Date());

  /*
  |--------------------------------------------------------------------------
  | LOG FORM
  |--------------------------------------------------------------------------
  */

  const [note, setNote] =
    useState("");

  const [photo, setPhoto] =
    useState<File | null>(null);

  const [photoPreview, setPhotoPreview] =
    useState<string | null>(null);

  const [logError, setLogError] =
    useState("");

  /*
  |--------------------------------------------------------------------------
  | REAL-TIME CLOCK
  |--------------------------------------------------------------------------
  */

  useEffect(() => {
    const timer = window.setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    return () => {
      window.clearInterval(timer);
    };
  }, []);

  /*
  |--------------------------------------------------------------------------
  | GET LOGGED-IN STUDENT
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

      fetchAttendance(
        loggedInStudent.student_id
      );

      fetchNotifications(
        loggedInStudent.student_id
      );
    } catch (error) {
      console.error(
        "Student data error:",
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
  | SAFE JSON RESPONSE
  |--------------------------------------------------------------------------
  */

  const parseResponse = async (
    response: Response
  ) => {
    const responseText =
      await response.text();

    if (!responseText.trim()) {
      return {};
    }

    try {
      return JSON.parse(responseText);
    } catch {
      console.error(
        "Invalid JSON response:",
        responseText
      );

      throw new Error(
        "The server returned an invalid response."
      );
    }
  };

  /*
  |--------------------------------------------------------------------------
  | GET ATTENDANCE
  |--------------------------------------------------------------------------
  */

  const fetchAttendance = async (
    studentId: string
  ) => {
    try {
      setLoading(true);

      const response =
        await fetch(
          `${API_URL}/api/attendance/${studentId}`,
          withStudentAuth()
        );

      const data =
        await parseResponse(response);

      if (!response.ok) {
        throw new Error(
          data.message ||
            "Failed to load attendance."
        );
      }

      setAttendanceLogs(
        Array.isArray(data.attendance)
          ? data.attendance
          : []
      );
    } catch (error) {
      console.error(
        "Attendance fetch error:",
        error
      );

      setAttendanceLogs([]);
    } finally {
      setLoading(false);
    }
  };

  /*
  |--------------------------------------------------------------------------
  | GET NOTIFICATIONS
  |--------------------------------------------------------------------------
  */

  const fetchNotifications = async (
    studentId: string
  ) => {
    try {
      const response =
        await fetch(
          `${API_URL}/api/notifications/${studentId}`,
          withStudentAuth()
        );

      const data =
        await parseResponse(response);

      if (!response.ok) {
        throw new Error(
          data.message ||
            "Failed to load notifications."
        );
      }

      const notificationList: Notification[] =
        Array.isArray(data.notifications)
          ? data.notifications
          : [];

      setNotifications(
        notificationList
      );

      setUnreadCount(
        notificationList.filter(
          (notification) =>
            !notification.is_read
        ).length
      );
    } catch (error) {
      console.error(
        "Notification fetch error:",
        error
      );
    }
  };

  /*
  |--------------------------------------------------------------------------
  | LOCAL DATE HELPERS
  |--------------------------------------------------------------------------
  */

  const getLocalDate = (
    date: Date
  ) => {
    const year =
      date.getFullYear();

    const month =
      String(
        date.getMonth() + 1
      ).padStart(2, "0");

    const day =
      String(
        date.getDate()
      ).padStart(2, "0");

    return `${year}-${month}-${day}`;
  };

  const getLogDate = (
    log: AttendanceLog
  ) => {
    if (log.time_in) {
      return getLocalDate(
        new Date(log.time_in)
      );
    }

    return String(log.date)
      .split("T")[0];
  };

  const today =
    getLocalDate(new Date());

  /*
  |--------------------------------------------------------------------------
  | TODAY'S ATTENDANCE
  |--------------------------------------------------------------------------
  */

  const todayLog =
    attendanceLogs.find(
      (log) =>
        getLogDate(log) === today
    );

  const hasTimeIn =
    Boolean(todayLog?.time_in);

  const hasBreak =
    Boolean(todayLog?.break_time);

  const hasReturnedFromBreak =
    Boolean(todayLog?.break_end_time);

  const hasTimeOut =
    Boolean(todayLog?.time_out);

  /*
  |--------------------------------------------------------------------------
  | FILTER + SEARCH
  |--------------------------------------------------------------------------
  */

  const filteredLogs =
    filter === "All"
      ? attendanceLogs
      : attendanceLogs.filter(
          (log) =>
            filter === "Flagged"
              ? log.status === "Flagged" ||
                log.status === "Rejected"
              : log.status === filter
        );

  const searchedLogs =
    filteredLogs.filter((log) => {
      if (
        !isWithinDateRange(
          getLogDate(log),
          dateFrom,
          dateTo
        )
      ) {
        return false;
      }

      const searchText =
        search
          .toLowerCase()
          .trim();

      if (!searchText) {
        return true;
      }

      return (
        getLogDate(log)
          .toLowerCase()
          .includes(searchText) ||
        (log.note || "")
          .toLowerCase()
          .includes(searchText) ||
        log.status
          .toLowerCase()
          .includes(searchText)
      );
    });

  /*
  |--------------------------------------------------------------------------
  | STATISTICS
  |--------------------------------------------------------------------------
  */

  const verifiedCount =
    attendanceLogs.filter(
      (log) =>
        log.status === "Verified"
    ).length;

  const pendingCount =
    attendanceLogs.filter(
      (log) =>
        log.status === "Pending"
    ).length;

  /*
  |--------------------------------------------------------------------------
  | FORMATTERS
  |--------------------------------------------------------------------------
  */

  const formatTime = (
    date: Date
  ) => {
    return date.toLocaleTimeString(
      [],
      {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      }
    );
  };

  const formatLogTime = (
    value: string | null
  ) => {
    if (!value) {
      return "--";
    }

    return new Date(
      value
    ).toLocaleTimeString(
      [],
      {
        hour: "2-digit",
        minute: "2-digit",
      }
    );
  };

  const formatDate = (
    date: Date
  ) => {
    return date.toLocaleDateString(
      undefined,
      {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
      }
    );
  };

  /*
  |--------------------------------------------------------------------------
  | OPEN LOG MODAL
  |--------------------------------------------------------------------------
  */

  const openLogModal = () => {
    if (hasTimeIn) {
      return;
    }

    setNote("");
    setPhoto(null);
    setPhotoPreview(null);
    setLogError("");

    setShowLogModal(true);
  };

  /*
  |--------------------------------------------------------------------------
  | CLOSE LOG MODAL
  |--------------------------------------------------------------------------
  */

  const closeLogModal = () => {
    if (saving) {
      return;
    }

    setShowLogModal(false);
    setLogError("");
  };

  /*
  |--------------------------------------------------------------------------
  | PHOTO SELECT
  |--------------------------------------------------------------------------
  */

  const handlePhotoChange = (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file =
      event.target.files?.[0];

    if (!file) {
      return;
    }

    if (!file.type.startsWith("image/")) {
      setLogError(
        "Please select a valid image file."
      );

      return;
    }

    setLogError("");
    setPhoto(file);

    if (photoPreview) {
      URL.revokeObjectURL(
        photoPreview
      );
    }

    const previewUrl =
      URL.createObjectURL(file);

    setPhotoPreview(previewUrl);
  };

  /*
  |--------------------------------------------------------------------------
  | LOG TIME IN
  |--------------------------------------------------------------------------
  */

  const handleSaveLog = async (
    event: React.FormEvent<HTMLFormElement>
  ) => {
    event.preventDefault();

    if (!student) {
      setLogError(
        "Student information not found."
      );

      return;
    }

    if (hasTimeIn) {
      setLogError(
        "You already logged attendance today."
      );

      return;
    }
    if (!photo) {
      setLogError("Capture an attendance photo before recording time-in.");
      return;
    }

    try {
      setSaving(true);
      setLogError("");

      const formData =
        new FormData();

      formData.append(
        "student_id",
        student.student_id
      );

      if (note.trim()) {
        formData.append(
          "notes",
          note.trim()
        );
      }

      formData.append("image", photo);

      const response =
        await fetch(
          `${API_URL}/api/attendance`,
          withStudentAuth({
            method: "POST",
            body: formData,
          })
        );

      const data =
        await parseResponse(response);

      if (!response.ok) {
        throw new Error(
          data.message ||
            data.error ||
            `Failed to record attendance. Server returned ${response.status}.`
        );
      }

      setShowLogModal(false);

      setNote("");
      setPhoto(null);

      if (photoPreview) {
        URL.revokeObjectURL(
          photoPreview
        );
      }

      setPhotoPreview(null);
      setLogError("");

      await fetchAttendance(
        student.student_id
      );

      await fetchNotifications(
        student.student_id
      );
    } catch (error) {
      console.error(
        "Save attendance error:",
        error
      );

      setLogError(
        error instanceof Error
          ? error.message
          : "Failed to record attendance."
      );
    } finally {
      setSaving(false);
    }
  };

  /*
  |--------------------------------------------------------------------------
  | START BREAK
  |--------------------------------------------------------------------------
  */

  const handleBreak = async () => {
    if (!student || !todayLog) {
      return;
    }

    if (
      !hasTimeIn ||
      hasBreak ||
      hasTimeOut
    ) {
      return;
    }

    try {
      setSaving(true);

      const response =
        await fetch(
          `${API_URL}/api/attendance/${todayLog.id}/break`,
          withStudentAuth({
            method: "PUT",
            headers: {
              "Content-Type":
                "application/json",
            },
            body: JSON.stringify({}),
          })
        );

      const data =
        await parseResponse(response);

      if (!response.ok) {
        throw new Error(
          data.message ||
            "Failed to record break."
        );
      }

      setShowBreakConfirm(false);

      await fetchAttendance(
        student.student_id
      );

      await fetchNotifications(
        student.student_id
      );
    } catch (error) {
      console.error(
        "Break error:",
        error
      );

      alert(
        error instanceof Error
          ? error.message
          : "Failed to record break."
      );
    } finally {
      setSaving(false);
    }
  };

  /*
  |--------------------------------------------------------------------------
  | RETURN FROM BREAK
  |--------------------------------------------------------------------------
  */

  const handleBackToWork = async () => {
    if (!student || !todayLog) {
      return;
    }

    if (
      !hasBreak ||
      hasReturnedFromBreak ||
      hasTimeOut
    ) {
      return;
    }

    try {
      setSaving(true);

      const response =
        await fetch(
          `${API_URL}/api/attendance/${todayLog.id}/break-end`,
          withStudentAuth({
            method: "PUT",
            headers: {
              "Content-Type":
                "application/json",
            },
            body: JSON.stringify({}),
          })
        );

      const data =
        await parseResponse(response);

      if (!response.ok) {
        throw new Error(
          data.message ||
            "Failed to record return from break."
        );
      }

      setShowBackToWorkConfirm(
        false
      );

      await fetchAttendance(
        student.student_id
      );

      await fetchNotifications(
        student.student_id
      );
    } catch (error) {
      console.error(
        "Back to work error:",
        error
      );

      alert(
        error instanceof Error
          ? error.message
          : "Failed to record return from break."
      );
    } finally {
      setSaving(false);
    }
  };

  /*
  |--------------------------------------------------------------------------
  | TIME OUT
  |--------------------------------------------------------------------------
  */

  const handleTimeOut = async () => {
    if (!student || !todayLog) {
      return;
    }

    if (
      !hasTimeIn ||
      !hasBreak ||
      hasTimeOut
    ) {
      return;
    }

    try {
      setSaving(true);

      const response =
        await fetch(
          `${API_URL}/api/attendance/${todayLog.id}/time-out`,
          withStudentAuth({
            method: "PUT",
            headers: {
              "Content-Type":
                "application/json",
            },
            body: JSON.stringify({}),
          })
        );

      const data =
        await parseResponse(response);

      if (!response.ok) {
        throw new Error(
          data.message ||
            "Failed to record time out."
        );
      }

      setShowTimeOutConfirm(
        false
      );

      await fetchAttendance(
        student.student_id
      );

      await fetchNotifications(
        student.student_id
      );
    } catch (error) {
      console.error(
        "Time out error:",
        error
      );

      alert(
        error instanceof Error
          ? error.message
          : "Failed to record time out."
      );
    } finally {
      setSaving(false);
    }
  };

  /*
  |--------------------------------------------------------------------------
  | SIGN OUT
  |--------------------------------------------------------------------------
  */

  const handleSignOut = () => {
    localStorage.removeItem(
      "student"
    );
    localStorage.removeItem("student_token");

    localStorage.removeItem(
      "student_id"
    );

    navigate("/");
  };

  /*
  |--------------------------------------------------------------------------
  | STUDENT INITIALS
  |--------------------------------------------------------------------------
  */

  const studentInitials =
    student?.name
      ? student.name
          .split(" ")
          .filter(Boolean)
          .map(
            (name) =>
              name[0]
          )
          .join("")
          .slice(0, 2)
          .toUpperCase()
      : "ST";

  /*
  |--------------------------------------------------------------------------
  | RENDER
  |--------------------------------------------------------------------------
  */

  return (
    <div className="flex h-screen bg-slate-50">

      {/* ================================================================
          SIDEBAR
      ================================================================ */}

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
              navigate(
                "/student/dashboard"
              )
            }
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-slate-400 transition hover:bg-white/5 hover:text-slate-200"
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
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-slate-400 transition hover:bg-white/5 hover:text-slate-200"
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

          {/* SCHEDULE */}

          <button
            type="button"
            onClick={() =>
              navigate("/schedule")
            }
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-slate-400 transition hover:bg-white/5 hover:text-slate-200"
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
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-slate-400 transition hover:bg-white/5 hover:text-slate-200"
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
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-slate-400 transition hover:bg-white/5 hover:text-slate-200"
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

          {/* PROFILE */}

          <button
            type="button"
            onClick={() => navigate("/profile")}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-slate-400 transition hover:bg-white/5 hover:text-slate-200"
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
              setShowLogoutConfirm(
                true
              )
            }
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-red-400 transition hover:bg-white/5"
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

      {/* ================================================================
          MAIN
      ================================================================ */}

      <div className="flex min-w-0 flex-1 flex-col overflow-y-auto">

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

            <div className="relative">

              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                className="absolute left-3 top-1/2 -translate-y-1/2 text-white/70"
              >
                <circle
                  cx="11"
                  cy="11"
                  r="7"
                />

                <path d="m20 20-4-4" />
              </svg>

              <input
                type="text"
                value={search}
                onChange={(event) =>
                  setSearch(
                    event.target.value
                  )
                }
                placeholder="Search logs..."
                className="w-52 rounded-md border border-white/20 bg-white/10 py-1.5 pl-9 pr-3 text-sm text-white outline-none transition placeholder:text-white/60 focus:border-white/40 focus:bg-white/15"
              />

            </div>

            {/* NOTIFICATIONS */}

            <div className="relative">

              <button
                type="button"
                onClick={() =>
                  setShowNotifications(
                    (previous) =>
                      !previous
                  )
                }
                className="relative rounded-md p-1.5 text-white transition hover:bg-white/15"
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
                  <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold text-white ring-2 ring-orange-500">
                    {unreadCount > 9
                      ? "9+"
                      : unreadCount}
                  </span>
                )}

              </button>

              {showNotifications && (
                <div className="absolute right-0 top-11 z-50 w-80 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">

                  <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">

                    <div>
                      <p className="text-sm font-semibold text-slate-900">
                        Notifications
                      </p>

                      <p className="text-[11px] text-slate-400">
                        {unreadCount > 0
                          ? `${unreadCount} unread notification${
                              unreadCount !== 1
                                ? "s"
                                : ""
                            }`
                          : "You're all caught up"}
                      </p>
                    </div>

                    {unreadCount > 0 && (
                      <span className="rounded-full bg-red-50 px-2 py-1 text-[10px] font-medium text-red-500">
                        {unreadCount} new
                      </span>
                    )}

                  </div>

                  <div className="max-h-80 overflow-y-auto">

                    {notifications.length === 0 ? (
                      <div className="px-4 py-8 text-center">

                        <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-slate-100">

                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            width="18"
                            height="18"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.7"
                            className="text-slate-400"
                          >
                            <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
                            <path d="M13.7 21a2 2 0 0 1-3.4 0" />
                          </svg>

                        </div>

                        <p className="mt-2 text-sm font-medium text-slate-600">
                          No notifications
                        </p>

                        <p className="mt-1 text-xs text-slate-400">
                          You're all caught up.
                        </p>

                      </div>
                    ) : (
                      notifications
                        .slice(0, 5)
                        .map(
                          (
                            notification
                          ) => (
                            <button
                              type="button"
                              key={
                                notification.id
                              }
                              onClick={() => {
                                setShowNotifications(
                                  false
                                );

                                navigate(
                                  "/notifications"
                                );
                              }}
                              className={`flex w-full gap-3 border-b border-slate-100 px-4 py-3 text-left transition hover:bg-slate-50 ${
                                !notification.is_read
                                  ? "bg-amber-50/40"
                                  : "bg-white"
                              }`}
                            >

                              <div
                                className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                                  notification.type ===
                                  "attendance"
                                    ? "bg-blue-50 text-blue-500"
                                    : notification.type ===
                                      "task"
                                    ? "bg-amber-50 text-amber-500"
                                    : notification.type ===
                                      "document"
                                    ? "bg-purple-50 text-purple-500"
                                    : notification.type ===
                                      "evaluation"
                                    ? "bg-emerald-50 text-emerald-500"
                                    : "bg-slate-100 text-slate-500"
                                }`}
                              >

                                <svg
                                  xmlns="http://www.w3.org/2000/svg"
                                  width="15"
                                  height="15"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="1.8"
                                >
                                  <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
                                  <path d="M13.7 21a2 2 0 0 1-3.4 0" />
                                </svg>

                              </div>

                              <div className="min-w-0 flex-1">

                                <div className="flex items-start justify-between gap-2">

                                  <p className="truncate text-xs font-semibold text-slate-800">
                                    {
                                      notification.title
                                    }
                                  </p>

                                  {!notification.is_read && (
                                    <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-amber-500" />
                                  )}

                                </div>

                                <p className="mt-0.5 line-clamp-2 text-[11px] leading-relaxed text-slate-500">
                                  {
                                    notification.message
                                  }
                                </p>

                                <p className="mt-1 text-[10px] text-slate-400">
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

                  <div className="border-t border-slate-100 p-2">

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
                      className="w-full rounded-lg px-3 py-2 text-center text-xs font-semibold text-amber-600 transition hover:bg-amber-50"
                    >
                      View all notifications
                    </button>

                  </div>

                </div>
              )}

            </div>

            {/* STUDENT INFO */}

            <div className="flex items-center gap-2 rounded-md bg-white/10 px-2 py-1">

              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-900 text-xs font-semibold text-white">
                {studentInitials}
              </div>

              <div className="text-right leading-tight">

                <p className="text-xs font-semibold text-white">
                  {student?.name ||
                    "Student"}
                </p>

                <p className="text-[10px] text-white/80">
                  OJT Student
                </p>

              </div>

            </div>

          </div>

        </header>

        {/* ================================================================
            PAGE CONTENT
        ================================================================ */}

        <main className="flex-1 space-y-3 p-4">

          {/* PAGE HEADER */}

          <div className="flex items-center justify-between">

            <div>

              <h1 className="text-xl font-semibold text-slate-900">
                Daily Attendance Log
              </h1>

              <p className="text-sm text-slate-400">
                Record your time-in, break, time-out, and notes
              </p>

            </div>

            <button
              type="button"
              onClick={openLogModal}
              disabled={hasTimeIn}
              className="flex items-center gap-1.5 rounded-lg bg-[#0c1322] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#16233f] disabled:cursor-not-allowed disabled:opacity-50"
            >

              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
              >
                <path d="M12 5v14M5 12h14" />
              </svg>

              Log Today

            </button>

          </div>

          {/* TODAY STATUS */}

          {hasTimeIn && (
            <div className="rounded-xl border border-slate-200 bg-white p-4">

              <div className="flex items-center justify-between">

                <div>

                  <p className="text-sm font-semibold text-slate-900">
                    Today's Attendance
                  </p>

                  <p className="mt-1 text-xs text-slate-400">
                    {formatDate(
                      currentTime
                    )}
                  </p>

                </div>

                <div className="flex gap-2">

                  {/* BREAK / BACK TO WORK */}

                  <button
                    type="button"
                    onClick={() => {
                      if (
                        hasReturnedFromBreak ||
                        hasTimeOut ||
                        saving
                      ) {
                        return;
                      }

                      if (hasBreak) {
                        setShowBackToWorkConfirm(
                          true
                        );
                      } else {
                        setShowBreakConfirm(
                          true
                        );
                      }
                    }}
                    disabled={
                      !hasTimeIn ||
                      hasTimeOut ||
                      saving ||
                      hasReturnedFromBreak
                    }
                    className={`rounded-lg border px-4 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${
                      hasReturnedFromBreak
                        ? "border-slate-200 bg-slate-50 text-slate-400"
                        : hasBreak
                        ? "border-emerald-200 bg-emerald-50 text-emerald-600 hover:bg-emerald-100"
                        : "border-amber-200 bg-amber-50 text-amber-600 hover:bg-amber-100"
                    }`}
                  >
                    {hasReturnedFromBreak
                      ? "Back to Work Recorded"
                      : hasBreak
                      ? "Back to Work"
                      : "Break"}
                  </button>

                  {/* TIME OUT */}

                  <button
                    type="button"
                    onClick={() =>
                      setShowTimeOutConfirm(
                        true
                      )
                    }
                    disabled={
                      !hasTimeIn ||
                      !hasBreak ||
                      !hasReturnedFromBreak ||
                      hasTimeOut ||
                      saving
                    }
                    className="rounded-lg bg-red-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {hasTimeOut
                      ? "Time Out Recorded"
                      : "Time Out"}
                  </button>

                </div>

              </div>

              {/* ATTENDANCE TIMES */}

              <div className="mt-4 grid grid-cols-4 gap-3">

                {/* TIME IN */}

                <div className="rounded-lg bg-slate-50 p-3">

                  <p className="text-[11px] text-slate-400">
                    TIME IN
                  </p>

                  <p className="mt-1 text-sm font-semibold text-blue-600">
                    {formatLogTime(
                      todayLog?.time_in ||
                        null
                    )}
                  </p>

                </div>

                {/* BREAK */}

                <div className="rounded-lg bg-slate-50 p-3">

                  <p className="text-[11px] text-slate-400">
                    BREAK
                  </p>

                  <p className="mt-1 text-sm font-semibold text-amber-500">
                    {formatLogTime(
                      todayLog?.break_time ||
                        null
                    )}
                  </p>

                </div>

                {/* BACK TO WORK */}

                <div className="rounded-lg bg-slate-50 p-3">

                  <p className="text-[11px] text-slate-400">
                    BACK TO WORK
                  </p>

                  <p className="mt-1 text-sm font-semibold text-emerald-500">
                    {formatLogTime(
                      todayLog?.break_end_time ||
                        null
                    )}
                  </p>

                </div>

                {/* TIME OUT */}

                <div className="rounded-lg bg-slate-50 p-3">

                  <p className="text-[11px] text-slate-400">
                    TIME OUT
                  </p>

                  <p className="mt-1 text-sm font-semibold text-red-500">
                    {formatLogTime(
                      todayLog?.time_out ||
                        null
                    )}
                  </p>

                </div>

              </div>

            </div>
          )}

          {/* STAT CARDS */}

          <div className="grid grid-cols-3 gap-2.5">

            <div className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-center">

              <p className="text-2xl font-semibold text-slate-900">
                {attendanceLogs.length}
              </p>

              <p className="mt-1 text-xs text-slate-400">
                Total Logged
              </p>

            </div>

            <div className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-center">

              <p className="text-2xl font-semibold text-emerald-500">
                {verifiedCount}
              </p>

              <p className="mt-1 text-xs text-slate-400">
                Verified
              </p>

            </div>

            <div className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-center">

              <p className="text-2xl font-semibold text-amber-500">
                {pendingCount}
              </p>

              <p className="mt-1 text-xs text-slate-400">
                Pending
              </p>

            </div>

          </div>

          {/* FILTERS */}

          <div className="flex flex-wrap items-center gap-2">

            {(
              [
                "All",
                "Verified",
                "Pending",
                "Flagged",
              ] as const
            ).map((status) => (
              <button
                type="button"
                key={status}
                onClick={() =>
                  setFilter(status)
                }
                className={`rounded-lg px-4 py-1.5 text-sm transition ${
                  filter === status
                    ? "bg-[#0c1322] font-medium text-white"
                    : "border border-slate-200 bg-white text-slate-500 hover:bg-slate-50"
                }`}
              >
                {status}
              </button>
            ))}

            <div className="sm:ml-auto">
              <DateRangeFilter
                from={dateFrom}
                to={dateTo}
                onChange={(from, to) => {
                  setDateFrom(from);
                  setDateTo(to);
                }}
              />
            </div>

          </div>

          {/* TABLE */}

          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">

            <div className="overflow-x-auto">

              <table className="w-full min-w-[900px] text-left text-sm">

                <thead>

                  <tr className="border-b border-slate-100 text-[11px] font-medium tracking-wide text-slate-400">

                    <th className="px-4 py-3">
                      DATE
                    </th>

                    <th className="px-4 py-3">
                      TIME IN
                    </th>

                    <th className="px-4 py-3">
                      BREAK
                    </th>

                    <th className="px-4 py-3">
                      BACK TO WORK
                    </th>

                    <th className="px-4 py-3">
                      TIME OUT
                    </th>

                    <th className="px-4 py-3">
                      HOURS
                    </th>

                    <th className="px-4 py-3">
                      NOTES
                    </th>

                    <th className="px-4 py-3 text-right">
                      STATUS
                    </th>

                  </tr>

                </thead>

                <tbody className="divide-y divide-slate-100">

                  {loading ? (
                    <tr>

                      <td
                        colSpan={8}
                        className="px-4 py-8 text-center text-sm text-slate-400"
                      >
                        Loading attendance...
                      </td>

                    </tr>
                  ) : searchedLogs.length === 0 ? (
                    <tr>

                      <td
                        colSpan={8}
                        className="px-4 py-8 text-center text-sm text-slate-400"
                      >
                        {search || dateFrom || dateTo
                          ? "No attendance records match your search."
                          : "No attendance records found."}
                      </td>

                    </tr>
                  ) : (
                    searchedLogs.map(
                      (log) => (
                        <tr
                          key={
                            log.id
                          }
                          className="transition hover:bg-slate-50"
                        >

                          <td className="px-4 py-3 font-medium text-slate-700">
                            {getLogDate(
                              log
                            )}
                          </td>

                          <td className="px-4 py-3 text-blue-600">
                            {formatLogTime(
                              log.time_in
                            )}
                          </td>

                          <td className="px-4 py-3 text-amber-500">
                            {formatLogTime(
                              log.break_time
                            )}
                          </td>

                          <td className="px-4 py-3 text-emerald-500">
                            {formatLogTime(
                              log.break_end_time
                            )}
                          </td>

                          <td className="px-4 py-3 text-red-500">
                            {formatLogTime(
                              log.time_out
                            )}
                          </td>

                          <td className="px-4 py-3 text-slate-600">
                            {log.hours ??
                              "--"}
                          </td>

                          <td className="max-w-md px-4 py-3 text-slate-600">
                            {log.note ||
                              "--"}
                            {log.review_notes && (
                              <p
                                className={`mt-1 text-xs ${
                                  log.status === "Rejected"
                                    ? "text-red-500"
                                    : "text-slate-400"
                                }`}
                              >
                                Supervisor: {log.review_notes}
                              </p>
                            )}
                          </td>

                          <td
                            className={`px-4 py-3 text-right font-medium ${
                              log.status ===
                              "Verified"
                                ? "text-emerald-500"
                                : log.status ===
                                  "Pending"
                                ? "text-amber-500"
                                : "text-red-500"
                            }`}
                          >
                            {log.status}
                          </td>

                        </tr>
                      )
                    )
                  )}

                </tbody>

              </table>

            </div>

          </div>

        </main>

      </div>

      {/* ================================================================
          LOG TODAY MODAL
      ================================================================ */}

      {showLogModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 backdrop-blur-sm"
          onClick={closeLogModal}
        >

          <div
            className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl"
            onClick={(event) =>
              event.stopPropagation()
            }
          >

            <div className="flex items-center justify-between">

              <div>

                <p className="text-sm font-semibold text-slate-900">
                  Log Today's Attendance
                </p>

                <p className="mt-1 text-xs text-slate-400">
                  {formatDate(
                    currentTime
                  )}
                </p>

              </div>

              <button
                type="button"
                onClick={
                  closeLogModal
                }
                disabled={saving}
                className="rounded-md p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 disabled:opacity-50"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>

            </div>

            {/* CURRENT TIME */}

            <div className="mt-4 rounded-xl bg-slate-50 p-4 text-center">

              <p className="text-[11px] font-medium tracking-wide text-slate-400">
                CURRENT TIME
              </p>

              <p className="mt-1 text-3xl font-semibold text-slate-900">
                {formatTime(
                  currentTime
                )}
              </p>

              <p className="mt-1 text-xs text-slate-400">
                This time will be recorded automatically.
              </p>

            </div>

            <form
              onSubmit={
                handleSaveLog
              }
              className="mt-4 space-y-3"
            >

              {/* NOTE */}

              <div>

                <label className="mb-1 block text-xs font-medium text-slate-500">
                  Note{" "}
                  <span className="font-normal text-slate-400">
                    (Optional)
                  </span>
                </label>

                <textarea
                  rows={3}
                  value={note}
                  onChange={(
                    event
                  ) =>
                    setNote(
                      event.target.value
                    )
                  }
                  placeholder="Add a note about what you worked on today..."
                  className="w-full resize-none rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-slate-400"
                />

              </div>

              {/* PHOTO */}

              <div>

                <label className="mb-1 block text-xs font-medium text-slate-500">
                  Attendance Photo <span className="text-red-500">*</span>
                </label>

                <label className="flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-center transition hover:border-amber-400 hover:bg-amber-50/30">

                  {photoPreview ? (
                    <img
                      src={
                        photoPreview
                      }
                      alt="Attendance preview"
                      className="mb-3 max-h-40 rounded-lg object-cover"
                    />
                  ) : (
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="28"
                      height="28"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      className="mb-2 text-slate-400"
                    >
                      <path d="M14.5 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-6.5" />
                      <path d="M16 3h5v5" />
                      <path d="m21 3-8 8" />
                      <circle
                        cx="8.5"
                        cy="8.5"
                        r="1.5"
                      />
                    </svg>
                  )}

                  <span className="text-sm font-medium text-slate-600">
                    {photo
                      ? photo.name
                      : "Capture attendance photo"}
                  </span>

                  <span className="mt-1 text-xs text-slate-400">
                    Required to record time-in. Your device camera will be offered on mobile.
                  </span>

                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/jpg"
                    capture="environment"
                    onChange={
                      handlePhotoChange
                    }
                    className="hidden"
                  />

                </label>

              </div>

              {logError && (
                <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-500">
                  {logError}
                </p>
              )}

              <div className="flex justify-end gap-2 pt-1">

                <button
                  type="button"
                  onClick={
                    closeLogModal
                  }
                  disabled={saving}
                  className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-slate-900 transition hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {saving
                    ? "Recording..."
                    : "Time In"}
                </button>

              </div>

            </form>

          </div>

        </div>
      )}

      {/* ================================================================
          BREAK CONFIRMATION
      ================================================================ */}

      {showBreakConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 px-4 backdrop-blur-sm"
          onClick={() =>
            !saving &&
            setShowBreakConfirm(
              false
            )
          }
        >

          <div
            className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl"
            onClick={(event) =>
              event.stopPropagation()
            }
          >

            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-amber-50 text-amber-500">

              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
              >
                <path d="M12 6v6l4 2" />

                <circle
                  cx="12"
                  cy="12"
                  r="9"
                />
              </svg>

            </div>

            <div className="mt-4 text-center">

              <h2 className="text-lg font-semibold text-slate-900">
                Start Break?
              </h2>

              <p className="mt-1.5 text-sm leading-relaxed text-slate-500">
                Your break will be recorded using the current time.
              </p>

              <p className="mt-3 text-2xl font-semibold text-amber-500">
                {formatTime(
                  currentTime
                )}
              </p>

            </div>

            <div className="mt-6 flex gap-2.5">

              <button
                type="button"
                onClick={() =>
                  setShowBreakConfirm(
                    false
                  )
                }
                disabled={saving}
                className="flex-1 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={
                  handleBreak
                }
                disabled={saving}
                className="flex-1 rounded-lg bg-amber-500 px-4 py-2.5 text-sm font-semibold text-slate-900 transition hover:bg-amber-400 disabled:opacity-50"
              >
                {saving
                  ? "Recording..."
                  : "Start Break"}
              </button>

            </div>

          </div>

        </div>
      )}

      {/* ================================================================
          BACK TO WORK CONFIRMATION
      ================================================================ */}

      {showBackToWorkConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 px-4 backdrop-blur-sm"
          onClick={() =>
            !saving &&
            setShowBackToWorkConfirm(
              false
            )
          }
        >

          <div
            className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl"
            onClick={(event) =>
              event.stopPropagation()
            }
          >

            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-500">

              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
              >
                <path d="M5 12h14" />
                <path d="m13 6 6 6-6 6" />
              </svg>

            </div>

            <div className="mt-4 text-center">

              <h2 className="text-lg font-semibold text-slate-900">
                Back to Work?
              </h2>

              <p className="mt-1.5 text-sm leading-relaxed text-slate-500">
                Your return from break will be recorded using the current time.
              </p>

              <p className="mt-3 text-2xl font-semibold text-emerald-500">
                {formatTime(
                  currentTime
                )}
              </p>

            </div>

            <div className="mt-6 flex gap-2.5">

              <button
                type="button"
                onClick={() =>
                  setShowBackToWorkConfirm(
                    false
                  )
                }
                disabled={saving}
                className="flex-1 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={
                  handleBackToWork
                }
                disabled={saving}
                className="flex-1 rounded-lg bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-600 disabled:opacity-50"
              >
                {saving
                  ? "Recording..."
                  : "Back to Work"}
              </button>

            </div>

          </div>

        </div>
      )}

      {/* ================================================================
          TIME OUT CONFIRMATION
      ================================================================ */}

      {showTimeOutConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 px-4 backdrop-blur-sm"
          onClick={() =>
            !saving &&
            setShowTimeOutConfirm(
              false
            )
          }
        >

          <div
            className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl"
            onClick={(event) =>
              event.stopPropagation()
            }
          >

            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-50 text-red-500">

              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
              >
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <path d="M16 17l5-5-5-5M21 12H9" />
              </svg>

            </div>

            <div className="mt-4 text-center">

              <h2 className="text-lg font-semibold text-slate-900">
                Time Out?
              </h2>

              <p className="mt-1.5 text-sm leading-relaxed text-slate-500">
                Are you sure you want to end your OJT attendance for today?
              </p>

              <p className="mt-3 text-2xl font-semibold text-red-500">
                {formatTime(
                  currentTime
                )}
              </p>

            </div>

            <div className="mt-6 flex gap-2.5">

              <button
                type="button"
                onClick={() =>
                  setShowTimeOutConfirm(
                    false
                  )
                }
                disabled={saving}
                className="flex-1 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
              >
                No, Stay
              </button>

              <button
                type="button"
                onClick={
                  handleTimeOut
                }
                disabled={saving}
                className="flex-1 rounded-lg bg-red-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-red-600 disabled:opacity-50"
              >
                {saving
                  ? "Recording..."
                  : "Yes, Time Out"}
              </button>

            </div>

          </div>

        </div>
      )}

      {/* ================================================================
          SIGN OUT MODAL
      ================================================================ */}

      {showLogoutConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 px-4 backdrop-blur-sm"
          onClick={() =>
            setShowLogoutConfirm(
              false
            )
          }
        >

          <div
            className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl"
            onClick={(event) =>
              event.stopPropagation()
            }
          >

            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-50 text-red-500">

              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
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
                onClick={() =>
                  setShowLogoutConfirm(
                    false
                  )
                }
                className="flex-1 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
              >
                No, Stay
              </button>

              <button
                type="button"
                onClick={
                  handleSignOut
                }
                className="flex-1 rounded-lg bg-red-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-red-600"
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