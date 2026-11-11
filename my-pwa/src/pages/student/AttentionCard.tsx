import { useId, useState } from "react";
import { Link } from "react-router-dom";
import Icon from "../../components/Icon";
import { Button, Modal } from "../../components/ui";
import type { AttentionItem, Urgency } from "./attention";

/*
|--------------------------------------------------------------------------
| NEEDS YOUR ATTENTION: THE PRIORITY STACK (Today, change1108)
|--------------------------------------------------------------------------
|
| Every item that needs the trainee (pages/student/attention.ts), most
| urgent first, drawn as a stack of cards, like papers on a desk: one item
| at a time, large, with the rest peeking out underneath.
|
|   The top card says one thing well: a rubber-stamp mark for how urgent
|   it is (OVERDUE, DUE TODAY, COMING UP: words, never colour alone), what
|   it is, how soon, and its one action as the card's main button.
|   The arrows step through the stack without hiding anything; "See all"
|   fans the stack out into a list, and "Stack them" gathers it again.
|   Hiding or finishing the top card brings the next one up.
|
|   The x sits on each card's top-left corner, away from the action, so a
|   thumb reaching for the button never hides it by mistake. Hiding the
|   first item of a session asks first: what it is, how soon, why it
|   matters, that it stays in the bell and comes back next time, and
|   "Don't ask me again during this session". Once that is ticked, items
|   hide at a tap and "Clear all" appears in the head.
|
|   Hidden items fold into one quiet line, "2 hidden for now · Show", so
|   nothing silently disappears.
|
*/

const URGENCY_WORD: Record<Urgency, string> = { now: "Needs action now", today: "Due today", soon: "Coming up" };

/** The rubber stamp on the top card: the urgency in two or three words. */
function stampWords(item: AttentionItem): string {
  if (item.urgency === "now") return /^overdue/i.test(item.when) ? item.when.replace(/^Overdue by /i, "Overdue ") : "Act now";
  if (item.urgency === "today") return "Due today";
  return "Coming up";
}

const STAMP_TONE: Record<Urgency, string> = {
  now: "text-(--status-late-ink)",
  today: "text-(--status-warning-ink)",
  soon: "text-(--status-info-ink)",
};

const EDGE: Record<Urgency, string> = {
  now: "before:bg-(--status-late-ink)",
  today: "before:bg-(--status-warning-ink)",
  soon: "before:bg-(--status-info-ink)",
};

