type Props = {
  from: string;
  to: string;
  onChange: (from: string, to: string) => void;
};

/** "From" and "To" date inputs with a clear button, for filtering lists by date. */
export default function DateRangeFilter({ from, to, onChange }: Props) {
  const inputClass =
    "h-9 rounded-lg border border-slate-300 bg-white px-2.5 text-sm text-slate-700 focus:border-psu-500 focus:outline-none";

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-slate-600">
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
          className="font-semibold text-psu-700 hover:underline"
        >
          Clear dates
        </button>
      )}
    </div>
  );
}
