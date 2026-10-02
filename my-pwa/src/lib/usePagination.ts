import { useMemo, useState } from "react";

export type PaginationState<T> = {
  /** The rows to show on the current page. */
  pageItems: T[];
  page: number;
  pageCount: number;
  total: number;
  /** 1-based positions of the first and last row shown. */
  from: number;
  to: number;
  setPage: (page: number) => void;
};

/**
 * Splits a list into pages. When the list shrinks (a filter or search
 * narrows it) the page is pulled back so it never points past the end.
 */
export function usePagination<T>(items: T[], pageSize = 20): PaginationState<T> {
  const [requested, setRequested] = useState(1);
  const pageCount = Math.max(1, Math.ceil(items.length / pageSize));
  const page = Math.min(requested, pageCount);

  const pageItems = useMemo(
    () => items.slice((page - 1) * pageSize, page * pageSize),
    [items, page, pageSize]
  );

  return {
    pageItems,
    page,
    pageCount,
    total: items.length,
    from: items.length === 0 ? 0 : (page - 1) * pageSize + 1,
    to: Math.min(page * pageSize, items.length),
    setPage: (next) => setRequested(Math.max(1, Math.min(pageCount, next))),
  };
}
