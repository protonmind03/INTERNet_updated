import type { Block, FormMeta, Run } from "./formModel";

/*
|--------------------------------------------------------------------------
| PRINT, PDF AND WORD FOR THE PRE-OJT FORMS (November 2026)
|--------------------------------------------------------------------------
|
| Print: the sheet alone goes into a page of its own (an invisible frame
| with the app's styles), so nothing of the app prints with it: no header,
| no menu, no buttons. The page is A4 with no margin of its own (the sheet
| carries its margins), which also leaves the browser no room for its
| date, title and address lines. When a form runs past one page, the pages
| get room at the top and bottom and are numbered "Page 1 of 2"; a form
| that fits one page has no number.
|
| PDF: written as real text from the same blocks (formPdf.ts).
|
| Word: the form's blocks (formModel.ts) written as a .docx with the same
| order, tables, lines and signatures, in Arial on A4, to edit freely.
|
*/

const A4_HEIGHT_PX = (297 / 25.4) * 96;

function styleCopies(target: Document): Promise<void>[] {
  const loads: Promise<void>[] = [];
  for (const node of Array.from(document.querySelectorAll('style, link[rel="stylesheet"]'))) {
    const copy = node.cloneNode(true) as HTMLElement;
    if (copy instanceof HTMLLinkElement) loads.push(new Promise((resolve) => ((copy.onload = () => resolve()), (copy.onerror = () => resolve()))));
    target.head.appendChild(copy);
  }
  return loads;
}

/** Prints the sheet by itself, on A4, with page numbers only when it runs past one page. */
export async function printSheet(sheet: HTMLElement, title: string): Promise<void> {
  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.tabIndex = -1;
  // Laid out at A4 width, out of sight.
  Object.assign(frame.style, { position: "fixed", left: "-10000px", top: "0", width: "210mm", height: "297mm", border: "0" });
  document.body.appendChild(frame);
  const doc = frame.contentDocument!;
  doc.open();
  doc.write(`<!doctype html><html><head><meta charset="utf-8"><title></title></head><body></body></html>`);
  doc.close();
  doc.title = title;
  await Promise.all(styleCopies(doc));
  const base = doc.createElement("style");
  base.textContent = `@page { size: A4; margin: 0; } html, body { margin: 0 !important; padding: 0 !important; background: #fff !important; } .pf-page { box-shadow: none !important; margin: 0 !important; }`;
  doc.head.appendChild(base);
  doc.body.appendChild(doc.importNode(sheet, true));
  await (doc.fonts?.ready ?? Promise.resolve());
  await new Promise((resolve) => setTimeout(resolve, 120));

  const page = doc.querySelector(".pf-page") as HTMLElement;
  if (page.scrollHeight > A4_HEIGHT_PX + 2) {
    // More than one page: room at the top and bottom of every page, and its number at the foot.
    const numbered = doc.createElement("style");
    numbered.textContent = `@page { size: A4; margin: 12mm 0 14mm; @bottom-center { content: "Page " counter(page) " of " counter(pages); font: 9pt Arial, Helvetica, sans-serif; color: #000; } } .pf-page { padding-top: 0 !important; padding-bottom: 0 !important; min-height: 0 !important; }`;
    doc.head.appendChild(numbered);
  }
  const done = () => window.setTimeout(() => frame.remove(), 500);
  frame.contentWindow!.addEventListener("afterprint", done, { once: true });
  frame.contentWindow!.focus();
  frame.contentWindow!.print();
  // Browsers that do not send afterprint: tidy up after a while anyway.
  window.setTimeout(() => frame.isConnected && frame.remove(), 60_000);
}

function download(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** The seal from the sheet, as a PNG for the Word file (null when it cannot be drawn). */
async function sealPng(sheet: HTMLElement): Promise<ArrayBuffer | null> {
  // The seal is the university's own picture (brand/PsuSeal.tsx), served by the app itself.
  const shown = sheet.querySelector<HTMLImageElement>(".pf-seal img");
  if (!shown?.currentSrc && !shown?.src) return null;
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("seal"));
      image.src = shown.currentSrc || shown.src;
    });
    const canvas = document.createElement("canvas");
    canvas.width = 300;
    canvas.height = 300;
    canvas.getContext("2d")!.drawImage(image, 0, 0, 300, 300);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    return blob ? await blob.arrayBuffer() : null;
  } catch {
    return null;
  }
}

