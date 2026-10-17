import CoordinatorLayout from "../../layouts/CoordinatorLayout";
import SystemStatus from "./SystemStatus";

/** Profile settings › What is switched on: the system status card, as its own section. */
export default function SystemStatusPage() {
  return (
    <CoordinatorLayout title="What is switched on" subtitle="Email, push notifications, storage and the problems worth a look.">
      <div className="max-w-3xl">
        <SystemStatus />
      </div>
    </CoordinatorLayout>
  );
}
