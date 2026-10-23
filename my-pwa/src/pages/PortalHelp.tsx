import CoordinatorLayout from "../layouts/CoordinatorLayout";
import StudentLayout from "../layouts/StudentLayout";
import SupervisorLayout from "../layouts/SupervisorLayout";
import { HelpCentre, HelpSections } from "./Help";

/*
| Help inside each portal: the same answers as the public Help centre
| (pages/Help.tsx), for the signed-in role only, with the portal's menu
| still around it. The public /help stays for anyone not signed in.
*/

export function StudentHelp() {
  return (
    <StudentLayout title="Help" subtitle="Answers for trainees">
      <div className="space-y-6">
        <HelpCentre fixedRole="student" />
        <HelpSections role="student" />
      </div>
    </StudentLayout>
  );
}

export function SupervisorHelp() {
  return (
    <SupervisorLayout title="Help" subtitle="Answers for supervisors">
      <div className="space-y-6">
        <HelpCentre fixedRole="supervisor" />
        <HelpSections role="supervisor" />
      </div>
    </SupervisorLayout>
  );
}

export function CoordinatorHelp() {
  return (
    <CoordinatorLayout title="Help" subtitle="Answers for the OJT coordinator">
      <div className="space-y-6">
        <HelpCentre fixedRole="coordinator" />
        <HelpSections role="coordinator" />
      </div>
    </CoordinatorLayout>
  );
}
