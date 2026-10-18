import { useId, useState } from "react";
import SavedViews from "./SavedViews";
import Icon from "../../components/Icon";
import { Skeleton } from "../../components/ui";
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
| On a phone (UX pass, Iteration 16) the bar is one line saying which
| students are shown, and opens the choices on a tap, so the page's own
| content is not pushed below the first screen. From the small breakpoint
| up it is open, as before.
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
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const chosen = Object.values(filters).filter(Boolean).length;
  // The one line a phone shows; the choices open beneath it.
  const toggle = (
    <button
      type="button"
      onClick={() => setOpen((current) => !current)}
      aria-expanded={open}
      aria-controls={panelId}
      className="flex min-h-11 w-full items-center justify-between gap-2 rounded-lg text-left text-sm sm:hidden"
    >
      <span className="min-w-0">
        <span className="font-semibold text-slate-900">Which students</span>
        <span className="text-slate-600"> · {chosen === 0 ? "all" : `${chosen} ${chosen === 1 ? "choice" : "choices"} on`}</span>
      </span>
      <Icon name="chevron-down" size={18} className={`shrink-0 text-slate-500 transition-transform ${open ? "rotate-180" : ""}`} />
    </button>
  );
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

  // The choices are still on their way: the bar's place, empty, so the page does not move when they come.
  if (!state.ready && selects.length === 0) {
    return (
      <section
        aria-label="Which students"
        aria-busy="true"
        className="rounded-xl border border-slate-200/80 bg-white p-3 shadow-card sm:p-4 print:hidden"
      >
        {/* A phone shows the closed line's place; wider screens, the open bar's. */}
        <div className="flex h-11 items-center sm:hidden" aria-hidden="true">
          <Skeleton className="h-4 w-44" />
        </div>
        <div className="hidden grid-cols-2 gap-3 sm:grid md:grid-cols-3 xl:grid-cols-6" aria-hidden="true">
          {[0, 1, 2].map((choice) => (
            <div key={choice} className="space-y-1.5">
              <Skeleton className="h-3.5 w-1/2" />
              <Skeleton className="h-10 w-full rounded-lg" />
            </div>
          ))}
        </div>
      </section>
    );
  }
  if (selects.length === 0) return null;

  return (
    <section
      aria-label="Which students"
      className="rounded-xl border border-slate-200/80 bg-white p-3 shadow-card sm:p-4 print:hidden"
    >
      {toggle}
      <div id={panelId} className={`${open ? "mt-3 block" : "hidden"} sm:mt-0 sm:block`}>
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
      </div>
    </section>
  );
}
