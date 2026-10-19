import { jsPDF } from "jspdf";
import { autoTable } from "jspdf-autotable";
// The PSU seal on the cover (Iteration 19), kept inside this lazily loaded chunk.
import sealPng from "../brand/assets/psu-seal-192.png?inline";

export type ReportSection = {
  title: string;
  head: string[];
  rows: (string | number)[][];
};

const MARGIN = 14;
/** The seal on the cover: 14 mm across, above the 12 mm the brand asks for in print. */
const SEAL_MM = 14;

/**
 * Builds a report of titled tables as an A4 PDF document: the coordinator's
 * analytics report unless another title is given.
 */
export function buildAnalyticsPdf(
  sections: ReportSection[],
  generatedAt: string,
  title = "INTERNet OJT Analytics Report"
): jsPDF {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageHeight = doc.internal.pageSize.getHeight();
  const pageWidth = doc.internal.pageSize.getWidth();

  // The cover: the seal, drawn as it is, with the title and the campus beside it.
  doc.addImage(sealPng, "PNG", MARGIN, 10, SEAL_MM, SEAL_MM);
  const textLeft = MARGIN + SEAL_MM + 4;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text(title, textLeft, 16);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(100);
  doc.text("Pangasinan State University · Lingayen Campus", textLeft, 21);
  doc.text(`Generated ${generatedAt}`, textLeft, 25.5);
  doc.setTextColor(0);

  let y = 36;
  for (const section of sections) {
    // Keep a section heading together with at least its first rows.
    if (y > pageHeight - 40) {
      doc.addPage();
      y = 18;
    }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text(section.title, MARGIN, y);

    autoTable(doc, {
      startY: y + 3,
      margin: { left: MARGIN, right: MARGIN },
      head: [section.head],
      body:
        section.rows.length > 0
          ? section.rows.map((row) => row.map(String))
          : [["No data for this section.", ...section.head.slice(1).map(() => "")]],
      styles: { fontSize: 9, cellPadding: 1.8 },
      headStyles: { fillColor: [79, 70, 229], textColor: 255 },
      alternateRowStyles: { fillColor: [248, 250, 252] },
    });

    const finalY = (
      doc as unknown as { lastAutoTable?: { finalY: number } }
    ).lastAutoTable?.finalY;
    y = (finalY ?? y + 10) + 10;
  }

  const pageCount = doc.getNumberOfPages();
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(120);
  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page);
    doc.text(
      `Page ${page} of ${pageCount}`,
      pageWidth - MARGIN,
      pageHeight - 8,
      { align: "right" }
    );
  }

  return doc;
}