export default function AttentionCard({
  items,
  hidden,
  noAsk,
  onHide,
  onShowAll,
  onNoAsk,
  onRun,
}: {
  items: AttentionItem[];
  hidden: string[];
  noAsk: boolean;
  onHide: (keys: string[]) => void;
  onShowAll: () => void;
  onNoAsk: (value: boolean) => void;
  /** An item whose action happens here (retake, missed time-out). */
  onRun: (run: NonNullable<AttentionItem["action"]["run"]>) => void;
}) {
  const [asking, setAsking] = useState<AttentionItem | "all" | null>(null);
  const [dontAsk, setDontAsk] = useState(false);
  const [fanned, setFanned] = useState(false);
  const [at, setAt] = useState(0);
  const headingId = useId();
  const shown = items.filter((item) => !hidden.includes(item.key));
  const hiddenCount = items.length - shown.length;
  const index = shown.length > 0 ? Math.min(at, shown.length - 1) : 0;

  if (items.length === 0) {
    return (
      <p className="flex items-center gap-2.5 rounded-2xl bg-(--status-success-bg) px-4 py-3 text-[14.5px] font-semibold text-(--status-success-ink)">
        <Icon name="check-circle" size={19} />
        You're all caught up. Nothing needs you right now.
      </p>
    );
  }

  const hide = (target: AttentionItem | "all") => {
    if (noAsk) onHide(target === "all" ? shown.map((item) => item.key) : [target.key]);
    else {
      setDontAsk(false);
      setAsking(target);
    }
  };
  const confirm = () => {
    if (!asking) return;
    onHide(asking === "all" ? shown.map((item) => item.key) : [asking.key]);
    if (dontAsk) onNoAsk(true);
    setAsking(null);
  };

  const action = (item: AttentionItem, big: boolean) =>
    item.action.to ? (
      big ? (
        <Link to={item.action.to} className="inb-press inline-flex h-11 items-center gap-1.5 rounded-xl bg-psu-700 px-4 text-[14px] font-bold text-white hover:bg-psu-800">
          {item.action.label}
          <Icon name="arrow-right" size={16} />
        </Link>
      ) : (
        <Link to={item.action.to} className="inline-flex min-h-11 shrink-0 items-center gap-1 rounded-xl px-2.5 text-[13.5px] font-bold text-psu-700 hover:bg-psu-50">
          <span className="max-sm:sr-only">{item.action.label}</span>
          <Icon name="chevron-right" size={16} />
        </Link>
      )
    ) : (
      <Button size={big ? "md" : "sm"} icon={item.action.run === "retake-photo" ? "camera" : "clock"} onClick={() => item.action.run && onRun(item.action.run)} className="shrink-0">
        {item.action.label}
      </Button>
    );

  const closeX = (item: AttentionItem) => (
    <button
      type="button"
      onClick={() => hide(item)}
      aria-label={`Hide “${item.title}” for now`}
      title="Hide for now"
      className="absolute left-1 top-1 z-[2] grid h-9 w-9 place-items-center rounded-full text-slate-500 hover:bg-slate-100 hover:text-slate-800"
    >
      <span aria-hidden="true" className="grid h-[22px] w-[22px] place-items-center rounded-full bg-white ring-1 ring-slate-300">
        <Icon name="close" size={12} strokeWidth={2.4} />
      </span>
    </button>
  );

  const top = shown[index];
  const behind = Math.min(2, shown.length - 1);

  return (
    <section aria-labelledby={headingId} className="attention-card">
      <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 px-1">
        <h2 id={headingId} className="flex min-w-0 flex-1 items-center gap-2 text-[15px] font-extrabold text-slate-900">
          <span aria-hidden="true" className="grid h-6 w-6 place-items-center rounded-full bg-(--status-late-ink) text-white">
            <Icon name="alert" size={13} strokeWidth={2.4} />
          </span>
          Needs your attention
          <span className="tabular rounded-full bg-(--status-late-bg) px-2 py-0.5 text-[12px] font-bold text-(--status-late-ink)">{shown.length}</span>
        </h2>
        {shown.length > 1 && (
          <button type="button" onClick={() => setFanned((value) => !value)} aria-expanded={fanned} className="inline-flex min-h-11 items-center gap-1 rounded-lg px-2 text-[13.5px] font-bold text-psu-700 hover:bg-psu-50">
            <Icon name={fanned ? "layers" : "list"} size={15} />
            {fanned ? "Stack them" : `See all ${shown.length}`}
          </button>
        )}
        {noAsk && shown.length > 0 && (
          <button type="button" onClick={() => hide("all")} className="inline-flex min-h-11 items-center gap-1 rounded-lg px-2 text-[13.5px] font-bold text-(--status-late-ink) hover:bg-(--status-late-bg)">
            <Icon name="close" size={15} />
            Clear all
          </button>
        )}
      </div>

      {top && !fanned && (
        <div className="relative" style={{ paddingBottom: behind * 9 }}>
          {/* The papers underneath, peeking out. */}
          {Array.from({ length: behind }, (_, layer) => (
            <div
              key={layer}
              aria-hidden="true"
              className="attention-sheet absolute inset-x-0 top-0 rounded-[18px] bg-white ring-1 ring-inset ring-(--role-hairline)"
              style={{ bottom: (behind - 1 - layer) * 9, marginInline: (layer + 1) * 10, zIndex: 0, opacity: 1 - (layer + 1) * 0.18 }}
            />
          ))}
          <article
            key={top.key}
            className={`attention-top relative z-[1] overflow-hidden rounded-[18px] bg-white shadow-raised ring-1 ring-inset ring-(--role-hairline) before:absolute before:inset-y-0 before:left-0 before:w-1.5 ${EDGE[top.urgency]}`}
          >
            {closeX(top)}
            <div className="flex gap-3.5 py-4 pl-11 pr-4 sm:pr-5">
              <div className="min-w-0 flex-1">
                <span className={`inb-stamp attention-stamp ${STAMP_TONE[top.urgency]}`}>{stampWords(top)}</span>
                <p className="mt-2.5 text-[17px] font-extrabold leading-snug tracking-tight text-slate-900 sm:text-[18px]">{top.title}</p>
                <p className="mt-1 line-clamp-2 text-[14px] text-slate-600">{top.detail}</p>
                {/* The stamp already says "Overdue 18 days" or "Due today": the line under it would only repeat it. */}
                <p className={`mt-1.5 inline-flex items-center gap-1.5 text-[13px] font-semibold text-slate-700 ${(top.urgency === "now" && /^overdue/i.test(top.when)) || top.when === "Due today" ? "sr-only" : ""}`}>
                  <Icon name={top.urgency === "soon" ? "calendar" : "clock"} size={14} />
                  {top.when}
                  <span className="sr-only">. {URGENCY_WORD[top.urgency]}.</span>
                </p>
              </div>
              <span aria-hidden="true" className="hidden h-14 w-14 shrink-0 place-items-center rounded-2xl bg-psu-50 text-psu-800 sm:grid">
                <Icon name={top.icon} size={26} />
              </span>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-dashed border-(--role-hairline) bg-psu-50/40 px-4 py-2.5 sm:pl-11">
              {shown.length > 1 ? (
                <div className="flex items-center gap-1">
                  <button type="button" onClick={() => setAt((index - 1 + shown.length) % shown.length)} aria-label="The item before" className="grid h-10 w-10 place-items-center rounded-full text-slate-600 hover:bg-white">
                    <Icon name="chevron-left" size={17} />
                  </button>
                  <span className="tabular min-w-[3.5rem] text-center text-[13px] font-semibold text-slate-600" aria-live="polite">
                    {index + 1} of {shown.length}
                  </span>
                  <button type="button" onClick={() => setAt((index + 1) % shown.length)} aria-label="The next item" className="grid h-10 w-10 place-items-center rounded-full text-slate-600 hover:bg-white">
                    <Icon name="chevron-right" size={17} />
                  </button>
                </div>
              ) : (
                <span className="text-[13px] text-slate-500">The only thing waiting on you.</span>
              )}
              {action(top, true)}
            </div>
          </article>
        </div>
      )}

      {fanned && shown.length > 0 && (
        <ul className="space-y-2">
          {shown.map((item) => (
            <li key={item.key} className={`attention-row relative overflow-hidden rounded-2xl bg-white ring-1 ring-inset ring-(--role-hairline) before:absolute before:inset-y-0 before:left-0 before:w-1 ${EDGE[item.urgency]}`}>
              {closeX(item)}
              <div className="flex items-center gap-3 py-2.5 pl-11 pr-2.5">
                <div className="min-w-0 flex-1">
                  <p className="text-[14.5px] font-bold leading-snug text-slate-900">{item.title}</p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[12.5px] text-slate-600">
                    <span className={`inb-stamp attention-stamp--small ${STAMP_TONE[item.urgency]}`}>{stampWords(item)}</span>
                    <span>{item.when}</span>
                  </p>
                </div>
                {action(item, false)}
              </div>
            </li>
          ))}
        </ul>
      )}

      {hiddenCount > 0 && (
        <p className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-white/70 px-4 py-1.5 text-[13px] text-slate-600 ring-1 ring-inset ring-(--role-hairline)">
          <span>
            {shown.length === 0 ? "All caught up for now. " : ""}
            {hiddenCount === 1 ? "1 item hidden for now" : `${hiddenCount} items hidden for now`}, still in your notifications.
          </span>
          <button type="button" onClick={onShowAll} className="inline-flex min-h-11 items-center font-bold text-psu-700 hover:underline">
            Show {hiddenCount === 1 ? "it" : "them"}
          </button>
        </p>
      )}

      <Modal
        open={asking !== null}
        onClose={() => setAsking(null)}
        title={asking === "all" ? "Hide all of these for now?" : "Hide this for now?"}
        description="You can deal with it later. It stays in your notifications (the bell) and comes back the next time you open INTERNet."
        footer={
          <>
            <Button variant="secondary" onClick={() => setAsking(null)}>
              Keep it here
            </Button>
            <Button onClick={confirm}>{asking === "all" ? "Hide all for now" : "Hide for now"}</Button>
          </>
        }
      >
        {asking && (
          <div className="space-y-3">
            {(asking === "all" ? shown : [asking]).slice(0, 4).map((item) => (
              <div key={item.key} className="rounded-xl bg-slate-50 p-3 ring-1 ring-inset ring-(--role-hairline)">
                <p className="flex flex-wrap items-center gap-2 text-[15px] font-bold text-slate-900">
                  {item.title}
                  <span className={`inb-stamp attention-stamp--small ${STAMP_TONE[item.urgency]}`}>{URGENCY_WORD[item.urgency]}</span>
                </p>
                <p className="mt-1 text-[13.5px] font-semibold text-slate-700">{item.when}</p>
                <p className="mt-1 text-[13.5px] leading-relaxed text-slate-600">{item.why}</p>
              </div>
            ))}
            {asking === "all" && shown.length > 4 && <p className="text-[13px] text-slate-600">and {shown.length - 4} more.</p>}
            <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl px-1 text-[14.5px] font-semibold text-slate-800">
              <input type="checkbox" checked={dontAsk} onChange={(event) => setDontAsk(event.target.checked)} className="h-5 w-5 accent-(--role-primary)" />
              Don't ask me again during this session
            </label>
          </div>
        )}
      </Modal>
    </section>
  );
}
