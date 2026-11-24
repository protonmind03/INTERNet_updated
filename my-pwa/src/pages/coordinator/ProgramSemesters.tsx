import { SEMESTER_LABELS, type Semester } from "../../lib/semesters";

/*
| Phase 2.6: the semester(s) a program's OJT runs in. One semester, or two
| in order when the OJT continues into a second term (its students are
| then carried over, with their hours, from the Terms page).
*/

const CHOICES: Semester[][] = [
  [],
  ["first"],
  ["second"],
  ["midyear"],
  ["first", "second"],
  ["second", "midyear"],
  ["second", "first"],
  ["midyear", "first"],
];

const label = (semesters: Semester[]) =>
  semesters.length === 0 ? "Not set" : semesters.map((semester) => SEMESTER_LABELS[semester]).join(", then ").replace(/, then (\w)/, (_all, first: string) => `, then ${first.toLowerCase()}`);

export default function ProgramSemesters({ programId, programName, value, onChange }: { programId: number; programName: string; value: Semester[]; onChange: (semesters: Semester[]) => void }) {
  const current = value.join(",");
  return (
    <label className="flex items-center gap-1.5 text-xs font-medium text-slate-700">
      OJT in
      <select
        aria-label={`OJT semesters of ${programName}`}
        className="field min-h-11 py-1 text-xs"
        value={current}
        data-program={programId}
        onChange={(event) => onChange(event.target.value ? (event.target.value.split(",") as Semester[]) : [])}
      >
        {CHOICES.map((choice) => (
          <option key={choice.join(",") || "none"} value={choice.join(",")}>
            {label(choice)}
          </option>
        ))}
      </select>
    </label>
  );
}
