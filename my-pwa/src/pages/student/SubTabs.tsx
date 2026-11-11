import type { KeyboardEvent } from "react";
import Icon, { type IconName } from "../../components/Icon";

/*
| The sections inside one part of a folder (the Resolution Center's
| Concerns, Feedback and Internship evaluation; the reports' Daily, Weekly
| and Monthly): a white segmented row, as inside the coordinator's record.
| Arrow keys move between them.
*/
export default function SubTabs<T extends string>({
  label,
  options,
  value,
  onChange,
  idPrefix,
}: {
  label: string;
  options: readonly { value: T; label: string; short?: string; icon?: IconName; count?: number }[];
  value: T;
  onChange: (value: T) => void;
  idPrefix: string;
}) {
  const onKey = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!["ArrowRight", "ArrowLeft", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const index = options.findIndex((option) => option.value === value);
    const next =
      event.key === "Home" ? 0 : event.key === "End" ? options.length - 1 : (index + (event.key === "ArrowRight" ? 1 : -1) + options.length) % options.length;
    onChange(options[next].value);
    window.setTimeout(() => document.getElementById(`${idPrefix}-${options[next].value}`)?.focus(), 0);
  };
  return (
    <div
      role="tablist"
      aria-label={label}
      onKeyDown={onKey}
      className="mb-5 flex w-full max-w-full gap-1 overflow-x-auto rounded-xl border border-(--role-hairline) bg-white p-1 shadow-card md:w-fit print:hidden [scrollbar-width:none]"
    >
      {options.map((option) => {
        const on = option.value === value;
        return (
          <button
            key={option.value}
            id={`${idPrefix}-${option.value}`}
            type="button"
            role="tab"
            aria-selected={on}
            aria-controls={`${idPrefix}-panel`}
            tabIndex={on ? 0 : -1}
            aria-label={option.short ? (option.label.toLowerCase().includes(option.short.toLowerCase()) ? option.label : `${option.short}: ${option.label}`) : undefined}
            onClick={() => onChange(option.value)}
            className={`relative inline-flex h-[40px] flex-1 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-[9px] px-3 text-[13.5px] font-semibold md:flex-none md:px-3.5 pointer-coarse:h-11 ${
              on ? "bg-psu-700 text-white shadow-sm" : "text-slate-600 hover:bg-psu-50 hover:text-slate-900"
            }`}
          >
            {option.icon && <Icon name={option.icon} size={15} className="shrink-0 max-sm:hidden" />}
            {option.short ? (
              <>
                <span className="sm:hidden">{option.short}</span>
                <span className="max-sm:hidden">{option.label}</span>
              </>
            ) : (
              option.label
            )}
            {option.count ? (
              <span className={`tabular inline-grid h-5 min-w-5 place-items-center rounded-full px-1.5 text-[11px] font-bold ${on ? "bg-white/25 text-white" : "bg-psu-100 text-psu-800"}`}>
                {option.count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
