import { useCallback, useEffect, useRef, useState } from "react";
import Icon from "./Icon";
import { Modal } from "./ui";
import {
  listPictures,
  onCostlyConnection,
  pictureUrl,
  removePicture,
  type Picture,
  type PictureOwner,
  type PictureRole,
} from "../lib/attachments";
import { formatFileSize } from "../lib/files";
import { errorText, toast } from "../lib/toast";

/**
 * The pictures attached to one entry, for whoever is allowed to see them:
 * small squares that open one at a time, full size, with the arrow keys or
 * a swipe to go between them. Nothing is shown when there are none.
 *
 * On a connection the browser reports as metered or slow, a picture is not
 * fetched until it is asked for; its size is shown instead.
 *
 * Whoever wrote the entry can take a picture off it while the entry can
 * still change (`onCount` tells the page how many are left, so its picker
 * knows how many more fit).
 */
export default function EntryPictures({
  role,
  owner,
  ownerId,
  reloadKey = 0,
  onCount,
  count,
  className = "mt-3",
}: {
  role: PictureRole;
  owner: PictureOwner;
  ownerId: number;
  /**
   * How many pictures the list this entry came from says it has. With 0
   * nothing is asked of the server. Left out, the server is asked.
   */
  count?: number;
  /** Change it to load the list again, after pictures were added. */
  reloadKey?: number;
  onCount?: (count: number, canAdd: boolean) => void;
  className?: string;
}) {
  const [pictures, setPictures] = useState<Picture[]>([]);
  const [canChange, setCanChange] = useState(false);
  // Object URLs by picture id, once fetched.
  const [urls, setUrls] = useState<Record<number, string>>({});
  const [open, setOpen] = useState<number | null>(null);
  const [costly] = useState(() => onCostlyConnection());
  const kept = useRef<string[]>([]);
  const told = useRef(onCount);
  useEffect(() => {
    told.current = onCount;
  }, [onCount]);

  const load = useCallback(async () => {
    try {
      const list = await listPictures(role, owner, ownerId);
      setPictures(list.attachments);
      setCanChange(list.can_add && role !== "coordinator");
      told.current?.(list.attachments.length, list.can_add);
    } catch {
      // The entry reads without its pictures; nothing else on the page depends on them.
      setPictures([]);
    }
  }, [role, owner, ownerId]);

  const none = count === 0;
  useEffect(() => {
    if (none) return;
    void Promise.resolve().then(load);
  }, [load, reloadKey, none]);

  const fetchOne = useCallback(
    async (id: number) => {
      try {
        const url = await pictureUrl(role, id);
        kept.current.push(url);
        setUrls((current) => ({ ...current, [id]: url }));
      } catch (error) {
        toast.error(errorText(error, "The picture could not be loaded."));
      }
    },
    [role]
  );

  // Fetched by themselves unless the connection is one to be careful with.
  useEffect(() => {
    if (costly) return;
    for (const picture of pictures) {
      if (!urls[picture.id]) void Promise.resolve().then(() => fetchOne(picture.id));
    }
    // `urls` is left out on purpose: each picture is asked for once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pictures, costly, fetchOne]);

  // Give the object URLs back when the entry leaves the screen.
  useEffect(
    () => () => {
      for (const url of kept.current) URL.revokeObjectURL(url);
    },
    []
  );

  const step = useCallback(
    (by: -1 | 1) => {
      setOpen((current) => {
        if (current === null) return current;
        const next = current + by;
        return next < 0 || next >= pictures.length ? current : next;
      });
    },
    [pictures.length]
  );

  useEffect(() => {
    if (open === null) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "ArrowLeft") step(-1);
      if (event.key === "ArrowRight") step(1);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, step]);

  // The picture being looked at is fetched if it has not been.
  const shown = open === null ? null : pictures[open] ?? null;
  useEffect(() => {
    if (shown && !urls[shown.id]) void Promise.resolve().then(() => fetchOne(shown.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown?.id, fetchOne]);

  const touchStart = useRef<number | null>(null);

  if (none || pictures.length === 0) return null;

  const altOf = (picture: Picture, index: number) =>
    picture.caption?.trim() || `Picture ${index + 1} of ${pictures.length}`;

  const remove = async (picture: Picture) => {
    try {
      await removePicture(role as "student" | "supervisor", picture.id);
      setOpen(null);
      toast.success("Picture removed.");
      await load();
    } catch (error) {
      toast.error(errorText(error, "The picture could not be removed."));
    }
  };

  return (
    <div className={className}>
      <p className="mb-1.5 text-sm font-medium text-slate-700">
        {pictures.length === 1 ? "1 picture" : `${pictures.length} pictures`}
      </p>
      <ul className="flex flex-wrap gap-2">
        {pictures.map((picture, index) => (
          <li key={picture.id}>
            <button
              type="button"
              onClick={() => setOpen(index)}
              aria-label={`Open ${altOf(picture, index)}`}
              className="relative flex h-20 w-20 items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-slate-100 text-slate-600 hover:border-psu-400"
            >
              {urls[picture.id] ? (
                <img src={urls[picture.id]} alt="" className="h-full w-full object-cover" />
              ) : (
                <span className="flex flex-col items-center gap-0.5 px-1 text-center text-[11px] leading-tight">
                  <Icon name="image" size={18} />
                  {costly ? `Show (${formatFileSize(picture.size_bytes)})` : "Loading"}
                </span>
              )}
            </button>
          </li>
        ))}
      </ul>

      <Modal
        open={shown !== null}
        onClose={() => setOpen(null)}
        title={shown && open !== null ? `Picture ${open + 1} of ${pictures.length}` : "Picture"}
        description={shown?.caption?.trim() || undefined}
        size="lg"
        footer={
          shown && open !== null ? (
            <div className="flex w-full flex-wrap items-center justify-between gap-2">
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => step(-1)}
                  disabled={open === 0}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                >
                  <Icon name="chevron-left" size={16} />
                  Previous
                </button>
                <button
                  type="button"
                  onClick={() => step(1)}
                  disabled={open === pictures.length - 1}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                >
                  Next
                  <Icon name="chevron-right" size={16} />
                </button>
              </div>
              {canChange && (
                <button
                  type="button"
                  onClick={() => void remove(shown)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-50"
                >
                  <Icon name="trash" size={16} />
                  Remove this picture
                </button>
              )}
            </div>
          ) : undefined
        }
      >
        {shown && open !== null && (
          <div
            className="flex min-h-48 items-center justify-center rounded-lg bg-slate-100"
            onTouchStart={(event) => {
              touchStart.current = event.touches[0]?.clientX ?? null;
            }}
            onTouchEnd={(event) => {
              const start = touchStart.current;
              const end = event.changedTouches[0]?.clientX;
              touchStart.current = null;
              if (start === null || end === undefined || Math.abs(end - start) < 48) return;
              step(end < start ? 1 : -1);
            }}
          >
            {urls[shown.id] ? (
              <img
                src={urls[shown.id]}
                alt={altOf(shown, open)}
                className="max-h-[70vh] w-full rounded-lg object-contain"
              />
            ) : (
              <p className="p-6 text-sm text-slate-600">Loading the picture</p>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
