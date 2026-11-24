import { useEffect, useState } from "react";
import { Card, ErrorNotice, SkeletonRows, StatusBadge } from "../../components/ui";
import AdminLayout from "../../layouts/AdminLayout";
import { errorText } from "../../lib/toast";
import { adminRequest } from "./request";

/*
| Production warnings (Phase 1.7): the settings a live site must have, each
| set or not. Read-only; a setting's value never leaves the server. The
| go-live checklist (docs/GO-LIVE-CHECKLIST.md) says how to set each.
*/

type Warning = { key: string; ok: boolean; title: string; detail: string };

export default function AdminWarnings() {
  const [warnings, setWarnings] = useState<Warning[] | null>(null);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    adminRequest<{ warnings: Warning[] }>("/api/admin/warnings", { signal: controller.signal })
      .then((data) => {
        setWarnings(data.warnings);
        setError("");
      })
      .catch((loadError) => {
        if (!controller.signal.aborted) setError(errorText(loadError, "The settings could not be read."));
      });
    return () => controller.abort();
  }, [reload]);

  const open = warnings?.filter((warning) => !warning.ok).length ?? 0;

  return (
    <AdminLayout title="Warnings">
      <div className="max-w-3xl space-y-4">
        {error ? (
          <ErrorNotice message={error} onRetry={() => setReload((value) => value + 1)} />
        ) : warnings === null ? (
          <Card className="p-4"><SkeletonRows rows={6} /></Card>
        ) : (
          <>
            <p className="text-sm text-slate-700">
              {open === 0 ? "Every setting a live site needs is in place." : `${open} of ${warnings.length} need attention before the site goes live. The go-live checklist says how to set each.`}
            </p>
            <Card>
              <ul className="divide-y divide-slate-100">
                {warnings.map((warning) => (
                  <li key={warning.key} className="px-4 py-3">
                    <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-slate-900">
                      {warning.title}
                      <StatusBadge status={warning.ok ? "OK" : "Needs attention"} tone={warning.ok ? "good" : "bad"} />
                    </p>
                    <p className="mt-0.5 text-sm text-slate-600">{warning.detail}</p>
                  </li>
                ))}
              </ul>
            </Card>
          </>
        )}
      </div>
    </AdminLayout>
  );
}
