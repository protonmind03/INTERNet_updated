import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { API_URL } from "../lib/api";

type Role = "student" | "supervisor" | "coordinator";

export default function Login() {
  const navigate = useNavigate();

  const [role, setRole] = useState<Role>(
    import.meta.env.DEV ? "coordinator" : "student"
  );
  const [email, setEmail] = useState(
    import.meta.env.DEV
      ? "coordinator@internet.psu.edu.ph"
      : ""
  );
  const [password, setPassword] = useState(
    import.meta.env.DEV ? "Coordinator123!" : ""
  );
  const [error, setError] = useState("");
  // Set by the session guard when it sends an expired session back here.
  const [notice, setNotice] = useState(
    () => sessionStorage.getItem("session_notice") || ""
  );
  useEffect(() => {
    sessionStorage.removeItem("session_notice");
  }, []);

  const handleLogin = async () => {
    setNotice("");
    setError("");

    /*
    |--------------------------------------------------------------------------
    | STUDENT LOGIN
    |--------------------------------------------------------------------------
    */

    if (role === "student") {
      try {
        const response = await fetch(
          `${API_URL}/api/login/student`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              email,
              student_id: email,
              password,
            }),
          }
        );

        const data = await response.json();

        if (!response.ok) {
          setError(
            data.message || "Invalid student email or password."
          );
          return;
        }

        // Save logged-in student
        localStorage.setItem(
          "student",
          JSON.stringify(data.student)
        );

        localStorage.setItem(
          "student_id",
          String(data.student.student_id)
        );
        localStorage.setItem("student_token", data.token);
        localStorage.setItem("active_role", "student");
        window.dispatchEvent(new Event("internet-auth-changed"));

        // Go to student dashboard
        navigate(
          data.must_change_password
            ? "/change-password?role=student"
            : "/student/dashboard"
        );
      } catch (error) {
        console.error("STUDENT LOGIN ERROR:", error);
        setError("Unable to connect to the server.");
      }

      return;
    }

    /*
    |--------------------------------------------------------------------------
    | SUPERVISOR LOGIN
    |--------------------------------------------------------------------------
    */

    if (role === "supervisor") {
      try {
        const response = await fetch(
          `${API_URL}/api/login/supervisor`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              email,
              password,
            }),
          }
        );

        const data = await response.json();

        if (!response.ok) {
          setError(
            data.message ||
              "Invalid supervisor email or password."
          );
          return;
        }

        // Save logged-in supervisor
        localStorage.setItem(
          "supervisor",
          JSON.stringify(data.supervisor)
        );

        localStorage.setItem(
          "supervisor_id",
          String(data.supervisor.supervisor_id)
        );
        localStorage.setItem("supervisor_token", data.token);
        localStorage.setItem("active_role", "supervisor");
        window.dispatchEvent(new Event("internet-auth-changed"));

        // Go to supervisor dashboard
        navigate(
          data.must_change_password
            ? "/change-password?role=supervisor"
            : "/supervisor/dashboard"
        );
      } catch (error) {
        console.error("SUPERVISOR LOGIN ERROR:", error);
        setError("Unable to connect to the server.");
      }

      return;
    }

    /*
    |--------------------------------------------------------------------------
    | COORDINATOR LOGIN
    |--------------------------------------------------------------------------
    */

    if (role === "coordinator") {
      try {
        const response = await fetch(
          `${API_URL}/api/login/coordinator`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              email,
              password,
            }),
          }
        );

        const data = await response.json();

        if (!response.ok) {
          setError(
            data.message || "Invalid coordinator email or password."
          );
          return;
        }

        // Save logged-in coordinator
        localStorage.setItem(
          "coordinator",
          JSON.stringify(data.coordinator)
        );

        localStorage.setItem(
          "coordinator_id",
          String(data.coordinator.coordinator_id)
        );

        localStorage.setItem(
          "coordinator_token",
          data.token
        );
        localStorage.setItem("active_role", "coordinator");
        window.dispatchEvent(new Event("internet-auth-changed"));

        // Go to coordinator dashboard
        navigate(
          data.must_change_password
            ? "/change-password?role=coordinator"
            : "/coordinator/dashboard"
        );
      } catch (error) {
        console.error("COORDINATOR LOGIN ERROR:", error);
        setError("Unable to connect to the server.");
      }

      return;
    }
  };

  return (
    <div className="flex h-screen bg-slate-50">

      {/* LEFT BRAND PANEL */}
      <div className="hidden w-1/2 flex-col justify-between bg-gradient-to-br from-[#0c1322] to-[#16233f] p-8 text-white md:flex">

        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-500 font-bold text-slate-900">
            IN
          </div>

          <div>
            <p className="text-sm font-semibold leading-tight">
              INTERNet
            </p>

            <p className="text-[11px] leading-tight text-slate-400">
              OJT Monitoring System
            </p>
          </div>
        </div>

        <div>
          <h2 className="text-2xl font-semibold leading-snug">
            Track your On-the-Job Training,
            <br />
            all in one place.
          </h2>

          <p className="mt-2 max-w-sm text-sm text-slate-300">
            Log attendance, manage tasks, submit documents,
            and stay on top of deadlines — whether you're a
            student or a supervisor.
          </p>

          <div className="mt-6 flex gap-2">
            <span className="rounded-full bg-white/10 px-3 py-1 text-xs">
              Attendance tracking
            </span>

            <span className="rounded-full bg-white/10 px-3 py-1 text-xs">
              Task management
            </span>

            <span className="rounded-full bg-white/10 px-3 py-1 text-xs">
              Document review
            </span>
          </div>
        </div>

        <p className="text-xs text-slate-400">
          Pangasinan State University · Lingayen Campus
        </p>
      </div>

      {/* RIGHT LOGIN PANEL */}
      <div className="flex w-full flex-col items-center justify-center p-6 md:w-1/2">
        <div className="w-full max-w-sm">

          {/* MOBILE LOGO */}
          <div className="mb-6 flex items-center gap-2.5 md:hidden">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-500 font-bold text-slate-900">
              IN
            </div>

            <div>
              <p className="text-sm font-semibold leading-tight text-slate-900">
                INTERNet
              </p>

              <p className="text-[11px] leading-tight text-slate-400">
                OJT Monitoring System
              </p>
            </div>
          </div>

          <h1 className="text-xl font-semibold text-slate-900">
            Welcome back
          </h1>

          <p className="mt-1 text-sm text-slate-400">
            Log in to your account to continue.
          </p>

          {/* ROLE TOGGLE */}
          <div className="mt-4 grid grid-cols-3 gap-2 rounded-lg bg-slate-100 p-1">

            <button
              type="button"
              onClick={() => {
                setRole("student");
                setEmail(
                  import.meta.env.DEV
                    ? "student.demo@internet.test"
                    : ""
                );
                setPassword(
                  import.meta.env.DEV ? "StudentDemo123!" : ""
                );
                setError("");
              }}
              className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                role === "student"
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              Student
            </button>

            <button
              type="button"
              onClick={() => {
                setRole("supervisor");
                setEmail(
                  import.meta.env.DEV
                    ? "supervisor.demo@internet.test"
                    : ""
                );
                setPassword(
                  import.meta.env.DEV ? "SupervisorDemo123!" : ""
                );
                setError("");
              }}
              className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                role === "supervisor"
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              Supervisor
            </button>

            <button
              type="button"
              onClick={() => {
                setRole("coordinator");
                setEmail(
                  import.meta.env.DEV
                    ? "coordinator@internet.psu.edu.ph"
                    : ""
                );
                setPassword(
                  import.meta.env.DEV ? "Coordinator123!" : ""
                );
                setError("");
              }}
              className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                role === "coordinator"
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              Coordinator
            </button>

          </div>

          {notice && !error && (
            <div
              role="status"
              className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700"
            >
              {notice}
            </div>
          )}

          {/* ERROR MESSAGE */}
          {error && (
            <div className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">
              {error}
            </div>
          )}

          {/* STUDENT FORM */}
          {role === "student" && (
            <form
              className="mt-4 space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                handleLogin();
              }}
            >

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">
                  Student ID / Email
                </label>

                <input
                  type="text"
                  placeholder="e.g. 2023-00123 or you@psu.edu.ph"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:border-slate-400 focus:outline-none"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">
                  Password
                </label>

                <input
                  type="password"
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:border-slate-400 focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-between text-xs">
                <label className="flex items-center gap-1.5 text-slate-500">
                  <input
                    type="checkbox"
                    className="rounded border-slate-300"
                  />
                  Remember me
                </label>

                <Link
                  to="/forgot-password?role=student"
                  className="font-medium text-blue-600 hover:underline"
                >
                  Forgot password?
                </Link>
              </div>

              <button
                type="submit"
                className="w-full rounded-lg bg-amber-500 py-2 text-sm font-semibold text-slate-900 hover:bg-amber-400"
              >
                Log In as Student
              </button>

            </form>
          )}

          {/* SUPERVISOR FORM */}
          {role === "supervisor" && (
            <form
              className="mt-4 space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                handleLogin();
              }}
            >

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">
                  Company Email
                </label>

                <input
                  type="email"
                  placeholder="e.g. supervisor@techcorp.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:border-slate-400 focus:outline-none"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">
                  Password
                </label>

                <input
                  type="password"
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:border-slate-400 focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-between text-xs">
                <label className="flex items-center gap-1.5 text-slate-500">
                  <input
                    type="checkbox"
                    className="rounded border-slate-300"
                  />
                  Remember me
                </label>

                <Link
                  to="/forgot-password?role=supervisor"
                  className="font-medium text-blue-600 hover:underline"
                >
                  Forgot password?
                </Link>
              </div>

              <button
                type="submit"
                className="w-full rounded-lg bg-[#0c1322] py-2 text-sm font-semibold text-white hover:bg-[#16233f]"
              >
                Log In as Supervisor
              </button>

            </form>
          )}

          {/* COORDINATOR FORM */}
          {role === "coordinator" && (
            <form
              className="mt-4 space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                handleLogin();
              }}
            >

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">
                  Coordinator Email
                </label>

                <input
                  type="email"
                  placeholder="e.g. coordinator@internet.psu.edu.ph"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:border-indigo-400 focus:outline-none"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">
                  Password
                </label>

                <input
                  type="password"
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:border-indigo-400 focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-between text-xs">
                <label className="flex items-center gap-1.5 text-slate-500">
                  <input
                    type="checkbox"
                    className="rounded border-slate-300"
                  />
                  Remember me
                </label>

                <Link
                  to="/forgot-password?role=coordinator"
                  className="font-medium text-indigo-600 hover:underline"
                >
                  Forgot password?
                </Link>
              </div>

              <button
                type="submit"
                className="w-full rounded-lg bg-indigo-600 py-2 text-sm font-semibold text-white hover:bg-indigo-500"
              >
                Log In as Coordinator
              </button>

            </form>
          )}

          <p className="mt-5 text-center text-xs text-slate-400">
            Don't have an account?{" "}

            Ask your OJT Coordinator to create an account.
          </p>

        </div>
      </div>
    </div>
  );
}
