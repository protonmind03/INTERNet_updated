import Icon from "./Icon";
import type { PaginationState } from "../lib/usePagination";

/**
 * The footer under a paged list: which rows are showing, and the controls to
 * move between pages. With a single page it shows only the count.
 */
export default function Pagination<T>({
  state,
  noun,
  extra,
}: {
  state: PaginationState<T>;
  /** What one row is called, for example "log" or "student". */
  noun: string;
  /** Extra text shown after the count. */
  extra?: string;
}) {
  const { page, pageCount, total, from, to, setPage } = state;
  const plural = total === 1 ? noun : `${noun}s`;

  // Up to five page numbers, centred on the current page.
  const first = Math.max(1, Math.min(page - 2, pageCount - 4));
  const numbers = Array.from(
    { length: Math.min(5, pageCount) },
    (_, index) => first + index
  );

  const arrow =
    "flex h-9 w-9 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent";

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-4 py-3 sm:px-5 print:hidden">
      <p className="text-xs text-slate-500">
        {pageCount > 1 ? `Showing ${from}–${to} of ${total} ${plural}` : `${total} ${plural}`}
        {extra && ` · ${extra}`}
      </p>
      {pageCount > 1 && (
        <nav aria-label="Pages" className="flex items-center gap-1">
          <button
            type="button"
            aria-label="Previous page"
            disabled={page === 1}
            onClick={() => setPage(page - 1)}
            className={arrow}
          >
            <Icon name="chevron-right" size={16} className="rotate-180" />
          </button>
          {numbers.map((number) => (
            <button
              key={number}
              type="button"
              aria-label={`Page ${number}`}
              aria-current={number === page ? "page" : undefined}
              onClick={() => setPage(number)}
              className={`tabular h-9 min-w-9 rounded-lg px-2 text-sm font-medium ${
                number === page
                  ? "bg-psu-700 text-white"
                  : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              {number}
            </button>
          ))}
          <button
            type="button"
            aria-label="Next page"
            disabled={page === pageCount}
            onClick={() => setPage(page + 1)}
            className={arrow}
          >
            <Icon name="chevron-right" size={16} />
          </button>
        </nav>
      )}
    </div>
  );
}
