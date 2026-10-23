import { lazy, Suspense, useEffect, type ComponentType } from "react";
import { BrowserRouter, Navigate, Routes, Route, useLocation } from "react-router-dom";
import { BrandLoader, RouteProgress } from "./brand";
import OfflineBanner from "./components/OfflineBanner";
import PushNotificationSettings from "./components/PushNotificationSettings";
import RealtimeNotificationBridge from "./components/RealtimeNotificationBridge";
import Toaster from "./components/Toaster";

import Door, { DoorRedirect } from "./pages/Door";
import ForgotPassword from "./pages/ForgotPassword";
import ChangePassword from "./pages/ChangePassword";
import Go from "./pages/Go";
import PageSkeleton from "./components/PageSkeleton";
import { HOME_PAGE, HOME_PATH } from "./lib/homePages";
import Help from "./pages/Help";
import CoordinatorHub, { MovedPage } from "./pages/coordinator/CoordinatorHub";

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
  const { pathname } = useLocation();
  // The first page after sign-in: its shape, not a spinner (Iteration 14, P2).
  if (Object.values(HOME_PATH).includes(pathname)) return <PageSkeleton />;
  return (
    <div className="app-canvas grid min-h-[calc(100dvh-var(--inb-top-inset))] place-items-center px-6">
      <BrandLoader variant="page" process="launch" />
    </div>
  );
}

/**
 * The old address of a page that is now a tab of the student's Resolution
 * Center. Whatever else the address carried is kept.
 */
function ToResolutionTab({ tab }: { tab: "concerns" | "evaluations" }) {
  const { search, hash } = useLocation();
  const params = new URLSearchParams(search);
  params.set("tab", tab);
  return <Navigate to={{ pathname: "/student/resolution", search: `?${params}`, hash }} replace />;
}

/** The old sign-in address: the landing page's doors (Vercel redirects it before the app loads). */
function ToDoors() {
  useEffect(() => {
    window.location.replace("/#doors");
  }, []);
  return null;
}

/*
|--------------------------------------------------------------------------
| STUDENT PAGES
|--------------------------------------------------------------------------
*/

const Dashboard = page("student", HOME_PAGE.student);
const DailyLog = page("student", () => import("./pages/student/dailylog"));
const MyTasks = page("student", () => import("./pages/student/task"));
const Schedule = page("student", () => import("./pages/student/sched"));
const Documents = page("student", () => import("./pages/student/document"));
const Notifications = page("student", () => import("./pages/student/notifications"));
const ResolutionCenter = page("student", () => import("./pages/student/ResolutionCenter"));
const StudentTimeRecord = page("student", () => import("./pages/student/TimeRecord"));
const StudentAnnouncements = page("student", () => import("./pages/student/Announcements"));
const StudentMessages = page("student", () => import("./pages/student/Messages"));
const StudentJournal = page("student", () => import("./pages/student/Journal"));
const StudentCompletion = page("student", () => import("./pages/student/Completion"));
const SupervisorAnnouncements = page("supervisor", () => import("./pages/supervisor/Announcements"));
const SupervisorMessages = page("supervisor", () => import("./pages/supervisor/Messages"));
const SupervisorJournals = page("supervisor", () => import("./pages/supervisor/Journals"));

/*
|--------------------------------------------------------------------------
| SUPERVISOR PAGES
|--------------------------------------------------------------------------
*/

const SupervisorDashboard = page("supervisor", HOME_PAGE.supervisor);
const SupervisorAttendanceApproval = page("supervisor", () => import("./pages/supervisor/attendance"));
const SupervisorTasks = page("supervisor", () => import("./pages/supervisor/tasks"));
const StudentProfilePage = page("student", () => import("./pages/student/Profile"));
const SupervisorInterns = page("supervisor", () => import("./pages/supervisor/interns"));
const SupervisorInternPage = page("supervisor", () => import("./pages/supervisor/InternPage"));
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

const CoordinatorDashboard = page("coordinator", HOME_PAGE.coordinator);
const CoordinatorStudents = page("coordinator", () => import("./pages/coordinator/Students"));
const CoordinatorSupervisors = page("coordinator", () => import("./pages/coordinator/Supervisors"));
const CoordinatorMonitoring = page("coordinator", () => import("./pages/coordinator/Monitoring"));
const CoordinatorComplaints = page("coordinator", () => import("./pages/coordinator/Complaints"));
const CoordinatorAppeals = page("coordinator", () => import("./pages/coordinator/Appeals"));
const CoordinatorEvaluations = page("coordinator", () => import("./pages/coordinator/Evaluations"));
const CoordinatorAnalytics = page("coordinator", () => import("./pages/coordinator/Analytics"));
const CoordinatorProfile = page("coordinator", () => import("./pages/coordinator/Profile"));
const CoordinatorRequirements = page("coordinator", () => import("./pages/coordinator/Requirements"));
const CoordinatorDocuments = page("coordinator", () => import("./pages/coordinator/Documents"));
const CoordinatorAnnouncements = page("coordinator", () => import("./pages/coordinator/Announcements"));
const CoordinatorMessages = page("coordinator", () => import("./pages/coordinator/Messages"));
const CoordinatorStudentRecord = page("coordinator", () => import("./pages/coordinator/StudentRecord"));
const CoordinatorNotifications = page("coordinator", () => import("./pages/coordinator/Notifications"));
const CoordinatorAudit = page("coordinator", () => import("./pages/coordinator/Audit"));
const CoordinatorCompanies = page("coordinator", () => import("./pages/coordinator/Companies"));
const CoordinatorTerms = page("coordinator", () => import("./pages/coordinator/Terms"));
const CoordinatorPrograms = page("coordinator", () => import("./pages/coordinator/Programs"));
const CoordinatorHolidays = page("coordinator", () => import("./pages/coordinator/Holidays"));
const CoordinatorAccounts = page("coordinator", () => import("./pages/coordinator/Coordinators"));
const CoordinatorSiteVisits = page("coordinator", () => import("./pages/coordinator/SiteVisits"));
const CoordinatorSystemStatus = page("coordinator", () => import("./pages/coordinator/SystemStatusPage"));
const CoordinatorCompanyPage = page("coordinator", () => import("./pages/coordinator/CompanyPage"));
const CoordinatorSupervisorPage = page("coordinator", () => import("./pages/coordinator/SupervisorPage"));

