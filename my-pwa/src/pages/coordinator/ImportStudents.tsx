import { useRef, useState } from "react";
import Icon from "../../components/Icon";
import { Button, FormError, Modal, StatusBadge } from "../../components/ui";
import { errorText, toast } from "../../lib/toast";
import { coordinatorRequest } from "./request";

/*
|--------------------------------------------------------------------------
| BULK STUDENT IMPORT
|--------------------------------------------------------------------------
|
| Three steps in one dialog: choose a CSV file, check the rows that were
| read from it, then see what happened to each row. Students given a
| generated password are listed with it once, with a file to download, so
| the coordinator can hand the passwords out.
|
*/

const COLUMNS = [
  "student_id",
  "name",
  "email",
  "program",
  "company",
  "supervisor_id",
  "required_hours",
  "password",
] as const;

type Column = (typeof COLUMNS)[number];
type Row = Record<Column, string>;

type ImportResult = {
  row: number;
  student_id: string;
  name: string;
  status: "created" | "error";
  message: string;
  password?: string;
};

const TEMPLATE = `${COLUMNS.join(",")}
23-LN-0001,Juan Dela Cruz,juan.delacruz@example.com,BS Information Technology,Example Company,,180,
`;

const MAX_ROWS = 200;

/** Reads CSV text into rows of cells, honouring quoted cells and commas. */
function parseCsv(source: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  // Spreadsheet programs often start the file with a byte-order mark.
  const text = source.charCodeAt(0) === 0xfeff ? source.slice(1) : source;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        cell += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(cell);
      cell = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[index + 1] === "\n") index += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }
  if (cell !== "" || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((cells) => cells.some((value) => value.trim() !== ""));
}

function csvCell(value: string): string {
  // Guard against a cell being read as a formula by a spreadsheet program.
  const safe = /^[\s]*[=+\-@]/.test(value) ? `'${value}` : value;
  return `"${safe.replace(/"/g, '""')}"`;
}

