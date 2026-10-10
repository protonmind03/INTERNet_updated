import { lazy, Suspense, useEffect, type ComponentType } from "react";
import { BrowserRouter, Navigate, Routes, Route, useLocation } from "react-router-dom";
import { BrandLoader, RouteProgress } from "./brand";
import OfflineBanner from "./components/OfflineBanner";
import PushNotificationSettings from "./components/PushNotificationSettings";
import RealtimeNotificationBridge from "./components/RealtimeNotificationBridge";
import Toaster from "./components/Toaster";

import Login from "./pages/Login";
import ForgotPassword from "./pages/ForgotPassword";
import ChangePassword from "./pages/ChangePassword";
import Go from "./pages/Go";

/*
|--------------------------------------------------------------------------
| PAGE LOADING
|--------------------------------------------------------------------------
|
| The sign-in and password pages above are part of the first download. Every
| portal page below is its own file, fetched when it is first opened, so
| nobody downloads the two portals they cannot use. Once someone is signed
| in, the rest of their own portal is fetched quietly in the background, so
| moving between its pages does not wait.
|
*/

type PortalRole = "student" | "supervisor" | "coordinator";
type PageLoader = () => Promise<{ default: ComponentType }>;

const portalPages: Record<PortalRole, PageLoader[]> = {
  student: [],
  supervisor: [],
  coordinator: [],
};

function page(role: PortalRole, load: PageLoader) {
  portalPages[role].push(load);
  return lazy(() =>
    load().then(
      (module) => {
        sessionStorage.removeItem(RELOADED_FOR);
        return module;
      },
      (error: unknown) => {
        // A page file that will not load is usually one of two things: the
        // connection dropped for a moment, or a new version was published
        // and this tab still asks for the old files. The browser remembers
        // the failure, so asking again cannot work; a fresh load of the
        // address can. It is tried once per address; after that, or with no
        // connection at all, the error screen takes over.
        const here = window.location.pathname;
        if (navigator.onLine && sessionStorage.getItem(RELOADED_FOR) !== here) {
          sessionStorage.setItem(RELOADED_FOR, here);
          window.location.reload();
          return new Promise<never>(() => {});
        }
        throw error;
      }
    )
  );
}

const RELOADED_FOR = "inb_page_reload";

const fetchedPortals = new Set<PortalRole>();

/** Fetches the signed-in role's other pages once the first one has settled. */
function PortalPrefetch() {
  const { pathname } = useLocation();

  useEffect(() => {
    const role = localStorage.getItem("active_role") as PortalRole | null;
    if (!role || !(role in portalPages) || fetchedPortals.has(role)) return;
    if (!localStorage.getItem(`${role}_token`)) return;
    // Someone on a metered connection asked the browser to save data.
    const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
    if (connection?.saveData || !navigator.onLine) return;

    const timer = window.setTimeout(() => {
      if (!navigator.onLine) return;
      fetchedPortals.add(role);
      for (const load of portalPages[role]) void load().catch(() => {});
    }, 2000);
    return () => window.clearTimeout(timer);
  }, [pathname]);

  return null;
}

/** Shown while a page's file is on its way. */
function PageFallback() {
  return (
    <div className="app-canvas grid min-h-[calc(100dvh-var(--inb-top-inset))] place-items-center px-6">
      <BrandLoader variant="page" process="launch" />
    </div>
  );
}

/*
|--------------------------------------------------------------------------
| STUDENT PAGES
|--------------------------------------------------------------------------
*/

const Dashboard = page("student", () => import("./pages/student/dashboard"));
const DailyLog = page("student", () => import("./pages/student/dailylog"));
const MyTasks = page("student", () => import("./pages/student/task"));
const Schedule = page("student", () => import("./pages/student/sched"));
const Documents = page("student", () => import("./pages/student/document"));
const Report = page("student", () => import("./pages/student/report"));
const Notifications = page("student", () => import("./pages/student/notifications"));
const StudentFeedback = page("student", () => import("./pages/student/Feedback"));
const StudentTimeRecord = page("student", () => import("./pages/student/TimeRecord"));

/*
|--------------------------------------------------------------------------
| SUPERVISOR PAGES
|--------------------------------------------------------------------------
*/

const SupervisorDashboard = page("supervisor", () => import("./pages/supervisor/dashboardsp"));
const SupervisorAttendanceApproval = page("supervisor", () => import("./pages/supervisor/attendance"));
const SupervisorTasks = page("supervisor", () => import("./pages/supervisor/tasks"));
const StudentProfilePage = page("student", () => import("./pages/student/Profile"));
const SupervisorInterns = page("supervisor", () => import("./pages/supervisor/interns"));
const SupervisorEvaluation = page("supervisor", () => import("./pages/supervisor/evaluation"));
const SupervisorComplaints = page("supervisor", () => import("./pages/supervisor/complaints"));
const SupervisorProfilePage = page("supervisor", () => import("./pages/supervisor/profile"));
const SupervisorDocuments = page("supervisor", () => import("./pages/supervisor/documents"));
const SupervisorNotifications = page("supervisor", () => import("./pages/supervisor/notifications"));
const SupervisorTimeRecord = page("supervisor", () => import("./pages/supervisor/TimeRecord"));

/*
|--------------------------------------------------------------------------
| COORDINATOR PAGES
|--------------------------------------------------------------------------
*/

