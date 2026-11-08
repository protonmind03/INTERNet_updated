import { useEffect, useState, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import Icon, { type IconName } from "../../components/Icon";
import PsuFormSheet, { FormField } from "../../components/PsuFormSheet";
import { Button } from "../../components/ui";
import StudentLayout from "../../layouts/StudentLayout";
import { API_URL, withStudentAuth } from "../../lib/api";
import { readRecord, saveRecord } from "../../lib/offlineStore";
import { PSU_FORMS, type FormCode } from "../../lib/psuForms";
import { useAccount } from "../../lib/session";

/*
|--------------------------------------------------------------------------
| FILL AND PRINT: THE UNIVERSITY'S PRE-OJT FORMS (Tasks · Documents, change1108)
|--------------------------------------------------------------------------
|
| Four of the internship requirements are papers the trainee fills in and
| has signed (and two notarized) before the OJT; INTERNet now fills them
| in from the record and prints them in the university's own formats (read
| from the photos of the real forms):
|
|   Application for Internship                     FM-AA-INT-01
|   Consent Form                                   FM-AA-INT-03
|   Internship Release Form                        (no code on the form)
|   Training Agreement and Liability Waiver Form   FM-AA-INT-18
|
| Each line the record knows is filled in (name, program, required hours,
| company); every line can be changed, and what is typed is kept on this
| device only (it never leaves it), ready for the next print. Signatures,
| the registrar's certification, the officials' names and the notary's
| details are left blank for the people who sign: the forms are printed,
| signed by hand, and the signed copy uploaded in Documents as before.
|
*/

type FormKey = "application" | "consent" | "release" | "waiver";

const FORMS: { key: FormKey; title: string; code?: FormCode; icon: IconName; line: string }[] = [
  { key: "application", title: "Application for Internship", code: PSU_FORMS.application, icon: "clipboard", line: "Your profile, academic credentials and the company, for approval" },
  { key: "consent", title: "Consent Form", code: PSU_FORMS.consent, icon: "edit", line: "Your sworn consent to the internship's terms; to be notarized" },
  { key: "release", title: "Internship Release Form", icon: "document", line: "Releases you to your company once your documents are complete" },
  { key: "waiver", title: "Training Agreement and Liability Waiver Form", code: PSU_FORMS.waiver, icon: "shield", line: "For overtime training, with your parent's consent (optional)" },
];

type Fields = {
  lastName: string;
  firstName: string;
  middleName: string;
  age: string;
  sex: string;
  civilStatus: string;
  contact: string;
  course: string;
  major: string;
  yearSection: string;
  guardian: string;
  currentAddress: string;
  homeAddress: string;
  town: string;
  hours: string;
  company: string;
  companyAddress: string;
  companyHead: string;
  companyContact: string;
  companyRep: string;
  from: string;
  to: string;
};

const EMPTY: Fields = {
  lastName: "",
  firstName: "",
  middleName: "",
  age: "",
  sex: "",
  civilStatus: "",
  contact: "",
  course: "",
  major: "",
  yearSection: "",
  guardian: "",
  currentAddress: "",
  homeAddress: "",
  town: "",
  hours: "",
  company: "",
  companyAddress: "",
  companyHead: "",
  companyContact: "",
  companyRep: "",
  from: "",
  to: "",
};

/** What each form asks for, in the order it asks. */
const ASKS: Record<FormKey, (keyof Fields)[]> = {
  application: ["lastName", "firstName", "middleName", "age", "sex", "civilStatus", "contact", "course", "yearSection", "major", "guardian", "currentAddress", "homeAddress", "company", "companyAddress", "companyHead", "companyContact", "hours"],
  consent: ["firstName", "middleName", "lastName", "homeAddress", "course", "hours", "company"],
  release: ["firstName", "middleName", "lastName", "homeAddress", "course", "major", "hours", "company", "companyAddress", "from", "to"],
  waiver: ["firstName", "middleName", "lastName", "company", "guardian", "companyRep"],
};

const LABELS: Record<keyof Fields, string> = {
  lastName: "Last name",
  firstName: "First name",
  middleName: "Middle name",
  age: "Age",
  sex: "Sex",
  civilStatus: "Civil status",
  contact: "Contact number",
  course: "Course",
  major: "Major",
  yearSection: "Year and section",
  guardian: "Parent or guardian",
  currentAddress: "Current address",
  homeAddress: "Home address",
  town: "Town",
  hours: "Required hours",
  company: "Company or agency",
  companyAddress: "Company address",
  companyHead: "Head of the company or agency",
  companyContact: "Company contact number",
  companyRep: "Company representative",
  from: "From (start date)",
  to: "To (end date)",
};

/** A blank to fill by hand, or the value on its line. */
function Blank({ value, wide = false }: { value?: string; wide?: boolean }) {
  return <span className={`psu-blank ${wide ? "psu-blank--wide" : ""}`}>{value?.trim() || " "}</span>;
}

function Signature({ name, title }: { name?: string; title: string }) {
  return (
    <span className="psu-sig">
      <span className="psu-sig-line">{name?.trim() || " "}</span>
      <span className="psu-sig-title">{title}</span>
    </span>
  );
}

function Notary() {
  return (
    <div className="psu-notary">
      <p>
        SUBSCRIBED AND SWORN TO BEFORE ME this <Blank /> day of <Blank />, <Blank /> at <Blank />, Philippines.
      </p>
      <p className="psu-notary-book">
        Doc. No. <Blank />
        <br />
        Page No. <Blank />
        <br />
        Book No. <Blank />
        <br />
        Series of <Blank />
      </p>
    </div>
  );
}

function ResCert() {
  return (
    <p className="psu-rescert">
      Res. Cert No.: <Blank />
      <br />
      Issued on: <Blank />
      <br />
      Issued at: <Blank />
    </p>
  );
}

function Sheet({ form, f }: { form: FormKey; f: Fields }) {
  const full = [f.firstName, f.middleName ? `${f.middleName.trim()[0]}.` : "", f.lastName].filter(Boolean).join(" ");
  const meta = FORMS.find((item) => item.key === form)!;
  if (form === "application")
    return (
      <PsuFormSheet title="Application for Internship" form={meta.code} onScreen>
        <table>
          <tbody>
            <tr>
              <th colSpan={4} className="psu-form-section">A. Personal profile</th>
            </tr>
            <tr>
              <th className="psu-form-label">Name</th>
              <td className="psu-form-value">{f.lastName}</td>
              <td className="psu-form-value">{f.firstName}</td>
              <td className="psu-form-value">{f.middleName}</td>
            </tr>
            {(
              [
                ["Age", f.age, "Civil status", f.civilStatus],
                ["Sex", f.sex, "Contact number", f.contact],
                ["Course", f.course, "Year & section", f.yearSection],
                ["Major", f.major, "Parent/guardian", f.guardian],
              ] as const
            ).map(([a, av, b, bv]) => (
              <tr key={a}>
                <th className="psu-form-label">{a}</th>
                <td className="psu-form-value">{av}</td>
                <th className="psu-form-label">{b}</th>
                <td className="psu-form-value">{bv}</td>
              </tr>
            ))}
            <FormField label="Current address">{f.currentAddress}</FormField>
            <FormField label="Home address">{f.homeAddress}</FormField>
          </tbody>
        </table>
        <div className="psu-form-text">
          <h3>B. Academic credentials/qualifications</h3>
          <p>
            <i>
              This is to certify that as per records kept in this office, the above name had already taken and pass <Blank /> units except the following subject/s to wit:
            </i>
          </p>
          <table>
            <thead>
              <tr>
                {["Sem", "SY", "Subject", "Passing", "Failing", "Grade", "Signature", "Date"].map((head) => (
                  <th key={head} className="psu-form-label text-center">
                    {head}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: 5 }, (_, row) => (
                <tr key={row}>
                  {Array.from({ length: 8 }, (_, cell) => (
                    <td key={cell} style={{ height: "0.26in" }} />
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <p style={{ marginTop: 8 }}>
            <i>
              This is to certify that he/she is <Blank /> to undergo internship.
            </i>
          </p>
          <p>Certified and verified true and correct:</p>
          <p className="text-center">
            <Signature title="Campus Registrar" />
          </p>
        </div>
        <table>
          <tbody>
            <tr>
              <th colSpan={2} className="psu-form-section">C. Firm/agency/company for internship</th>
            </tr>
            <FormField label="Name of the firm/agency/company">{f.company}</FormField>
            <FormField label="Address">{f.companyAddress}</FormField>
            <FormField label="Head">{f.companyHead}</FormField>
            <FormField label="Contact number">{f.companyContact}</FormField>
            <FormField label="Number of hours">{f.hours}</FormField>
          </tbody>
        </table>
        <div className="psu-form-text">
          <p>
            <i>Note: Please attach Medical Certificate and Psychological Test from any government physician, certifying that the student applicant is physically, emotionally, and mentally fit for the internship training activity.</i>
          </p>
          <h3>Recommending approval</h3>
          <div className="psu-sig-grid">
            <Signature title="Internship/Practicum Subject Instructor" />
            <Signature title="Campus Internship Coordinator" />
            <Signature title="Department Chair" />
            <Signature title="College Dean" />
          </div>
          <h3>Approved by</h3>
          <p className="text-center">
            <Signature title="Campus Executive Director" />
          </p>
        </div>
      </PsuFormSheet>
    );

  if (form === "consent")
    return (
      <PsuFormSheet title="Consent Form" form={meta.code} onScreen>
        <div className="psu-form-text psu-form-text--letter">
          <p>
            I, <Blank value={full} wide />, Filipino, of legal age, and residing at <Blank value={f.homeAddress} wide /> after being duly sworn by law, do hereby depose and say that:
          </p>
          <ol className="psu-numbered">
            <li>
              I am a student of Pangasinan State University, Lingayen Campus and that as a course requirement for <Blank value={f.course} wide />, I am required to undergo Internship / Practicum in any company in line with my major field of specialization for <Blank value={f.hours} /> hours;
            </li>
            <li>
              That the Pangasinan State University, Lingayen Campus, thru the Campus Internship Coordinator and the Internship/Practicum Subject Instructor has requested <Blank value={f.company} wide /> allow me to undergo thereat and said company had accepted said request;
            </li>
            <li>
              I promise to render the necessary work to the best of my ability in order that my practicum shall be brought to a successful conclusion and that <Blank value={f.company} wide /> and the Pangasinan State University, Lingayen Campus shall not adversely affect;
            </li>
            <li>That while performing the practicum and the duration thereof, I shall abide by the rules and policies of said Company and Pangasinan State University, Lingayen Campus relative to the work covered by said practicum and such order and instruction issued or to be issued thereby;</li>
            <li>I shall be punctual in my attendance and shall abide by the evaluation given me by said company based on such internship;</li>
            <li>
              I declare unconditional that there exists no employer-employee relationship between <Blank value={f.company} wide /> and me, and hereby hold its officers, directors and personnel free and harmless from any case or causes of action, claims or otherwise arising from or about my internship which I have, including money claims, it understood that the internship is just a part of the academic preparation and thus non-compensable;
            </li>
          </ol>
          <p>
            Signed at <Blank />, Pangasinan. This <Blank /> day of <Blank />, 20<Blank />.
          </p>
          <div className="psu-sig-grid">
            <div>
              <p>Witnesses:</p>
              <Signature title="Campus Internship Coordinator" />
            </div>
            <div>
              <p>Conforme:</p>
              <Signature name={full} title="Signature over Printed Name of Student" />
            </div>
            <div>
              <p>Noted:</p>
              <Signature title="Campus Executive Director" />
            </div>
            <div>
              <ResCert />
              <Signature name={f.guardian} title="Signature over Printed Name of Parent/Guardian" />
            </div>
          </div>
          <Notary />
        </div>
      </PsuFormSheet>
    );

  if (form === "release")
    return (
      <PsuFormSheet title="Internship Release Form" onScreen>
        <div className="psu-form-text psu-form-text--letter">
          <p>
            <Signature title="Date" />
          </p>
          <p>
            <Blank value={full} wide />
            <br />
            <Blank value={f.homeAddress} wide />
          </p>
          <p>
            <b>Course: </b>
            <Blank value={f.course} wide />
            <br />
            <b>Major: </b>
            <Blank value={f.major} wide />
          </p>
          <p>
            Upon completion and submission of all your required documents for your Internship / Practicum activity, you are hereby released to undergo <Blank value={f.hours} /> hours Internship / Practicum at
          </p>
          <p>
            <b>Cooperating Company/Agency/Firm: </b>
            <Blank value={f.company} wide />
            <br />
            <b>Company/Agency/Firm Address: </b>
            <Blank value={f.companyAddress} wide />
          </p>
          <p>
            From <Blank value={f.from} /> to <Blank value={f.to} />.
          </p>
          <p>Please be guided with the school and company Internship / Practicum policies and guidelines throughout the duration of your Internship / Practicum Activity.</p>
          <div className="psu-sig-grid">
            <Signature title="Internship / Practicum Subject Instructor" />
            <Signature title="Campus Internship Coordinator" />
          </div>
          <p>Noted:</p>
          <p className="text-center">
            <Signature title="Campus Executive Director" />
          </p>
        </div>
      </PsuFormSheet>
    );

  return (
    <PsuFormSheet title="Training Agreement and Liability Waiver Form" form={meta.code} onScreen>
      <div className="psu-form-text psu-form-text--letter">
        <p>
          I, <Blank value={full.toUpperCase()} wide />, a student of Pangasinan State University, hereby voluntarily agree to undergo overtime training in my Internship Training at <Blank value={f.company} wide /> under the following terms and conditions:
        </p>
        <ol className="psu-lettered">
          <li>That I have consent from my parents/guardians for the said overtime.</li>
          <li>That the company/establishment where I am undergoing my training has knowledge of the overtime.</li>
          <li>
            That I fully understand that the Pangasinan State University and <Blank value={f.company} wide /> is no longer responsible/liable for any injury or incident that may occur during the said overtime.
          </li>
        </ol>
        <div className="psu-sig-grid">
          <div>
            <Signature name={full.toUpperCase()} title="Student-Intern" />
            <ResCert />
          </div>
          <div>
            <p>With our consent and approval:</p>
            <Signature name={f.guardian} title="Parent/Guardian" />
            <ResCert />
          </div>
          <div>
            <Signature name={f.companyRep} title="Company Representative" />
            <ResCert />
          </div>
        </div>
        <Notary />
      </div>
    </PsuFormSheet>
  );
}

export default function PrintForms() {
  const student = useAccount("student");
  const [params, setParams] = useSearchParams();
  const form = (FORMS.find((item) => item.key === params.get("form"))?.key ?? "application") as FormKey;
  const [fields, setFields] = useState<Fields | null>(null);

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

  const change = (key: keyof Fields, value: string) =>
    setFields((current) => {
      if (!current) return current;
      const next = { ...current, [key]: value };
      void saveRecord("student", "print-forms", next).catch(() => undefined);
      return next;
    });

  const meta = FORMS.find((item) => item.key === form)!;

  return (
    <StudentLayout title="Fill and print" subtitle="The university's pre-OJT forms, filled in from your record">
      <div className="space-y-4">
        <div className="grid gap-2 print:hidden sm:grid-cols-2 xl:grid-cols-4" role="tablist" aria-label="Forms">
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
          <section aria-labelledby="form-fields" className="rounded-2xl bg-white p-4 ring-1 ring-inset ring-(--role-hairline) print:hidden lg:sticky lg:top-4">
            <h2 id="form-fields" className="text-[16px] font-extrabold text-slate-900">
              {meta.title}
            </h2>
            <p className="mt-0.5 text-[13px] text-slate-600">{meta.line}. What you type stays on this device.</p>
            {fields && (
              <div className="mt-3 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                {ASKS[form].map((key) => (
                  <label key={key} className={key.toLowerCase().includes("address") || key === "company" ? "sm:col-span-2 lg:col-span-1 xl:col-span-2" : ""}>
                    <span className="mb-1 block text-[12.5px] font-bold text-slate-700">{LABELS[key]}</span>
                    <input value={fields[key]} onChange={(event) => change(key, event.target.value)} className="field" />
                  </label>
                ))}
              </div>
            )}
            <div className="mt-4 flex flex-wrap gap-2">
              <Button icon="printer" onClick={() => window.print()}>
                Print or save PDF
              </Button>
            </div>
            <p className="mt-3 text-[12.5px] text-slate-500">Signatures, the registrar's part and the notary's are left blank for the people who sign. Upload the signed copy in Documents.</p>
          </section>
          <PreviewFrame>{fields && <Sheet form={form} f={fields} />}</PreviewFrame>
        </div>
      </div>
    </StudentLayout>
  );
}

function PreviewFrame({ children }: { children: ReactNode }) {
  return (
    <div tabIndex={0} role="region" aria-label="Preview of the form" className="psu-preview overflow-x-auto rounded-2xl bg-slate-200/70 p-3 ring-1 ring-inset ring-(--role-hairline) sm:p-5 print:bg-transparent print:p-0 print:ring-0">
      <div className="mx-auto w-[8.5in] max-w-none bg-white p-[0.5in] shadow-raised print:w-auto print:p-0 print:shadow-none">{children}</div>
    </div>
  );
}
