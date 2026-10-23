import { Navigate, useLocation } from "react-router-dom";
import StudentLayout from "../../layouts/StudentLayout";
import EvaluationsPanel from "./Feedback";
import ConcernsPanel from "./report";
import { FEEDBACK_PATH } from "./resolutionTabs";

/*
|--------------------------------------------------------------------------
| RESOLUTION CENTER AND FEEDBACK
|--------------------------------------------------------------------------
|
| Two pages, as More lists them: the Resolution Center, for a concern the
| trainee reports to the coordinator; and Feedback, for the evaluations
| written about them and their own rating of the company. They were two
| tabs of one page, so More's "Feedback" opened the Resolution Center and
| lit the wrong entry; an old ?tab=evaluations address is sent to
| Feedback, with whatever else it carried.
|
*/

export default function ResolutionCenter() {
  const { search, hash } = useLocation();
  const params = new URLSearchParams(search);
  if (params.get("tab") === "evaluations") {
    params.delete("tab");
    const rest = params.toString();
    return <Navigate to={{ pathname: FEEDBACK_PATH, search: rest ? `?${rest}` : "", hash }} replace />;
  }
  return (
    <StudentLayout title="Resolution Center" subtitle="Report a concern to the OJT coordinator">
      <ConcernsPanel />
    </StudentLayout>
  );
}

export function StudentFeedback() {
  return (
    <StudentLayout title="Feedback" subtitle="Your evaluations, and your rating of the company">
      <EvaluationsPanel />
    </StudentLayout>
  );
}
