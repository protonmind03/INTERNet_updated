import "@fontsource/unifrakturmaguntia/latin-400.css";
import { useEffect, useState, type ReactNode } from "react";
import { PsuSeal } from "../../../brand";
import { pictureUrl } from "../../../lib/attachments";
import type { NarrativeParts } from "../../../lib/traineeRecord";
import { MOA, PARTS, REQUIREMENTS, type Records } from "./model";
import type { ReportPhoto, UploadedDocument } from "./useNarrativeData";

/*
|--------------------------------------------------------------------------
| THE NARRATIVE REPORT, AS PRINTED (or saved as PDF from the browser)
|--------------------------------------------------------------------------
|
| Each part on its own page under the letterhead of the university's sample
| table of contents: the seal at the left; on the right "Pangasinan State
| University" in blackletter, the campus, the college in italics, the
| program, and the host company in bold. The body is Times-like, as the
| sample's table of contents is.
|
| The Title Page waits for the university's sample (the user is sending a
| photo); until then it prints a plain page with the facts it needs, marked
| as a draft layout. The signed and issued papers (the agreement and the
| requirements) are listed where they go; they are put in by hand.
|
*/

const BLACKLETTER = "'Old English Text MT', 'UnifrakturMaguntia', serif";

function Letterhead({ records, college }: { records: Records; college: string }) {
  return (
    <header className="flex items-center gap-6 border-b border-black/20 pb-3">
      <PsuSeal size={70} clearSpace={false} decorative />
      <div className="flex-1 text-center leading-tight">
        <p style={{ fontFamily: BLACKLETTER, fontSize: "22pt" }}>Pangasinan State University</p>
        <p style={{ fontSize: "9pt" }}>{records.campus} Campus</p>
        {college && <p style={{ fontSize: "9pt", fontStyle: "italic" }}>{college}</p>}
        {records.program && <p style={{ fontSize: "9pt" }}>{records.program}</p>}
        {records.company && <p style={{ fontSize: "9pt", fontWeight: 700 }}>{records.company}</p>}
      </div>
    </header>
  );
}

function Page({ records, college, children }: { records: Records; college: string; children: ReactNode }) {
  return (
    <section className="narrative-page" style={{ breakBefore: "page", fontFamily: "'Times New Roman', Times, serif", fontSize: "12pt", color: "#000" }}>
      <Letterhead records={records} college={college} />
      <div className="pt-6">{children}</div>
    </section>
  );
}

function Text({ value }: { value?: string }) {
  return <div style={{ whiteSpace: "pre-wrap", textAlign: "justify", lineHeight: 1.6 }}>{value?.trim() || ""}</div>;
}

function Photo({ photo }: { photo: ReportPhoto }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let made: string | null = null;
    void pictureUrl("student", photo.id).then((value) => {
      made = value;
      setUrl(value);
    }).catch(() => undefined);
    return () => {
      if (made) URL.revokeObjectURL(made);
    };
  }, [photo.id]);
  return (
    <figure style={{ breakInside: "avoid", margin: 0 }}>
      {url && <img src={url} alt={photo.caption || photo.title} style={{ width: "100%", height: "2.6in", objectFit: "cover", border: "1px solid #000" }} />}
      <figcaption style={{ fontSize: "10pt", textAlign: "center", marginTop: 4 }}>
        {photo.caption || photo.title}
        {photo.day ? ` (${photo.day})` : ""}
      </figcaption>
    </figure>
  );
}

