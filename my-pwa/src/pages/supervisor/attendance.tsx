import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useNavigate } from "react-router-dom";
import {
  API_URL,
  getProtectedUploadUrl,
  withSupervisorAuth,
} from "../../lib/api";
import { isWithinDateRange } from "../../lib/dateRange";
import DateRangeFilter from "../../components/DateRangeFilter";
import NotificationBell from "../../components/NotificationBell";

/*
|--------------------------------------------------------------------------
| TYPES
|--------------------------------------------------------------------------
*/

type Supervisor = {
  id: number;
  supervisor_id: string;
  email: string;
  name: string;
  company: string;
  department: string;
};

type InternAttendance = {
  id: number;
  student_id: string;
  student_name: string;
  student_email?: string;
  program?: string;
  company?: string;
  date: string;
  time_in: string | null;
  break_time?: string | null;
  time_out: string | null;
  hours: number | null;
  note: string | null;
  status: string;
  image_url: string | null;
  review_notes?: string | null;
};

type FilterKey =
  | "all"
  | "pending"
  | "verified"
  | "rejected";

/*
|--------------------------------------------------------------------------
| API
|--------------------------------------------------------------------------
*/

/*
|--------------------------------------------------------------------------
| COMPONENT
|--------------------------------------------------------------------------
*/

