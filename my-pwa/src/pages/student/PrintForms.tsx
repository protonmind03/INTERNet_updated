import { useRef } from "react";
import { Link, useSearchParams } from "react-router-dom";
import Icon, { type IconName } from "../../components/Icon";
import StudentLayout from "../../layouts/StudentLayout";
import { useAccount } from "../../lib/session";
import { useTimeRecordHeader } from "../../lib/timeRecordHeader";
import FormButtons, { FormPreview } from "./forms/FormButtons";
import { ASKS, FORMS, LABELS, WIDE, blocksFor, fileNameFor, type DocMeta, type Fields, type FormKey, type Group } from "./forms/formModel";
import { TIMEFRAME, WEEKLY, timeframeBlocks, weeklyBlocks } from "./forms/recordForms";
import { timeframeFrom, useJournals, usePrintFields, weeklyFrom } from "./forms/useFormData";
import { resolutionPath } from "./resolutionTabs";
import { useTimeIn } from "./timeInContext";

/*
|--------------------------------------------------------------------------
| FILL AND PRINT: THE UNIVERSITY'S FORMS (Tasks · Documents)
|--------------------------------------------------------------------------
|
| Every university form the trainee prints, in the university's own
| formats (read from the photos of the real forms; each is defined once as
| blocks, in forms/formModel.ts and forms/recordForms.ts):
|
|   Before your OJT     Application for Internship (FM-AA-INT-01),
|                       Certification of Units Earned (FM-AA-INT-02, for
|                       the registrar to complete), Consent Form
|                       (FM-AA-INT-03), Internship Release Form, Training
|                       Agreement and Liability Waiver Form (FM-AA-INT-18)
|   From your record    Internship Time Frame (FM-AA-INT-17, the verified
|                       days) and Internship/Practicum Weekly Report
|                       (FM-AA-INT-19, the weekly reports)
|   Elsewhere           the Student-Intern's Feedback Form (FM-AA-INT-20)
|                       and the supervisor's Internship Evaluation Form
|                       (FM-AA-INT-13), filled in under Support
|
| Every line the trainee can answer has a field on the left; each line the
| record knows starts filled in. What is typed is kept on this device
| only. Lines for the registrar, officials, notary and signers stay blank.
| Print sends only the form to the printer, on A4; Save makes a PDF, or a
| Word file to keep editing (forms/FormButtons.tsx).
|
*/

type RecordKey = "timeframe" | "weekly";
type Key = FormKey | RecordKey;

const RECORD: { key: RecordKey; meta: DocMeta; icon: IconName; line: string; asks: Group[] }[] = [
  {
    key: "timeframe",
    meta: TIMEFRAME,
    icon: "calendar",
    line: "Every verified day and its hours, from your attendance",
    asks: [
      { title: "You", keys: ["yearSection", "course"] },
      { title: "The company", keys: ["company", "companyAddress", "companyRep"] },
    ],
  },
  {
    key: "weekly",
    meta: WEEKLY,
    icon: "document",
    line: "Every week's tasks and learnings, from your weekly reports",
    asks: [
      { title: "Your internship", keys: ["instructor", "jobDescription"] },
      { title: "The company", keys: ["company"] },
    ],
  },
];

export default function PrintForms() {
  return (
    <StudentLayout title="Fill and print" subtitle="The university's forms, filled in from your record">
      <PrintFormsBody />
    </StudentLayout>
  );
}

