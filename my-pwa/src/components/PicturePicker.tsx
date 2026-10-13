import { useId, useRef, useState } from "react";
import Icon from "./Icon";
import { ProgressBar } from "./ui";
import { MAX_PICTURES, preparePicture, type PictureDraft } from "../lib/attachments";
import { formatFileSize } from "../lib/files";

/**
 * Chooses the pictures to go with an entry being written: from the camera
 * or the gallery, up to `max`. Each can be given a caption, moved earlier
 * or later, and taken off again before anything is sent. The page that
 * owns the entry holds the drafts and sends them once the entry is saved
 * (lib/attachments.ts#uploadPictures).
 */
export default function PicturePicker({
  drafts,
  onChange,
  max = MAX_PICTURES,
  disabled = false,
  progress = {},
  unavailable,
}: {
  drafts: PictureDraft[];
  onChange: (next: PictureDraft[]) => void;
  /** How many more this entry can take. */
  max?: number;
  disabled?: boolean;
  /** How much of each draft has been sent, by its key, from 0 to 100. */
  progress?: Record<string, number>;
  /** Said in place of the button when pictures cannot be added now. */
  unavailable?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [problem, setProblem] = useState("");
  const [preparing, setPreparing] = useState(false);
  const id = useId();
  const room = Math.max(0, max - drafts.length);

  const choose = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setProblem("");
    setPreparing(true);
    const added: PictureDraft[] = [];
    const problems: string[] = [];
    const chosen = [...files];
    if (chosen.length > room) {
      problems.push(`Only ${room === 1 ? "1 more picture" : `${room} more pictures`} can be added, so the rest were left out.`);
    }
    for (const file of chosen.slice(0, room)) {
      try {
        added.push(await preparePicture(file));
      } catch (error) {
        problems.push(error instanceof Error ? error.message : "A picture could not be prepared.");
      }
    }
    setPreparing(false);
    setProblem(problems.join(" "));
    if (added.length > 0) onChange([...drafts, ...added]);
    // The same file can be chosen again after being removed.
    if (input.current) input.current.value = "";
  };

  const remove = (key: string) => {
    const gone = drafts.find((draft) => draft.key === key);
    if (gone) URL.revokeObjectURL(gone.preview);
    onChange(drafts.filter((draft) => draft.key !== key));
  };
  const move = (index: number, by: -1 | 1) => {
    const next = [...drafts];
    const [item] = next.splice(index, 1);
    next.splice(index + by, 0, item);
    onChange(next);
  };
  const caption = (key: string, text: string) =>
    onChange(drafts.map((draft) => (draft.key === key ? { ...draft, caption: text } : draft)));

  const small =
    "inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 disabled:opacity-40";

  return (
    <div>
      <p className="mb-1.5 text-sm font-medium text-slate-700">
        Pictures <span className="font-normal text-slate-500">(optional, up to {MAX_PICTURES})</span>
      </p>

      {drafts.length > 0 && (
        <ul className="mb-2 space-y-2">
          {drafts.map((draft, index) => {
            const sent = progress[draft.key];
            return (
              <li key={draft.key} className="flex gap-3 rounded-lg border border-slate-200 p-2">
                <img
                  src={draft.preview}
                  alt={draft.caption.trim() || `Picture ${index + 1} of ${drafts.length}`}
                  className="h-16 w-16 shrink-0 rounded-md bg-slate-100 object-cover"
                />
                <div className="min-w-0 flex-1">
                  <label htmlFor={`${id}-${draft.key}`} className="sr-only">
                    Caption for picture {index + 1}
                  </label>
                  <input
                    id={`${id}-${draft.key}`}
                    type="text"
                    maxLength={200}
                    value={draft.caption}
                    disabled={disabled}
                    onChange={(event) => caption(draft.key, event.target.value)}
                    placeholder="What does it show? (optional)"
                    className="field h-9 py-1 text-sm"
                  />
                  {sent === undefined ? (
                    <p className="mt-1 text-xs text-slate-500">{formatFileSize(draft.file.size)}</p>
                  ) : (
                    <div className="mt-2">
                      <ProgressBar value={sent} label={`Picture ${index + 1}: ${sent}% sent`} />
                    </div>
                  )}
                </div>
                <div className="flex shrink-0 items-start gap-1">
                  <button
                    type="button"
                    className={small}
                    disabled={disabled || index === 0}
                    onClick={() => move(index, -1)}
                    aria-label={`Move picture ${index + 1} earlier`}
                  >
                    <Icon name="chevron-left" size={16} />
                  </button>
                  <button
                    type="button"
                    className={small}
                    disabled={disabled || index === drafts.length - 1}
                    onClick={() => move(index, 1)}
                    aria-label={`Move picture ${index + 1} later`}
                  >
                    <Icon name="chevron-right" size={16} />
                  </button>
                  <button
                    type="button"
                    className={`${small} text-red-700`}
                    disabled={disabled}
                    onClick={() => remove(draft.key)}
                    aria-label={`Remove picture ${index + 1}`}
                  >
                    <Icon name="trash" size={16} />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {unavailable ? (
        <p className="text-sm text-slate-600">{unavailable}</p>
      ) : (
        room > 0 && (
          <>
            {/* No "capture": the phone then offers both the camera and the gallery. */}
            <input
              ref={input}
              type="file"
              accept="image/*"
              multiple
              className="sr-only"
              tabIndex={-1}
              aria-hidden="true"
              onChange={(event) => void choose(event.target.files)}
            />
            <button
              type="button"
              disabled={disabled || preparing}
              onClick={() => input.current?.click()}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
            >
              <Icon name="image" size={16} />
              {preparing ? "Preparing" : drafts.length === 0 ? "Add a picture" : "Add another picture"}
            </button>
          </>
        )
      )}

      {problem && (
        <p role="alert" className="mt-2 text-sm text-red-700">
          {problem}
        </p>
      )}
    </div>
  );
}
