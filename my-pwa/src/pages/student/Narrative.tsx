import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import Icon from "../../components/Icon";
import { Button, ConfirmDialog, ErrorNotice, SkeletonRows } from "../../components/ui";
import StudentLayout from "../../layouts/StudentLayout";
import { formatDate } from "../../lib/format";
import { toast } from "../../lib/toast";
import { traineeRecord } from "../../lib/traineeRecord";
import { restoreAutosave, saveStateText, useAutosave } from "../../lib/useAutosave";
import { MOA, PARTS, REQUIREMENTS, draftFor, type PartSource, type Requirement } from "./narrative/model";
import NarrativePrint from "./narrative/NarrativePrint";
import TimeframeSheet from "./narrative/TimeframeSheet";
import TimeInProvider from "./TimeInProvider";
import { useNarrativeData, type UploadedDocument } from "./narrative/useNarrativeData";

/*
|--------------------------------------------------------------------------
| NARRATIVE REPORT ON INTERNSHIP TRAINING (Tasks folder, November 2026)
|--------------------------------------------------------------------------
|
| The binder the trainee hands in at the end, put together here from
| everything INTERNet already holds, in the order of the university's own
| table of contents (narrative/model.ts):
|
|   the outline, each part marked Written, From INTERNet, Upload or To
|   follow; the part opened is written beside it (it saves as they type),
|   with "From your records" offering a starting draft made from their
|   weekly and daily reports, tasks and attendance, to edit and make theirs
|
|   the Memorandum of Agreement and the sixteen internship requirements:
|   which are on file in Documents, which INTERNet prints (the timeframe,
|   the weekly report, the feedback form, the evaluation), which to attach
|
|   Print / save as PDF gives the whole binder under the letterhead of the
|   university's sample; Word gives the same as a .docx to keep editing
|
| The title page and the Training Supervisor's Feedback Form wait for the
| photos of the university's samples.
|
*/

const SOURCE_CHIP: Record<PartSource, { label: string; className: string }> = {
  write: { label: "You write", className: "bg-psu-100 text-psu-900" },
  auto: { label: "From INTERNet", className: "bg-emerald-100 text-emerald-900" },
  upload: { label: "Upload", className: "bg-sky-100 text-sky-900" },
  waiting: { label: "To follow", className: "bg-slate-200 text-slate-700" },
};

const WRITABLE = PARTS.filter((part) => part.source !== "auto" && !["company", "narrative", "learning"].includes(part.key));

/** Mounts the shared attendance above the page, which reads it before it draws the layout. */
export default function Narrative() {
  return (
    <TimeInProvider>
      <NarrativePage />
    </TimeInProvider>
  );
}