const CoordinatorDashboard = page("coordinator", () => import("./pages/coordinator/Dashboard"));
const CoordinatorStudents = page("coordinator", () => import("./pages/coordinator/Students"));
const CoordinatorSupervisors = page("coordinator", () => import("./pages/coordinator/Supervisors"));
const CoordinatorMonitoring = page("coordinator", () => import("./pages/coordinator/Monitoring"));
const CoordinatorComplaints = page("coordinator", () => import("./pages/coordinator/Complaints"));
const CoordinatorEvaluations = page("coordinator", () => import("./pages/coordinator/Evaluations"));
const CoordinatorAnalytics = page("coordinator", () => import("./pages/coordinator/Analytics"));
const CoordinatorProfile = page("coordinator", () => import("./pages/coordinator/Profile"));
const CoordinatorRequirements = page("coordinator", () => import("./pages/coordinator/Requirements"));
const CoordinatorDocuments = page("coordinator", () => import("./pages/coordinator/Documents"));
const CoordinatorAnnouncements = page("coordinator", () => import("./pages/coordinator/Announcements"));
const CoordinatorStudentRecord = page("coordinator", () => import("./pages/coordinator/StudentRecord"));
const CoordinatorNotifications = page("coordinator", () => import("./pages/coordinator/Notifications"));

// The brand kit preview only exists in development builds.
const BrandPreview = import.meta.env.DEV ? lazy(() => import("./brand/BrandPreview")) : null;

/** The thin line at the top of the screen that runs on every page change. */
function RouteLine() {
  const { pathname } = useLocation();
  return <RouteProgress trigger={pathname} />;
}

function App() {
  return (
    <BrowserRouter>
      <RouteLine />
      <PortalPrefetch />
      <Suspense fallback={<PageFallback />}>
      <Routes>

        {/* 
        |--------------------------------------------------------------------------
        | LOGIN
        |--------------------------------------------------------------------------
        */}

        <Route
          path="/"
          element={<Login />}
        />
        <Route
          path="/forgot-password"
          element={<ForgotPassword />}
        />
        <Route
          path="/reset-password"
          element={<ForgotPassword />}
        />
        <Route
          path="/change-password"
          element={<ChangePassword />}
        />
        {/* The installed app's shortcuts: /go/today, /go/tasks, /go/notifications. */}
        <Route
          path="/go/:target"
          element={<Go />}
        />

        {/* 
        |--------------------------------------------------------------------------
        | STUDENT
        |--------------------------------------------------------------------------
        */}

        <Route
          path="/student/dashboard"
          element={<Dashboard />}
        />

        <Route
          path="/daily-log"
          element={<DailyLog />}
        />

        <Route
          path="/task"
          element={<MyTasks />}
        />

        <Route
          path="/schedule"
          element={<Schedule />}
        />

        <Route
          path="/documents"
          element={<Documents />}
        />

        <Route
          path="/report"
          element={<Report />}
        />

        <Route
          path="/notifications"
          element={<Notifications />}
        />

        <Route
          path="/student/feedback"
          element={<StudentFeedback />}
        />

        <Route
          path="/time-record"
          element={<StudentTimeRecord />}
        />

        {/* 
        |--------------------------------------------------------------------------
        | SUPERVISOR
        |--------------------------------------------------------------------------
        */}
<Route
  path="/supervisor/dashboard"
  element={<SupervisorDashboard />}
/>

<Route
  path="/supervisor/attendance"
  element={<SupervisorAttendanceApproval />}
/>

<Route
  path="/supervisor/tasks"
  element={<SupervisorTasks />}
/>

<Route
  path="/supervisor/documents"
  element={<SupervisorDocuments />}
/>

        <Route
          path="/supervisor/notifications"
          element={<SupervisorNotifications />}
        />

        <Route
          path="/supervisor/time-record"
          element={<SupervisorTimeRecord />}
        />

<Route
  path="/profile"
  element={<StudentProfilePage />}
/>

<Route
  path="/supervisor/interns"
  element={<SupervisorInterns />}
/>

<Route
  path="/supervisor/evaluation"
  element={<SupervisorEvaluation />}
/>

<Route
  path="/supervisor/complaints"
  element={<SupervisorComplaints />}
/>

<Route
  path="/supervisor/profile"
  element={<SupervisorProfilePage />}
/>

        {/* 
        |--------------------------------------------------------------------------
        | COORDINATOR
        |--------------------------------------------------------------------------
        */}

        <Route
          path="/coordinator/dashboard"
          element={<CoordinatorDashboard />}
        />

        <Route
          path="/coordinator/students"
          element={<CoordinatorStudents />}
        />

        <Route
          path="/coordinator/students/:studentId"
          element={<CoordinatorStudentRecord />}
        />

        <Route
          path="/coordinator/supervisors"
          element={<CoordinatorSupervisors />}
        />

        <Route
          path="/coordinator/monitoring"
          element={<CoordinatorMonitoring />}
        />

        <Route
          path="/coordinator/complaints"
          element={<CoordinatorComplaints />}
        />

        <Route
          path="/coordinator/evaluations"
          element={<CoordinatorEvaluations />}
        />

        <Route
          path="/coordinator/analytics"
          element={<CoordinatorAnalytics />}
        />

        <Route
          path="/coordinator/profile"
          element={<CoordinatorProfile />}
        />

        <Route
          path="/coordinator/requirements"
          element={<CoordinatorRequirements />}
        />

        <Route
          path="/coordinator/documents"
          element={<CoordinatorDocuments />}
        />

        <Route
          path="/coordinator/announcements"
          element={<CoordinatorAnnouncements />}
        />

        <Route
          path="/coordinator/notifications"
          element={<CoordinatorNotifications />}
        />

        {BrandPreview && (
          <Route
            path="/brand-preview"
            element={<BrandPreview />}
          />
        )}

        {/* Unknown URLs go back to the login page instead of a blank screen. */}
        <Route path="*" element={<Navigate to="/" replace />} />

      </Routes>
      </Suspense>
      <RealtimeNotificationBridge />
      <PushNotificationSettings />
      <Toaster />
      <OfflineBanner />
    </BrowserRouter>
  );
}

export default App;
