import { useEffect, useState } from "react";
import Icon from "../../components/Icon";
import SystemStatusCard from "../../components/SystemStatusCard";
import { coordinatorRequest } from "./request";

/*
| Phase 1.7: the status card is the system administrator's. Until an active
| administrator account exists the coordinator keeps it, as before; after
| that the server answers only whether something is wrong
| ({ managed_by_admin, something_wrong }), and this says so in a line.
*/
export default function SystemStatus() {
  const [managed, setManaged] = useState<{ something_wrong: boolean } | null | undefined>(undefined);

  useEffect(() => {
    const controller = new AbortController();
    coordinatorRequest<{ managed_by_admin?: boolean; something_wrong?: boolean }>("/api/coordinator/system-status", { signal: controller.signal })
      .then((data) => setManaged(data.managed_by_admin ? { something_wrong: data.something_wrong === true } : null))
      .catch(() => {
        if (!controller.signal.aborted) setManaged(null);
      });
    return () => controller.abort();
  }, []);

  if (managed === undefined) return null;
  if (managed === null) return <SystemStatusCard request={coordinatorRequest} base="/api/coordinator" />;
  return managed.something_wrong ? (
    <p role="status" className="flex gap-2 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-inset ring-amber-200">
      <Icon name="info" size={16} className="mt-0.5 shrink-0" />
      Something is wrong with the system. The system administrator sees it on their System status page.
    </p>
  ) : (
    <p role="status" className="flex gap-2 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-900 ring-1 ring-inset ring-emerald-200">
      <Icon name="check" size={16} className="mt-0.5 shrink-0" />
      Nothing is wrong. The system administrator looks after email, backups and the server.
    </p>
  );
}