function NarrativePage() {
  const data = useNarrativeData();
  const [params, setParams] = useSearchParams();
  const open = params.get("part") ?? "dedication";
  const [printing, setPrinting] = useState<"binder" | "timeframe" | null>(null);
  const [exporting, setExporting] = useState(false);
  const college = data.header?.trainee.college ?? "";

  // Print once the chosen sheet is on the page.
  useEffect(() => {
    if (!printing) return;
    const frame = window.setTimeout(() => {
      window.print();
      setPrinting(null);
    }, 400);
    return () => window.clearTimeout(frame);
  }, [printing]);

  const written = WRITABLE.filter((part) => (data.parts[part.key]?.text ?? "").trim().length > 0).length;
  const documentFor = (item: Requirement): UploadedDocument | undefined => (item.match ? data.documents.find((doc) => item.match?.test(doc.doc_type)) : undefined);
  const requirements = [MOA, ...REQUIREMENTS];
  const ready = requirements.filter((item) => item.source === "auto" || (item.source === "upload" && documentFor(item))).length;

  const exportWord = async () => {
    setExporting(true);
    try {
      const { downloadNarrativeDocx } = await import("./narrative/exportDocx");
      await downloadNarrativeDocx({ records: data.records, parts: data.parts, college, photos: data.photos, documents: data.documents, journals: data.journals, logs: data.logs });
      toast.success("Your narrative report was saved as a Word file.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The Word file could not be made.");
    } finally {
      setExporting(false);
    }
  };

  const select = (key: string) => {
    const rest = new URLSearchParams(params);
    rest.set("part", key);
    setParams(rest, { replace: true });
    if (window.matchMedia("(max-width: 1023px)").matches) window.setTimeout(() => document.getElementById("narrative-editor")?.scrollIntoView({ block: "start", behavior: "smooth" }), 50);
  };

  const current = PARTS.find((part) => part.key === open && part.source !== "auto") ?? PARTS.find((part) => part.key === "dedication")!;

  return (
    <StudentLayout title="Narrative report" subtitle="Your Narrative Report on Internship Training, put together from your record">
      <div className="space-y-4 print:hidden">
        {data.error && <ErrorNotice message={data.error} onRetry={() => void data.reload()} />}

        <section className="flex flex-col gap-4 rounded-2xl bg-white p-4 ring-1 ring-inset ring-(--role-hairline) sm:flex-row sm:items-center sm:justify-between sm:p-5">
          <div className="flex items-center gap-4">
            <Ring value={written} total={WRITABLE.length} />
            <div>
              <p className="text-[15.5px] font-extrabold text-slate-900">
                {written} of {WRITABLE.length} parts written · {ready} of {requirements.length} requirements ready
              </p>
              <p className="text-[13px] text-slate-600">Everything saves as you type. Print or download whenever you like; nothing is sent anywhere.</p>
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <Button variant="secondary" icon="printer" onClick={() => setPrinting("binder")} disabled={data.loading}>
              Print or save PDF
            </Button>
            <Button icon="download" busy={exporting} onClick={() => void exportWord()} disabled={data.loading}>
              Word file
            </Button>
          </div>
        </section>

        {data.loading ? (
          <SkeletonRows rows={6} />
        ) : (
          <div className="grid gap-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:items-start">
            <nav aria-label="Parts of the narrative report" className="rounded-2xl bg-white p-2 ring-1 ring-inset ring-(--role-hairline) lg:sticky lg:top-4">
              <ol>
                {PARTS.map((part) => {
                  const done = (data.parts[part.key]?.text ?? "").trim().length > 0;
                  const heading = ["company", "narrative", "learning"].includes(part.key);
                  const selectable = !heading && part.source !== "auto";
                  const on = selectable && part.key === current.key;
                  const content = (
                    <>
                      <span className="tabular w-7 shrink-0 text-[12.5px] font-bold text-slate-500">{part.number}</span>
                      <span className={`min-w-0 flex-1 truncate ${heading ? "font-extrabold text-slate-900" : "font-semibold"}`}>{part.title}</span>
                      {!heading && (
                        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold ${on ? "bg-white/20" : done && part.source === "write" ? "bg-emerald-100 text-emerald-900" : SOURCE_CHIP[part.source].className}`}>
                          {done && part.source === "write" ? "Written" : SOURCE_CHIP[part.source].label}
                        </span>
                      )}
                    </>
                  );
                  return (
                    <li key={part.key} style={{ paddingLeft: part.level * 14 }}>
                      {selectable ? (
                        <button
                          type="button"
                          onClick={() => select(part.key)}
                          aria-current={on ? "true" : undefined}
                          className={`flex min-h-11 w-full items-center gap-2 rounded-xl px-2.5 text-left text-[14px] ${on ? "bg-psu-700 text-white [&_span]:text-white" : "text-slate-800 hover:bg-psu-50"}`}
                        >
                          {content}
                        </button>
                      ) : (
                        <div className="flex min-h-10 items-center gap-2 px-2.5 text-[14px] text-slate-700">{content}</div>
                      )}
                    </li>
                  );
                })}
                <li className="mt-1 border-t border-(--role-hairline) pt-1">
                  <a href="#requirements" className="flex min-h-11 items-center gap-2 rounded-xl px-2.5 text-[14px] font-extrabold text-slate-900 hover:bg-psu-50">
                    <span className="tabular w-7 shrink-0 text-[12.5px] font-bold text-slate-500">VII.</span>
                    Agreement and requirements
                    <span className="ml-auto rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-bold text-sky-900">
                      {ready}/{requirements.length}
                    </span>
                  </a>
                </li>
              </ol>
            </nav>

            <div id="narrative-editor" className="scroll-mt-4 space-y-4">
              {data.studentId && (
                <PartEditor
                  key={current.key}
                  studentId={data.studentId}
                  partKey={current.key}
                  title={`${current.number} ${current.title}`}
                  hint={current.hint}
                  waiting={current.source === "waiting"}
                  saved={data.parts[current.key]?.text ?? ""}
                  draft={draftFor(current.key, data.records)}
                  onSaved={(text) => data.setParts((parts) => ({ ...parts, [current.key]: { text, updated_at: new Date().toISOString() } }))}
                />
              )}
              <PhotosNote count={data.photos.length} />
            </div>
          </div>
        )}

        <section id="requirements" aria-labelledby="requirements-title" className="scroll-mt-4 rounded-2xl bg-white ring-1 ring-inset ring-(--role-hairline)">
          <div className="border-b border-(--role-hairline) px-4 py-3 sm:px-5">
            <h2 id="requirements-title" className="text-[16px] font-extrabold text-slate-900">
              VII–VIII. Memorandum of Agreement and Internship Requirements
            </h2>
            <p className="text-[13px] text-slate-600">The signed and issued papers go in the binder as they are. INTERNet prints the ones it keeps.</p>
          </div>
          <ul className="divide-y divide-(--role-hairline)">
            {requirements.map((item) => {
              const doc = documentFor(item);
              return (
                <li key={item.title} className="flex flex-wrap items-center gap-3 px-4 py-2.5 sm:px-5">
                  <span className="tabular w-8 shrink-0 text-[13px] font-bold text-slate-500">{item.number}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[14.5px] font-semibold text-slate-900">
                      {item.title}
                      {item.optional && <span className="font-normal text-slate-500"> (optional)</span>}
                    </span>
                    {(item.note || doc) && (
                      <span className="block text-[12.5px] text-slate-600">
                        {doc ? `On file: ${doc.original_filename} · ${doc.status} · ${formatDate(doc.uploaded_at)}` : item.note}
                      </span>
                    )}
                  </span>
                  {item.source === "auto" ? (
                    item.to === "#timeframe" ? (
                      <Button variant="secondary" size="sm" icon="printer" onClick={() => setPrinting("timeframe")}>
                        Print
                      </Button>
                    ) : (
                      <Link to={item.to ?? "/"} className="inline-flex min-h-11 items-center gap-1 text-[13.5px] font-bold text-psu-700 hover:underline">
                        Open
                        <Icon name="chevron-right" size={15} />
                      </Link>
                    )
                  ) : item.source === "waiting" ? (
                    <span className={`rounded-full px-2.5 py-1 text-[12px] font-bold ${SOURCE_CHIP.waiting.className}`}>To follow</span>
                  ) : doc ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-[12px] font-bold text-emerald-900">
                      <Icon name="check" size={13} />
                      On file
                    </span>
                  ) : (
                    <Link to="/documents" className="inline-flex min-h-11 items-center gap-1 text-[13.5px] font-bold text-sky-800 hover:underline">
                      Upload in Documents
                      <Icon name="chevron-right" size={15} />
                    </Link>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      </div>

      {printing === "binder" && <NarrativePrint records={data.records} parts={data.parts} college={college} photos={data.photos} documents={data.documents} />}
      {printing === "timeframe" && <TimeframeSheet logs={data.logs} header={data.header} />}
    </StudentLayout>
  );
}

function Ring({ value, total }: { value: number; total: number }) {
  const share = total ? value / total : 0;
  const r = 22;
  const c = 2 * Math.PI * r;
  return (
    <svg width="56" height="56" viewBox="0 0 56 56" role="img" aria-label={`${value} of ${total} parts written`} className="shrink-0">
      <circle cx="28" cy="28" r={r} fill="none" strokeWidth="6" className="stroke-psu-100" />
      <circle cx="28" cy="28" r={r} fill="none" strokeWidth="6" strokeLinecap="round" strokeDasharray={`${share * c} ${c}`} transform="rotate(-90 28 28)" className="stroke-psu-600" />
      <text x="28" y="32" textAnchor="middle" className="fill-slate-900 text-[13px] font-extrabold">
        {Math.round(share * 100)}%
      </text>
    </svg>
  );
}

function PartEditor({
  studentId,
  partKey,
  title,
  hint,
  waiting,
  saved,
  draft,
  onSaved,
}: {
  studentId: string;
  partKey: string;
  title: string;
  hint: string;
  waiting: boolean;
  saved: string;
  draft: string;
  onSaved: (text: string) => void;
}) {
  const [text, setText] = useState<string | null>(null);
  const [replacing, setReplacing] = useState(false);
  useEffect(() => {
    let active = true;
    void restoreAutosave<string>("student", `narrative:${partKey}`).then((value) => {
      if (active) setText(value ?? saved);
    });
    return () => {
      active = false;
    };
    // Once per part opened.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [partKey]);

  const save = useAutosave<string>({
    role: "student",
    key: `narrative:${partKey}`,
    value: text ?? "",
    enabled: text !== null,
    start: saved,
    save: async (value) => {
      await traineeRecord.saveNarrativePart(studentId, partKey, value);
      onSaved(value);
    },
  });

  const words = (text ?? "").trim() ? (text ?? "").trim().split(/\s+/).length : 0;
  const applyDraft = (mode: "replace" | "add") => {
    setText((current) => (mode === "add" && current?.trim() ? `${current.trim()}\n\n${draft}` : draft));
    setReplacing(false);
  };

  return (
    <section className="rounded-2xl bg-white ring-1 ring-inset ring-(--role-hairline)">
      <div className="flex flex-wrap items-start justify-between gap-2 border-b border-(--role-hairline) px-4 py-3 sm:px-5">
        <div className="min-w-0">
          <h2 className="text-[17px] font-extrabold text-slate-900">{title}</h2>
          <p className="text-[13px] text-slate-600">{hint}</p>
        </div>
        <span className="text-[12.5px] text-slate-600" aria-live="polite">
          {saveStateText(save.state, save.message) || `${words} word${words === 1 ? "" : "s"}`}
        </span>
      </div>
      <div className="space-y-3 px-4 py-4 sm:px-5">
        {waiting && (
          <p className="rounded-xl bg-slate-100 px-3 py-2 text-[13px] text-slate-700">
            Write the title as you want it to read. The page's layout follows the university's sample once it is in INTERNet.
          </p>
        )}
        {text === null ? (
          <SkeletonRows rows={4} />
        ) : (
          <textarea
            aria-label={title}
            rows={waiting ? 3 : 14}
            maxLength={20000}
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder={waiting ? "NARRATIVE REPORT ON INTERNSHIP TRAINING" : "Write here…"}
            className="field resize-y leading-relaxed"
          />
        )}
        {draft && (
          <details className="rounded-xl bg-psu-50 px-3.5 py-2.5 ring-1 ring-inset ring-psu-200/70">
            <summary className="cursor-pointer text-[14px] font-bold text-psu-900">From your records: a starting draft</summary>
            <p className="mt-1 text-[12.5px] text-slate-600">Put together from your reports, tasks and attendance. Make it yours: change it, cut it, add to it.</p>
            <pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap rounded-lg bg-white p-2.5 font-sans text-[13.5px] text-slate-800 ring-1 ring-inset ring-psu-100">{draft}</pre>
            <div className="mt-2 flex flex-wrap gap-2">
              <Button size="sm" icon="plus" onClick={() => ((text ?? "").trim() ? setReplacing(true) : applyDraft("replace"))}>
                Use this draft
              </Button>
            </div>
          </details>
        )}
      </div>
      <ConfirmDialog
        open={replacing}
        title="Use the starting draft?"
        message="You have already written something here. Put the draft below what you wrote, or replace it?"
        confirmLabel="Put it below"
        cancelLabel="Cancel"
        onConfirm={() => applyDraft("add")}
        onCancel={() => setReplacing(false)}
      />
    </section>
  );
}

function PhotosNote({ count }: { count: number }) {
  return (
    <p className="rounded-2xl bg-emerald-50 px-4 py-3 text-[13.5px] text-emerald-950 ring-1 ring-inset ring-emerald-600/20">
      <Icon name="image" size={15} className="mr-1.5 inline align-[-2px]" />
      <span className="font-bold">7. Pictures Depicting OJT Experiences</span> fills itself with the {count} photo{count === 1 ? "" : "s"} from your daily reports and their captions.{" "}
      <Link to="/journal" className="font-bold underline-offset-2 hover:underline">
        Add more in your daily reports
      </Link>
      .
    </p>
  );
}
