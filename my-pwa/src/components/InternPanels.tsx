import { useId, useState, type ReactNode } from "react";
import { formatDate } from "../lib/format";
import { sameId } from "../lib/ids";
import { sortPanels, type InternPanel } from "../lib/internPanels";
import Icon from "./Icon";
import { StatusBadge } from "./ui";

/*
|--------------------------------------------------------------------------
| ONE PANEL PER INTERN
|--------------------------------------------------------------------------
|
| Documents and weekly reports read best person by person. Each intern gets
| a panel that opens and closes; its header says who it is, their block,
| how many items wait for a decision and since when. Panels with something
| waiting come first, the oldest wait at the top, and start open; the rest
| follow by name, closed. Inside a panel the items keep the page's order.
|
*/

export default function InternPanels<T>({
  panels,
  renderItems,
  waitingLabel = "waiting",
  focusStudentId,
  className = "",
}: {
  panels: InternPanel<T>[];
  /** The open panel's body: its items, as a list. */
  renderItems: (items: T[]) => ReactNode;
  /** "waiting", "to review"…: the word after the count in the header. */
  waitingLabel?: string;
  /** The intern whose record a link points at: their panel is open. */
  focusStudentId?: string | null;
  className?: string;
}) {
  return (
    <ul className={`divide-y divide-slate-100 ${className}`}>
      {sortPanels(panels).map((panel) => (
        <Panel
          key={panel.id}
          panel={panel}
          renderItems={renderItems}
          waitingLabel={waitingLabel}
          focused={Boolean(focusStudentId) && sameId(panel.id, focusStudentId!)}
        />
      ))}
    </ul>
  );
}

function Panel<T>({
  panel,
  renderItems,
  waitingLabel,
  focused,
}: {
  panel: InternPanel<T>;
  renderItems: (items: T[]) => ReactNode;
  waitingLabel: string;
  focused: boolean;
}) {
  const bodyId = useId();
  // Until the supervisor opens or closes it, a panel is open when something waits in it.
  const [chosen, setChosen] = useState<boolean | null>(null);
  const open = focused || (chosen ?? panel.waiting > 0);
  const count = panel.items.length;

  return (
    <li>
      <h3>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={bodyId}
          onClick={() => setChosen(!open)}
          className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-left hover:bg-slate-50 sm:px-5"
        >
          <Icon
            name="chevron-right"
            size={16}
            className={`shrink-0 text-slate-500 transition-transform motion-reduce:transition-none ${open ? "rotate-90" : ""}`}
          />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold text-slate-900">{panel.name}</span>
            <span className="block text-xs text-slate-600">
              {panel.block || "No block"} · {count} {count === 1 ? "item" : "items"}
            </span>
          </span>
          {panel.waiting > 0 ? (
            <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-600">
              <StatusBadge status={`${panel.waiting} ${waitingLabel}`} tone="waiting" />
              {panel.oldestWaiting && <span>since {formatDate(panel.oldestWaiting)}</span>}
            </span>
          ) : (
            <span className="text-xs text-slate-500">Nothing waiting</span>
          )}
        </button>
      </h3>
      <div id={bodyId} hidden={!open} className="border-t border-slate-100 bg-slate-50/40">
        {open && (
          <>
            {panel.summary && <div className="px-4 pt-3 sm:px-5">{panel.summary}</div>}
            {renderItems(panel.items)}
          </>
        )}
      </div>
    </li>
  );
}
