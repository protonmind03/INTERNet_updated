import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import Icon from "../../components/Icon";
import { Button } from "../../components/ui";
import StudentLayout from "../../layouts/StudentLayout";
import { API_URL, withStudentAuth } from "../../lib/api";
import { readRecord, saveRecord } from "../../lib/offlineStore";
import { useAccount } from "../../lib/session";
import { toast } from "../../lib/toast";
import FormSheet from "./forms/FormSheet";
import { ASKS, EMPTY, FORMS, LABELS, WIDE, blocksFor, fileNameFor, type Fields, type FormKey } from "./forms/formModel";

/*
|--------------------------------------------------------------------------
| FILL AND PRINT: THE UNIVERSITY'S PRE-OJT FORMS (Tasks · Documents)
|--------------------------------------------------------------------------
|
| Four of the internship requirements are papers the trainee fills in and
| has signed (two of them notarized) before the OJT; INTERNet fills them in
| from the record, in the university's own formats (read from the photos
| of the real forms; the forms are defined once in forms/formModel.ts):
|
|   Application for Internship                     FM-AA-INT-01
|   Consent Form                                   FM-AA-INT-03
|   Internship Release Form                        (no code on the form)
|   Training Agreement and Liability Waiver Form   FM-AA-INT-18
|
| Every line the trainee can answer has a field on the left, grouped (you,
| your program, the company, your residence certificate, your parent or
| guardian, signing); each line the record knows starts filled in. What is
| typed is kept on this device only. The lines for the registrar, the
| officials and the notary stay blank: those people fill them in.
|
| Print sends only the form to the printer, on A4 (forms/formOutput.ts);
| Save makes a PDF, or a Word file to keep editing.
|
*/

