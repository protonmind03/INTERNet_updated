import type { ReactNode } from "react";
import { PsuSeal } from "../brand";
import type { FormCode } from "../lib/psuForms";

/*
|--------------------------------------------------------------------------
| A PSU FORM, AS PRINTED (revisions, November 2026)
|--------------------------------------------------------------------------
|
| The university's internship forms share one head, read from the photos of
| the real forms (FM-AA-INT-01, -13, -17, -19, -20): the seal at the left,
| the form's title in capitals and bold, "PANGASINAN STATE UNIVERSITY" and
| the campus under it, and the form code, revision and date at the top
| right. Black on white, Arial-like type, ruled boxes. This draws that head
| and a ruled body for whatever form is put inside, for printing or saving
| as PDF from the browser. It is hidden on screen unless `onScreen`.
|
*/


export default function PsuFormSheet({
  title,
  form,
  campus = "Lingayen",
  onScreen = false,
  children,
  className = "",
}: {
  title: string;
  /** The form's code at the top right; none for a page the university has no form for (the monthly report). */
  form?: FormCode;
  /** The campus name without "Campus". */
  campus?: string;
  /** Shown on screen too (a preview); otherwise only when printed. */
  onScreen?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <article className={`psu-form ${onScreen ? "" : "hidden print:block"} ${className}`} aria-label={title}>
      {form && (
        <p className="psu-form-code">
          {form.code}
          <br />
          {form.rev}
          <br />
          {form.date}
        </p>
      )}
      <header className="psu-form-head">
        <span className="psu-form-seal">
          <PsuSeal size={84} clearSpace={false} decorative />
        </span>
        <span className="psu-form-titles">
          <span className="psu-form-title">{title}</span>
          <span className="psu-form-university">PANGASINAN STATE UNIVERSITY</span>
          <span className="psu-form-campus">
            <u>{campus.replace(/\s*campus$/i, "")}</u> Campus
          </span>
        </span>
      </header>
      {children}
    </article>
  );
}

/** A two-column ruled row: a label in capitals and its value, as at the top of the forms. */
export function FormField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <tr>
      <th scope="row" className="psu-form-label">
        {label}
      </th>
      <td className="psu-form-value">{children}</td>
    </tr>
  );
}
