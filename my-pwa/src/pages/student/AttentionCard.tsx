import { useId, useState } from "react";
import { Link } from "react-router-dom";
import Icon from "../../components/Icon";
import { Button, Modal } from "../../components/ui";
import type { AttentionItem, Urgency } from "./attention";

/*
|--------------------------------------------------------------------------
| NEEDS YOUR ATTENTION (Today, revisions November 2026)
|--------------------------------------------------------------------------
|
| One card holding every item that needs the trainee (pages/student/
| attention.ts), most urgent first, so they read as one list to work
| through rather than a stack of red banners.
|
|   Each item: what it is, how soon (a chip whose words carry the urgency,
|   never colour alone), and its action on the right. The x sits on the
|   item's top-left corner, away from the action, so a thumb reaching for
|   "Open" never hides it by mistake.
|
|   Hiding the first item of a session asks first: what it is, how soon,
|   why it matters, that it stays in the bell and comes back next time,
|   and "Don't ask me again this session". Once that is ticked, items hide
|   at a tap and "Clear all" appears in the card's head.
|
|   Hidden items fold into one quiet line, "2 hidden for now · Show", so
|   nothing silently disappears.
|
*/

const URGENCY_CLASS: Record<Urgency, string> = {
  now: "bg-(--status-late-bg) text-(--status-late-ink)",
  today: "bg-(--status-warning-bg) text-(--status-warning-ink)",
  soon: "bg-(--status-info-bg) text-(--status-info-ink)",
};

const URGENCY_WORD: Record<Urgency, string> = { now: "Needs action now", today: "Due today", soon: "Coming up" };

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
  const headingId = useId();
  const shown = items.filter((item) => !hidden.includes(item.key));
  const hiddenCount = items.length - shown.length;

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

  return (
    <section aria-labelledby={headingId} className="attention-card overflow-hidden rounded-2xl bg-white ring-1 ring-inset ring-[color-mix(in_srgb,var(--status-late-ink)_22%,transparent)]">
      <div className="flex items-center gap-3 border-b border-[color-mix(in_srgb,var(--status-late-ink)_14%,transparent)] bg-(--status-late-bg)/60 px-4 py-2.5">
        <span aria-hidden="true" className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-(--status-late-ink) text-white">
          <Icon name="alert" size={17} />
        </span>
        <h2 id={headingId} className="min-w-0 flex-1 text-[15.5px] font-extrabold text-(--status-late-ink)">
          Needs your attention
          <span className="tabular ml-2 inline-grid h-6 min-w-6 place-items-center rounded-full bg-(--status-late-ink) px-1.5 align-middle text-[12px] font-bold text-white">
            {shown.length}
          </span>
        </h2>
        {noAsk && shown.length > 0 && (
          <button type="button" onClick={() => hide("all")} className="inline-flex min-h-11 items-center gap-1 rounded-lg px-2 text-[13.5px] font-bold text-(--status-late-ink) hover:bg-white/70">
            <Icon name="close" size={15} />
            Clear all
          </button>
        )}
      </div>

      {shown.length > 0 && (
        <ul className="divide-y divide-(--role-hairline)">
          {shown.map((item) => (
            <li key={item.key} className="relative">
              {/* The x, on the item's top-left corner: hides it for this session. */}
              <button
                type="button"
                onClick={() => hide(item)}
                aria-label={`Hide “${item.title}” for now`}
                title="Hide for now"
                className="absolute left-0.5 top-0.5 z-[1] grid h-9 w-9 place-items-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <span aria-hidden="true" className="grid h-[22px] w-[22px] place-items-center rounded-full bg-white ring-1 ring-slate-300">
                  <Icon name="close" size={12} strokeWidth={2.4} />
                </span>
              </button>
              <div className="flex items-start gap-3 py-3 pl-10 pr-3 sm:pr-4">
                <span aria-hidden="true" className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-(--status-late-bg) text-(--status-late-ink)">
                  <Icon name={item.icon} size={18} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[15px] font-bold leading-snug text-slate-900">{item.title}</p>
                  <p className="mt-0.5 line-clamp-2 text-[13.5px] text-slate-600">{item.detail}</p>
                  <span className={`mt-1.5 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[12px] font-bold ${URGENCY_CLASS[item.urgency]}`}>
                    <Icon name={item.urgency === "soon" ? "calendar" : "clock"} size={12} />
                    {item.when}
                  </span>
                </div>
                {item.action.to ? (
                  <Link to={item.action.to} className="mt-0.5 inline-flex min-h-11 shrink-0 items-center gap-1 rounded-xl px-2.5 text-[13.5px] font-bold text-psu-700 hover:bg-psu-50">
                    <span className="max-sm:sr-only">{item.action.label}</span>
                    <Icon name="chevron-right" size={16} />
                  </Link>
                ) : (
                  <Button size="sm" icon={item.action.run === "retake-photo" ? "camera" : "clock"} onClick={() => item.action.run && onRun(item.action.run)} className="mt-0.5 shrink-0">
                    {item.action.label}
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {hiddenCount > 0 && (
        <p className="flex flex-wrap items-center justify-between gap-2 border-t border-(--role-hairline) bg-slate-50/70 px-4 py-2 text-[13px] text-slate-600">
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
                  <span className={`rounded-full px-2 py-0.5 text-[11.5px] font-bold ${URGENCY_CLASS[item.urgency]}`}>{URGENCY_WORD[item.urgency]}</span>
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
