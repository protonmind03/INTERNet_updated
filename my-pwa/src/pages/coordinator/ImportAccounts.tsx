import { useRef, useState } from "react";
import Icon from "../../components/Icon";
import { Button, FormError, Modal, StatusBadge } from "../../components/ui";
import { errorText, toast } from "../../lib/toast";
import { coordinatorRequest } from "./request";

/*
|--------------------------------------------------------------------------
| BULK ACCOUNT IMPORT (students or supervisors)
|--------------------------------------------------------------------------
|
| Four steps in one dialog: choose a CSV file, look at the rows read from
| it, have the server check them (nothing is created yet), then import and
| see what happened to each row. Accounts given a generated password are
| listed with it once, with a file to download, so the coordinator can
| hand the passwords out.
|
*/

type Kind = "students" | "supervisors";

const KINDS = {
  students: {
    one: "student",
    many: "students",
    id: "student_id",
    idLabel: "Student ID",
    // college, program, major and block are optional. A program is matched
    // by its name or short code, a block by its name ("BSIT 4A").
    columns: ["student_id", "name", "email", "college", "program", "major", "block", "company", "supervisor_id", "required_hours", "password"],
    template: "23-LN-0001,Juan Dela Cruz,juan.delacruz@example.com,College of Computing Sciences,BSIT,,BSIT 4A,Example Company,,180,",
    // The extra columns worth showing before importing.
    preview: [
      { key: "program", label: "Program", fallback: "—" },
      { key: "block", label: "Block", fallback: "—" },
      { key: "supervisor_id", label: "Supervisor ID", fallback: "—" },
      { key: "required_hours", label: "Hours", fallback: "180" },
    ],
  },
  supervisors: {
    one: "supervisor",
    many: "supervisors",
    id: "supervisor_id",
    idLabel: "Supervisor ID",
    columns: ["supervisor_id", "name", "email", "company", "department", "password"],
    template: "SUP-0001,Maria Santos,maria.santos@example.com,Example Company,Accounting,",
    preview: [
      { key: "company", label: "Company", fallback: "—" },
      { key: "department", label: "Department", fallback: "—" },
    ],
  },
} as const;

type Row = Record<string, string>;

type ImportResult = {
  row: number;
  /** The account's ID: `student_id` or `supervisor_id`, whichever was imported. */
  student_id?: string;
  supervisor_id?: string;
  name: string;
  status: "created" | "ok" | "error";
  message: string;
  password?: string;
};

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

