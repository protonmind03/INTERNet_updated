import { useEffect, useRef, useState, type RefObject } from "react";
import Icon from "../../../components/Icon";
import { Button } from "../../../components/ui";
import { toast } from "../../../lib/toast";
import FormSheet from "./FormSheet";
import type { Block, DocMeta } from "./formModel";

/*
|--------------------------------------------------------------------------
| PRINT, AND SAVE AS PDF OR WORD, FOR ANY UNIVERSITY FORM (November 2026)
|--------------------------------------------------------------------------
|
| Two buttons wherever a form is: Print sends the form alone to the
| printer, on A4 (no browser lines, no app around it); Save opens a choice
| of a PDF (real text) or a Word file (to edit). Given `sheet`, the form
| already on the page is used; without it, the form is laid out out of
| sight here, so a page can offer the buttons without showing the sheet.
|
*/

export default function FormButtons({
  meta,
  blocks,
  fileName,
  sheet,
  campus,
  disabled = false,
  size = "md",
  printLabel = "Print",
}: {
  meta: DocMeta;
  blocks: Block[];
  fileName: string;
  sheet?: RefObject<HTMLElement | null>;
  campus?: string;
  disabled?: boolean;
  size?: "sm" | "md";
  printLabel?: string;
}) {
  const own = useRef<HTMLElement>(null);
  const [saving, setSaving] = useState(false);
  const [menu, setMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // The Save menu closes on a click elsewhere or Escape.
  useEffect(() => {
    if (!menu) return;
    const close = (event: MouseEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent ? event.key === "Escape" : !menuRef.current?.contains(event.target as Node)) setMenu(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [menu]);

  // Without a sheet on the page, the form is laid out only while it prints or saves.
  const [laidOut, setLaidOut] = useState(false);
  const sheetNow = async (): Promise<HTMLElement | null> => {
    if (sheet) return sheet.current;
    setLaidOut(true);
    for (let tries = 0; tries < 20 && !own.current; tries += 1) await new Promise((resolve) => requestAnimationFrame(resolve));
    // The seal's picture, before the form is copied or drawn.
    const seal = own.current?.querySelector("img");
    if (seal && !seal.complete) await new Promise((resolve) => ((seal.onload = resolve), (seal.onerror = resolve), window.setTimeout(resolve, 1500)));
    return own.current;
  };

  const print = async () => {
    const node = await sheetNow();
    if (!node) return;
    const { printSheet } = await import("./formOutput");
    await printSheet(node, fileName);
    if (!sheet) setLaidOut(false);
  };

  const save = async (kind: "pdf" | "docx") => {
    setMenu(false);
    setSaving(true);
    try {
      const node = await sheetNow();
      if (!node) return;
      if (kind === "pdf") await (await import("./formPdf")).saveFormPdf(meta, blocks, node, fileName, campus);
      else await (await import("./formOutput")).saveFormDocx(meta, blocks, node, fileName, campus);
      toast.success(kind === "pdf" ? "Saved as a PDF in your downloads." : "Saved as a Word file in your downloads.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The file could not be made.");
    } finally {
      setSaving(false);
      if (!sheet) setLaidOut(false);
    }
  };

  return (
    <div className="flex flex-wrap gap-2">
      <Button size={size} icon="printer" onClick={() => void print()} disabled={disabled}>
        {printLabel}
      </Button>
      <div ref={menuRef} className="relative">
        <Button size={size} variant="secondary" icon="download" busy={saving} busyLabel="Saving" onClick={() => setMenu((open) => !open)} disabled={disabled} aria-haspopup="menu" aria-expanded={menu}>
          Save
          <Icon name="chevron-down" size={15} />
        </Button>
        {menu && (
          <div role="menu" aria-label="Save as" className="absolute right-0 z-30 mt-1.5 w-64 overflow-hidden rounded-xl bg-white py-1 text-left shadow-raised ring-1 ring-(--role-hairline) sm:left-0 sm:right-auto">
            <button type="button" role="menuitem" onClick={() => void save("pdf")} className="flex w-full items-start gap-2.5 px-3 py-2.5 text-left hover:bg-psu-50">
              <Icon name="document" size={18} className="mt-0.5 text-psu-700" />
              <span>
                <span className="block text-[14px] font-bold text-slate-900">PDF (.pdf)</span>
                <span className="block text-[12px] text-slate-600">Ready to print or send, as it looks here</span>
              </span>
            </button>
            <button type="button" role="menuitem" onClick={() => void save("docx")} className="flex w-full items-start gap-2.5 px-3 py-2.5 text-left hover:bg-psu-50">
              <Icon name="edit" size={18} className="mt-0.5 text-psu-700" />
              <span>
                <span className="block text-[14px] font-bold text-slate-900">Word (.docx)</span>
                <span className="block text-[12px] text-slate-600">To edit any part before printing</span>
              </span>
            </button>
          </div>
        )}
      </div>
      {!sheet && laidOut && (
        // The form, laid out at A4 out of sight, for Print and Save to use.
        <div aria-hidden="true" className="pointer-events-none fixed top-0 -left-[10000px] w-[210mm] print:hidden" inert>
          <FormSheet ref={own} meta={meta} blocks={blocks} campus={campus} />
        </div>
      )}
    </div>
  );
}

/** The form on a grey desk, at A4, scrolling sideways on a narrow screen. */
export function FormPreview({ meta, blocks, sheet, campus, label = "Preview of the form" }: { meta: DocMeta; blocks: Block[]; sheet: RefObject<HTMLElement | null>; campus?: string; label?: string }) {
  return (
    <div tabIndex={0} role="region" aria-label={label} className="psu-preview overflow-x-auto rounded-2xl bg-slate-200/70 p-3 ring-1 ring-inset ring-(--role-hairline) sm:p-5">
      <div className="mx-auto w-[210mm] max-w-none shadow-raised">
        <FormSheet ref={sheet} meta={meta} blocks={blocks} campus={campus} />
      </div>
    </div>
  );
}
