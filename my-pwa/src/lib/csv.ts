// Tells spreadsheet programs the file is UTF-8, so accented names open correctly.
const BYTE_ORDER_MARK = String.fromCharCode(0xfeff);

/** Guards a spreadsheet cell against being read as a formula. */
export function csvCell(value: string | number): string {
  let text = String(value);
  if (/^[\s]*[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

/** Rows of cells as the text of a CSV file. */
export function csvText(rows: (string | number)[][]): string {
  return `${BYTE_ORDER_MARK}${rows.map((row) => row.map(csvCell).join(",")).join("\r\n")}`;
}

/** Hands the browser a CSV file to save. */
export function saveCsv(rows: (string | number)[][], fileName: string): void {
  const url = URL.createObjectURL(new Blob([csvText(rows)], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
