import { useEffect, useState } from "react";
import { BrandLoader } from "../brand";
import { getProtectedUploadUrl } from "../lib/api";

/**
 * The photo taken at time-in. It is a private file, so it is fetched with
 * the viewer's own token rather than linked to directly.
 */
export default function AttendancePhoto({
  path,
  role,
}: {
  path: string | null;
  role: "student" | "supervisor" | "coordinator";
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!path) return;
    let active = true;
    let objectUrl: string | null = null;
    getProtectedUploadUrl(path, role)
      .then((result) => {
        objectUrl = result;
        if (active) setUrl(result);
        else URL.revokeObjectURL(result);
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      setUrl(null);
      setFailed(false);
    };
  }, [path, role]);

  return (
    <div>
      <p className="mb-1.5 text-xs font-medium text-slate-500">Time-in photo</p>
      <div className="flex min-h-40 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-slate-100">
        {!path ? (
          <p className="px-4 text-sm text-slate-500">No photo was attached.</p>
        ) : failed ? (
          <p className="px-4 text-sm text-slate-500">The photo could not be loaded.</p>
        ) : url ? (
          <a href={url} target="_blank" rel="noreferrer" title="Open full size">
            <img
              src={url}
              alt="Photo taken at time-in"
              className="max-h-80 w-full animate-fade-in object-contain"
            />
          </a>
        ) : (
          <BrandLoader variant="inline" process="attendance" message="Loading the time-in photo…" />
        )}
      </div>
    </div>
  );
}
