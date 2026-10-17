import { useId } from "react";
import { patternWeek, mondayOf } from "../../lib/schedulePattern";
import { phToday } from "../../lib/phTime";
import { formatLongDate } from "../../lib/format";
import ScheduleDays from "./ScheduleDays";
import type { PatternForm } from "./scheduleRows";

/*
| Iteration 11. How a schedule repeats, and its days: every week (one set of
| days), or every two weeks (week 1 and week 2 taking turns, counted from
| the Monday week 1 starts on). Used on a student's Schedule tab
| (ScheduleEditor.tsx) and for a whole block (BlockScheduleDialog.tsx).
*/

export default function SchedulePatternFields({
  value,
  onChange,
  disabled = false,
}: {
  value: PatternForm;
  onChange: (next: PatternForm) => void;
  disabled?: boolean;
}) {
  const id = useId();
  const today = phToday();
  const anchorOk = /^\d{4}-\d{2}-\d{2}$/.test(value.anchor) && new Date(`${value.anchor}T00:00:00Z`).getUTCDay() === 1;
  const thisWeek = value.weeks === 2 && anchorOk ? patternWeek(value.anchor, 2, today) : null;

  return (
    <div className="space-y-4">
      <fieldset>
        <legend className="mb-1.5 text-sm font-medium text-slate-700">Repeats</legend>
        <div className="flex flex-wrap gap-2">
          {([1, 2] as const).map((weeks) => (
            <label
              key={weeks}
              className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border px-3 text-sm ${
                value.weeks === weeks ? "border-psu-500 bg-psu-50 font-semibold text-psu-900" : "border-slate-300 bg-white text-slate-700"
              }`}
            >
              <input
                type="radio"
                name={`${id}-weeks`}
                checked={value.weeks === weeks}
                disabled={disabled}
                onChange={() =>
                  onChange({
                    ...value,
                    weeks,
                    // A first anchor: the Monday of this week.
                    anchor: weeks === 2 && !value.anchor ? mondayOf(today) : value.anchor,
                  })
                }
                className="h-4 w-4 text-psu-700"
              />
              {weeks === 1 ? "Every week" : "Every two weeks"}
            </label>
          ))}
        </div>
      </fieldset>

      {value.weeks === 2 && (
        <div>
          <label htmlFor={`${id}-anchor`} className="mb-1.5 block text-sm font-medium text-slate-700">
            Week 1 starts on
          </label>
          <input
            id={`${id}-anchor`}
            type="date"
            value={value.anchor}
            disabled={disabled}
            aria-describedby={`${id}-anchor-hint`}
            onChange={(event) => onChange({ ...value, anchor: event.target.value })}
            className="field w-auto"
          />
          <p id={`${id}-anchor-hint`} className={`mt-1 text-xs ${value.anchor && !anchorOk ? "font-semibold text-red-700" : "text-slate-500"}`}>
            {value.anchor && !anchorOk
              ? "Choose a Monday."
              : thisWeek
                ? `A Monday. Week 1 is the week of ${formatLongDate(value.anchor)}, and this week is week ${thisWeek}.`
                : "A Monday: the weeks take turns from it."}
          </p>
        </div>
      )}

      <div>
        {value.weeks === 2 && <h3 className="mb-2 text-sm font-semibold text-slate-900">Week 1</h3>}
        <ScheduleDays rows={value.week1} onChange={(week1) => onChange({ ...value, week1 })} disabled={disabled} />
      </div>
      {value.weeks === 2 && (
        <div>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-slate-900">Week 2</h3>
            <button
              type="button"
              disabled={disabled}
              onClick={() => onChange({ ...value, week2: value.week1.map((row) => ({ ...row })) })}
              className="inline-flex min-h-10 items-center rounded-lg px-2 text-sm font-semibold text-psu-700 hover:bg-psu-50"
            >
              Copy week 1
            </button>
          </div>
          <ScheduleDays rows={value.week2} onChange={(week2) => onChange({ ...value, week2 })} disabled={disabled} />
        </div>
      )}
    </div>
  );
}
