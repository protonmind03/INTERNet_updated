import { useState } from "react";
import "@fontsource/unifrakturmaguntia/latin-400.css";
import { PsuSeal } from "../brand";
import { MarkImage } from "../brand/MarkImages";
import { getMark } from "../brand/psuMarks";
import { formatHours } from "../lib/format";
import type { SignatureImage, TimeRecordHeaderData } from "../lib/timeRecordHeader";

/*
|--------------------------------------------------------------------------
| THE TIME RECORD'S HEADER, DETAILS AND SIGNATURE
|--------------------------------------------------------------------------
|
| Iteration 20. Above the record's grid (which is unchanged), centred and
| stacked as the university's forms are: the seal (2 cm in print), the
| republic line, the university in blackletter, the campus, the college,
| the program's formal name, the locality, then the title and the month.
| Every line comes from one endpoint (GET /api/time-record/:id/header),
| kept for offline use with the rest of the trainee's saved data.
|
| On screen the sheet sits in a print-preview frame, at print size or
| zoomed to 200% (5 pt type cannot be read on a phone at print size).
|
*/

const TIMES = "'Times New Roman', 'Liberation Serif', Times, serif";
const BLACKLETTER = "'Old English Text MT', 'UnifrakturMaguntia', serif";

/** "Pangasinan State University", whatever capitals it was saved with. */
const titleCase = (text: string) =>
  text.toLowerCase().replace(/\b([a-z])/g, (letter) => letter.toUpperCase()).replace(/\b(Of|The|And|In)\b/g, (word, _m, at) => (at === 0 ? word : word.toLowerCase()));

export function DtrHeader({ data, monthLabel }: { data: TimeRecordHeaderData | null; monthLabel: string }) {
  const institution = data?.institution;
  const trainee = data?.trainee;
  return (
    <header className="dtr-header text-center" style={{ fontFamily: TIMES }}>
      <div className="dtr-seal mx-auto">
        {/* The seal the institution details name (seal_asset, from the PSU set); the university's by default. */}
        {institution && institution.seal_asset !== "psu-seal" && getMark(institution.seal_asset) ? (
          <MarkImage mark={getMark(institution.seal_asset)} fallbackCode="PSU" size={76} alt={getMark(institution.seal_asset)?.name ?? ""} />
        ) : (
          <PsuSeal size={76} clearSpace={false} />
        )}
      </div>
      {institution && (
        <>
          <p className="dtr-line" style={{ fontSize: "5pt", textTransform: "uppercase" }}>{institution.republic_line}</p>
          <p className="dtr-line" style={{ fontFamily: BLACKLETTER, fontSize: "22pt", lineHeight: 1.1 }}>{titleCase(institution.university_name)}</p>
          <p className="dtr-line" style={{ fontSize: "6pt" }}>{institution.campus_name}</p>
          {trainee?.program_linked && trainee.college && (
            <p className="dtr-line" style={{ fontSize: "9pt", textTransform: "uppercase" }}>{trainee.college}</p>
          )}
          {trainee?.program && <p className="dtr-line" style={{ fontSize: "8pt", fontStyle: "italic" }}>{trainee.program}</p>}
          <p className="dtr-line" style={{ fontSize: "5pt" }}>{institution.locality_line}</p>
        </>
      )}
      <h2 className="mt-2 font-sans text-lg font-bold tracking-tight text-slate-900">Daily Time Record</h2>
      <p className="font-sans text-sm text-slate-700">On-the-Job Training · {monthLabel}</p>
    </header>
  );
}

/** The trainee's details under the header, read live. */
export function TraineeDetails({
  data,
  fallback,
  certificationLine,
}: {
  data: TimeRecordHeaderData | null;
  fallback: { name: string; studentId: string; program?: string | null; company?: string | null; supervisor?: string | null };
  certificationLine: string | null;
}) {
  const trainee = data?.trainee;
  const rows: [string, string][] = [
    ["Name", trainee?.name || fallback.name],
    ["Student ID", trainee?.student_id || fallback.studentId],
    ["Program · block", [trainee?.program || fallback.program, trainee?.block].filter(Boolean).join(" · ") || "—"],
    ["Company", trainee?.company || fallback.company || "—"],
    ["Supervisor", trainee?.supervisor || fallback.supervisor || "—"],
    ["Required hours", trainee?.required_hours !== null && trainee?.required_hours !== undefined ? formatHours(trainee.required_hours) : "—"],
    ["Verified to date", trainee ? formatHours(trainee.verified_hours) : "—"],
  ];
  return (
    <dl className="mt-5 grid gap-x-8 gap-y-1.5 text-sm sm:grid-cols-2 print:grid-cols-2">
      {rows.map(([label, value]) => (
        <div key={label} className="flex gap-2">
          <dt className="w-32 shrink-0 text-slate-500">{label}</dt>
          <dd className="font-medium text-slate-900">{value}</dd>
        </div>
      ))}
      {certificationLine && (
        <div className="flex gap-2 sm:col-span-2 print:col-span-2">
          <dt className="w-32 shrink-0 text-slate-500">Certification</dt>
          <dd className="font-medium text-slate-900">{certificationLine}</dd>
        </div>
      )}
    </dl>
  );
}

/** The trainee's signature over the line: the strokes when there are some, the PNG otherwise. At most 45 mm by 15 mm. */
export function SignatureMark({ image }: { image: SignatureImage | null }) {
  if (!image) return <span className="block h-[15mm]" aria-hidden="true" />;
  const label = "The trainee's signature";
  if (image.svg_paths) {
    return (
      <svg viewBox="0 0 600 200" role="img" aria-label={label} className="dtr-signature mx-auto block" preserveAspectRatio="xMidYMid meet">
        <path d={image.svg_paths} fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  return image.png ? <img src={image.png} alt={label} className="dtr-signature mx-auto block object-contain" /> : null;
}

/** The on-screen frame: print size, or zoomed to 200%. Print ignores it. */
export function PrintPreviewFrame({ children }: { children: React.ReactNode }) {
  const [zoom, setZoom] = useState(false);
  return (
    <div className="dtr-frame">
      <div role="group" aria-label="Preview size" className="mb-2 flex justify-end gap-1 print:hidden">
        {[
          { on: false, label: "Print size" },
          { on: true, label: "Zoom 200%" },
        ].map((option) => (
          <button
            key={option.label}
            type="button"
            aria-pressed={zoom === option.on}
            onClick={() => setZoom(option.on)}
            className={`min-h-11 rounded-lg px-3 text-sm font-semibold ${zoom === option.on ? "bg-slate-900 text-white" : "bg-white text-slate-700 ring-1 ring-slate-300"}`}
          >
            {option.label}
          </button>
        ))}
      </div>
      <div className={`dtr-frame-viewport ${zoom ? "dtr-frame-viewport--zoom" : ""}`}>{children}</div>
    </div>
  );
}
