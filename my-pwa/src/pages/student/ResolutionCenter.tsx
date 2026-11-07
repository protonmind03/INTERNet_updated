import { Navigate, useLocation, useSearchParams } from "react-router-dom";
import StudentLayout from "../../layouts/StudentLayout";
import EvaluationsPanel from "./Feedback";
import InternshipEvaluation from "./InternshipEvaluation";
import ConcernsPanel from "./report";
import SubTabs from "./SubTabs";
import { RESOLUTION_PATH, resolutionTabOf, type ResolutionTab } from "./resolutionTabs";

/*
|--------------------------------------------------------------------------
| RESOLUTION CENTER (revisions, November 2026)
|--------------------------------------------------------------------------
|
| In the Support folder. Three sections, named in the address (?tab=) so
| Back and links return to the right one:
|
|   Concerns                a concern the trainee reports to the coordinator
|   Feedback                the evaluations written about them, and their
|                           rating of the company
|   Internship evaluation   their Student-Intern's Feedback Form
|                           (FM-AA-INT-20) and the supervisor's Internship
|                           Evaluation Form (FM-AA-INT-13)
|
| Feedback was its own page until now; /student/feedback opens its section.
|
*/

const SECTIONS: readonly { value: ResolutionTab; label: string; short?: string; icon: "flag" | "star" | "clipboard"; subtitle: string }[] = [
  { value: "concerns", label: "Concerns", icon: "flag", subtitle: "Report a concern to the OJT coordinator" },
  { value: "feedback", label: "Feedback", icon: "star", subtitle: "Your evaluations, and your rating of the company" },
  { value: "evaluation", label: "Internship evaluation", short: "Evaluation", icon: "clipboard", subtitle: "Your feedback form, and your supervisor's evaluation" },
];

export default function ResolutionCenter() {
  const [params, setParams] = useSearchParams();
  const tab = resolutionTabOf(params.get("tab"));
  const section = SECTIONS.find((item) => item.value === tab) ?? SECTIONS[0];
  const go = (next: ResolutionTab) => {
    const rest = new URLSearchParams(params);
    if (next === "concerns") rest.delete("tab");
    else rest.set("tab", next);
    setParams(rest, { replace: true });
  };
  return (
    <StudentLayout title="Resolution Center" subtitle={section.subtitle}>
      <SubTabs label="Resolution Center sections" idPrefix="resolution" value={tab} onChange={go} options={SECTIONS} />
      <div id="resolution-panel" role="tabpanel" aria-labelledby={`resolution-${tab}`}>
        {tab === "concerns" && <ConcernsPanel />}
        {tab === "feedback" && <EvaluationsPanel showFinal={false} />}
        {tab === "evaluation" && <InternshipEvaluation />}
      </div>
    </StudentLayout>
  );
}

/** The old Feedback page: its section of the Resolution Center, keeping what else the address carried. */
export function StudentFeedback() {
  const { search, hash } = useLocation();
  const params = new URLSearchParams(search);
  params.set("tab", "feedback");
  return <Navigate to={{ pathname: RESOLUTION_PATH, search: `?${params}`, hash }} replace />;
}
