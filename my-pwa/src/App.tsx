import { lazy, Suspense } from "react";
import { BrowserRouter, Navigate, Routes, Route, useLocation } from "react-router-dom";
import { RouteProgress } from "./brand";
import OfflineBanner from "./components/OfflineBanner";
import PushNotificationSettings from "./components/PushNotificationSettings";
import RealtimeNotificationBridge from "./components/RealtimeNotificationBridge";
import Toaster from "./components/Toaster";

import Login from "./pages/Login";
import ForgotPassword from "./pages/ForgotPassword";
import ChangePassword from "./pages/ChangePassword";

/*
|--------------------------------------------------------------------------
| STUDENT PAGES
|--------------------------------------------------------------------------
*/

import Dashboard from "./pages/student/dashboard";
import DailyLog from "./pages/student/dailylog";
import MyTasks from "./pages/student/task";
import Schedule from "./pages/student/sched";
import Documents from "./pages/student/document";
import Report from "./pages/student/report";
import Notifications from "./pages/student/notifications";
import StudentFeedback from "./pages/student/Feedback";
import StudentTimeRecord from "./pages/student/TimeRecord";

/*
|--------------------------------------------------------------------------
| SUPERVISOR PAGES
|--------------------------------------------------------------------------
*/

import SupervisorDashboard from "./pages/supervisor/dashboardsp";
import SupervisorAttendanceApproval from "./pages/supervisor/attendance";
import SupervisorTasks from "./pages/supervisor/tasks";
import StudentProfilePage from "./pages/student/Profile";
import SupervisorInterns from "./pages/supervisor/interns";
import SupervisorEvaluation from "./pages/supervisor/evaluation";
import SupervisorComplaints from "./pages/supervisor/complaints";
import SupervisorProfilePage from "./pages/supervisor/profile";
import SupervisorDocuments from "./pages/supervisor/documents";
import SupervisorNotifications from "./pages/supervisor/notifications";
import SupervisorTimeRecord from "./pages/supervisor/TimeRecord";

/*
|--------------------------------------------------------------------------
| COORDINATOR PAGES
|--------------------------------------------------------------------------
*/

import CoordinatorDashboard from "./pages/coordinator/Dashboard";
import CoordinatorStudents from "./pages/coordinator/Students";
import CoordinatorSupervisors from "./pages/coordinator/Supervisors";
import CoordinatorMonitoring from "./pages/coordinator/Monitoring";
import CoordinatorComplaints from "./pages/coordinator/Complaints";
import CoordinatorEvaluations from "./pages/coordinator/Evaluations";
import CoordinatorAnalytics from "./pages/coordinator/Analytics";
import CoordinatorProfile from "./pages/coordinator/Profile";
import CoordinatorRequirements from "./pages/coordinator/Requirements";
import CoordinatorDocuments from "./pages/coordinator/Documents";
import CoordinatorAnnouncements from "./pages/coordinator/Announcements";
import CoordinatorStudentRecord from "./pages/coordinator/StudentRecord";

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

        {BrandPreview && (
          <Route
            path="/brand-preview"
            element={<Suspense fallback={null}><BrandPreview /></Suspense>}
          />
        )}

        {/* Unknown URLs go back to the login page instead of a blank screen. */}
        <Route path="*" element={<Navigate to="/" replace />} />

      </Routes>
      <RealtimeNotificationBridge />
      <PushNotificationSettings />
      <Toaster />
      <OfflineBanner />
    </BrowserRouter>
  );
}

export default App;
