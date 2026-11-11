import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import Icon from "../../components/Icon";
import { EmptyState, ErrorNotice, SkeletonRows } from "../../components/ui";
import StudentLayout from "../../layouts/StudentLayout";
import { API_URL, getProtectedUploadUrl, withStudentAuth } from "../../lib/api";
import { pictureUrl } from "../../lib/attachments";
import { formatDate } from "../../lib/format";
import { saveToPhone, usePendingPhotos } from "../../lib/pendingPhotos";
import { useAccount } from "../../lib/session";
import SubTabs from "./SubTabs";

/*
|--------------------------------------------------------------------------
| ALBUM (Profile, revisions November 2026)
|--------------------------------------------------------------------------
|
| Every picture the trainee has in INTERNet, in one place, newest first and
| grouped by month: photos on their reports (events, weekly reports,
| time-out notes) and the files they uploaded as requirements. Filters:
| All, Reports, Documents, and Taken in INTERNet (the app's own camera).
| Photos still waiting on this phone show first, with a way to save copies.
|
| The album only points at files already kept for the reports and
| documents (backend GET /api/students/:id/album); nothing is copied, so it
| costs no extra storage. Small previews load as the grid comes into view;
| the full picture loads when one is opened. Medical and psychological
| certificates are never listed.
|
*/

type Picture = {
  id: number;
  source: "report_entry" | "journal" | "attendance";
  mime_type: string;
  caption: string | null;
  has_preview: boolean;
  captured_in_app: boolean;
  taken_at: string;
  title: string;
  day: string | null;
};

type Document = { id: number; title: string; original_filename: string; file_path: string; mime_type: string; status: string; taken_at: string };

type Item =
  | ({ kind: "picture"; key: string } & Picture)
  | ({ kind: "document"; key: string } & Document);

type Filter = "all" | "reports" | "documents" | "camera";

const SOURCE: Record<Picture["source"], { label: string; to: (day: string | null) => string }> = {
  report_entry: { label: "Daily report", to: (day) => (day ? `/journal?day=${day}` : "/journal") },
  journal: { label: "Weekly report", to: () => "/journal?view=weekly" },
  attendance: { label: "Time-out note", to: () => "/daily-log" },
};

