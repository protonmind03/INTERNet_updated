import { useId } from "react";
import SavedViews from "./SavedViews";
import type { FilterKey, StudentFilterState } from "./useStudentFilters";

/*
|--------------------------------------------------------------------------
| THE FILTER BAR
|--------------------------------------------------------------------------
|
| The same six choices on every coordinator page that lists or counts
| students: Term, College, Program, Block, Company, Supervisor. A level
| with nothing to choose from is left out (no blocks made yet, say), so the
| bar is as short as the programme's records allow. The state is held by
| useStudentFilters; this only draws it.
|
*/

type Choice = { value: string; label: string };

function Select({
  label,
  value,
  onChange,
  all,
  choices,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  /** What the empty choice is called: "All programs". */
  all: string;
  choices: Choice[];
}) {
  const id = useId();
  return (
    <div className="min-w-0">
      <label htmlFor={id} className="mb-1 block text-xs font-medium text-slate-600">
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={`h-10 w-full rounded-lg border bg-white px-2.5 text-sm text-slate-800 focus:border-psu-500 focus:outline-none ${
          value ? "border-psu-500 font-medium" : "border-slate-300"
        }`}
      >
        <option value="">{all}</option>
        {choices.map((choice) => (
          <option key={choice.value} value={choice.value}>
            {choice.label}
          </option>
        ))}
      </select>
    </div>
  );
}

export default function FilterBar({
  state,
  /** Levels this page does not offer. */
  hide = [],
  /** Says what the bar narrows on this page, when it is not plainly "the students". */
  note,
}: {
  state: StudentFilterState;
  hide?: FilterKey[];
  note?: string;
}) {
  // A page that hides a level cannot show a view honestly: the view might choose that level.
  const views = hide.length === 0;
  const { filters, set, clear, active, choices, options } = state;
  const shows = (key: FilterKey, has: boolean) => !hide.includes(key) && (has || Boolean(filters[key]));
  // A block's term is said when it is not the term already chosen.
  const blockLabel = (name: string, termName: string | null) =>
    !filters.term && termName ? `${name} (${termName})` : name;

  const selects = [
    shows("term", options.terms.length > 0) && (
      <Select
        key="term"
        label="Term"
        value={filters.term}
        onChange={(value) => set("term", value)}
        all="All terms"
        choices={[
          ...choices.terms.map((item) => ({
            value: String(item.id),
            label: `${item.name}${item.is_closed ? " (closed)" : ""}`,
          })),
          { value: "none", label: "No term" },
        ]}
      />
    ),
    shows("college", options.colleges.length > 0) && (
      <Select
        key="college"
        label="College"
        value={filters.college}
        onChange={(value) => set("college", value)}
        all="All colleges"
        choices={choices.colleges.map((item) => ({
          value: String(item.id),
          label: item.short_name ? `${item.short_name}: ${item.name}` : item.name,
        }))}
      />
    ),
    shows("program", options.programs.length > 0) && (
      <Select
        key="program"
        label="Program"
        value={filters.program}
        onChange={(value) => set("program", value)}
        all="All programs"
        choices={choices.programs.map((item) => ({
          value: String(item.id),
          label: `${item.short_code}: ${item.name}`,
        }))}
      />
    ),
    shows("block", options.blocks.length > 0) && (
      <Select
        key="block"
        label="Block"
        value={filters.block}
        onChange={(value) => set("block", value)}
        all="All blocks"
        choices={[
          ...choices.blocks.map((item) => ({
            value: String(item.id),
            label: blockLabel(item.name, item.term_name),
          })),
          { value: "none", label: "No block" },
        ]}
      />
    ),
    shows("company", options.companies.length > 0) && (
      <Select
        key="company"
        label="Company"
        value={filters.company}
        onChange={(value) => set("company", value)}
        all="All companies"
        choices={choices.companies.map((item) => ({ value: String(item.id), label: item.name }))}
      />
    ),
    shows("supervisor", options.supervisors.length > 0) && (
      <Select
        key="supervisor"
        label="Supervisor"
        value={filters.supervisor}
        onChange={(value) => set("supervisor", value)}
        all="All supervisors"
        choices={[
          ...choices.supervisors.map((item) => ({ value: item.supervisor_id, label: item.name })),
          { value: "none", label: "No supervisor" },
        ]}
      />
    ),
  ].filter(Boolean);

  if (selects.length === 0) return null;

  return (
    <section
      aria-label="Which students"
      className="rounded-xl border border-slate-200/80 bg-white p-3 shadow-card sm:p-4 print:hidden"
    >
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">{selects}</div>
      {(active || note) && (
        <div className="mt-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-xs text-slate-600">
          <p>{note ?? "Showing only the students these choices leave."}</p>
          {active && (
            <button type="button" onClick={clear} className="text-sm font-semibold text-psu-700 hover:underline">
              Clear filters
            </button>
          )}
        </div>
      )}
      {views && <SavedViews state={state} />}
    </section>
  );
}
