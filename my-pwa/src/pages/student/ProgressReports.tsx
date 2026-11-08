import { Navigate, useLocation, useSearchParams } from "react-router-dom";
import StudentLayout from "../../layouts/StudentLayout";
import DailyReports from "./DailyReports";
import WeeklyJournal from "./Journal";
import MonthlyReports from "./MonthlyReports";

/*
|--------------------------------------------------------------------------
| PROGRESS REPORTS (the Reports folder, revisions November 2026)
|--------------------------------------------------------------------------
|
| The weekly report grew into three, under one name the trainee chose:
|
|   Daily     a report for each day, with events and their photos
|             (DailyReports.tsx); saves as you type
|   Weekly    the weekly report the supervisor reviews, as before
|             (Journal.tsx), printable as FM-AA-INT-19
|   Monthly   the month put together from the rest, with the trainee's
|             summary and highlights (MonthlyReports.tsx)
|
| change1108: the three are tabs of the Reports folder itself
| (pages/student/hubs.ts), so this page no longer draws its own row of tabs.
| The address stays /journal so links and notifications keep working;
| ?view= names the part (daily when absent). An older link with only
| ?spot= (a returned weekly report) is moved to ?view=weekly, so the
| folder lights the right tab.
|
*/

type View = "daily" | "weekly" | "monthly";

export default function ProgressReports() {
  const [params] = useSearchParams();
  const { pathname } = useLocation();
  const asked = params.get("view");
  if (!asked && params.has("spot")) {
    const rest = new URLSearchParams(params);
    rest.set("view", "weekly");
    return <Navigate to={`${pathname}?${rest.toString()}`} replace />;
  }
  const view: View = asked === "weekly" || asked === "monthly" ? asked : "daily";
  return (
    <StudentLayout title={view === "daily" ? "Daily reports" : view === "weekly" ? "Weekly report" : "Monthly reports"}>
      {view === "daily" && <DailyReports />}
      {view === "weekly" && <WeeklyJournal />}
      {view === "monthly" && <MonthlyReports />}
    </StudentLayout>
  );
}
