import type { Block, Cell, FormMeta, Line, Run, Signature } from "./formModel";

/*
|--------------------------------------------------------------------------
| THE PRE-OJT FORMS AS A REAL PDF (November 2026)
|--------------------------------------------------------------------------
|
| Written straight from the form's blocks (formModel.ts) with jsPDF: real
| text in Helvetica (Arial's metrics), real lines and ruled tables on an A4
| page, laid out by the same rules as the sheet on screen (FormSheet.tsx and
| index.css "pf-"): 10 pt body, 16 pt title, 8.3 pt labels, 16 mm sides.
| The text stays sharp at any zoom and can be searched and copied. A form
| that runs past one page is numbered "Page 1 of 2"; one page has no number.
|
*/

const PT = 0.3528; // mm per point
const PAGE = { w: 210, h: 297 };

type Font = "normal" | "bold" | "italic" | "bolditalic";

type Token =
  | { kind: "word"; text: string; font: Font; width: number }
  | { kind: "space"; width: number }
  | { kind: "line"; text: string; width: number }
  | { kind: "break" };

export async function saveFormPdf(meta: FormMeta, blocks: Block[], sheet: HTMLElement | null, fileName: string, campus = "Lingayen"): Promise<void> {
  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const compact = meta.key === "application";
  const M = { left: 16, right: 16, top: compact ? 10 : 13, bottom: compact ? 10 : 12 };
  const W = PAGE.w - M.left - M.right;
  const BODY = 10;
  const LH = 1.38;
  let y = M.top;

  const font = (style: Font, size = BODY) => {
    pdf.setFont("helvetica", style);
    pdf.setFontSize(size);
  };
  const lineHeight = (size = BODY) => size * PT * LH;
  const room = (needed: number) => {
    if (y + needed > PAGE.h - M.bottom) {
      pdf.addPage();
      y = M.top;
    }
  };

  /* ----- Running text with lines to fill ----- */

  const LINE_MIN: Record<Line["w"], number> = { s: 16, m: 32, l: 58 };

  const tokens = (runs: Run[], italic = false, size = BODY): Token[] => {
    const list: Token[] = [];
    const plain: Font = italic ? "italic" : "normal";
    for (const run of runs) {
      if (typeof run === "string") {
        if (run === "\n") {
          list.push({ kind: "break" });
          continue;
        }
        for (const part of run.split(/(\s+)/)) {
          if (!part) continue;
          if (/^\s+$/.test(part)) {
            font(plain, size);
            list.push({ kind: "space", width: pdf.getTextWidth(" ") });
          } else {
            font(plain, size);
            list.push({ kind: "word", text: part, font: plain, width: pdf.getTextWidth(part) });
          }
        }
      } else if ("b" in run || "i" in run) {
        const style: Font = "b" in run ? (italic ? "bolditalic" : "bold") : "italic";
        const text = "b" in run ? run.b : run.i;
        for (const part of text.split(/(\s+)/)) {
          if (!part) continue;
          font(style, size);
          list.push(/^\s+$/.test(part) ? { kind: "space", width: pdf.getTextWidth(" ") } : { kind: "word", text: part, font: style, width: pdf.getTextWidth(part) });
        }
      } else {
        const value = run.upper ? run.v.toUpperCase() : run.v;
        font("bold", size);
        list.push({ kind: "line", text: value, width: Math.max(LINE_MIN[run.w], value ? pdf.getTextWidth(value) + 2.4 : 0) });
      }
    }
    return list;
  };

  /** Lays the runs out in `width`, from `x`, and returns the height used. */
  const paragraph = (runs: Run[], x: number, width: number, options: { italic?: boolean; align?: "justify" | "left" | "center"; size?: number; draw?: boolean } = {}): number => {
    const size = options.size ?? BODY;
    const lh = lineHeight(size);
    const all = tokens(runs, options.italic, size);
    // Break into lines.
    const lines: { items: Token[]; forced: boolean }[] = [];
    let current: Token[] = [];
    let used = 0;
    const flush = (forced: boolean) => {
      while (current.length && current[current.length - 1].kind === "space") current.pop();
      lines.push({ items: current, forced });
      current = [];
      used = 0;
    };
    for (const token of all) {
      if (token.kind === "break") {
        flush(true);
        continue;
      }
      if (token.kind === "space" && current.length === 0) continue;
      const tokenWidth = token.width;
      if (used + tokenWidth > width + 0.01 && token.kind !== "space" && current.length) flush(false);
      if (token.kind === "space" && current.length === 0) continue;
      current.push(token);
      used += tokenWidth;
    }
    flush(true);

    if (options.draw !== false) {
      lines.forEach((line, index) => {
        room(lh);
        const natural = line.items.reduce((sum, item) => sum + (item.kind === "break" ? 0 : item.width), 0);
        const spaces = line.items.filter((item) => item.kind === "space").length;
        const last = index === lines.length - 1 || line.forced;
        const align = options.align ?? "justify";
        const extra = align === "justify" && !last && spaces > 0 ? (width - natural) / spaces : 0;
        let cursor = align === "center" ? x + (width - natural) / 2 : x;
        const baseline = y + lh * 0.72;
        for (const item of line.items) {
          if (item.kind === "space") {
            cursor += item.width + extra;
          } else if (item.kind === "word") {
            font(item.font, size);
            pdf.text(item.text, cursor, baseline);
            cursor += item.width;
          } else if (item.kind === "line") {
            if (item.text) {
              font("bold", size);
              pdf.text(item.text, cursor + item.width / 2, baseline, { align: "center" });
            }
            pdf.setLineWidth(0.26);
            pdf.line(cursor, baseline + 0.9, cursor + item.width, baseline + 0.9);
            cursor += item.width;
          }
        }
        y += lh;
      });
    }
    return lines.length * lh;
  };

  /* ----- The head ----- */

  const seal = sheet ? await sealDataUrl(sheet) : null;
  const headTop = y;
  if (seal) pdf.addImage(seal, "JPEG", M.left, headTop, 20, 20);
  if (meta.code) {
    font("bolditalic", 7.5);
    [meta.code.code, meta.code.rev, meta.code.date].forEach((text, index) => pdf.text(text, PAGE.w - M.right, headTop - 3 + index * 2.9, { align: "right" }));
  }
  font("bold", 16);
  const titleLines = pdf.splitTextToSize(meta.title.toUpperCase(), W - 50) as string[];
  let ty = headTop + (titleLines.length > 1 ? 4.5 : 7.5);
  for (const text of titleLines) {
    pdf.text(text, PAGE.w / 2, ty, { align: "center" });
    ty += 16 * PT * 1.15;
  }
  font("normal", 9);
  pdf.text("PANGASINAN STATE UNIVERSITY", PAGE.w / 2, ty, { align: "center" });
  ty += 9 * PT * 1.25;
  const campusWidth = pdf.getTextWidth(campus);
  const fullWidth = pdf.getTextWidth(`${campus} Campus`);
  const start = PAGE.w / 2 - fullWidth / 2;
  pdf.text(`${campus} Campus`, start, ty);
  pdf.setLineWidth(0.2);
  pdf.line(start, ty + 0.6, start + campusWidth, ty + 0.6);
  y = Math.max(headTop + 21, ty + 2.5);
  pdf.setLineWidth(0.53);
  pdf.line(M.left, y, PAGE.w - M.right, y);
  y += compact ? 2.5 : 3.5;

  /* ----- The blocks ----- */

  const signature = (item: Signature, x: number, width: number, draw: boolean): number => {
    const top = y;
    let h = 0;
    if (item.lead !== undefined) h += lineHeight();
    if (draw && item.lead?.trim()) {
      font("normal");
      pdf.text(item.lead, x, top + lineHeight() * 0.72);
    }
    h += item.lead ? (compact ? 4.5 : 5) : compact ? 5.5 : 7;
    const nameBase = top + h + lineHeight() * 0.72;
    if (draw && item.name?.trim()) {
      font("bold");
      pdf.text(item.name.toUpperCase(), x + width / 2, nameBase, { align: "center" });
    }
    if (draw) {
      pdf.setLineWidth(0.26);
      pdf.line(x, nameBase + 1.1, x + width, nameBase + 1.1);
    }
    h += lineHeight() + 1.2;
    if (draw) {
      font("italic", 8.3);
      pdf.text(item.title, x + width / 2, top + h + 8.3 * PT, { align: "center" });
    }
    h += 8.3 * PT * 1.4;
    if (item.after) {
      h += 1.5;
      const saved = y;
      y = top + h;
      for (const row of item.after) h += paragraph(row, x, width, { align: "left", size: 9.5, draw });
      y = saved;
    }
    return h;
  };

  for (const block of blocks) {
    if (block.kind === "section") {
      room(lineHeight() * 3);
      y += compact ? 1.6 : 2.4;
      font("bold");
      pdf.text(block.title.toUpperCase(), M.left, y + lineHeight() * 0.72);
      y += lineHeight() + (compact ? 0.4 : 0.8);
    } else if (block.kind === "gap") {
      y += block.mm;
    } else if (block.kind === "para") {
      paragraph(block.runs, M.left, W, { italic: block.italic, align: block.align });
      y += compact ? 1.2 : 1.8;
    } else if (block.kind === "list") {
      block.items.forEach((item, index) => {
        const mark = block.style === "alpha" ? `${String.fromCharCode(97 + index)}.` : `${index + 1}.`;
        room(lineHeight());
        font("normal");
        pdf.text(mark, M.left + 1, y + lineHeight() * 0.72);
        paragraph(item, M.left + 7, W - 7);
        y += 1.2;
      });
      y += 0.8;
    } else if (block.kind === "signatures") {
      const columns = block.columns === 1 ? 1 : 2;
      const gap = 12;
      const width = columns === 1 ? W / 2 : (W - gap) / 2;
      const x0 = columns === 1 ? (block.align === "left" ? M.left : M.left + W / 4) : M.left;
      for (let index = 0; index < block.items.length; index += columns) {
        const row = block.items.slice(index, index + columns);
        const heights = row.map((item) => signature(item, 0, width, false));
        const tallest = Math.max(...heights);
        room(tallest);
        row.forEach((item, column) => signature(item, x0 + column * (width + gap), width, true));
        y += tallest + (compact ? 0.5 : 1);
      }
      y += compact ? 0.8 : 1.5;
    } else if (block.kind === "table") {
      const widths = block.cols.map((share) => (W * share) / 100);
      const pad = { x: 1.6, y: compact ? 0.75 : 1.1 };
      const rows: Cell[][] = [...block.rows, ...Array.from({ length: block.empty ?? 0 }, () => block.cols.map((): Cell => ({ v: "" })))];
      for (const row of rows) {
        // Each cell's lines, at its own size; the row is as tall as its tallest cell.
        let column = 0;
        const cells = row.map((cell) => {
          const span = cell.span ?? 1;
          const cellWidth = widths.slice(column, column + span).reduce((a, b) => a + b, 0);
          const x = M.left + widths.slice(0, column).reduce((a, b) => a + b, 0);
          column += span;
          const size = cell.label ? 8.3 : 9.5;
          font(cell.head ? "bold" : "normal", size);
          const text = ((cell.label ? cell.text : cell.v) ?? "").toUpperCase();
          const lines = text ? (pdf.splitTextToSize(text, cellWidth - 2 * pad.x) as string[]) : [];
          return { x, width: cellWidth, size, lines, head: Boolean(cell.head) };
        });
        const empty = rows.indexOf(row) >= block.rows.length;
        const height = Math.max(empty ? (compact ? 5 : 6) : 0, ...cells.map((cell) => Math.max(1, cell.lines.length) * cell.size * PT * 1.25 + 2 * pad.y));
        room(height);
        pdf.setLineWidth(0.26);
        for (const cell of cells) {
          pdf.rect(cell.x, y, cell.width, height);
          font(cell.head ? "bold" : "normal", cell.size);
          const block = cell.lines.length * cell.size * PT * 1.25;
          let ly = y + (height - block) / 2 + cell.size * PT * 0.95;
          for (const text of cell.lines) {
            pdf.text(text, cell.head ? cell.x + cell.width / 2 : cell.x + pad.x, ly, { align: cell.head ? "center" : "left" });
            ly += cell.size * PT * 1.25;
          }
        }
        y += height;
      }
      y += compact ? 1.6 : 2;
    }
  }

  // Page numbers, only when there is more than one page.
  const pages = pdf.getNumberOfPages();
  if (pages > 1) {
    for (let page = 1; page <= pages; page += 1) {
      pdf.setPage(page);
      font("normal", 9);
      pdf.text(`Page ${page} of ${pages}`, PAGE.w / 2, PAGE.h - 6, { align: "center" });
    }
  }
  pdf.setProperties({ title: meta.title, creator: "INTERNet" });
  pdf.save(`${fileName}.pdf`);
}

/** The seal from the sheet, on white, as a compact JPEG for the PDF. */
async function sealDataUrl(sheet: HTMLElement): Promise<string | null> {
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
    canvas.width = 360;
    canvas.height = 360;
    const context = canvas.getContext("2d")!;
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, 360, 360);
    context.drawImage(image, 0, 0, 360, 360);
    return canvas.toDataURL("image/jpeg", 0.9);
  } catch {
    return null;
  }
}

