import { useId } from "react";
import { useStudentFilters } from "./useStudentFilters";

/**
 * Roadmap 5.6: the term the student list shows, in the Students header.
 * It is the filter bar's own term field (the same address parameter), so
 * the two always agree, and choosing here narrows blocks as the bar does.
 */
export default function TermSwitcher() {
  const id = useId();
  const filters = useStudentFilters();
  const terms = filters.options.terms;
  if (terms.length === 0) return null;
  return (
    <div className="flex items-center gap-2">
      <label htmlFor={id} className="text-sm font-medium text-slate-700">
        Term
      </label>
      <select
        id={id}
        value={filters.filters.term}
        onChange={(event) => filters.set("term", event.target.value)}
        className="field h-10 w-auto min-w-44"
      >
        <option value="">All terms</option>
        {terms.map((term) => (
          <option key={term.id} value={String(term.id)}>
            {term.name}
            {term.is_closed ? " (closed)" : ""}
          </option>
        ))}
        <option value="none">No term</option>
      </select>
    </div>
  );
}
