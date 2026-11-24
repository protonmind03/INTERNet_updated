import { useEffect, useState } from "react";
import { API_URL, withRoleAuth } from "../lib/api";
import Icon from "./Icon";

/*
| Phase 1.8: on a live site, the privacy settings that are missing (students
| not asked to agree to the notice, old photos kept with no limit, the notice
| still the draft). Shown to the coordinators, the OJT Director and the
| administrator; a test or development server shows nothing.
*/
export default function PrivacyWarnings({ role }: { role: "coordinator" | "director" | "admin" }) {
  const [warnings, setWarnings] = useState<string[]>([]);

  useEffect(() => {
    let live = true;
    fetch(`${API_URL}/api/privacy/warnings`, withRoleAuth(role))
      .then((response) => (response.ok ? response.json() : { warnings: [] }))
      .then((data: { warnings?: string[] }) => {
        if (live) setWarnings(data.warnings ?? []);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [role]);

  if (warnings.length === 0) return null;
  return (
    <section aria-labelledby="privacy-warnings-heading" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-900 ring-1 ring-inset ring-red-200">
      <h2 id="privacy-warnings-heading" className="flex items-center gap-2 font-semibold">
        <Icon name="alert" size={16} />
        Privacy settings missing on this live site
      </h2>
      <ul className="mt-1.5 list-disc space-y-1 pl-6">
        {warnings.map((warning) => (
          <li key={warning}>{warning}</li>
        ))}
      </ul>
    </section>
  );
}