export default function Album() {
  const student = useAccount("student");
  const studentId = student?.student_id;
  const [pictures, setPictures] = useState<Picture[]>([]);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [newestFirst, setNewestFirst] = useState(true);
  const [open, setOpen] = useState<Item | null>(null);
  const { photos: waiting } = usePendingPhotos();

  const load = useCallback(async () => {
    if (!studentId) return;
    try {
      const response = await fetch(`${API_URL}/api/students/${encodeURIComponent(studentId)}/album`, withStudentAuth());
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || "Could not load your album.");
      setPictures(data.pictures ?? []);
      setDocuments(data.documents ?? []);
      setError("");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load your album.");
    } finally {
      setLoading(false);
    }
  }, [studentId]);

  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  const items = useMemo<Item[]>(() => {
    const all: Item[] = [
      ...pictures.map((picture) => ({ ...picture, kind: "picture" as const, key: `p${picture.id}` })),
      ...documents.map((doc) => ({ ...doc, kind: "document" as const, key: `d${doc.id}` })),
    ];
    const shown = all.filter((item) =>
      filter === "all" ? true : filter === "documents" ? item.kind === "document" : filter === "camera" ? item.kind === "picture" && item.captured_in_app : item.kind === "picture"
    );
    return shown.sort((a, b) => (newestFirst ? -1 : 1) * a.taken_at.localeCompare(b.taken_at));
  }, [pictures, documents, filter, newestFirst]);

  const months = useMemo(() => {
    const groups = new Map<string, Item[]>();
    for (const item of items) {
      const month = new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", month: "long", year: "numeric" }).format(new Date(item.taken_at));
      groups.set(month, [...(groups.get(month) ?? []), item]);
    }
    return [...groups.entries()];
  }, [items]);

  const counts = {
    all: pictures.length + documents.length,
    reports: pictures.length,
    documents: documents.length,
    camera: pictures.filter((picture) => picture.captured_in_app).length,
  };

  return (
    <StudentLayout title="Album" subtitle="Every photo and file you have in INTERNet" folderLabel={{ icon: "album", title: "Album" }}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Link to="/profile" className="inline-flex min-h-11 items-center gap-1 text-sm font-bold text-psu-700 hover:underline">
          <Icon name="chevron-left" size={16} />
          Profile
        </Link>
        <button type="button" onClick={() => setNewestFirst((value) => !value)} className="inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-white px-3 text-sm font-semibold text-slate-700 ring-1 ring-inset ring-(--role-hairline) hover:bg-psu-50">
          <Icon name="sliders" size={16} />
          {newestFirst ? "Newest first" : "Oldest first"}
        </button>
      </div>

      <SubTabs
        label="Show"
        idPrefix="album"
        value={filter}
        onChange={setFilter}
        options={[
          { value: "all", label: "All", count: counts.all },
          { value: "reports", label: "Reports", icon: "note", count: counts.reports },
          { value: "documents", label: "Documents", icon: "document", count: counts.documents },
          { value: "camera", label: "Taken in INTERNet", short: "Camera", icon: "camera", count: counts.camera },
        ]}
      />

      {error && <ErrorNotice message={error} onRetry={() => void load()} />}

      {waiting.length > 0 && (
        <section className="mb-5 rounded-2xl bg-amber-50 p-4 ring-1 ring-inset ring-amber-600/20">
          <p className="text-[14.5px] font-bold text-amber-950">
            {waiting.length === 1 ? "1 photo is" : `${waiting.length} photos are`} on this phone, waiting to be sent
          </p>
          <p className="mt-0.5 text-[13px] text-amber-900">They are sent by themselves once you're online. Signing out erases them.</p>
          <button type="button" onClick={() => void saveToPhone(waiting)} className="mt-2 inline-flex min-h-11 items-center gap-1.5 font-bold text-amber-900 hover:underline">
            <Icon name="download" size={16} />
            Save copies to your phone
          </button>
        </section>
      )}

      <div id="album-panel" role="tabpanel" aria-labelledby={`album-${filter}`}>
        {loading ? (
          <SkeletonRows rows={4} />
        ) : items.length === 0 ? (
          <EmptyState
            icon="album"
            title={filter === "all" ? "No photos yet" : "Nothing here yet"}
            description="Photos you add to your daily reports, and files you upload as requirements, appear here by month."
          />
        ) : (
          <div className="space-y-6">
            {months.map(([month, list]) => (
              <section key={month} aria-label={month}>
                <h2 className="mb-2 flex items-baseline gap-2 text-[15px] font-extrabold text-slate-900">
                  {month}
                  <span className="tabular text-[13px] font-semibold text-slate-500">{list.length}</span>
                </h2>
                <ul className="grid grid-cols-3 gap-1.5 sm:grid-cols-4 lg:grid-cols-6">
                  {list.map((item) => (
                    <li key={item.key}>
                      <Tile item={item} onOpen={() => setOpen(item)} />
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </div>

      {open && <Viewer item={open} onClose={() => setOpen(null)} />}
    </StudentLayout>
  );
}

/** A square: the picture's small preview, loaded once it is near the screen. A document shows its kind. */
function Tile({ item, onOpen }: { item: Item; onOpen: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  const [node, setNode] = useState<HTMLButtonElement | null>(null);
  useEffect(() => {
    if (!node || item.kind !== "picture") return;
    let made: string | null = null;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        observer.disconnect();
        void pictureUrl("student", item.id, item.has_preview)
          .then((value) => {
            made = value;
            setUrl(value);
          })
          .catch(() => undefined);
      },
      { rootMargin: "200px" }
    );
    observer.observe(node);
    return () => {
      observer.disconnect();
      if (made) URL.revokeObjectURL(made);
    };
  }, [node, item]);

  const label = item.kind === "picture" ? `${item.title}, ${formatDate(item.taken_at)}` : `${item.title}: ${item.original_filename}`;
  return (
    <button ref={setNode} type="button" onClick={onOpen} aria-label={`Open ${label}`} className="group relative block aspect-square w-full overflow-hidden rounded-xl bg-psu-50 ring-1 ring-inset ring-(--role-hairline)">
      {item.kind === "picture" ? (
        url ? <img src={url} alt="" className="h-full w-full object-cover transition-transform group-hover:scale-105" /> : <span className="block h-full w-full animate-pulse bg-psu-100/60" />
      ) : (
        <span className="flex h-full w-full flex-col items-center justify-center gap-1 p-2 text-center">
          <Icon name="document" size={26} className="text-psu-700" />
          <span className="line-clamp-2 text-[12px] font-semibold leading-tight text-slate-700">{item.title}</span>
        </span>
      )}
      {item.kind === "picture" && item.captured_in_app && (
        <span aria-hidden="true" className="absolute right-1 top-1 grid h-6 w-6 place-items-center rounded-full bg-black/55 text-white">
          <Icon name="camera" size={13} />
        </span>
      )}
    </button>
  );
}

function Viewer({ item, onClose }: { item: Item; onClose: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let made: string | null = null;
    const load = item.kind === "picture" ? pictureUrl("student", item.id) : getProtectedUploadUrl(item.file_path, "student");
    void load.then((value) => {
      made = value;
      setUrl(value);
    }).catch(() => undefined);
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      if (made) URL.revokeObjectURL(made);
    };
  }, [item, onClose]);

  const isImage = item.mime_type.startsWith("image/");
  const source = item.kind === "picture" ? SOURCE[item.source] : null;
  return (
    <div className="modal-backdrop fixed inset-0 z-(--z-modal) flex items-center justify-center p-3" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-label={item.title} className="flex max-h-full w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-raised">
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-4 py-3">
          <div className="min-w-0">
            <p className="truncate text-[15.5px] font-bold text-slate-900">{item.title}</p>
            <p className="text-[13px] text-slate-600">
              {item.kind === "picture" ? `${source?.label} · ${formatDate(item.taken_at)}${item.captured_in_app ? " · taken in INTERNet" : ""}` : `${item.original_filename} · ${item.status}`}
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="grid h-11 w-11 shrink-0 place-items-center rounded-xl text-slate-500 hover:bg-slate-100">
            <Icon name="close" />
          </button>
        </div>
        <div className="grid min-h-[40vh] flex-1 place-items-center overflow-auto bg-slate-950/95 p-2">
          {!url ? (
            <span className="text-sm text-white/70">Loading…</span>
          ) : isImage ? (
            <img src={url} alt={item.kind === "picture" ? item.caption || item.title : item.title} className="max-h-[70vh] w-auto object-contain" />
          ) : (
            <iframe src={url} title={item.title} className="h-[70vh] w-full rounded bg-white" />
          )}
        </div>
        <div className="flex flex-wrap justify-between gap-2 px-4 py-3">
          {source ? (
            <Link to={source.to(item.kind === "picture" ? item.day : null)} className="inline-flex min-h-11 items-center gap-1 text-sm font-bold text-psu-700 hover:underline">
              Open the {source.label.toLowerCase()}
              <Icon name="chevron-right" size={15} />
            </Link>
          ) : (
            <Link to="/documents" className="inline-flex min-h-11 items-center gap-1 text-sm font-bold text-psu-700 hover:underline">
              Open documents
              <Icon name="chevron-right" size={15} />
            </Link>
          )}
          {url && (
            <a href={url} download={item.kind === "document" ? item.original_filename : `INTERNet-photo-${item.id}.jpg`} className="inline-flex min-h-11 items-center gap-1.5 rounded-xl px-3 text-sm font-bold text-slate-700 ring-1 ring-inset ring-slate-200 hover:bg-slate-50">
              <Icon name="download" size={15} />
              Save to phone
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
