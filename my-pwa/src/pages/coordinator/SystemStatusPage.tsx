import CoordinatorLayout from "../../layouts/CoordinatorLayout";
import PrivacyWarnings from "../../components/PrivacyWarnings";
import SystemStatus from "./SystemStatus";

/** Profile settings › What is switched on: the system status card, as its own section. */
export default function SystemStatusPage() {
  return (
    <CoordinatorLayout title="System status" subtitle="Email, push notifications, storage and the problems worth a look.">
      <div className="max-w-3xl space-y-4">
        <PrivacyWarnings role="coordinator" />
        <SystemStatus />
      </div>
    </CoordinatorLayout>
  );
}
