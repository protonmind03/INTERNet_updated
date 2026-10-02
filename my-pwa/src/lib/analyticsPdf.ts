import { jsPDF } from "jspdf";
import { autoTable } from "jspdf-autotable";

export type ReportSection = {
  title: string;
  head: string[];
  rows: (string | number)[][];
};

const MARGIN = 14;

/** Builds the coordinator analytics report as an A4 PDF document. */
export function buildAnalyticsPdf(
  sections: ReportSection[],
  generatedAt: string
): jsPDF {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageHeight = doc.internal.pageSize.getHeight();
  const pageWidth = doc.internal.pageSize.getWidth();

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text("INTERNet OJT Analytics Report", MARGIN, 18);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(100);
  doc.text(`Generated ${generatedAt}`, MARGIN, 24);
  doc.setTextColor(0);

  let y = 32;
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
