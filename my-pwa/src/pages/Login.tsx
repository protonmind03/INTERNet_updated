import { useEffect, useRef, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { LoginScreen, SplashScreen, type Role } from "../brand";
import { API_URL } from "../lib/api";

/*
|--------------------------------------------------------------------------
| SIGN IN
|--------------------------------------------------------------------------
|
| The page itself (phone, tablet and desktop layouts) is the brand kit's
| LoginScreen. This file supplies what happens when someone signs in: the
| request for their role, what is stored for the session, and where they
| are taken afterwards.
|
*/

const HOME: Record<Role, string> = {
  student: "/student/dashboard",
  supervisor: "/supervisor/dashboard",
  coordinator: "/coordinator/dashboard",
};

const ROLES: Role[] = ["student", "supervisor", "coordinator"];
const LAST_ROLE_KEY = "inb_last_role";

// Local development only: the seeded demo accounts, so the form is ready to
// submit. None of this is included in a production build.
const DEV_ACCOUNTS: Record<Role, { identifier: string; password: string }> = {
  student: { identifier: "student.demo@internet.test", password: "StudentDemo123!" },
  supervisor: { identifier: "supervisor.demo@internet.test", password: "SupervisorDemo123!" },
  coordinator: { identifier: "coordinator@internet.psu.edu.ph", password: "Coordinator123!" },
};

/** The role chosen the last time someone signed in on this device. */
function lastRole(): Role {
  try {
    const stored = localStorage.getItem(LAST_ROLE_KEY);
    return ROLES.includes(stored as Role) ? (stored as Role) : "student";
  } catch {
    return "student";
  }
}

/** The role already signed in on this device, if its token is still stored. */
function signedInRole(): Role | null {
  try {
    const active = localStorage.getItem("active_role");
    return ROLES.includes(active as Role) && localStorage.getItem(`${active}_token`)
      ? (active as Role)
      : null;
  } catch {
    return null;
  }
}

export default function Login() {
  const navigate = useNavigate();

  // Read once, when the page opens: someone who is already signed in is
  // taken to their portal. Signing in on this page must not trigger it, or
  // the launch screen and the first-login password step would be skipped.
  const [alreadySignedIn] = useState(signedInRole);

  // Set by the session guard when it sends an expired session back here.
  const [notice, setNotice] = useState(() => sessionStorage.getItem("session_notice") || "");
  // After a successful sign-in the role's launch screen shows briefly, then the portal opens.
  const [launch, setLaunch] = useState<{ role: Role; to: string } | null>(null);
  // Whether the account that just signed in has to set a new password first.
  const mustChangePassword = useRef(false);

  useEffect(() => {
    sessionStorage.removeItem("session_notice");
    document.title = "Sign in · INTERNet";
  }, []);

  useEffect(() => {
    if (!launch) return;
    const timer = window.setTimeout(() => navigate(launch.to), 1200);
    return () => window.clearTimeout(timer);
  }, [launch, navigate]);

  const rememberRole = (role: Role) => {
    try {
      localStorage.setItem(LAST_ROLE_KEY, role);
    } catch {
      /* private mode: the page just opens on Student next time */
    }
  };

  const signIn = async (role: Role, identifier: string, password: string) => {
    setNotice("");
    const response = await fetch(`${API_URL}/api/login/${role}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: identifier, password }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      // With no readable message the page uses the role's own wording.
      throw new Error(typeof data.message === "string" ? data.message : "");
    }

    const account = data[role];
    localStorage.setItem(role, JSON.stringify(account));
    localStorage.setItem(`${role}_id`, String(account[`${role}_id`]));
    localStorage.setItem(`${role}_token`, data.token);
    localStorage.setItem("active_role", role);
    window.dispatchEvent(new Event("internet-auth-changed"));
    rememberRole(role);

    mustChangePassword.current = Boolean(data.must_change_password);
    try {
      sessionStorage.removeItem("inb_splash_seen");
    } catch {
      /* private mode: nothing to clear */
    }
  };

  if (alreadySignedIn) return <Navigate to={HOME[alreadySignedIn]} replace />;

  return (
    <>
      {launch && <SplashScreen role={launch.role} />}
      <LoginScreen
        initialRole={lastRole()}
        onRoleChange={rememberRole}
        onSubmit={signIn}
        onSignedIn={(role) =>
          setLaunch({
            role,
            to: mustChangePassword.current ? `/change-password?role=${role}` : HOME[role],
          })
        }
        forgotHref={(role) => `/forgot-password?role=${role}`}
        notice={notice || undefined}
        prefill={import.meta.env.DEV ? (role) => DEV_ACCOUNTS[role] : undefined}
      />
    </>
  );
}
