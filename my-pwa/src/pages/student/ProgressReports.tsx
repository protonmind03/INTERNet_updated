import { useSearchParams } from "react-router-dom";
import StudentLayout from "../../layouts/StudentLayout";
import DailyReports from "./DailyReports";
import WeeklyJournal from "./Journal";
import MonthlyReports from "./MonthlyReports";
import SubTabs from "./SubTabs";

/*
|--------------------------------------------------------------------------
| PROGRESS REPORTS (Tasks folder, revisions November 2026)
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
| The address stays /journal so links and notifications keep working;
| ?view= names the part (daily when absent). A notification about a
| returned weekly report opens ?view=weekly.
|
*/

type View = "daily" | "weekly" | "monthly";

const VIEWS: readonly { value: View; label: string; icon: "calendar" | "note" | "chart"; subtitle: string }[] = [
  { value: "daily", label: "Daily", icon: "calendar", subtitle: "A report for each day, with events and photos" },
  { value: "weekly", label: "Weekly", icon: "note", subtitle: "Your weekly report, reviewed by your supervisor" },
  { value: "monthly", label: "Monthly", icon: "chart", subtitle: "Your month, put together, in your own words" },
];

export default function ProgressReports() {
  const [params, setParams] = useSearchParams();
  const asked = params.get("view");
  // A link from before the reports grew (a returned weekly report) still lands on Weekly.
  const view: View = asked === "weekly" || asked === "monthly" || asked === "daily" ? asked : params.has("spot") ? "weekly" : "daily";
  const current = VIEWS.find((item) => item.value === view) ?? VIEWS[0];
  const go = (next: View) => {
    const rest = new URLSearchParams(params);
    rest.delete("day");
    if (next === "daily") rest.delete("view");
    else rest.set("view", next);
    setParams(rest, { replace: true });
  };
  return (
    <StudentLayout title="Progress reports" subtitle={current.subtitle}>
      <SubTabs label="Progress reports" idPrefix="reports" value={view} onChange={go} options={VIEWS} />
      <div id="reports-panel" role="tabpanel" aria-labelledby={`reports-${view}`}>
        {view === "daily" && <DailyReports />}
        {view === "weekly" && <WeeklyJournal />}
        {view === "monthly" && <MonthlyReports />}
      </div>
    </StudentLayout>
  );
}
