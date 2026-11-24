import { useEffect, useState } from "react";
import { Button, Card, ConfirmDialog, EmptyState, ErrorNotice, SkeletonRows, StatusBadge } from "../../components/ui";
import AdminLayout from "../../layouts/AdminLayout";
import { formatFileSize } from "../../lib/files";
import { phStamp } from "../../lib/phTime";
import { errorText, toast } from "../../lib/toast";
import { adminRequest } from "./request";

/*
| Backups (Phase 1.7): the last backup runs and photo removals, and "Back
| up uploaded files now". The restore drill is recorded on System status.
| No key is ever shown: the server reads none here.
*/

type Run = {
  id: number;
  kind: "database" | "uploads" | "restore_drill";
  status: "running" | "ok" | "failed";
  started_at: string;
  finished_at: string | null;
  size_bytes: number | null;
  detail: string | null;
};
type Purge = { id: number; ran_at: string; retention_days: number; removed: number; failed: number; by_hand: boolean };
type Backups = {
  status: { uploads: { needed: boolean }; restore_drill: { last: { at: string } | null; due: boolean } };
  runs: Run[];
  photo_purges: Purge[];
};

const KIND: Record<Run["kind"], string> = { database: "Database", uploads: "Uploaded files", restore_drill: "Restore drill" };

function runState(run: Run): { label: string; tone: "good" | "bad" | "info" } {
  if (run.status === "ok") return { label: "OK", tone: "good" };
  if (run.status === "failed") return { label: "Failed", tone: "bad" };
  return { label: "Running", tone: "info" };
}

export default function AdminBackups() {
  const [data, setData] = useState<Backups | null>(null);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  const [asking, setAsking] = useState(false);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    adminRequest<Backups>("/api/admin/backups", { signal: controller.signal })
      .then((loaded) => {
        setData(loaded);
        setError("");
      })
      .catch((loadError) => {
        if (!controller.signal.aborted) setError(errorText(loadError, "The backups could not be loaded."));
      });
    return () => controller.abort();
  }, [reload]);

  const startPack = async () => {
    setStarting(true);
    try {
      const done = await adminRequest<{ message: string }>("/api/admin/backups/uploads", { method: "POST" });
      toast.success(done.message);
      setAsking(false);
      setReload((value) => value + 1);
    } catch (startError) {
      toast.error(errorText(startError, "The backup could not start."));
    } finally {
      setStarting(false);
    }
  };

  return (
    <AdminLayout
      title="Backups"
      actions={
        data?.status.uploads.needed ? (
          <Button variant="secondary" icon="upload" onClick={() => setAsking(true)}>
            Back up uploaded files now
          </Button>
        ) : undefined
      }
    >
      <div className="max-w-4xl space-y-4">
        {error ? (
          <ErrorNotice message={error} onRetry={() => setReload((value) => value + 1)} />
        ) : data === null ? (
          <Card className="p-4"><SkeletonRows rows={5} /></Card>
        ) : (
          <>
            <p className="text-sm text-slate-600">
              {data.status.restore_drill.last
                ? `Last restore drill ${phStamp(new Date(data.status.restore_drill.last.at))}.`
                : "No restore drill recorded yet."}{" "}
              {data.status.restore_drill.due ? "One is due; record it on System status once it is done." : ""}
            </p>
            <Card className="overflow-hidden">
              <h2 className="border-b border-slate-100 px-4 py-3 text-[16px] font-bold text-slate-900">Last runs</h2>
              {data.runs.length === 0 ? (
                <EmptyState icon="layers" title="No backup has run yet" description="The nightly backup runs as its own service; the deployment notes say how to set it up." />
              ) : (
                <ul className="divide-y divide-slate-100">
                  {data.runs.map((run) => {
                    const state = runState(run);
                    return (
                      <li key={run.id} className="flex flex-wrap items-start gap-x-4 gap-y-1 px-4 py-3">
                        <div className="min-w-0 flex-1 basis-60">
                          <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-slate-900">
                            {KIND[run.kind]}
                            <StatusBadge status={state.label} tone={state.tone} />
                          </p>
                          {run.detail && <p className="mt-0.5 break-words text-sm text-slate-600">{run.detail}</p>}
                        </div>
                        <div className="text-right text-sm text-slate-600">
                          <p className="font-mono text-[13px]">{phStamp(new Date(run.finished_at ?? run.started_at))}</p>
                          {run.size_bytes !== null && <p>{formatFileSize(run.size_bytes)}</p>}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>
            <Card className="overflow-hidden">
              <h2 className="border-b border-slate-100 px-4 py-3 text-[16px] font-bold text-slate-900">Old time-in photos removed</h2>
              {data.photo_purges.length === 0 ? (
                <EmptyState icon="image" title="None removed yet" description="Once PHOTO_RETENTION_DAYS is set, photos past the limit are removed each night at 2:30 AM." />
              ) : (
                <ul className="divide-y divide-slate-100">
                  {data.photo_purges.map((purge) => (
                    <li key={purge.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
                      <span className="text-slate-800">
                        {purge.removed === 1 ? "1 photo" : `${purge.removed} photos`} older than {purge.retention_days} days
                        {purge.failed > 0 ? `, ${purge.failed} could not be deleted` : ""}
                        {purge.by_hand ? ", run by hand" : ""}
                      </span>
                      <span className="font-mono text-[13px] text-slate-600">{phStamp(new Date(purge.ran_at))}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </>
        )}
      </div>
      <ConfirmDialog
        open={asking}
        title="Back up uploaded files now?"
        message="Packs every uploaded file on the server's disk, encrypts the pack and sends it to the backup store. It runs in the background; its result shows here when it ends."
        confirmLabel="Back up uploaded files now"
        busy={starting}
        onConfirm={() => void startPack()}
        onCancel={() => setAsking(false)}
      />
    </AdminLayout>
  );
}