function downloadText(filename: string, content: string): void {
  const url = URL.createObjectURL(
    new Blob([String.fromCharCode(0xfeff) + content], { type: "text/csv;charset=utf-8" })
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export default function ImportStudents({
  open,
  onClose,
  onImported,
}: {
  open: boolean;
  onClose: () => void;
  onImported: () => void;
}) {
  const [rows, setRows] = useState<Row[]>([]);
  const [fileName, setFileName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<ImportResult[] | null>(null);
  const input = useRef<HTMLInputElement | null>(null);

  const reset = () => {
    setRows([]);
    setFileName("");
    setError("");
    setResults(null);
  };

  const close = () => {
    if (busy) return;
    const imported = results?.some((result) => result.status === "created");
    reset();
    if (imported) onImported();
    else onClose();
  };

  const chooseFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setError("");
    setRows([]);
    setFileName(file.name);

    const cells = parseCsv(await file.text());
    if (cells.length < 2) {
      return setError("That file has no student rows under the header row.");
    }
    const header = cells[0].map((value) => value.trim().toLowerCase().replace(/\s+/g, "_"));
    const missing = (["student_id", "name", "email"] as const).filter(
      (column) => !header.includes(column)
    );
    if (missing.length > 0) {
      return setError(
        `The first row must name the columns. Missing: ${missing.join(", ")}. Download the template to see the layout.`
      );
    }
    if (cells.length - 1 > MAX_ROWS) {
      return setError(`Import at most ${MAX_ROWS} students at a time. This file has ${cells.length - 1}.`);
    }

    setRows(
      cells.slice(1).map((line) => {
        const row = {} as Row;
        for (const column of COLUMNS) {
          const position = header.indexOf(column);
          row[column] = position >= 0 ? (line[position] || "").trim() : "";
        }
        return row;
      })
    );
  };

  const runImport = async () => {
    setBusy(true);
    setError("");
    try {
      const response = await coordinatorRequest<{ results: ImportResult[] }>(
        "/api/coordinator/students/import",
        { method: "POST", body: { students: rows } }
      );
      setResults(response.results);
      const created = response.results.filter((result) => result.status === "created").length;
      toast.success(`${created} of ${rows.length} students imported.`);
    } catch (importError) {
      setError(errorText(importError, "The import could not be completed."));
    } finally {
      setBusy(false);
    }
  };

  const created = results?.filter((result) => result.status === "created") ?? [];
  const failed = results?.filter((result) => result.status === "error") ?? [];

  const downloadCredentials = () => {
    const lines = [
      ["student_id", "name", "temporary_password"].join(","),
      ...created.map((result) =>
        [result.student_id, result.name, result.password || ""].map(csvCell).join(",")
      ),
    ];
    downloadText("internet-imported-students.csv", lines.join("\r\n"));
  };

  return (
    <Modal
      open={open}
      onClose={close}
      title="Import students"
      description={
        results
          ? `${created.length} created, ${failed.length} not imported`
          : "Create many student accounts from a spreadsheet saved as CSV."
      }
      locked={busy}
      size="lg"
      footer={
        results ? (
          <>
            {created.length > 0 && (
              <Button variant="secondary" icon="download" onClick={downloadCredentials}>
                Download passwords
              </Button>
            )}
            <Button onClick={close}>Done</Button>
          </>
        ) : (
          <>
            <Button variant="secondary" onClick={close} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={() => void runImport()} busy={busy} disabled={rows.length === 0}>
              {busy
                ? "Importing"
                : rows.length > 0
                  ? `Import ${rows.length} ${rows.length === 1 ? "student" : "students"}`
                  : "Import"}
            </Button>
          </>
        )
      }
    >
      <input
        ref={input}
        type="file"
        accept=".csv,text/csv"
        onChange={(event) => void chooseFile(event)}
        className="sr-only"
        aria-label="CSV file"
        tabIndex={-1}
      />

      {results ? (
        <div className="space-y-4">
          {created.length > 0 && (
            <p className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2.5 text-sm text-amber-900">
              <Icon name="alert" size={16} className="mt-0.5 shrink-0" />
              Download the passwords now. They are not shown again, and each student must set
              their own at first sign-in.
            </p>
          )}
          <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
            {results.map((result) => (
              <li
                key={result.row}
                className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-3.5 py-2.5 text-sm"
              >
                <span className="min-w-0">
                  <span className="font-medium text-slate-900">
                    {result.name || `Row ${result.row}`}
                  </span>
                  <span className="text-slate-500"> · {result.student_id || "no ID"}</span>
                  {result.status === "error" && (
                    <span className="block text-red-700">{result.message}</span>
                  )}
                </span>
                <StatusBadge
                  status={result.status === "created" ? "Created" : "Not imported"}
                  tone={result.status === "created" ? "good" : "bad"}
                />
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="space-y-4">
          <ol className="space-y-2 text-sm text-slate-700">
            <li>
              1. <button
                type="button"
                onClick={() => downloadText("internet-students-template.csv", TEMPLATE)}
                className="font-semibold text-psu-700 hover:underline"
              >
                Download the template
              </button>{" "}
              and fill in one student per row.
            </li>
            <li>
              2. <span className="font-medium">student_id</span>,{" "}
              <span className="font-medium">name</span> and{" "}
              <span className="font-medium">email</span> are required. Leave{" "}
              <span className="font-medium">password</span> empty to have one generated.
            </li>
            <li>3. Save it as CSV and choose the file below.</li>
          </ol>

          <button
            type="button"
            onClick={() => input.current?.click()}
            disabled={busy}
            className="flex w-full items-center gap-3 rounded-lg border border-dashed border-slate-300 px-3.5 py-3.5 text-left hover:border-psu-400 hover:bg-psu-50"
          >
            <Icon name="upload" className="shrink-0 text-slate-400" />
            <span className="text-sm">
              <span className="font-semibold text-psu-700">
                {fileName ? "Choose a different file" : "Choose a CSV file"}
              </span>
              <span className="block text-xs text-slate-500">
                {fileName || `Up to ${MAX_ROWS} students per file`}
              </span>
            </span>
          </button>

          <FormError message={error} />

          {rows.length > 0 && (
            <div>
              <p className="mb-2 text-sm font-medium text-slate-700">
                {rows.length} {rows.length === 1 ? "student" : "students"} found. Check them
                before importing.
              </p>
              <div className="max-h-64 overflow-auto rounded-lg border border-slate-200">
                <table className="w-full text-left text-sm">
                  <thead className="sticky top-0 bg-slate-50 text-xs text-slate-500">
                    <tr>
                      <th scope="col" className="px-3 py-2 font-medium">Student ID</th>
                      <th scope="col" className="px-3 py-2 font-medium">Name</th>
                      <th scope="col" className="px-3 py-2 font-medium">Email</th>
                      <th scope="col" className="px-3 py-2 font-medium">Supervisor ID</th>
                      <th scope="col" className="px-3 py-2 text-right font-medium">Hours</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {rows.map((row, index) => (
                      <tr key={index}>
                        <td className="whitespace-nowrap px-3 py-2">{row.student_id || "—"}</td>
                        <td className="px-3 py-2">{row.name || "—"}</td>
                        <td className="px-3 py-2">{row.email || "—"}</td>
                        <td className="whitespace-nowrap px-3 py-2">
                          {row.supervisor_id || "—"}
                        </td>
                        <td className="tabular px-3 py-2 text-right">
                          {row.required_hours || "180"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