function FormTab({ on, title, code, icon, onClick }: { on: boolean; title: string; code: string; icon: IconName; onClick: () => void }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={on}
      onClick={onClick}
      className={`flex items-start gap-3 rounded-2xl p-3 text-left ring-1 ring-inset transition-colors ${on ? "bg-white shadow-raised ring-2 ring-psu-600" : "bg-white/60 ring-(--role-hairline) hover:bg-white"}`}
    >
      <span aria-hidden="true" className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${on ? "bg-gold-300 text-psu-950 ic-lit" : "bg-psu-50 text-psu-800"}`}>
        <Icon name={icon} size={19} />
      </span>
      <span className="min-w-0">
        <span className="block text-[14px] font-bold leading-snug text-slate-900">{title}</span>
        <span className="block text-[12px] text-slate-600">{code}</span>
      </span>
    </button>
  );
}

function PrintFormsBody() {
  const student = useAccount("student");
  const [params, setParams] = useSearchParams();
  const asked = params.get("form");
  const key: Key = (FORMS.find((item) => item.key === asked)?.key ?? RECORD.find((item) => item.key === asked)?.key ?? "application") as Key;
  const record = RECORD.find((item) => item.key === key);
  const { fields, change } = usePrintFields();
  const { attendance } = useTimeIn();
  const header = useTimeRecordHeader("student", student?.student_id, null);
  const journals = useJournals(key === "weekly");
  const sheet = useRef<HTMLElement>(null);

  const meta: DocMeta = record?.meta ?? FORMS.find((item) => item.key === key)!;
  const asks = record?.asks ?? ASKS[key as FormKey];
  const blocks = !fields
    ? []
    : key === "timeframe"
      ? timeframeBlocks(timeframeFrom(attendance.logs, header, fields))
      : key === "weekly"
        ? weeklyBlocks(weeklyFrom(journals ?? [], attendance.logs, header, fields))
        : blocksFor(key as FormKey, fields);
  const campus = header?.institution.campus_name || undefined;
  const verifiedDays = attendance.logs.filter((log) => log.time_in && log.status === "Verified").length;
  const choose = (next: Key) => setParams({ form: next }, { replace: true });

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <p className="eyebrow text-psu-800" id="forms-before">
          Before your OJT
        </p>
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5" role="tablist" aria-labelledby="forms-before">
          {FORMS.map((item) => (
            <FormTab key={item.key} on={item.key === key} title={item.title} code={item.code?.code ?? "PSU form"} icon={item.icon} onClick={() => choose(item.key)} />
          ))}
        </div>
      </div>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <div className="space-y-2">
          <p className="eyebrow text-psu-800" id="forms-record">
            From your record
          </p>
          <div className="grid gap-2 sm:grid-cols-2" role="tablist" aria-labelledby="forms-record">
            {RECORD.map((item) => (
              <FormTab key={item.key} on={item.key === key} title={item.meta.title} code={item.meta.code?.code ?? ""} icon={item.icon} onClick={() => choose(item.key)} />
            ))}
          </div>
        </div>
        <div className="space-y-2">
          <p className="eyebrow text-psu-800">Filled in under Support</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {[
              { to: resolutionPath("evaluation"), title: "Student-Intern's Feedback Form", code: "FM-AA-INT-20 · you fill it in", icon: "clipboard" as IconName },
              { to: `${resolutionPath("evaluation")}&side=supervisor`, title: "Internship Evaluation Form", code: "FM-AA-INT-13 · your supervisor's", icon: "star" as IconName },
            ].map((item) => (
              <Link key={item.title} to={item.to} className="flex items-start gap-3 rounded-2xl bg-white/60 p-3 ring-1 ring-inset ring-(--role-hairline) transition-colors hover:bg-white">
                <span aria-hidden="true" className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-psu-50 text-psu-800">
                  <Icon name={item.icon} size={19} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[14px] font-bold leading-snug text-slate-900">{item.title}</span>
                  <span className="block text-[12px] text-slate-600">{item.code}</span>
                </span>
                <Icon name="arrow-right" size={16} className="mt-1 shrink-0 text-slate-400" />
              </Link>
            ))}
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,4fr)_minmax(0,7fr)] lg:items-start">
        <section aria-labelledby="form-fields" className="rounded-2xl bg-white p-4 ring-1 ring-inset ring-(--role-hairline) lg:sticky lg:top-4">
          <h2 id="form-fields" className="text-[16px] font-extrabold text-slate-900">
            {meta.title}
          </h2>
          <p className="mt-0.5 text-[13px] text-slate-600">{record ? record.line : FORMS.find((item) => item.key === key)?.line}. What you type stays on this device.</p>
          {key === "timeframe" && (
            <p className="mt-3 rounded-xl bg-psu-50 px-3 py-2 text-[13px] text-psu-900">
              <b>{verifiedDays}</b> verified {verifiedDays === 1 ? "day" : "days"} so far. A day shows here once your supervisor verifies it.
            </p>
          )}
          {key === "weekly" && (
            <p className="mt-3 rounded-xl bg-psu-50 px-3 py-2 text-[13px] text-psu-900">
              <b>{journals?.length ?? 0}</b> weekly {journals?.length === 1 ? "report" : "reports"} so far.{" "}
              <Link to="/journal?view=weekly" className="font-bold underline">
                Write or edit them
              </Link>
              .
            </p>
          )}
          {fields &&
            asks.map((group) => (
              <fieldset key={group.title} className="mt-4">
                <legend className="eyebrow mb-2 text-psu-800">{group.title}</legend>
                <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                  {group.keys.map((field: keyof Fields) => (
                    <label key={field} className={WIDE.includes(field) ? "sm:col-span-2 lg:col-span-1 xl:col-span-2" : ""}>
                      <span className="mb-1 block text-[12.5px] font-bold text-slate-700">{LABELS[field]}</span>
                      <input value={fields[field]} onChange={(event) => change(field, event.target.value)} className="field" />
                    </label>
                  ))}
                </div>
              </fieldset>
            ))}
          <div className="mt-5">
            <FormButtons meta={meta} blocks={blocks} sheet={sheet} campus={campus} fileName={fields ? fileNameFor(meta, record ? header?.trainee.name || fields : fields) : meta.title} disabled={!fields} />
          </div>
          <p className="mt-3 text-[12.5px] text-slate-500">
            {key === "units"
              ? "The registrar lists your courses and units and signs it. Upload the certified copy in Documents."
              : record
                ? "The signatures are left for you, your instructor and the company to sign."
                : "The lines for the registrar, the officials and the notary are left blank for them to fill in. Upload the signed copy in Documents."}
          </p>
        </section>
        {fields && <FormPreview meta={meta} blocks={blocks} sheet={sheet} campus={campus} />}
      </div>
    </div>
  );
}
