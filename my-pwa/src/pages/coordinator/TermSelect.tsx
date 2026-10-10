import type { TermOption } from "./useTermFilter";

/** The term chooser on the coordinator's lists. Hidden until a term exists. */
export default function TermSelect({
  term,
  terms,
  onChange,
}: {
  term: string;
  terms: TermOption[];
  onChange: (term: string) => void;
}) {
  if (terms.length === 0) return null;
  return (
    <label className="flex items-center gap-2 text-sm text-slate-600">
      Term
      <select
        value={term}
        onChange={(event) => onChange(event.target.value)}
        className="field w-auto"
      >
        <option value="">All terms</option>
        {terms.map((item) => (
          <option key={item.id} value={String(item.id)}>
            {item.name}
            {item.is_closed ? " (closed)" : ""}
          </option>
        ))}
        <option value="none">No term</option>
      </select>
    </label>
  );
}
