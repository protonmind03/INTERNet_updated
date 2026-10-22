import { MarkImage, Monogram } from "../brand/MarkImages";
import type { PsuMark } from "../brand/psuMarks";

/*
| PSU redesign, Section 2: choosing a college's or a program's mark (or the
| Time Record's seal) from the shipped PSU set. A radio group of the marks,
| each with its name; "None" leaves the monogram. No uploads.
*/
export default function MarkPicker({
  name,
  label,
  choices,
  value,
  onChange,
  noneCode,
  allowNone = true,
}: {
  /** The radio group's name, one per form. */
  name: string;
  label: string;
  choices: PsuMark[];
  value: string;
  onChange: (key: string) => void;
  /** The short code the monogram shows when "None" is chosen. */
  noneCode: string;
  allowNone?: boolean;
}) {
  const option = (key: string, title: string, art: React.ReactNode) => (
    <label
      key={key || "none"}
      className={`flex min-h-14 cursor-pointer items-center gap-3 rounded-xl border px-3 py-2 text-sm has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-psu-600 ${
        value === key ? "border-psu-600 bg-psu-50 font-semibold text-slate-900" : "border-(--role-hairline) bg-white text-slate-700 hover:bg-slate-50"
      }`}
    >
      <input type="radio" name={name} value={key} checked={value === key} onChange={() => onChange(key)} className="sr-only" />
      {art}
      <span className="min-w-0 flex-1 leading-snug">{title}</span>
      {value === key && <span className="st-badge st-badge--info">Chosen</span>}
    </label>
  );
  return (
    <fieldset>
      <legend className="mb-1.5 block text-sm font-medium text-slate-700">{label}</legend>
      <div className="grid max-h-72 gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
        {allowNone && option("", `None (the ${noneCode || "short code"} monogram)`, <Monogram code={noneCode || "PSU"} size={36} alt="" />)}
        {choices.map((mark) => option(mark.key, mark.name, <MarkImage mark={mark} fallbackCode={mark.program ?? mark.college ?? "PSU"} size={36} alt="" />))}
      </div>
    </fieldset>
  );
}
