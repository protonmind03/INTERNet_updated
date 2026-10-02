type Props = {
  from: string;
  to: string;
  onChange: (from: string, to: string) => void;
};

/** "From" and "To" date inputs with a clear button, for filtering lists by date. */
export default function DateRangeFilter({ from, to, onChange }: Props) {
  const inputClass =
    "rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm text-slate-700 focus:border-slate-400 focus:outline-none";

  return (
    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
      <label className="flex items-center gap-1.5">
        From
        <input
          type="date"
          value={from}
          max={to || undefined}
          onChange={(event) => onChange(event.target.value, to)}
          className={inputClass}
        />
      </label>
      <label className="flex items-center gap-1.5">
        To
        <input
          type="date"
          value={to}
          min={from || undefined}
          onChange={(event) => onChange(from, event.target.value)}
          className={inputClass}
        />
      </label>
      {(from || to) && (
        <button
          type="button"
          onClick={() => onChange("", "")}
          className="font-medium text-indigo-600 hover:underline"
        >
          Clear dates
        </button>
      )}
    </div>
  );
}
