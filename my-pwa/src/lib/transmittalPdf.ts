import { jsPDF } from "jspdf";
import { autoTable } from "jspdf-autotable";
import sealPng from "../brand/assets/psu-seal-192.png?inline";

/*
| Phase 2.4: the transmittal letter that goes with a student's hard copies
| to the OJT office. Health and clearance documents are never listed here
| (they never appear in exports); the letter says they go separately.
*/

export type TransmittalLine = { label: string; dated: string | null; received_on: string | null; received_by: string | null };
export type TransmittalStudent = { name: string; student_id: string; program: string | null; company: string | null };

const MARGIN = 20;

export function buildTransmittalPdf(student: TransmittalStudent, lines: TransmittalLine[], from: string, today: string): jsPDF {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const width = doc.internal.pageSize.getWidth();

  doc.addImage(sealPng, "PNG", MARGIN, 14, 16, 16);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.text("Transmittal of OJT documents", MARGIN + 20, 21);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(100);
  doc.text("Pangasinan State University, Lingayen Campus", MARGIN + 20, 26);
  doc.setTextColor(0);

  doc.setFontSize(10.5);
  const facts: [string, string][] = [
    ["Date", today],
    ["To", "The OJT Office"],
    ["From", from],
    ["Student", `${student.name} (${student.student_id})`],
    ["Program", student.program ?? "Not set"],
    ["Host company", student.company ?? "Not placed"],
  ];
  let y = 42;
  for (const [label, value] of facts) {
    doc.setFont("helvetica", "bold");
    doc.text(label, MARGIN, y);
    doc.setFont("helvetica", "normal");
    doc.text(doc.splitTextToSize(value, width - MARGIN * 2 - 32), MARGIN + 32, y);
    y += 6.5;
  }

  y += 4;
  doc.text("Transmitted herewith are the hard copies of the following:", MARGIN, y);
  autoTable(doc, {
    startY: y + 3,
    margin: { left: MARGIN, right: MARGIN },
    head: [["", "Document", "Dated", "Received on", "Received by"]],
    body:
      lines.length > 0
        ? lines.map((line, index) => [String(index + 1), line.label, line.dated ?? "", line.received_on ?? "", line.received_by ?? ""])
        : [["", "No documents to transmit.", "", "", ""]],
    styles: { fontSize: 9.5, cellPadding: 2 },
    headStyles: { fillColor: [12, 23, 49] },
    columnStyles: { 0: { cellWidth: 8 } },
  });
  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;

  doc.setFontSize(9);
  doc.setTextColor(90);
  doc.text("Health and clearance documents are transmitted separately.", MARGIN, y);
  doc.setTextColor(0);
  doc.setFontSize(10.5);

  y += 22;
  const half = (width - MARGIN * 2) / 2;
  for (const [index, label] of ["Transmitted by", "Received by"].entries()) {
    const left = MARGIN + index * half;
    doc.line(left, y, left + half - 10, y);
    doc.text(index === 0 ? from : "Name and signature", left, y + 5);
    doc.setFontSize(9);
    doc.setTextColor(100);
    doc.text(index === 0 ? label : `${label}, and date`, left, y + 9.5);
    doc.setTextColor(0);
    doc.setFontSize(10.5);
  }
  return doc;
}
