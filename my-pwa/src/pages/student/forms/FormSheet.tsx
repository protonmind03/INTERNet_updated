import { forwardRef, type ReactNode } from "react";
import { PsuSeal } from "../../../brand";
import type { Block, FormMeta, Run, Signature } from "./formModel";

/*
|--------------------------------------------------------------------------
| ONE FORM ON AN A4 SHEET (Fill and print, November 2026)
|--------------------------------------------------------------------------
|
| The university's head (the seal, the form's title, the university and
| campus, the form's code at the top right), then the form's blocks
| (formModel.ts): a table only where the form has one, one per section,
| with no border around the whole page. Arial, 10 pt, on a 210 x 297 mm
| sheet with its own margins, so it prints the same from any browser.
| This element is what Print sends to the printer and what Save makes the
| PDF from (formOutput.ts). Styles: index.css, "pf-".
|
*/

function runs(list: Run[]): ReactNode {
  return list.map((run, index) => {
    if (typeof run === "string") return run === "\n" ? <br key={index} /> : <span key={index}>{run}</span>;
    if ("b" in run) return <b key={index}>{run.b}</b>;
    if ("i" in run) return <i key={index}>{run.i}</i>;
    return (
      <span key={index} className={`pf-line pf-line--${run.w}`}>
        {(run.upper ? run.v.toUpperCase() : run.v) || " "}
      </span>
    );
  });
}

function SignatureBox({ item }: { item: Signature }) {
  return (
    <div className="pf-sig">
      {/* A blank lead keeps its line's height, so a signature sits level with a "Noted:" beside it. */}
      {item.lead && <p className="pf-sig-lead">{item.lead.trim() ? item.lead : String.fromCharCode(160)}</p>}
      <p className="pf-sig-name">{item.name?.trim() || " "}</p>
      <p className="pf-sig-title">{item.title}</p>
      {item.after && (
        <div className="pf-sig-after">
          {item.after.map((row, index) => (
            <p key={index}>{runs(row)}</p>
          ))}
        </div>
      )}
    </div>
  );
}

function BlockView({ block }: { block: Block }) {
  switch (block.kind) {
    case "section":
      return <h3 className="pf-section">{block.title}</h3>;
    case "gap":
      return <div style={{ height: `${block.mm}mm` }} />;
    case "para":
      return <p className={`pf-para ${block.italic ? "pf-para--italic" : ""} ${block.align === "left" ? "pf-para--left" : block.align === "center" ? "pf-para--center" : ""}`}>{runs(block.runs)}</p>;
    case "list":
      return (
        <ol className={`pf-list ${block.style === "alpha" ? "pf-list--alpha" : ""}`}>
          {block.items.map((item, index) => (
            <li key={index}>{runs(item)}</li>
          ))}
        </ol>
      );
    case "signatures":
      return (
        <div className={`pf-sigs ${block.columns === 1 ? "pf-sigs--one" : ""} ${block.align === "left" ? "pf-sigs--left" : ""}`}>
          {block.items.map((item, index) => (
            <SignatureBox key={index} item={item} />
          ))}
        </div>
      );
    case "table":
      return (
        <table className="pf-table">
          <colgroup>
            {block.cols.map((width, index) => (
              <col key={index} style={{ width: `${width}%` }} />
            ))}
          </colgroup>
          <tbody>
            {block.rows.map((row, rowIndex) => (
              <tr key={rowIndex}>
                {row.map((cell, index) => (
                  <td key={index} colSpan={cell.span} className={cell.label ? `pf-label ${cell.head ? "pf-label--head" : ""}` : "pf-value"}>
                    {cell.label ? cell.text : cell.v}
                  </td>
                ))}
              </tr>
            ))}
            {Array.from({ length: block.empty ?? 0 }, (_, rowIndex) => (
              <tr key={`empty-${rowIndex}`} className="pf-empty">
                {block.cols.map((_, index) => (
                  <td key={index} />
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      );
  }
}

const FormSheet = forwardRef<HTMLElement, { meta: FormMeta; blocks: Block[]; campus?: string }>(function FormSheet({ meta, blocks, campus = "Lingayen" }, ref) {
  return (
    <article ref={ref} className={`pf-page pf-page--${meta.key}`} aria-label={meta.title}>
      {meta.code && (
        <p className="pf-code">
          {meta.code.code}
          <br />
          {meta.code.rev}
          <br />
          {meta.code.date}
        </p>
      )}
      <header className="pf-head">
        <span className="pf-seal">
          <PsuSeal size={76} clearSpace={false} decorative />
        </span>
        <span className="pf-titles">
          <span className="pf-title">{meta.title}</span>
          <span className="pf-university">PANGASINAN STATE UNIVERSITY</span>
          <span className="pf-campus">
            <u>{campus}</u> Campus
          </span>
        </span>
        <span className="pf-seal pf-seal--balance" aria-hidden="true" />
      </header>
      <div className="pf-body">
        {blocks.map((block, index) => (
          <BlockView key={index} block={block} />
        ))}
      </div>
    </article>
  );
});

export default FormSheet;