// The brand kit preview (and the loading prototypes, Iteration 14) only exists in development
// builds, or in a build made with VITE_BRAND_PREVIEW=true, so it can be tried on a test site.
// Production leaves it unset.
const BrandPreview =
  import.meta.env.DEV || import.meta.env.VITE_BRAND_PREVIEW === "true" ? lazy(() => import("./brand/BrandPreview")) : null;

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

        {/* Iteration 23: "/" is the landing page (index.html); inside the app it
            opens the portal of whoever is signed in, or the door used last. */}
        <Route
          path="/"
          element={<DoorRedirect />}
        />
        <Route path="/student/sign-in" element={<Door role="student" />} />
        <Route path="/supervisor/sign-in" element={<Door role="supervisor" />} />
        <Route path="/coordinator/sign-in" element={<Door role="coordinator" />} />
        <Route path="/login" element={<ToDoors />} />
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
        {/* What works with no connection, for every role (Iteration 12). */}
        <Route
          path="/help"
          element={<Help />}
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

        {/* Concerns and evaluations are the two tabs of the Resolution Center. */}
        <Route
          path="/student/resolution"
          element={<ResolutionCenter />}
        />
        <Route
          path="/report"
          element={<ToResolutionTab tab="concerns" />}
        />

        <Route
          path="/notifications"
          element={<Notifications />}
        />

        <Route
          path="/student/feedback"
          element={<ToResolutionTab tab="evaluations" />}
        />

        <Route
          path="/time-record"
          element={<StudentTimeRecord />}
        />

        <Route
          path="/announcements"
          element={<StudentAnnouncements />}
        />

        <Route
          path="/messages"
          element={<StudentMessages />}
        />

        <Route
          path="/journal"
          element={<StudentJournal />}
        />

        <Route
          path="/student/completion"
          element={<StudentCompletion />}
        />

        <Route
          path="/supervisor/announcements"
          element={<SupervisorAnnouncements />}
        />

        <Route
          path="/supervisor/messages"
          element={<SupervisorMessages />}
        />

        <Route
          path="/supervisor/journals"
          element={<SupervisorJournals />}
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
  path="/supervisor/interns/:studentId"
  element={<SupervisorInternPage />}
/>

{/* Evaluations are a tab of each intern's page now; this address leads there. */}
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
          element={<CoordinatorHub hub="students" pages={{ students: CoordinatorStudents, terms: CoordinatorTerms }} />}
        />

        <Route
          path="/coordinator/students/:studentId"
          element={<CoordinatorStudentRecord />}
        />

        <Route
          path="/coordinator/supervisors"
          element={<MovedPage />}
        />

        <Route
          path="/coordinator/monitoring"
          element={<CoordinatorMonitoring />}
        />

        <Route
          path="/coordinator/complaints"
          element={<MovedPage />}
        />

        <Route
          path="/coordinator/appeals"
          element={<MovedPage />}
        />

        <Route
          path="/coordinator/evaluations"
          element={<MovedPage />}
        />

        <Route
          path="/coordinator/analytics"
          element={<CoordinatorAnalytics />}
        />

        <Route
          path="/coordinator/resolution"
          element={<CoordinatorHub hub="resolution" pages={{ concerns: CoordinatorComplaints, evaluations: CoordinatorEvaluations, appeals: CoordinatorAppeals }} />}
        />

        <Route
          path="/coordinator/companies/:companyId"
          element={<CoordinatorCompanyPage />}
        />

        <Route
          path="/coordinator/supervisors/:supervisorId"
          element={<CoordinatorSupervisorPage />}
        />

        <Route
          path="/coordinator/profile"
          element={<CoordinatorHub hub="settings" pages={{ account: CoordinatorProfile, coordinators: CoordinatorAccounts, audit: CoordinatorAudit, status: CoordinatorSystemStatus }} />}
        />

        <Route
          path="/coordinator/requirements"
          element={<MovedPage />}
        />

        <Route
          path="/coordinator/documents"
          element={<CoordinatorHub hub="documents" pages={{ submissions: CoordinatorDocuments, requirements: CoordinatorRequirements }} />}
        />

        <Route
          path="/coordinator/announcements"
          element={<CoordinatorAnnouncements />}
        />

        <Route
          path="/coordinator/messages"
          element={<CoordinatorMessages />}
        />

        <Route
          path="/coordinator/notifications"
          element={<CoordinatorNotifications />}
        />

        <Route
          path="/coordinator/audit"
          element={<MovedPage />}
        />

        <Route
          path="/coordinator/companies"
          element={<CoordinatorHub hub="companies" pages={{ companies: CoordinatorCompanies, supervisors: CoordinatorSupervisors, "site-visits": CoordinatorSiteVisits }} />}
        />

        <Route
          path="/coordinator/terms"
          element={<MovedPage />}
        />

        <Route
          path="/coordinator/programs"
          element={<CoordinatorPrograms />}
        />

        <Route
          path="/coordinator/holidays"
          element={<CoordinatorHolidays />}
        />

        <Route
          path="/coordinator/coordinators"
          element={<MovedPage />}
        />

        <Route
          path="/coordinator/site-visits"
          element={<MovedPage />}
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