export default function ImportAccounts({
  kind,
  open,
  onClose,
  onImported,
}: {
  kind: Kind;
  open: boolean;
  onClose: () => void;
  onImported: () => void;
}) {
  const config = KINDS[kind];
  const [rows, setRows] = useState<Row[]>([]);
  const [fileName, setFileName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  /** What the server said the import would do, before anything is created. */
  const [checked, setChecked] = useState<ImportResult[] | null>(null);
  const [results, setResults] = useState<ImportResult[] | null>(null);
  const input = useRef<HTMLInputElement | null>(null);

  const idOf = (result: ImportResult) => result[config.id] || "";

  const reset = () => {
    setRows([]);
    setFileName("");
    setError("");
    setChecked(null);
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
    setChecked(null);
    setFileName(file.name);

    const cells = parseCsv(await file.text());
    if (cells.length < 2) {
      return setError(`That file has no ${config.one} rows under the header row.`);
    }
    const header = cells[0].map((value) => value.trim().toLowerCase().replace(/\s+/g, "_"));
    const missing = [config.id, "name", "email"].filter((column) => !header.includes(column));
    if (missing.length > 0) {
      return setError(
        `The first row must name the columns. Missing: ${missing.join(", ")}. Download the template to see the layout.`
      );
    }
    if (cells.length - 1 > MAX_ROWS) {
      return setError(
        `Import at most ${MAX_ROWS} ${config.many} at a time. This file has ${cells.length - 1}.`
      );
    }

    setRows(
      cells.slice(1).map((line) => {
        const row: Row = {};
        for (const column of config.columns) {
          const position = header.indexOf(column);
          row[column] = position >= 0 ? (line[position] || "").trim() : "";
        }
        return row;
      })
    );
  };

  const send = async (dryRun: boolean) => {
    setBusy(true);
    setError("");
    try {
      const response = await coordinatorRequest<{ results: ImportResult[] }>(
        `/api/coordinator/${kind}/import`,
        { method: "POST", body: { [kind]: rows, ...(dryRun ? { dry_run: true } : {}) } }
      );
      if (dryRun) {
        setChecked(response.results);
      } else {
        setResults(response.results);
        const made = response.results.filter((result) => result.status === "created").length;
        toast.success(`${made} of ${rows.length} ${config.many} imported.`);
      }
    } catch (importError) {
      setError(errorText(importError, dryRun ? "The file could not be checked." : "The import could not be completed."));
    } finally {
      setBusy(false);
    }
  };

  const created = results?.filter((result) => result.status === "created") ?? [];
  const failed = results?.filter((result) => result.status === "error") ?? [];
  const ready = checked?.filter((result) => result.status === "ok") ?? [];
  const problems = checked?.filter((result) => result.status === "error") ?? [];

  const downloadCredentials = () => {
    const lines = [
      [config.id, "name", "temporary_password"].join(","),
      ...created.map((result) =>
        [idOf(result), result.name, result.password || ""].map(csvCell).join(",")
      ),
    ];
    downloadText(`internet-imported-${config.many}.csv`, lines.join("\r\n"));
  };

  const outcomeList = (list: ImportResult[]) => (
    <ul className="max-h-72 divide-y divide-(--role-hairline) overflow-y-auto rounded-lg border border-(--role-hairline)">
      {list.map((result) => (
        <li
          key={result.row}
          className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-3.5 py-2.5 text-sm"
        >
          <span className="min-w-0">
            <span className="font-medium text-slate-900">{result.name || `Row ${result.row}`}</span>
            <span className="text-slate-500"> · {idOf(result) || "no ID"}</span>
            {result.status === "error" && (
              <span className="block text-red-700">{result.message}</span>
            )}
          </span>
          <StatusBadge
            status={
              result.status === "created"
                ? "Created"
                : result.status === "ok"
                  ? "Ready"
                  : results
                    ? "Not imported"
                    : "Will be skipped"
            }
            tone={result.status === "error" ? "bad" : "good"}
          />
        </li>
      ))}
    </ul>
  );

  return (
    <Modal
      open={open}
      onClose={close}
      title={`Import ${config.many}`}
      description={
        results
          ? `${created.length} created, ${failed.length} not imported`
          : checked
            ? `${ready.length} ready, ${problems.length} with a problem. Nothing has been created yet.`
            : `Create many ${config.one} accounts from a spreadsheet saved as CSV.`
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
        ) : checked ? (
          <>
            <Button variant="secondary" onClick={() => setChecked(null)} disabled={busy}>
              Back
            </Button>
            <Button
              onClick={() => void send(false)}
              busy={busy}
              failed={Boolean(error)}
              disabled={ready.length === 0}
            >
              {busy
                ? "Importing"
                : `Import ${ready.length} ${ready.length === 1 ? config.one : config.many}`}
            </Button>
          </>
        ) : (
          <>
            <Button variant="secondary" onClick={close} disabled={busy}>
              Cancel
            </Button>
            <Button
              onClick={() => void send(true)}
              busy={busy}
              failed={Boolean(error)}
              disabled={rows.length === 0}
            >
              {busy ? "Checking" : "Check the file"}
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
            <p className="flex items-start gap-2 rounded-lg bg-(--status-warning-bg) px-3 py-2.5 text-sm text-(--status-warning-ink)">
              <Icon name="alert" size={16} className="mt-0.5 shrink-0" />
              Download the passwords now. They are not shown again, and each {config.one} must
              set their own at first sign-in.
            </p>
          )}
          {outcomeList(results)}
        </div>
      ) : checked ? (
        <div className="space-y-4">
          <p className="text-sm text-slate-700">
            {problems.length === 0
              ? `Every row can be imported.`
              : ready.length === 0
                ? "No row can be imported. Fix the file and choose it again."
                : `The ${problems.length === 1 ? "row" : "rows"} with a problem will be skipped. To include ${problems.length === 1 ? "it" : "them"}, go back, fix the file and choose it again.`}
          </p>
          {outcomeList(checked)}
          <FormError message={error} />
        </div>
      ) : (
        <div className="space-y-4">
          <ol className="space-y-2 text-sm text-slate-700">
            <li>
              1.{" "}
              <button
                type="button"
                onClick={() =>
                  downloadText(
                    `internet-${config.many}-template.csv`,
                    `${config.columns.join(",")}\n${config.template}\n`
                  )
                }
                className="font-semibold text-psu-700 hover:underline"
              >
                Download the template
              </button>{" "}
              and fill in one {config.one} per row.
            </li>
            <li>
              2. <span className="font-medium">{config.id}</span>,{" "}
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
            className="flex w-full items-center gap-3 rounded-lg border-[1.5px] border-dashed border-psu-300 px-3.5 py-3.5 text-left hover:border-psu-400 hover:bg-psu-50"
          >
            <Icon name="upload" className="shrink-0 text-slate-400" />
            <span className="text-sm">
              <span className="font-semibold text-psu-700">
                {fileName ? "Choose a different file" : "Choose a CSV file"}
              </span>
              <span className="block text-xs text-slate-500">
                {fileName || `Up to ${MAX_ROWS} ${config.many} per file`}
              </span>
            </span>
          </button>

          <FormError message={error} />

          {rows.length > 0 && (
            <div>
              <p className="mb-2 text-sm font-medium text-slate-700">
                {rows.length} {rows.length === 1 ? config.one : config.many} found. Checking the
                file creates nothing; it shows what would happen to each row.
              </p>
              <div className="max-h-64 overflow-auto rounded-lg border border-(--role-hairline)">
                <table className="w-full text-left text-sm">
                  <thead className="sticky top-0 bg-slate-50 text-xs text-slate-500">
                    <tr>
                      <th scope="col" className="px-3 py-2 font-medium">{config.idLabel}</th>
                      <th scope="col" className="px-3 py-2 font-medium">Name</th>
                      <th scope="col" className="px-3 py-2 font-medium">Email</th>
                      {config.preview.map((column) => (
                        <th key={column.key} scope="col" className="px-3 py-2 font-medium">
                          {column.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-(--role-hairline)">
                    {rows.map((row, index) => (
                      <tr key={index}>
                        <td className="whitespace-nowrap px-3 py-2">{row[config.id] || "—"}</td>
                        <td className="px-3 py-2">{row.name || "—"}</td>
                        <td className="px-3 py-2">{row.email || "—"}</td>
                        {config.preview.map((column) => (
                          <td key={column.key} className="tabular px-3 py-2">
                            {row[column.key] || column.fallback}
                          </td>
                        ))}
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