export default function NarrativePrint({
  records,
  parts,
  college,
  photos,
  documents,
}: {
  records: Records;
  parts: NarrativeParts;
  college: string;
  photos: ReportPhoto[];
  documents: UploadedDocument[];
}) {
  const text = (key: string) => parts[key]?.text ?? "";
  const heading = (title: string) => <h2 style={{ fontSize: "13pt", fontWeight: 700, margin: "0 0 10px" }}>{title}</h2>;
  const uploaded = (match?: RegExp) => (match ? documents.find((doc) => match.test(doc.doc_type)) : undefined);

  return (
    <div className="hidden print:block">
      {/* I. Title Page: a draft layout until the university's sample is in. */}
      <section style={{ fontFamily: "'Times New Roman', Times, serif", color: "#000", textAlign: "center", paddingTop: "1.2in" }}>
        <PsuSeal size={110} clearSpace={false} decorative />
        <p style={{ fontFamily: BLACKLETTER, fontSize: "26pt", marginTop: 16 }}>Pangasinan State University</p>
        <p>{records.campus} Campus</p>
        {college && <p style={{ fontStyle: "italic" }}>{college}</p>}
        <p style={{ fontSize: "20pt", fontWeight: 700, marginTop: "1in", whiteSpace: "pre-wrap" }}>{text("title_page") || "NARRATIVE REPORT ON INTERNSHIP TRAINING"}</p>
        <p style={{ marginTop: 12 }}>at</p>
        <p style={{ fontWeight: 700 }}>{records.company}</p>
        <p style={{ marginTop: "1in" }}>Presented by</p>
        <p style={{ fontWeight: 700, fontSize: "14pt" }}>{records.name}</p>
        <p>{records.program}</p>
        <p style={{ marginTop: "0.8in", fontSize: "9pt", fontStyle: "italic" }}>Draft layout: the title page follows the university's sample once it is in.</p>
      </section>

      {/* II. Table of Contents, in the university's order. */}
      <Page records={records} college={college}>
        {heading("Table of Contents")}
        <ol style={{ listStyle: "none", padding: 0, lineHeight: 1.9 }}>
          {PARTS.map((part) => (
            <li key={part.key} style={{ paddingLeft: part.level * 36 }}>
              <span style={{ display: "inline-block", minWidth: 40 }}>{part.number}</span>
              {part.title}
            </li>
          ))}
          <li>
            <span style={{ display: "inline-block", minWidth: 40 }}>{MOA.number}</span>
            {MOA.title}
          </li>
          <li>
            <span style={{ display: "inline-block", minWidth: 40 }}>VIII.</span>Internship Requirements
          </li>
          {REQUIREMENTS.map((item) => (
            <li key={item.number} style={{ paddingLeft: 72 }}>
              <span style={{ display: "inline-block", minWidth: 32 }}>{item.number}</span>
              {item.title}
              {item.optional ? " (Optional)" : ""}
            </li>
          ))}
        </ol>
      </Page>

      {(["dedication", "acknowledgement"] as const).map((key) => (
        <Page key={key} records={records} college={college}>
          {heading(PARTS.find((part) => part.key === key)?.title ?? "")}
          <Text value={text(key)} />
        </Page>
      ))}

      <Page records={records} college={college}>
        {heading("Company Profile")}
        {(["agency_profile", "organizational_chart", "functions_services"] as const).map((key) => (
          <div key={key} style={{ marginBottom: 18 }}>
            <h3 style={{ fontWeight: 700, margin: "0 0 6px" }}>{PARTS.find((part) => part.key === key)?.title}</h3>
            <Text value={text(key)} />
          </div>
        ))}
      </Page>

      <Page records={records} college={college}>
        {heading("Narrative Report")}
        {PARTS.filter((part) => part.level >= 1 && !["agency_profile", "organizational_chart", "functions_services", "learning", "pictures"].includes(part.key)).map((part) => (
          <div key={part.key} style={{ marginBottom: 18, paddingLeft: part.level === 2 ? 24 : 0 }}>
            <h3 style={{ fontWeight: 700, margin: "0 0 6px" }}>
              {part.number} {part.title}
            </h3>
            <Text value={text(part.key)} />
            {part.key === "introduction" && <h3 style={{ fontWeight: 700, margin: "18px 0 0" }}>B. Learning</h3>}
          </div>
        ))}
      </Page>

      <Page records={records} college={college}>
        {heading("7. Pictures Depicting OJT Experiences")}
        <Text value={text("pictures")} />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginTop: 10 }}>
          {photos.slice(0, 12).map((photo) => (
            <Photo key={photo.id} photo={photo} />
          ))}
        </div>
      </Page>

      <Page records={records} college={college}>
        {heading("Memorandum of Agreement and Internship Requirements")}
        <p style={{ fontStyle: "italic", fontSize: "10.5pt", marginBottom: 10 }}>The signed and issued copies follow, in this order.</p>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "11pt" }}>
          <tbody>
            {[MOA, ...REQUIREMENTS].map((item) => {
              const doc = uploaded(item.match);
              return (
                <tr key={item.title}>
                  <td style={{ border: "1px solid #000", padding: "4px 6px", width: 50 }}>{item.number}</td>
                  <td style={{ border: "1px solid #000", padding: "4px 6px" }}>
                    {item.title}
                    {item.optional ? " (Optional)" : ""}
                  </td>
                  <td style={{ border: "1px solid #000", padding: "4px 6px", width: "34%", fontSize: "10pt" }}>
                    {item.source === "auto" ? "Printed from INTERNet" : item.source === "waiting" ? "To follow" : doc ? `On file (${doc.status})` : "To attach"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Page>
    </div>
  );
}
