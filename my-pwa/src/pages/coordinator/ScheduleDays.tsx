import Icon from "../../components/Icon";
import { Button } from "../../components/ui";
import { SCHEDULE_DAYS, type ScheduleRow } from "./scheduleRows";

/*
| The rows of a weekly schedule, editable: a day, its start and end, and
| what the day is for. Used for one student's schedule and for a whole
| block's, so both are filled in the same way.
*/

export default function ScheduleDays({
  rows,
  onChange,
  disabled = false,
}: {
  rows: ScheduleRow[];
  onChange: (rows: ScheduleRow[]) => void;
  disabled?: boolean;
}) {
  const used = new Set(rows.map((row) => row.day));
  const change = (index: number, patch: Partial<ScheduleRow>) =>
    onChange(rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  const addDay = () => {
    const day = SCHEDULE_DAYS.find((name) => !used.has(name));
    if (!day) return;
    onChange(
      [...rows, { day, start_time: "08:00", end_time: "17:00", focus: "" }].sort(
        (a, b) => SCHEDULE_DAYS.indexOf(a.day) - SCHEDULE_DAYS.indexOf(b.day)
      )
    );
  };

  return (
    <div className="space-y-3">
      {rows.length === 0 ? (
        <p className="text-sm text-slate-600">No working days yet. Add the first one.</p>
      ) : (
        <ul className="space-y-3">
          {rows.map((row, index) => (
            <li
              key={row.day}
              className="grid grid-cols-2 gap-2 rounded-lg border border-slate-200 p-3 sm:grid-cols-[7.5rem_minmax(0,1fr)_minmax(0,1fr)_2.5rem]"
            >
              <label className="col-span-2 sm:col-span-1">
                <span className="sr-only">Day</span>
                <select
                  value={row.day}
                  disabled={disabled}
                  onChange={(event) => change(index, { day: event.target.value })}
                  className="field"
                >
                  {SCHEDULE_DAYS.filter((name) => name === row.day || !used.has(name)).map((name) => (
                    <option key={name}>{name}</option>
                  ))}
                </select>
              </label>
              <label>
                <span className="sr-only">{row.day} start time</span>
                <input
                  type="time"
                  value={row.start_time}
                  disabled={disabled}
                  onChange={(event) => change(index, { start_time: event.target.value })}
                  className="field"
                />
              </label>
              <label>
                <span className="sr-only">{row.day} end time</span>
                <input
                  type="time"
                  value={row.end_time}
                  disabled={disabled}
                  onChange={(event) => change(index, { end_time: event.target.value })}
                  className="field"
                />
              </label>
              <button
                type="button"
                aria-label={`Remove ${row.day}`}
                disabled={disabled}
                onClick={() => onChange(rows.filter((_, i) => i !== index))}
                className="col-span-2 flex h-10 items-center justify-center gap-1.5 rounded-lg text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50 sm:col-span-1 sm:w-10"
              >
                <Icon name="trash" size={16} />
                <span className="sm:hidden">Remove</span>
              </button>
              <label className="col-span-2 sm:col-span-4">
                <span className="sr-only">{row.day} focus</span>
                <input
                  type="text"
                  maxLength={150}
                  value={row.focus}
                  disabled={disabled}
                  onChange={(event) => change(index, { focus: event.target.value })}
                  placeholder="What the day is for (optional)"
                  className="field"
                />
              </label>
            </li>
          ))}
        </ul>
      )}
      <Button variant="secondary" icon="plus" onClick={addDay} disabled={disabled || used.size >= SCHEDULE_DAYS.length}>
        Add a day
      </Button>
    </div>
  );
}