const SPACE = String.fromCharCode(160);

const BLANK: Record<"s" | "m" | "l", number> = { s: 10, m: 20, l: 34 };

/** Saves the form as an editable Word file on A4, built from the same blocks as the sheet. */
export async function saveFormDocx(meta: FormMeta, blocks: Block[], sheet: HTMLElement, fileName: string, campus = "Lingayen"): Promise<void> {
  const docx = await import("docx");
  const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, AlignmentType, BorderStyle, ImageRun, VerticalAlign, TableLayoutType } = docx;
  const WIDTH = 11906 - 2 * 907; // A4 less 16 mm side margins, in twips
  const none = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
  const noBorders = { top: none, bottom: none, left: none, right: none, insideHorizontal: none, insideVertical: none };
  const thin = { style: BorderStyle.SINGLE, size: 6, color: "000000" };
  const ruled = { top: thin, bottom: thin, left: thin, right: thin, insideHorizontal: thin, insideVertical: thin };

  const textRuns = (list: Run[], options: { italic?: boolean; size?: number } = {}) =>
    list.map((run) => {
      if (typeof run === "string") return run === "\n" ? new TextRun({ break: 1 }) : new TextRun({ text: run, italics: options.italic, size: options.size });
      if ("b" in run) return new TextRun({ text: run.b, bold: true, size: options.size });
      if ("i" in run) return new TextRun({ text: run.i, italics: true, size: options.size });
      const value = run.upper ? run.v.toUpperCase() : run.v;
      return new TextRun({ text: value ? `${SPACE}${value}${SPACE}` : SPACE.repeat(BLANK[run.w]), bold: Boolean(value), underline: {}, italics: options.italic, size: options.size });
    });

  const signatureCell = (item: { lead?: string; name?: string; title: string; after?: Run[][] }, width: number) =>
    new TableCell({
      width: { size: width, type: WidthType.DXA },
      borders: noBorders,
      children: [
        ...(item.lead ? [new Paragraph({ children: [new TextRun({ text: item.lead })], spacing: { after: 120 } })] : []),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 360 },
          border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: "000000", space: 1 } },
          children: [new TextRun({ text: (item.name || "").toUpperCase() || "\u00a0", bold: true })],
        }),
        new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: item.title, italics: true, size: 17 })] }),
        ...(item.after ?? []).map((row, index) => new Paragraph({ spacing: { before: index === 0 ? 120 : 0 }, children: textRuns(row, { size: 19 }) })),
      ],
    });

  const children: (InstanceType<typeof Paragraph> | InstanceType<typeof Table>)[] = [];

  // The university's head: the seal, the titles, the form's code.
  const seal = await sealPng(sheet);
  children.push(
    new Table({
      width: { size: WIDTH, type: WidthType.DXA },
      layout: TableLayoutType.FIXED,
      borders: noBorders,
      rows: [
        new TableRow({
          children: [
            new TableCell({
              width: { size: 1500, type: WidthType.DXA },
              borders: noBorders,
              verticalAlign: VerticalAlign.CENTER,
              children: [new Paragraph({ children: seal ? [new ImageRun({ type: "png", data: seal, transformation: { width: 76, height: 76 } })] : [] })],
            }),
            new TableCell({
              width: { size: WIDTH - 3000, type: WidthType.DXA },
              borders: noBorders,
              verticalAlign: VerticalAlign.CENTER,
              children: [
                new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: meta.title.toUpperCase(), bold: true, size: 32 })] }),
                new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "PANGASINAN STATE UNIVERSITY", size: 18 })] }),
                new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: campus, size: 18, underline: {} }), new TextRun({ text: " Campus", size: 18 })] }),
              ],
            }),
            new TableCell({
              width: { size: 1500, type: WidthType.DXA },
              borders: noBorders,
              children: meta.code
                ? [meta.code.code, meta.code.rev, meta.code.date].map((text) => new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text, bold: true, italics: true, size: 15 })] }))
                : [new Paragraph({ children: [] })],
            }),
          ],
        }),
      ],
    }),
    new Paragraph({ spacing: { after: 120 }, children: [] })
  );

  for (const block of blocks) {
    if (block.kind === "section") {
      children.push(new Paragraph({ spacing: { before: 200, after: 80 }, children: [new TextRun({ text: block.title.toUpperCase(), bold: true })] }));
    } else if (block.kind === "gap") {
      children.push(new Paragraph({ spacing: { after: Math.round(block.mm * 57) }, children: [] }));
    } else if (block.kind === "para") {
      children.push(
        new Paragraph({
          alignment: block.align === "left" ? AlignmentType.LEFT : block.align === "center" ? AlignmentType.CENTER : AlignmentType.JUSTIFIED,
          spacing: { after: 120, line: 300 },
          children: textRuns(block.runs, { italic: block.italic }),
        })
      );
    } else if (block.kind === "list") {
      block.items.forEach((item, index) => {
        const mark = block.style === "alpha" ? `${String.fromCharCode(97 + index)}.` : `${index + 1}.`;
        children.push(
          new Paragraph({
            alignment: AlignmentType.JUSTIFIED,
            indent: { left: 400, hanging: 400 },
            spacing: { after: 80, line: 300 },
            children: [new TextRun({ text: `${mark}\t` }), ...textRuns(item)],
            tabStops: [{ type: "left", position: 400 }],
          })
        );
      });
    } else if (block.kind === "signatures") {
      const columns = block.columns === 1 ? 1 : 2;
      const cellWidth = columns === 1 ? Math.round(WIDTH * 0.5) : Math.round(WIDTH / 2);
      const rows = [];
      for (let index = 0; index < block.items.length; index += columns) {
        rows.push(new TableRow({ children: block.items.slice(index, index + columns).map((item) => signatureCell(item, cellWidth)).concat(columns === 2 && index + 1 >= block.items.length ? [new TableCell({ width: { size: cellWidth, type: WidthType.DXA }, borders: noBorders, children: [new Paragraph({ children: [] })] })] : []) }));
      }
      children.push(
        new Table({ width: { size: columns === 1 ? cellWidth : WIDTH, type: WidthType.DXA }, alignment: block.align === "left" ? AlignmentType.LEFT : AlignmentType.CENTER, layout: TableLayoutType.FIXED, borders: noBorders, rows }),
        new Paragraph({ spacing: { after: 80 }, children: [] })
      );
    } else if (block.kind === "table") {
      const widths = block.cols.map((share) => Math.round((WIDTH * share) / 100));
      const cell = (content: { text?: string; v?: string; label?: boolean; span?: number; head?: boolean }, index: number) =>
        new TableCell({
          width: { size: widths.slice(index, index + (content.span ?? 1)).reduce((a, b) => a + b, 0), type: WidthType.DXA },
          columnSpan: content.span,
          verticalAlign: VerticalAlign.CENTER,
          margins: { top: 50, bottom: 50, left: 90, right: 90 },
          children: [
            new Paragraph({
              alignment: content.head ? AlignmentType.CENTER : AlignmentType.LEFT,
              children: [new TextRun({ text: (content.label ? content.text ?? "" : content.v ?? "").toUpperCase(), size: content.label ? 17 : 19, bold: Boolean(content.head) })],
            }),
          ],
        });
      const rows = block.rows.map((row) => {
        let column = 0;
        return new TableRow({
          children: row.map((content) => {
            const made = cell(content, column);
            column += content.span ?? 1;
            return made;
          }),
        });
      });
      for (let index = 0; index < (block.empty ?? 0); index += 1) {
        rows.push(new TableRow({ height: { value: 360, rule: "atLeast" }, children: widths.map((width) => new TableCell({ width: { size: width, type: WidthType.DXA }, children: [new Paragraph({ children: [] })] })) }));
      }
      children.push(new Table({ width: { size: WIDTH, type: WidthType.DXA }, layout: TableLayoutType.FIXED, borders: ruled, columnWidths: widths, rows }), new Paragraph({ spacing: { after: 60 }, children: [] }));
    }
  }

  const file = new Document({
    creator: "INTERNet",
    title: meta.title,
    styles: { default: { document: { run: { font: "Arial", size: 20 } } } },
    sections: [{ properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 794, bottom: 794, left: 907, right: 907 } } }, children }],
  });
  download(await Packer.toBlob(file), `${fileName}.docx`);
}
