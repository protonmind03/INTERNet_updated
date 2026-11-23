import { useEffect, useState } from "react";
import Icon from "../../components/Icon";
import { coordinatorRequest } from "./request";

/*
| Phase 1.6: until an OJT Director account exists, the coordinators keep the
| office's powers (programs, rules, coordinator accounts), and their Home
| says so. Once a Director exists it is gone.
*/
export default function OfficeNotice() {
  const [noDirector, setNoDirector] = useState(false);

  useEffect(() => {
    let current = true;
    coordinatorRequest<{ director_exists: boolean }>("/api/coordinator/office")
      .then((data) => current && setNoDirector(data.director_exists === false))
      .catch(() => undefined);
    return () => {
      current = false;
    };
  }, []);

  if (!noDirector) return null;
  return (
    <p className="mt-6 flex gap-2 rounded-xl bg-sky-50 px-4 py-3 text-sm text-sky-900 ring-1 ring-inset ring-sky-200">
      <Icon name="info" size={16} className="mt-0.5 shrink-0" />
      No OJT Director account yet; ask the system administrator to create one. Until then you manage the programs, the rules and the coordinator accounts.
    </p>
  );
}
