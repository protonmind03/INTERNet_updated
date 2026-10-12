import { Navigate, useSearchParams } from "react-router-dom";
import { internPath } from "./internPath";

/**
 * Evaluations used to be a page of their own with an intern to choose.
 * They are now the Evaluate tab of each intern's page, so this address
 * leads there: to the intern it named ("?intern="), or to the list of
 * interns to pick one. Kept so that old links and notifications still work.
 */
export default function SupervisorEvaluation() {
  const [params] = useSearchParams();
  const intern = params.get("intern");
  return <Navigate to={intern ? internPath(intern, "evaluate") : "/supervisor/interns"} replace />;
}
