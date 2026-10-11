import { useSearchParams } from "react-router-dom";
import StudentLayout from "../../layouts/StudentLayout";
import EvaluationsPanel from "./Feedback";
import ConcernsPanel from "./report";
import { RESOLUTION_TABS, type ResolutionTab } from "./resolutionTabs";

/*
|--------------------------------------------------------------------------
| RESOLUTION CENTER
|--------------------------------------------------------------------------
|
| The two things a student takes up with the people running their OJT, in
| one place: a concern they report to the coordinator, and evaluations
| (those written about them, and their own rating of the company). Each
| was a page of its own, at /report and /student/feedback; those addresses
| now come here, to the right tab.
|
| The tab is in the address (?tab=evaluations), so a link or the Back
| button lands on the tab that was open.
|
*/

export default function ResolutionCenter() {
  const [params, setParams] = useSearchParams();
  const tab: ResolutionTab = params.get("tab") === "evaluations" ? "evaluations" : "concerns";

  const show = (next: ResolutionTab) => {
    const updated = new URLSearchParams(params);
    updated.set("tab", next);
    setParams(updated, { replace: true });
  };

  return (
    <StudentLayout
      title="Resolution Center"
      subtitle="Report a concern, see your evaluations, and rate your company."
    >
      <div
        role="tablist"
        aria-label="Resolution Center"
        className="mb-5 flex gap-1 border-b border-slate-200"
      >
        {RESOLUTION_TABS.map((item) => (
          <button
            key={item.value}
            type="button"
            role="tab"
            id={`resolution-tab-${item.value}`}
            aria-selected={tab === item.value}
            aria-controls="resolution-panel"
            onClick={() => show(item.value)}
            className={`-mb-px flex h-11 items-center border-b-2 px-4 text-sm font-semibold ${
              tab === item.value
                ? "border-psu-600 text-psu-800"
                : "border-transparent text-slate-600 hover:text-slate-900"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div id="resolution-panel" role="tabpanel" aria-labelledby={`resolution-tab-${tab}`}>
        {tab === "concerns" ? <ConcernsPanel /> : <EvaluationsPanel />}
      </div>
    </StudentLayout>
  );
}
