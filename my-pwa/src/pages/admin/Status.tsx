import { useEffect, useState } from "react";
import PrivacyWarnings from "../../components/PrivacyWarnings";
import SystemStatusCard from "../../components/SystemStatusCard";
import { Card, ErrorNotice, SkeletonRows, StatusBadge } from "../../components/ui";
import AdminLayout from "../../layouts/AdminLayout";
import { formatFileSize } from "../../lib/files";
import { errorText } from "../../lib/toast";
import { adminRequest } from "./request";

/*
| System status (Phase 1.7): the server's own checks (the database, the
| migrations, the uploads kept, in totals), then the card of what is
| switched on, the problems log and the restore drill, which the
| coordinators had until this portal existed (components/SystemStatusCard).
*/

type Health = {
  database: { ok: boolean; answered_in_ms?: number };
  migrations: { latest: string | null; count: number; waiting: string[] };
  server: { uptime_minutes: number; node: string };
  uploads: { kept_in: string; by_kind: Array<{ role: string; kind: string; files: number; bytes: number }> };
};

const UPLOAD_KINDS: Record<string, string> = {
  document: "Documents",
  task_file: "Task files",
  evidence: "Evidence",
  picture: "Pictures",
  signature: "Signatures",
};

function uptime(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  return hours < 48 ? `${hours} h` : `${Math.floor(hours / 24)} days`;
}

export default function AdminStatus() {
  const [health, setHealth] = useState<Health | null>(null);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    adminRequest<Health>("/api/admin/health", { signal: controller.signal })
      .then((data) => {
        setHealth(data);
        setError("");
      })
      .catch((loadError) => {
        if (!controller.signal.aborted) setError(errorText(loadError, "The server's checks could not be read."));
      });
    return () => controller.abort();
  }, [reload]);

  return (
    <AdminLayout title="System status">
      <div className="max-w-3xl space-y-4">
        <PrivacyWarnings role="admin" />
        <Card className="p-4 sm:p-5">
          <h2 className="text-[16px] font-bold text-slate-900">The server</h2>
          {error ? (
            <div className="mt-3"><ErrorNotice message={error} onRetry={() => setReload((value) => value + 1)} /></div>
          ) : health === null ? (
            <div className="mt-3"><SkeletonRows rows={3} /></div>
          ) : (
            <ul className="mt-3 divide-y divide-slate-100 border-t border-slate-100">
              <Check
                name="Database"
                state={health.database.ok ? "OK" : "Off"}
                about={health.database.ok ? `Answers, in ${health.database.answered_in_ms ?? 0} ms.` : "Did not answer."}
              />
              <Check
                name="Migrations"
                state={health.migrations.waiting.length === 0 ? "OK" : "Needs attention"}
                about={
                  health.migrations.waiting.length === 0 ? (
                    <>All {health.migrations.count} have run. The last is <span className="font-mono text-[13px]">{health.migrations.latest ?? "none"}</span>.</>
                  ) : (
                    <>Waiting to run: <span className="font-mono text-[13px]">{health.migrations.waiting.join(", ")}</span>. They run at the next deploy (npm run db:migrate).</>
                  )
                }
              />
              <Check
                name="Server"
                state="OK"
                about={<>Up for {uptime(health.server.uptime_minutes)}, on Node <span className="font-mono text-[13px]">{health.server.node}</span>.</>}
              />
            </ul>
          )}
          {health && (
            <section aria-labelledby="uploads-heading" className="mt-4 border-t border-slate-100 pt-4">
              <h3 id="uploads-heading" className="text-sm font-semibold text-slate-900">Uploaded files, in totals</h3>
              <p className="mt-1 text-sm text-slate-600">Kept on {health.uploads.kept_in}. Totals by kind only; never whose.</p>
              {health.uploads.by_kind.length === 0 ? (
                <p className="mt-2 text-sm text-slate-600">Nothing uploaded yet.</p>
              ) : (
                <table className="mt-2 w-full text-left text-sm">
                  <caption className="sr-only">Uploaded files by kind</caption>
                  <thead className="text-slate-600">
                    <tr>
                      <th scope="col" className="py-1.5 font-medium">From</th>
                      <th scope="col" className="py-1.5 font-medium">Kind</th>
                      <th scope="col" className="py-1.5 text-right font-medium">Files</th>
                      <th scope="col" className="py-1.5 text-right font-medium">Size</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {health.uploads.by_kind.map((row) => (
                      <tr key={`${row.role}:${row.kind}`}>
                        <td className="py-1.5 text-slate-700">{row.role === "student" ? "Trainees" : "Supervisors"}</td>
                        <td className="py-1.5 text-slate-700">{UPLOAD_KINDS[row.kind] ?? row.kind}</td>
                        <td className="py-1.5 text-right tabular-nums text-slate-700">{row.files}</td>
                        <td className="py-1.5 text-right tabular-nums text-slate-700">{formatFileSize(row.bytes)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>
          )}
        </Card>
        <SystemStatusCard request={adminRequest} base="/api/admin" />
      </div>
    </AdminLayout>
  );
}

function Check({ name, state, about }: { name: string; state: "OK" | "Needs attention" | "Off"; about: React.ReactNode }) {
  return (
    <li className="py-3">
      <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-slate-900">
        {name}
        <StatusBadge status={state} tone={state === "OK" ? "good" : state === "Off" ? "neutral" : "bad"} />
      </p>
      <p className="mt-0.5 text-sm text-slate-600">{about}</p>
    </li>
  );
}