export default function PrintForms() {
  const student = useAccount("student");
  const [params, setParams] = useSearchParams();
  const form = (FORMS.find((item) => item.key === params.get("form"))?.key ?? "application") as FormKey;
  const [fields, setFields] = useState<Fields | null>(null);
  const [saving, setSaving] = useState<"pdf" | "docx" | null>(null);
  const [menu, setMenu] = useState(false);
  const sheet = useRef<HTMLElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // What the record knows, under what was typed here before.
  useEffect(() => {
    if (!student?.student_id) return;
    let active = true;
    const id = encodeURIComponent(student.student_id);
    const parts = (student.name || "").trim().split(/\s+/);
    const known: Partial<Fields> = {
      firstName: parts.slice(0, -1).join(" ") || parts[0] || "",
      lastName: parts.length > 1 ? parts[parts.length - 1] : "",
      course: student.program ?? "",
      hours: student.required_hours ? String(Number(student.required_hours)) : "",
      company: student.company ?? "",
    };
    void Promise.all([
      fetch(`${API_URL}/api/company/${id}`, withStudentAuth())
        .then((response) => (response.ok ? response.json() : null))
        .catch(() => null),
      readRecord<Partial<Fields>>("student", "print-forms").catch(() => null),
    ]).then(([company, typed]) => {
      if (!active) return;
      const fromCompany: Partial<Fields> = company?.company
        ? { company: company.company.name || known.company, companyAddress: company.company.address ?? "", companyRep: company.company.supervisor ?? "" }
        : {};
      setFields({ ...EMPTY, ...known, ...fromCompany, ...(typed ?? {}) });
    });
    return () => {
      active = false;
    };
  }, [student?.student_id, student?.name, student?.program, student?.required_hours, student?.company]);

  // The Save menu closes on a click elsewhere or Escape.
  useEffect(() => {
    if (!menu) return;
    const close = (event: MouseEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent ? event.key === "Escape" : !menuRef.current?.contains(event.target as Node)) setMenu(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [menu]);

  const change = (key: keyof Fields, value: string) =>
    setFields((current) => {
      if (!current) return current;
      const next = { ...current, [key]: value };
      void saveRecord("student", "print-forms", next).catch(() => undefined);
      return next;
    });

  const meta = FORMS.find((item) => item.key === form)!;
  const blocks = fields ? blocksFor(form, fields) : [];

  const print = async () => {
    if (!sheet.current || !fields) return;
    const { printSheet } = await import("./forms/formOutput");
    await printSheet(sheet.current, fileNameFor(meta, fields));
  };
  const save = async (kind: "pdf" | "docx") => {
    setMenu(false);
    if (!sheet.current || !fields) return;
    setSaving(kind);
    try {
      const output = await import("./forms/formOutput");
      const name = fileNameFor(meta, fields);
      if (kind === "pdf") await (await import("./forms/formPdf")).saveFormPdf(meta, blocks, sheet.current, name);
      else await output.saveFormDocx(meta, blocks, sheet.current, name);
      toast.success(kind === "pdf" ? "Saved as a PDF in your downloads." : "Saved as a Word file in your downloads.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The file could not be made.");
    } finally {
      setSaving(null);
    }
  };

  return (
    <StudentLayout title="Fill and print" subtitle="The university's pre-OJT forms, filled in from your record">
      <div className="space-y-4">
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4" role="tablist" aria-label="Forms">
          {FORMS.map((item) => {
            const on = item.key === form;
            return (
              <button
                key={item.key}
                type="button"
                role="tab"
                aria-selected={on}
                onClick={() => setParams({ form: item.key }, { replace: true })}
                className={`flex items-start gap-3 rounded-2xl p-3 text-left ring-1 ring-inset transition-colors ${on ? "bg-white shadow-raised ring-2 ring-psu-600" : "bg-white/60 ring-(--role-hairline) hover:bg-white"}`}
              >
                <span aria-hidden="true" className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${on ? "bg-gold-300 text-psu-950 ic-lit" : "bg-psu-50 text-psu-800"}`}>
                  <Icon name={item.icon} size={19} />
                </span>
                <span className="min-w-0">
                  <span className="block text-[14px] font-bold leading-snug text-slate-900">{item.title}</span>
                  <span className="block text-[12px] text-slate-600">{item.code?.code ?? "PSU form"}</span>
                </span>
              </button>
            );
          })}
        </div>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,4fr)_minmax(0,7fr)] lg:items-start">
          <section aria-labelledby="form-fields" className="rounded-2xl bg-white p-4 ring-1 ring-inset ring-(--role-hairline) lg:sticky lg:top-4">
            <h2 id="form-fields" className="text-[16px] font-extrabold text-slate-900">
              {meta.title}
            </h2>
            <p className="mt-0.5 text-[13px] text-slate-600">{meta.line}. What you type stays on this device.</p>
            {fields &&
              ASKS[form].map((group) => (
                <fieldset key={group.title} className="mt-4">
                  <legend className="eyebrow mb-2 text-psu-800">{group.title}</legend>
                  <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                    {group.keys.map((key) => (
                      <label key={key} className={WIDE.includes(key) ? "sm:col-span-2 lg:col-span-1 xl:col-span-2" : ""}>
                        <span className="mb-1 block text-[12.5px] font-bold text-slate-700">{LABELS[key]}</span>
                        <input value={fields[key]} onChange={(event) => change(key, event.target.value)} className="field" />
                      </label>
                    ))}
                  </div>
                </fieldset>
              ))}
            <div className="mt-5 flex flex-wrap gap-2">
              <Button icon="printer" onClick={() => void print()} disabled={!fields}>
                Print
              </Button>
              <div ref={menuRef} className="relative">
                <Button variant="secondary" icon="download" busy={saving !== null} busyLabel="Saving" onClick={() => setMenu((open) => !open)} disabled={!fields} aria-haspopup="menu" aria-expanded={menu}>
                  Save
                  <Icon name="chevron-down" size={15} />
                </Button>
                {menu && (
                  <div role="menu" aria-label="Save as" className="absolute left-0 z-20 mt-1.5 w-60 overflow-hidden rounded-xl bg-white py-1 shadow-raised ring-1 ring-(--role-hairline)">
                    <button type="button" role="menuitem" onClick={() => void save("pdf")} className="flex w-full items-start gap-2.5 px-3 py-2.5 text-left hover:bg-psu-50">
                      <Icon name="document" size={18} className="mt-0.5 text-psu-700" />
                      <span>
                        <span className="block text-[14px] font-bold text-slate-900">PDF (.pdf)</span>
                        <span className="block text-[12px] text-slate-600">Ready to print or send, as it looks here</span>
                      </span>
                    </button>
                    <button type="button" role="menuitem" onClick={() => void save("docx")} className="flex w-full items-start gap-2.5 px-3 py-2.5 text-left hover:bg-psu-50">
                      <Icon name="edit" size={18} className="mt-0.5 text-psu-700" />
                      <span>
                        <span className="block text-[14px] font-bold text-slate-900">Word (.docx)</span>
                        <span className="block text-[12px] text-slate-600">To edit any part before printing</span>
                      </span>
                    </button>
                  </div>
                )}
              </div>
            </div>
            <p className="mt-3 text-[12.5px] text-slate-500">The lines for the registrar, the officials and the notary are left blank for them to fill in. Upload the signed copy in Documents.</p>
          </section>
          <div tabIndex={0} role="region" aria-label="Preview of the form" className="psu-preview overflow-x-auto rounded-2xl bg-slate-200/70 p-3 ring-1 ring-inset ring-(--role-hairline) sm:p-5">
            <div className="mx-auto w-[210mm] max-w-none shadow-raised">{fields && <FormSheet ref={sheet} meta={meta} blocks={blocks} />}</div>
          </div>
        </div>
      </div>
    </StudentLayout>
  );
}
