import { useEffect, useState } from "react";
import { Card, ProgressBar } from "../../components/ui";
import { formatFileSize } from "../../lib/files";
import { coordinatorRequest } from "./request";

type Usage = { used_bytes: number; files_today: number; quota_bytes: number; daily_files: number };

/**
 * How much of their room for uploads a student has used: documents, task
 * files, concern evidence and pictures (time-in photos are not counted).
 * Shown under the student's documents so a coordinator can see why an
 * upload was refused. Nothing is shown when the server has no such count.
 */
export default function UploadUsage({ studentId }: { studentId: string }) {
  const [usage, setUsage] = useState<Usage | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    coordinatorRequest<Usage>(`/api/coordinator/students/${encodeURIComponent(studentId)}/upload-usage`, {
      signal: controller.signal,
    })
      .then(setUsage)
      .catch(() => {
        /* An older server, or no connection: the line is left out. */
      });
    return () => controller.abort();
  }, [studentId]);

  if (!usage) return null;
  const share = usage.quota_bytes > 0 ? Math.min(100, Math.round((usage.used_bytes / usage.quota_bytes) * 100)) : 0;
  const nearlyFull = share >= 90;

  return (
    <Card className="mt-4 p-4 sm:p-5">
      <h3 className="text-sm font-semibold text-slate-900">Uploads</h3>
      <p className="mt-1 text-sm text-slate-600">
        {formatFileSize(usage.used_bytes)} of {formatFileSize(usage.quota_bytes)} used ({share}%).{" "}
        {usage.files_today === 1 ? "1 file" : `${usage.files_today} files`} today, of {usage.daily_files} allowed in a
        day. Time-in photos are not counted.
        {nearlyFull && " Nearly full: further uploads will be refused once it is."}
      </p>
      <div className="mt-2">
        <ProgressBar value={share} label={`Uploads: ${share}% of the room used`} />
      </div>
    </Card>
  );
}
