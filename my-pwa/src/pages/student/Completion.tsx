import StudentLayout from "../../layouts/StudentLayout";
import CompletionChecklist from "./CompletionChecklist";

/**
 * The checklist on a page of its own. It is shown on Profile now; this
 * page stays for links and notifications that still point here.
 */
export default function Completion() {
  return (
    <StudentLayout title="Completion" subtitle="What is left before your OJT is done.">
      <CompletionChecklist title="Checklist" />
    </StudentLayout>
  );
}
