import { pictureUrl } from "../../../lib/attachments";
import type { NarrativeParts } from "../../../lib/traineeRecord";
import { logDateKey, type AttendanceLog } from "../useAttendance";
import { MOA, PARTS, REQUIREMENTS, type Records } from "./model";
import { fieldsOf, titleDefaults } from "./structured";
import type { Journal, ReportPhoto, UploadedDocument } from "./useNarrativeData";

/*
|--------------------------------------------------------------------------
| THE NARRATIVE REPORT AS A WORD FILE (revisions, November 2026)
|--------------------------------------------------------------------------
|
| The same parts as the printed binder (NarrativePrint.tsx), as a .docx the
| trainee can keep editing in Word: Times New Roman 12, each part on a new
| page under a text letterhead (university, campus, college, program,
| company), the photos with their captions, the internship timeframe and
| the weekly report as tables, and the requirements to attach. Made in the
| browser with the docx library, loaded only when asked for.
|
*/

export async function downloadNarrativeDocx({
  records,
  parts,
  college,
  photos,
  documents,
  journals,
  logs,
}: {
  records: Records;
  parts: NarrativeParts;
  college: string;
  photos: ReportPhoto[];
  documents: UploadedDocument[];
  journals: Journal[];
  logs: AttendanceLog[];
}): Promise<void> {
  const docx = await import("docx");
  const { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, PageBreak, Table, TableRow, TableCell, WidthType, ImageRun, Header } = docx;

  const run = (text: string, options: { bold?: boolean; italics?: boolean; size?: number; font?: string } = {}) =>
    new TextRun({ text, bold: options.bold, italics: options.italics, size: options.size ?? 24, font: options.font ?? "Times New Roman" });
  const body = (text: string) =>
    (text.trim() ? text.trim().split(/\n+/) : [""]).map(
      (line) => new Paragraph({ children: [run(line)], alignment: AlignmentType.JUSTIFIED, spacing: { after: 160, line: 360 } })
    );
  const heading = (text: string, level: (typeof HeadingLevel)[keyof typeof HeadingLevel] = HeadingLevel.HEADING_1) =>
    new Paragraph({ children: [run(text, { bold: true, size: level === HeadingLevel.HEADING_1 ? 28 : 24 })], heading: level, spacing: { before: 120, after: 160 } });
  const pageBreak = () => new Paragraph({ children: [new PageBreak()] });
  const text = (key: string) => parts[key]?.text ?? "";
  const cell = (value: string, bold = false) => new TableCell({ children: [new Paragraph({ children: [run(value, { bold, size: 20 })] })] });

  const letterhead = new Header({
    children: [
      new Paragraph({ alignment: AlignmentType.CENTER, children: [run("Pangasinan State University", { size: 36, font: "Old English Text MT" })] }),
      new Paragraph({ alignment: AlignmentType.CENTER, children: [run(`${records.campus} Campus`, { size: 18 })] }),
      ...(college ? [new Paragraph({ alignment: AlignmentType.CENTER, children: [run(college, { size: 18, italics: true })] })] : []),
      ...(records.program ? [new Paragraph({ alignment: AlignmentType.CENTER, children: [run(records.program, { size: 18 })] })] : []),
      ...(records.company ? [new Paragraph({ alignment: AlignmentType.CENTER, children: [run(records.company, { size: 18, bold: true })] })] : []),
    ],
  });

  const children: InstanceType<typeof Paragraph | typeof Table>[] = [];

  // I. Title page: the lines of the guided form (change1108), centred; Word keeps them editable.
  const cover = fieldsOf(parts, "title_page", titleDefaults(records, text("title_page")));
  const centred = (value: string, options: Parameters<typeof run>[1] = {}, before = 0) =>
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before }, children: [run(value, options)] });
  children.push(
    centred(cover.title, { bold: true, size: 36 }, 2400),
    ...(cover.agency ? [centred("at"), centred(cover.agency, { bold: true })] : []),
    centred(cover.purpose, { italics: true }, 360),
    ...(cover.submittedBy ? [centred("Submitted by:", {}, 1200), centred(cover.submittedBy, { bold: true, size: 28 }), centred(records.program)] : []),
    ...(cover.submittedTo ? [centred("Submitted to:", {}, 280), centred(cover.submittedTo, { bold: true })] : []),
    centred(cover.date, {}, 400),
    pageBreak()
  );

  // II. Table of contents.
  children.push(heading("Table of Contents"));
  for (const part of PARTS) children.push(new Paragraph({ indent: { left: part.level * 720 }, children: [run(`${part.number}  ${part.title}`)] }));
  children.push(new Paragraph({ children: [run(`${MOA.number}  ${MOA.title}`)] }), new Paragraph({ children: [run("VIII.  Internship Requirements")] }));
  for (const item of REQUIREMENTS) children.push(new Paragraph({ indent: { left: 1440 }, children: [run(`${item.number}  ${item.title}${item.optional ? " (Optional)" : ""}`)] }));
  children.push(pageBreak());

  for (const key of ["dedication", "acknowledgement"]) {
    children.push(heading(PARTS.find((part) => part.key === key)?.title ?? ""), ...body(text(key)), pageBreak());
  }

  children.push(heading("Company Profile"));
  for (const key of ["agency_profile", "organizational_chart", "functions_services"]) {
    children.push(heading(PARTS.find((part) => part.key === key)?.title ?? "", HeadingLevel.HEADING_2), ...body(text(key)));
  }
  children.push(pageBreak(), heading("Narrative Report"));
  for (const part of PARTS.filter((item) => item.level >= 1 && !["agency_profile", "organizational_chart", "functions_services", "pictures"].includes(item.key))) {
    children.push(heading(`${part.number} ${part.title}`, HeadingLevel.HEADING_2));
    if (part.key !== "learning") children.push(...body(text(part.key)));
  }

  // 7. Pictures, with their captions.
  children.push(pageBreak(), heading("7. Pictures Depicting OJT Experiences", HeadingLevel.HEADING_2), ...body(text("pictures")));
  for (const photo of photos.slice(0, 12)) {
    try {
      const url = await pictureUrl("student", photo.id);
      const data = await (await fetch(url)).arrayBuffer();
      URL.revokeObjectURL(url);
      children.push(
        new Paragraph({ alignment: AlignmentType.CENTER, children: [new ImageRun({ data, transformation: { width: 420, height: 300 }, type: "jpg" })] }),
        new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 240 }, children: [run(`${photo.caption || photo.title}${photo.day ? ` (${photo.day})` : ""}`, { italics: true, size: 20 })] })
      );
    } catch {
      // A photo that cannot be fetched is left out; the rest of the file still goes.
    }
  }

  // VII and VIII: what is attached, then the two tables INTERNet makes.
  children.push(pageBreak(), heading("Memorandum of Agreement and Internship Requirements"));
  children.push(
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [MOA, ...REQUIREMENTS].map((item) => {
        const doc = item.match ? documents.find((upload) => item.match?.test(upload.doc_type)) : undefined;
        return new TableRow({
          children: [
            cell(item.number),
            cell(`${item.title}${item.optional ? " (Optional)" : ""}`),
            cell(item.source === "auto" ? "Printed from INTERNet" : item.source === "waiting" ? "To follow" : doc ? `On file (${doc.status})` : "To attach"),
          ],
        });
      }),
    })
  );

  const verified = logs.filter((log) => log.time_in && log.status === "Verified").sort((a, b) => logDateKey(a).localeCompare(logDateKey(b)));
  if (verified.length) {
    const day = (log: AttendanceLog, options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", ...options }).format(new Date(`${logDateKey(log)}T12:00:00+08:00`));
    children.push(pageBreak(), heading("Internship Time Frame (FM-AA-INT-17)"));
    children.push(
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
          new TableRow({ children: [cell("DATE", true), cell("DAY", true), cell("NUMBER OF HOURS", true)] }),
          ...verified.map((log) => new TableRow({ children: [cell(day(log, { month: "long", day: "2-digit", year: "numeric" }).toUpperCase()), cell(day(log, { weekday: "long" }).toUpperCase()), cell(String(Math.round((Number(log.hours) || 0) * 100) / 100))] })),
          new TableRow({ children: [cell("TOTAL NUMBER OF HOURS", true), cell(""), cell(`${Math.round(verified.reduce((sum, log) => sum + (Number(log.hours) || 0), 0) * 100) / 100} HOURS`, true)] }),
        ],
      })
    );
  }

  if (journals.length) {
    children.push(pageBreak(), heading("Internship/Practicum Weekly Report (FM-AA-INT-19)"));
    children.push(
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
          new TableRow({ children: [cell("DATE", true), cell("TASKS ACCOMPLISHED", true), cell("KNOWLEDGE, SKILLS, VALUES LEARNED", true)] }),
          ...journals
            .slice()
            .sort((a, b) => a.week_start.localeCompare(b.week_start))
            .map((journal, index) => new TableRow({ children: [cell(`Week ${index + 1} (${journal.week_start})`), cell(journal.activities), cell(journal.learnings)] })),
        ],
      })
    );
  }

  const file = new Document({
    creator: records.name || "INTERNet",
    title: "Narrative Report on Internship Training",
    styles: { default: { document: { run: { font: "Times New Roman", size: 24 } } } },
    sections: [{ headers: { default: letterhead }, properties: { page: { margin: { top: 1440, bottom: 1440, left: 1440, right: 1440 } } }, children }],
  });
  const blob = await Packer.toBlob(file);
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `Narrative Report - ${records.name || "INTERNet"}.docx`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 5000);
}