function SupervisorAttendanceApproval() {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const navigate = useNavigate();

  /*
  |--------------------------------------------------------------------------
  | STATE
  |--------------------------------------------------------------------------
  */

  const [supervisor, setSupervisor] =
    useState<Supervisor | null>(null);

  const [logs, setLogs] =
    useState<InternAttendance[]>([]);

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState("");

  const [filter, setFilter] =
    useState<FilterKey>("pending");

  const [search, setSearch] =
    useState("");

  const [dateFrom, setDateFrom] =
    useState("");

  const [dateTo, setDateTo] =
    useState("");

  const searchInputRef =
    useRef<HTMLInputElement>(null);

  const focusSearch = () => {
    searchInputRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });
    searchInputRef.current?.focus();
  };

  // The dashboard's Search button links here with ?search=1.
  useEffect(() => {
    if (
      new URLSearchParams(window.location.search).get("search") === "1"
    ) {
      searchInputRef.current?.focus();
    }
  }, []);

  const [processingId, setProcessingId] =
    useState<number | null>(null);

  const [rejectTarget, setRejectTarget] =
    useState<InternAttendance | null>(null);

  const [rejectReason, setRejectReason] =
    useState("");

  const [rejectError, setRejectError] =
    useState("");

  const [previewImage, setPreviewImage] =
    useState<string | null>(null);

  const [previewError, setPreviewError] =
    useState("");

  const [loadingPreview, setLoadingPreview] =
    useState(false);

  const [showProfileMenu, setShowProfileMenu] =
    useState(false);

  const profileDropdownRef =
    useRef<HTMLDivElement>(null);

  useEffect(() => {
    return () => {
      if (previewImage?.startsWith("blob:")) {
        URL.revokeObjectURL(previewImage);
      }
    };
  }, [previewImage]);

  const openAttendanceImage = async (filePath: string) => {
    setLoadingPreview(true);
    setPreviewError("");
    try {
      const url = await getProtectedUploadUrl(filePath, "supervisor");
      setPreviewImage(url);
    } catch (error) {
      setPreviewError(
        error instanceof Error ? error.message : "Unable to load attendance photo."
      );
    } finally {
      setLoadingPreview(false);
    }
  };

  /*
  |--------------------------------------------------------------------------
  | LOAD SUPERVISOR
  |--------------------------------------------------------------------------
  */

  useEffect(() => {
    const savedSupervisor =
      localStorage.getItem("supervisor");

    if (!savedSupervisor) {
      navigate("/");
      return;
    }

    try {
      const parsed: Supervisor =
        JSON.parse(savedSupervisor);

      if (!parsed.supervisor_id) {
        throw new Error(
          "Supervisor ID is missing."
        );
      }

      setSupervisor(parsed);

      /*
       * Keep supervisor_id in localStorage too.
       * This supports older parts of the application.
       */
      localStorage.setItem(
        "supervisor_id",
        parsed.supervisor_id
      );
    } catch (err) {
      console.error(
        "ERROR READING SUPERVISOR:",
        err
      );

      localStorage.removeItem(
        "supervisor"
      );
      localStorage.removeItem("supervisor_token");

      localStorage.removeItem(
        "supervisor_id"
      );

      navigate("/");
    }
  }, [navigate]);

  /*
  |--------------------------------------------------------------------------
  | FETCH ATTENDANCE
  |--------------------------------------------------------------------------
  */

  const fetchLogs = useCallback(
    async () => {
      if (!supervisor?.supervisor_id) {
        return;
      }

      try {
        setError("");

        const url =
          `${API_URL}/api/supervisor/attendance/` +
          `${encodeURIComponent(
            supervisor.supervisor_id
          )}`;

        console.log(
          "FETCHING SUPERVISOR ATTENDANCE:",
          url
        );

        const response =
          await fetch(url, withSupervisorAuth());

        /*
         * Try to read JSON even when the response
         * is not successful so we can see the
         * backend's actual message.
         */
        const data =
          await response.json();

        console.log(
          "SUPERVISOR ATTENDANCE RESPONSE:",
          data
        );

        if (!response.ok) {
          throw new Error(
            data?.message ||
              "Failed to fetch attendance."
          );
        }

        const attendance =
          Array.isArray(data?.attendance)
            ? data.attendance
            : [];

        /*
         * Normalize the backend data.
         */
        const normalized: InternAttendance[] =
          attendance.map(
            (item: any) => ({
              id: Number(item.id),

              student_id:
                item.student_id || "",

              student_name:
                item.student_name ||
                "Unknown Student",

              student_email:
                item.student_email || "",

              program:
                item.program || "",

              company:
                item.company || "",

              date:
                item.date
                  ? String(item.date).split("T")[0]
                  : "",

              time_in:
                item.time_in || null,

              break_time:
                item.break_time || null,

              time_out:
                item.time_out || null,

              hours:
                item.hours === null ||
                item.hours === undefined
                  ? null
                  : Number(item.hours),

              /*
               * IMPORTANT:
               * Your attendance table uses "note",
               * not "tasks".
               */
              note:
                item.note || null,

              status:
                item.status || "Pending",

              image_url:
                item.image_url || null,

              review_notes:
                item.review_notes || null,
            })
          );

        /*
         * Newest attendance first.
         */
        normalized.sort((a, b) => {
          const dateCompare =
            b.date.localeCompare(a.date);

          if (dateCompare !== 0) {
            return dateCompare;
          }

          return b.id - a.id;
        });

        setLogs(normalized);
      } catch (err) {
        console.error(
          "ERROR FETCHING SUPERVISOR ATTENDANCE:",
          err
        );

        setError(
          err instanceof Error
            ? err.message
            : "Failed to load attendance."
        );
      } finally {
        setLoading(false);
      }
    },
    [supervisor?.supervisor_id]
  );

  /*
  |--------------------------------------------------------------------------
  | INITIAL FETCH + AUTO REFRESH
  |--------------------------------------------------------------------------
  */

  useEffect(() => {
    if (!supervisor?.supervisor_id) {
      return;
    }

    /*
     * Fetch immediately.
     */
    fetchLogs();

    /*
     * Refresh every 10 seconds.
     * This means when a student submits attendance,
     * the supervisor interface will update automatically.
     */
    const interval =
      window.setInterval(() => {
        fetchLogs();
      }, 10000);

    return () => {
      window.clearInterval(interval);
    };
  }, [
    supervisor?.supervisor_id,
    fetchLogs,
  ]);

  /*
  |--------------------------------------------------------------------------
  | CLOSE PROFILE DROPDOWN
  |--------------------------------------------------------------------------
  */

  useEffect(() => {
    const handleClickOutside = (
      event: MouseEvent
    ) => {
      if (
        profileDropdownRef.current &&
        !profileDropdownRef.current.contains(
          event.target as Node
        )
      ) {
        setShowProfileMenu(false);
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

  /*
  |--------------------------------------------------------------------------
  | STATS
  |--------------------------------------------------------------------------
  */

  const stats = useMemo(() => {
    const pending =
      logs.filter(
        (log) =>
          log.status?.toLowerCase() ===
          "pending"
      ).length;

    const verified =
      logs.filter(
        (log) =>
          log.status?.toLowerCase() ===
          "verified"
      ).length;

    const rejected =
      logs.filter(
        (log) =>
          log.status?.toLowerCase() ===
          "rejected"
      ).length;

    const uniqueStudents =
      new Set(
        logs.map(
          (log) => log.student_id
        )
      ).size;

    return {
      pending,
      verified,
      rejected,
      uniqueStudents,
    };
  }, [logs]);

  /*
  |--------------------------------------------------------------------------
  | FILTER LOGS
  |--------------------------------------------------------------------------
  */

  const filteredLogs = useMemo(() => {
    const needle = search.trim().toLowerCase();

    return logs.filter(
      (log) =>
        (filter === "all" ||
          log.status?.toLowerCase() === filter) &&
        isWithinDateRange(log.date, dateFrom, dateTo) &&
        (!needle ||
          [
            log.student_name,
            log.student_id,
            log.student_email,
            log.company,
            log.program,
            log.note,
          ].some((value) =>
            String(value || "")
              .toLowerCase()
              .includes(needle)
          ))
    );
  }, [logs, filter, search, dateFrom, dateTo]);

  const hasExtraFilters =
    search.trim() !== "" || dateFrom !== "" || dateTo !== "";

  /*
  |--------------------------------------------------------------------------
  | HELPERS
  |--------------------------------------------------------------------------
  */

  const getInitials = (
    name: string
  ) => {
    if (!name) {
      return "SV";
    }

    const parts =
      name.trim().split(/\s+/);

    if (parts.length === 1) {
      return parts[0]
        .substring(0, 2)
        .toUpperCase();
    }

    return (
      `${parts[0][0]}${
        parts[parts.length - 1][0]
      }`
    ).toUpperCase();
  };

  const formatTime = (
    value: string | null
  ) => {
    if (!value) {
      return "—";
    }

    /*
     * IMPORTANT:
     * PostgreSQL returns timestamps in UTC
     * (e.g. "2026-09-27T07:55:00.000Z").
     *
     * The old code just sliced those raw
     * characters, so it displayed the UTC
     * clock digits as-is — every time_in/
     * time_out looked shifted by a fixed
     * offset from the real local time
     * (this is why times could look "stuck"
     * around a value like 7:55).
     *
     * Parse it as a real Date and format it
     * in the viewer's local timezone instead.
     */
    const parsed =
      new Date(value);

    if (Number.isNaN(parsed.getTime())) {
      return "—";
    }

    return parsed.toLocaleTimeString(
      [],
      {
        hour: "2-digit",
        minute: "2-digit",
      }
    );
  };

  const formatHours = (
    hours: number | null
  ) => {
    if (
      hours === null ||
      hours === undefined
    ) {
      return "0h";
    }

    return `${Number(hours).toFixed(2)}h`;
  };

  const statusBadge = (
    status: string
  ) => {
    switch (
      status?.toLowerCase()
    ) {
      case "verified":
        return "bg-emerald-50 text-emerald-600";

      case "rejected":
        return "bg-red-50 text-red-500";

      default:
        return "bg-amber-50 text-amber-600";
    }
  };

  /*
  |--------------------------------------------------------------------------
  | UPDATE ATTENDANCE STATUS
  |--------------------------------------------------------------------------
  */

  const updateStatus = async (
    log: InternAttendance,
    status:
      | "Verified"
      | "Rejected",
    reason?: string
  ) => {
    setProcessingId(log.id);

    try {
      const response =
        await fetch(
          `${API_URL}/api/attendance/${log.id}/status`,
          withSupervisorAuth({
            method: "PATCH",

            headers: {
              "Content-Type":
                "application/json",
            },

            body: JSON.stringify({
              status,
              reason:
                reason?.trim() || undefined,
            }),
          })
        );

      const data =
        await response.json();

      if (!response.ok) {
        throw new Error(
          data?.message ||
            "Failed to update attendance status."
        );
      }

      /*
       * Update the interface immediately.
       */
      setLogs((previous) =>
        previous.map((item) =>
          item.id === log.id
            ? {
                ...item,
                status,
                review_notes:
                  reason?.trim() ||
                  null,
              }
            : item
        )
      );

      /*
       * Fetch again from database to make
       * absolutely sure the UI matches the DB.
       */
      await fetchLogs();
    } catch (err) {
      console.error(
        "ERROR UPDATING ATTENDANCE:",
        err
      );

      setError(
        err instanceof Error
          ? err.message
          : "Failed to update attendance."
      );
    } finally {
      setProcessingId(null);
    }
  };

  /*
  |--------------------------------------------------------------------------
  | APPROVE
  |--------------------------------------------------------------------------
  */

  const handleApprove = (
    log: InternAttendance
  ) => {
    updateStatus(
      log,
      "Verified"
    );
  };

  /*
  |--------------------------------------------------------------------------
  | OPEN REJECT MODAL
  |--------------------------------------------------------------------------
  */

  const openRejectModal = (
    log: InternAttendance
  ) => {
    setRejectTarget(log);
    setRejectReason("");
    setRejectError("");
  };

  /*
  |--------------------------------------------------------------------------
  | CONFIRM REJECT
  |--------------------------------------------------------------------------
  */

  const handleConfirmReject =
    async () => {
      if (!rejectTarget) {
        return;
      }

      if (
        !rejectReason.trim()
      ) {
        setRejectError(
          "Please provide a reason for rejecting this log."
        );

        return;
      }

      await updateStatus(
        rejectTarget,
        "Rejected",
        rejectReason.trim()
      );

      setRejectTarget(null);
      setRejectReason("");
      setRejectError("");
    };

  /*
  |--------------------------------------------------------------------------
  | LOGOUT
  |--------------------------------------------------------------------------
  */

  const handleLogout = () => {
    localStorage.removeItem(
      "supervisor"
    );
    localStorage.removeItem("supervisor_token");

    localStorage.removeItem(
      "supervisor_id"
    );

    navigate("/");
  };

  /*
  |--------------------------------------------------------------------------
  | FILTER TABS
  |--------------------------------------------------------------------------
  */

  const filterTabs: {
    key: FilterKey;
    label: string;
    count: number;
  }[] = [
    {
      key: "all",
      label: "All",
      count: logs.length,
    },
    {
      key: "pending",
      label: "Pending",
      count: stats.pending,
    },
    {
      key: "verified",
      label: "Verified",
      count: stats.verified,
    },
    {
      key: "rejected",
      label: "Rejected",
      count: stats.rejected,
    },
  ];

  /*
  |--------------------------------------------------------------------------
  | RENDER
  |--------------------------------------------------------------------------
  */

  return (
    <div className="flex h-screen bg-slate-50">

      {/* ================================================================ */}
      {/* SIDEBAR */}
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
              Supervisor Portal
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
                "/supervisor/dashboard"
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

          {/* ATTENDANCE */}

          <button
            type="button"
            onClick={() =>
              navigate(
                "/supervisor/attendance"
              )
            }
            className="flex w-full items-center gap-3 rounded-lg border-l-2 border-amber-500 bg-white/5 px-3 py-2 text-left text-sm font-medium text-amber-500"
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
          </button>

          {/* INTERNS */}

          <button
            type="button"
            onClick={() =>
              navigate(
                "/supervisor/interns"
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
              <circle
                cx="9"
                cy="8"
                r="3"
              />
              <path d="M2 20c1.2-3.2 4-5 7-5s5.8 1.8 7 5" />
              <circle
                cx="17"
                cy="7"
                r="2.5"
              />
              <path d="M16 15c2.4.3 4.2 1.8 5 5" />
            </svg>

            My Interns
          </button>

          {/* TASKS */}

          <button
            type="button"
            onClick={() =>
              navigate(
                "/supervisor/tasks"
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
              <path d="m9 11 3 3L22 4M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
            </svg>

            Assign Tasks
          </button>

          {/* EVALUATIONS */}

          <button
            type="button"
            onClick={() =>
              navigate(
                "/supervisor/evaluation"
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
              <path d="m12 2 3.1 6.3 6.9 1-5 4.9L18.2 21 12 17.8 5.8 21 7 14.2l-5-4.9 6.9-1Z" />
            </svg>

            Evaluations
          </button>

          {/* DOCUMENTS */}

          <button
            type="button"
            onClick={() =>
              navigate(
                "/supervisor/documents"
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
              <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9Z" />
              <path d="M14 3v6h6" />
            </svg>

            Documents
          </button>

          {/* COMPLAINTS */}

          <button
            type="button"
            onClick={() =>
              navigate(
                "/supervisor/complaints"
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
              <path d="M10.3 3.9 2.7 17a1.8 1.8 0 0 0 1.5 2.7h15.6a1.8 1.8 0 0 0 1.5-2.7L13.7 3.9a2 2 0 0 0-3.4 0Z" />
              <path d="M12 9v4M12 16.5h.01" />
            </svg>

            Complaints
          </button>

        </nav>

        {/* BOTTOM SIDEBAR */}

        <div className="space-y-1 border-t border-white/10 px-3 py-2">

          <button
            type="button"
            onClick={() =>
              navigate(
                "/supervisor/profile"
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
              <circle
                cx="12"
                cy="8"
                r="4"
              />
              <path d="M4 21c1.5-4 5-6 8-6s6.5 2 8 6" />
            </svg>

            Profile
          </button>

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

      {/* ================================================================ */}
      {/* MAIN */}
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
            {supervisor?.company ||
              "Company"}{" "}
            · Supervisor Portal
          </p>

          <div className="flex items-center gap-3">

            {/* SEARCH */}

            <button
              type="button"
              onClick={focusSearch}
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

            {/* NOTIFICATION */}

            <NotificationBell
              role="supervisor"
              viewAllPath="/supervisor/notifications"
              buttonClassName="relative rounded-md p-1.5 text-white hover:bg-white/15"
            />

            {/* PROFILE */}

            <div
              className="relative"
              ref={
                profileDropdownRef
              }
            >
              <button
                type="button"
                onClick={() =>
                  setShowProfileMenu(
                    (previous) =>
                      !previous
                  )
                }
                className="flex items-center gap-2 rounded-md bg-white/10 px-2 py-1 hover:bg-white/20"
              >

                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-900 text-xs font-semibold text-white">
                  {getInitials(
                    supervisor?.name ||
                      ""
                  )}
                </div>

                <div className="text-right leading-tight">
                  <p className="text-xs font-semibold text-white">
                    {supervisor?.name ||
                      "Supervisor"}
                  </p>

                  <p className="text-[10px] text-white/80">
                    Supervisor
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
                  className={`text-white/70 transition-transform ${
                    showProfileMenu
                      ? "rotate-180"
                      : ""
                  }`}
                >
                  <path d="m6 9 6 6 6-6" />
                </svg>

              </button>

              {showProfileMenu && (
                <div className="absolute right-0 top-10 z-[100] w-56 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl">

                  <button
                    type="button"
                    onClick={() => {
                      setShowProfileMenu(
                        false
                      );

                      navigate(
                        "/supervisor/profile"
                      );
                    }}
                    className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm text-slate-600 hover:bg-slate-50"
                  >
                    View Profile
                  </button>

                  <div className="border-t border-slate-100">

                    <button
                      type="button"
                      onClick={
                        handleLogout
                      }
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

        {/* ============================================================= */}
        {/* CONTENT */}
        {/* ============================================================= */}

        <main className="flex-1 space-y-3 p-4">

          {/* PAGE HEADER */}

          <div>
            <h1 className="text-xl font-semibold text-slate-900">
              Attendance Approval
            </h1>

            <p className="text-sm text-slate-400">
              Review and approve your
              interns' daily attendance
              logs
            </p>
          </div>

          {/* ERROR */}

          {error && (
            <div className="flex items-center justify-between rounded-xl border border-red-200 bg-red-50 px-4 py-3">

              <p className="text-xs text-red-600">
                {error}
              </p>

              <button
                type="button"
                onClick={fetchLogs}
                className="rounded-lg bg-red-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-600"
              >
                Retry
              </button>

            </div>
          )}

          {/* STATS */}

          <div className="grid grid-cols-4 gap-2.5">

            <div className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-center">
              <p className="text-2xl font-semibold text-amber-500">
                {stats.pending}
              </p>

              <p className="mt-0.5 text-xs text-slate-400">
                Awaiting Review
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-center">
              <p className="text-2xl font-semibold text-emerald-500">
                {stats.verified}
              </p>

              <p className="mt-0.5 text-xs text-slate-400">
                Verified
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-center">
              <p className="text-2xl font-semibold text-red-500">
                {stats.rejected}
              </p>

              <p className="mt-0.5 text-xs text-slate-400">
                Rejected
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-center">
              <p className="text-2xl font-semibold text-slate-900">
                {stats.uniqueStudents}
              </p>

              <p className="mt-0.5 text-xs text-slate-400">
                Interns
              </p>
            </div>

          </div>

          {/* FILTER TABS */}

          <div className="flex items-center gap-2">

            {filterTabs.map(
              (tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() =>
                    setFilter(
                      tab.key
                    )
                  }
                  className={`rounded-lg px-4 py-1.5 text-sm font-medium ${
                    filter ===
                    tab.key
                      ? "bg-[#0c1322] text-white"
                      : "border border-slate-200 bg-white text-slate-500 hover:bg-slate-50"
                  }`}
                >
                  {tab.label}

                  <span className="ml-1 text-xs opacity-70">
                    ({tab.count})
                  </span>
                </button>
              )
            )}

          </div>

          {/* SEARCH + DATE RANGE */}

          <div className="flex flex-wrap items-center gap-3">
            <input
              ref={searchInputRef}
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search by intern, ID, company, or note"
              aria-label="Search attendance logs"
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 focus:border-slate-400 focus:outline-none sm:max-w-xs"
            />
            <DateRangeFilter
              from={dateFrom}
              to={dateTo}
              onChange={(from, to) => {
                setDateFrom(from);
                setDateTo(to);
              }}
            />
            {hasExtraFilters && (
              <span className="text-xs text-slate-400">
                {filteredLogs.length} matching
              </span>
            )}
          </div>

          {/* LOG LIST */}

          <div className="space-y-2">

            {loading ? (

              <div className="rounded-xl border border-slate-200 bg-white px-4 py-8 text-center">

                <div className="mx-auto mb-2 h-5 w-5 animate-spin rounded-full border-2 border-slate-200 border-t-amber-500" />

                <p className="text-xs text-slate-400">
                  Loading attendance
                  logs…
                </p>

              </div>

            ) : filteredLogs.length ===
              0 ? (

              <div className="rounded-xl border border-slate-200 bg-white px-4 py-8 text-center">

                <p className="text-sm font-medium text-slate-500">
                  No attendance
                  logs
                </p>

                <p className="mt-1 text-xs text-slate-400">
                  {filter ===
                  "pending"
                    ? "There are no attendance logs waiting for review."
                    : "No logs match this filter."}
                </p>

              </div>

            ) : (

              filteredLogs.map(
                (log) => (
                  <div
                    key={log.id}
                    className="rounded-xl border border-slate-200 bg-white p-3"
                  >

                    {/* LOG HEADER */}

                    <div className="flex items-start justify-between gap-3">

                      <div className="flex items-start gap-3">

                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-900 text-xs font-semibold text-white">
                          {getInitials(
                            log.student_name
                          )}
                        </div>

                        <div>

                          <p className="text-sm font-semibold text-slate-800">
                            {log.student_name}
                          </p>

                          <p className="text-xs text-slate-400">
                            {log.student_id}
                          </p>

                          <p className="mt-0.5 text-xs text-slate-400">
                            {log.date}
                            {" · "}
                            {formatTime(
                              log.time_in
                            )}
                            {" – "}
                            {formatTime(
                              log.time_out
                            )}
                            {" · "}
                            {formatHours(
                              log.hours
                            )}
                          </p>

                          {log.program && (
                            <p className="mt-0.5 text-xs text-slate-400">
                              {log.program}
                            </p>
                          )}

                          {log.note && (
                            <p className="mt-1 text-xs text-slate-500">
                              <span className="font-medium">
                                Note:
                              </span>{" "}
                              {log.note}
                            </p>
                          )}

                          {log.review_notes && (
                            <p className="mt-1 text-xs text-red-500">
                              <span className="font-medium">
                                Review:
                              </span>{" "}
                              {log.review_notes}
                            </p>
                          )}

                        </div>

                      </div>

                      <span
                        className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium ${statusBadge(
                          log.status
                        )}`}
                      >
                        {log.status}
                      </span>

                    </div>

                    {/* DETAILS */}

                    <div className="mt-2.5 flex items-center justify-between border-t border-slate-100 pt-2.5">

                      {/* PHOTO */}

                      {log.image_url ? (
                        <button
                          type="button"
                          onClick={() =>
                            void openAttendanceImage(log.image_url!)
                          }
                          disabled={loadingPreview}
                          className="flex items-center gap-1.5 text-xs font-medium text-blue-600 hover:underline"
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
                            <rect
                              x="3"
                              y="3"
                              width="18"
                              height="18"
                              rx="2"
                            />

                            <circle
                              cx="9"
                              cy="9"
                              r="2"
                            />

                            <path d="m21 15-5-5L5 21" />
                          </svg>

                          View verification
                          photo
                        </button>
                      ) : (
                        <span className="text-xs text-slate-300">
                          No photo attached
                        </span>
                      )}

                      {/* ACTIONS */}

                      {log.status?.toLowerCase() ===
                        "pending" && (
                        <div className="flex gap-2">

                          <button
                            type="button"
                            onClick={() =>
                              openRejectModal(
                                log
                              )
                            }
                            disabled={
                              processingId ===
                              log.id
                            }
                            className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-500 hover:bg-red-50 disabled:opacity-50"
                          >
                            Reject
                          </button>

                          <button
                            type="button"
                            onClick={() =>
                              handleApprove(
                                log
                              )
                            }
                            disabled={
                              processingId ===
                                log.id ||
                              !log.time_out
                            }
                            title={
                              log.time_out
                                ? undefined
                                : "Available after the student times out"
                            }
                            className="rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {processingId ===
                            log.id
                              ? "Approving…"
                              : "Approve"}
                          </button>

                        </div>
                      )}

                    </div>

                  </div>
                )
              )

            )}

          </div>
        </main>
      </div>

      {/* ================================================================ */}
      {/* IMAGE PREVIEW MODAL */}
      {/* ================================================================ */}

      {previewImage && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={() =>
            setPreviewImage(null)
          }
        >

          <div className="relative max-h-[90vh] max-w-4xl">

            <button
              type="button"
              onClick={() =>
                setPreviewImage(null)
              }
              className="absolute right-2 top-2 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-black/60 text-lg text-white hover:bg-black/80"
            >
              ×
            </button>

            <img
              src={previewImage}
              alt="Attendance verification"
              className="max-h-[85vh] max-w-full rounded-xl bg-white object-contain shadow-2xl"
              onClick={(event) =>
                event.stopPropagation()
              }
              onError={() => {
                console.error(
                  "FAILED TO LOAD IMAGE:",
                  previewImage
                );
              }}
            />

          </div>
        </div>
      )}
      {previewError && (
        <div
          role="alert"
          className="fixed bottom-4 right-4 z-[60] rounded-lg bg-red-600 px-4 py-3 text-sm text-white shadow-lg"
        >
          {previewError}
        </div>
      )}

      {/* ================================================================ */}
      {/* REJECT MODAL */}
      {/* ================================================================ */}

      {rejectTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          onClick={() =>
            setRejectTarget(null)
          }
        >

          <div
            onClick={(event) =>
              event.stopPropagation()
            }
            className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-5 shadow-xl"
          >

            <p className="text-sm font-semibold text-slate-900">
              Reject{" "}
              {rejectTarget.student_name}
              's attendance?
            </p>

            <p className="mt-1 text-xs text-slate-500">
              Attendance date:{" "}
              {rejectTarget.date}
            </p>

            <p className="mt-2 text-xs text-slate-500">
              Let the intern know what
              needs to be corrected.
            </p>

            <textarea
              rows={4}
              value={rejectReason}
              onChange={(event) => {
                setRejectReason(
                  event.target.value
                );

                if (
                  event.target.value.trim()
                ) {
                  setRejectError("");
                }
              }}
              placeholder="Enter rejection reason..."
              className="mt-3 w-full resize-none rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 outline-none focus:border-slate-400"
            />

            {rejectError && (
              <p className="mt-1.5 text-xs text-red-500">
                {rejectError}
              </p>
            )}

            <div className="mt-4 flex justify-end gap-2">

              <button
                type="button"
                onClick={() => {
                  setRejectTarget(
                    null
                  );

                  setRejectReason(
                    ""
                  );

                  setRejectError(
                    ""
                  );
                }}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={
                  handleConfirmReject
                }
                disabled={
                  processingId ===
                  rejectTarget.id
                }
                className="rounded-lg bg-red-500 px-4 py-2 text-sm font-semibold text-white hover:bg-red-600 disabled:opacity-50"
              >
                {processingId ===
                rejectTarget.id
                  ? "Rejecting…"
                  : "Confirm Reject"}
              </button>

            </div>

          </div>
        </div>
      )}

    </div>
  );
}

export default SupervisorAttendanceApproval;