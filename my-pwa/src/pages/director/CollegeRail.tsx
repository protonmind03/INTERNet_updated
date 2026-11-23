import { CollegeMark } from "../../brand/MarkImages";
import type { RailCollege } from "./useChosenCollege";

/*
|--------------------------------------------------------------------------
| THE COLLEGE MARKS: THE DIRECTOR'S FILTER (Phase 1.6)
|--------------------------------------------------------------------------
|
| The portal's one bold element. One mark per college (CASL, CBPA, CCS,
| CHTM, CTE, CIT), "All colleges" first and chosen by default. Choosing a
| mark scopes the page to that college; the choice is in the address
| (?college=), so Back and a shared link keep it. On a phone the row
| scrolls sideways in its own box; the page itself never does.
|
*/

export default function CollegeRail({ colleges, chosen, onChoose }: { colleges: RailCollege[]; chosen: number | null; onChoose: (id: number | null) => void }) {
  const option = (selected: boolean) =>
    `flex min-h-11 shrink-0 snap-start flex-col items-center gap-1.5 rounded-xl px-3 pb-2 pt-2.5 text-center outline-none ring-offset-2 ring-offset-(--role-surface) focus-visible:ring-2 focus-visible:ring-(--role-ink) ${
      selected ? "bg-(--role-chrome) text-(--role-on-chrome)" : "text-(--role-ink) hover:bg-white"
    }`;
  const markRing = (selected: boolean) =>
    `grid h-12 w-12 place-items-center rounded-full bg-white ${selected ? "ring-[3px] ring-(--role-accent)" : "ring-1 ring-(--role-hairline)"}`;

  return (
    <div role="radiogroup" aria-label="College" className="-mx-4 overflow-x-auto px-4 pb-1 md:mx-0 md:px-0">
      <div className="flex w-max snap-x gap-1.5">
        <button type="button" role="radio" aria-checked={chosen === null} onClick={() => onChoose(null)} className={option(chosen === null)}>
          <span aria-hidden="true" className={`${markRing(chosen === null)} font-display text-sm font-bold text-(--role-ink)`}>
            PSU
          </span>
          <span className="text-[13px] font-semibold">All colleges</span>
        </button>
        {colleges.map((college) => {
          const selected = chosen === college.id;
          return (
            <button
              key={college.id}
              type="button"
              role="radio"
              aria-checked={selected}
              title={college.name}
              onClick={() => onChoose(college.id)}
              className={option(selected)}
            >
              <span className={markRing(selected)}>
                <CollegeMark shortName={college.short_name} markKey={college.mark_key} size={40} alt="" />
              </span>
              <span className="text-[13px] font-semibold">{college.short_name || college.name}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
