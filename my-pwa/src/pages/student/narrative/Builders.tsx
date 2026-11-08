import "@fontsource/unifrakturmaguntia/latin-400.css";
import { useEffect, useState, type ReactNode } from "react";
import { PsuSeal } from "../../../brand";
import Icon from "../../../components/Icon";
import { Button, SkeletonRows } from "../../../components/ui";
import { pictureUrl } from "../../../lib/attachments";
import { traineeRecord } from "../../../lib/traineeRecord";
import { restoreAutosave, saveStateText, useAutosave } from "../../../lib/useAutosave";
import type { Records } from "./model";
import {
  TITLE_LAYOUTS,
  orgTree,
  type AgencyData,
  type OrgData,
  type OrgNode,
  type OrgPerson,
  type ServicesData,
  type TitleData,
} from "./structured";
import type { ReportPhoto } from "./useNarrativeData";

/*
|--------------------------------------------------------------------------
| THE GUIDED FORMS OF THE NARRATIVE REPORT (change1108)
|--------------------------------------------------------------------------
|
| One frame (GuidedEditor) for every guided part: it restores what was left
| on the phone, saves the fields and their text version as the trainee
| types, and says so. Inside it, a form per part (structured.ts says what
| each holds), and the two drawings the printed binder uses as well: the
| title page in its chosen layout and the organizational chart.
|
*/

const BLACKLETTER = "'Old English Text MT', 'UnifrakturMaguntia', serif";

export function GuidedEditor<T extends Record<string, unknown>>({
  studentId,
  partKey,
  title,
  hint,
  initial,
  compose,
  onSaved,
  children,
}: {
  studentId: string;
  partKey: string;
  title: string;
  hint: string;
  /** What the server has (or the defaults). */
  initial: T;
  compose: (data: T) => string;
  onSaved: (text: string, data: T) => void;
  children: (data: T, update: (patch: Partial<T>) => void) => ReactNode;
}) {
  const [data, setData] = useState<T | null>(null);
  useEffect(() => {
    let active = true;
    void restoreAutosave<T>("student", `narrative:${partKey}:fields`).then((value) => {
      if (active) setData(value ? { ...initial, ...value } : initial);
    });
    return () => {
      active = false;
    };
    // Once per part opened.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [partKey]);

  const save = useAutosave<T | null>({
    role: "student",
    key: `narrative:${partKey}:fields`,
    value: data,
    enabled: data !== null,
    start: initial,
    save: async (value) => {
      if (!value) return;
      const text = compose(value);
      await traineeRecord.saveNarrativePart(studentId, partKey, text, value);
      onSaved(text, value);
    },
  });

  return (
    <section className="rounded-2xl bg-white ring-1 ring-inset ring-(--role-hairline)">
      <div className="flex flex-wrap items-start justify-between gap-2 border-b border-(--role-hairline) px-4 py-3 sm:px-5">
        <div className="min-w-0">
          <h2 className="text-[17px] font-extrabold text-slate-900">{title}</h2>
          <p className="text-[13px] text-slate-600">{hint}</p>
        </div>
        <span className="text-[12.5px] text-slate-600" aria-live="polite">
          {saveStateText(save.state, save.message) || "Saves as you type"}
        </span>
      </div>
      <div className="px-4 py-4 sm:px-5">{data === null ? <SkeletonRows rows={4} /> : children(data, (patch) => setData((current) => (current ? { ...current, ...patch } : current)))}</div>
    </section>
  );
}

function Field({ label, children, wide = false }: { label: string; children: ReactNode; wide?: boolean }) {
  return (
    <label className={`block ${wide ? "sm:col-span-2" : ""}`}>
      <span className="mb-1 block text-[13px] font-bold text-slate-800">{label}</span>
      {children}
    </label>
  );
}

/* ---------- I. Title Page ---------- */

/** The title page in its layout, at print size (8.5 × 11 in). */
export function TitlePageSheet({ data, records, college }: { data: TitleData; records: Records; college: string }) {
  const base = { fontFamily: "'Times New Roman', Times, serif", color: "#000", width: "8.5in", minHeight: "11in", boxSizing: "border-box" as const, background: "#fff" };
  const lines = (
    <>
      <p style={{ fontStyle: "italic", fontSize: "12pt", margin: "18pt 0 0" }}>{data.purpose}</p>
    </>
  );
  const people = (align: "center" | "left") => (
    <div style={{ marginTop: "1.1in", textAlign: align, fontSize: "12pt", lineHeight: 1.5 }}>
      {data.submittedBy && (
        <>
          <p style={{ margin: 0 }}>Submitted by:</p>
          <p style={{ margin: 0, fontWeight: 700, fontSize: "14pt" }}>{data.submittedBy}</p>
          {records.program && <p style={{ margin: 0 }}>{records.program}</p>}
        </>
      )}
      {data.submittedTo && (
        <>
          <p style={{ margin: "14pt 0 0" }}>Submitted to:</p>
          <p style={{ margin: 0, fontWeight: 700 }}>{data.submittedTo}</p>
        </>
      )}
      <p style={{ margin: "20pt 0 0" }}>{data.date}</p>
    </div>
  );

  if (data.layout === "seal") {
    return (
      <section style={{ ...base, padding: 0, textAlign: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "18pt", padding: "0.45in 0.8in", background: "#13246b", color: "#fff", borderBottom: "6pt solid #f5c518" }}>
          <PsuSeal size={84} clearSpace={false} decorative />
          <div style={{ textAlign: "left", lineHeight: 1.2 }}>
            <p style={{ fontFamily: BLACKLETTER, fontSize: "26pt", margin: 0 }}>Pangasinan State University</p>
            <p style={{ margin: 0, fontSize: "11pt" }}>{records.campus} Campus</p>
            {college && <p style={{ margin: 0, fontSize: "11pt", fontStyle: "italic" }}>{college}</p>}
          </div>
        </div>
        <div style={{ padding: "0.9in 1in 0.8in" }}>
          <div style={{ border: "3pt double #13246b", padding: "28pt 20pt" }}>
            <p style={{ fontSize: "22pt", fontWeight: 700, margin: 0, whiteSpace: "pre-wrap", letterSpacing: "0.02em" }}>{data.title}</p>
            {data.agency && <p style={{ margin: "12pt 0 0", fontSize: "13pt" }}>at <b>{data.agency}</b></p>}
            {lines}
          </div>
          {people("center")}
        </div>
      </section>
    );
  }

  if (data.layout === "modern") {
    return (
      <section style={{ ...base, padding: "0.9in 1in 0.9in 1.2in", borderLeft: "0.32in solid #f5c518", textAlign: "left" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "14pt" }}>
          <PsuSeal size={64} clearSpace={false} decorative />
          <div style={{ lineHeight: 1.2 }}>
            <p style={{ fontFamily: BLACKLETTER, fontSize: "20pt", margin: 0 }}>Pangasinan State University</p>
            <p style={{ margin: 0, fontSize: "10.5pt" }}>
              {records.campus} Campus{college ? ` · ${college}` : ""}
            </p>
          </div>
        </div>
        <p style={{ fontSize: "30pt", fontWeight: 700, lineHeight: 1.1, margin: "1.5in 0 0", whiteSpace: "pre-wrap" }}>{data.title}</p>
        <div style={{ width: "1.4in", height: "4pt", background: "#13246b", margin: "16pt 0" }} />
        {data.agency && <p style={{ margin: 0, fontSize: "14pt" }}>{data.agency}</p>}
        {lines}
        {people("left")}
      </section>
    );
  }

  return (
    <section style={{ ...base, padding: "0.9in 1in", textAlign: "center" }}>
      <div style={{ display: "flex", justifyContent: "center" }}>
        <PsuSeal size={110} clearSpace={false} decorative />
      </div>
      <p style={{ fontFamily: BLACKLETTER, fontSize: "26pt", margin: "12pt 0 0" }}>Pangasinan State University</p>
      <p style={{ margin: 0 }}>{records.campus} Campus</p>
      {college && <p style={{ margin: 0, fontStyle: "italic" }}>{college}</p>}
      <p style={{ fontSize: "20pt", fontWeight: 700, margin: "1in 0 0", whiteSpace: "pre-wrap" }}>{data.title}</p>
      {data.agency && (
        <>
          <p style={{ margin: "10pt 0 0" }}>at</p>
          <p style={{ margin: 0, fontWeight: 700 }}>{data.agency}</p>
        </>
      )}
      {lines}
      {people("center")}
    </section>
  );
}

export function TitleForm({ data, update, records, college }: { data: TitleData; update: (patch: Partial<TitleData>) => void; records: Records; college: string }) {
  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_auto]">
      <div className="space-y-4">
        <fieldset>
          <legend className="mb-2 text-[13px] font-bold text-slate-800">Layout</legend>
          <div className="grid gap-2">
            {TITLE_LAYOUTS.map((layout) => (
              <label key={layout.value} className={`flex cursor-pointer flex-col gap-0.5 rounded-xl px-3 py-2.5 ring-1 ring-inset transition-colors ${data.layout === layout.value ? "bg-psu-50 ring-2 ring-psu-600" : "ring-(--role-hairline) hover:bg-slate-50"}`}>
                <span className="flex items-center gap-2 text-[14px] font-bold text-slate-900">
                  <input type="radio" name="title-layout" value={layout.value} checked={data.layout === layout.value} onChange={() => update({ layout: layout.value })} className="h-4 w-4 accent-(--role-primary)" />
                  {layout.label}
                </span>
                <span className="text-[12px] leading-snug text-slate-600">{layout.line}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Title" wide>
            <textarea rows={2} value={data.title} onChange={(event) => update({ title: event.target.value })} className="field resize-y" />
          </Field>
          <Field label="Agency or company" wide>
            <input value={data.agency} onChange={(event) => update({ agency: event.target.value })} className="field" />
          </Field>
          <Field label="Purpose line" wide>
            <input value={data.purpose} onChange={(event) => update({ purpose: event.target.value })} className="field" />
          </Field>
          <Field label="Submitted by">
            <input value={data.submittedBy} onChange={(event) => update({ submittedBy: event.target.value })} className="field" />
          </Field>
          <Field label="Submitted to (optional)">
            <input value={data.submittedTo} onChange={(event) => update({ submittedTo: event.target.value })} placeholder="Your OJT coordinator" className="field" />
          </Field>
          <Field label="Date">
            <input value={data.date} onChange={(event) => update({ date: event.target.value })} className="field" />
          </Field>
        </div>
      </div>
      <figure className="mx-auto">
        <div aria-label="Preview of the title page" role="img" className="title-preview overflow-hidden rounded-lg shadow-raised ring-1 ring-(--role-hairline)">
          <div className="title-preview-inner">
            <TitlePageSheet data={data} records={records} college={college} />
          </div>
        </div>
        <figcaption className="mt-1.5 text-center text-[12px] text-slate-500">Preview · prints on its own page</figcaption>
      </figure>
    </div>
  );
}

/* ---------- V. Company Profile ---------- */

export function AgencyForm({ data, update }: { data: AgencyData; update: (patch: Partial<AgencyData>) => void }) {
  const input = (key: keyof AgencyData, label: string, placeholder = "") => (
    <Field label={label}>
      <input value={data[key]} onChange={(event) => update({ [key]: event.target.value })} placeholder={placeholder} className="field" />
    </Field>
  );
  const area = (key: keyof AgencyData, label: string, placeholder: string) => (
    <Field label={label} wide>
      <textarea rows={3} value={data[key]} onChange={(event) => update({ [key]: event.target.value })} placeholder={placeholder} className="field resize-y leading-relaxed" />
    </Field>
  );
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {input("name", "Name of the agency or company")}
      {input("address", "Address", "Street, town, province")}
      {input("head", "Head of office", "Name and position")}
      {input("founded", "Year established", "e.g. 1975")}
      {area("history", "A short history", "How it began, what it has become…")}
      {area("mission", "Mission", "As the agency states it")}
      {area("vision", "Vision", "As the agency states it")}
      <p className="text-[12.5px] text-slate-500 sm:col-span-2">Ask your supervisor or look at the agency's website or citizen's charter for the exact mission and vision.</p>
    </div>
  );
}

export function ServicesForm({ data, update }: { data: ServicesData; update: (patch: Partial<ServicesData>) => void }) {
  const items = data.items.length ? data.items : [{ name: "", detail: "" }];
  const set = (index: number, patch: Partial<ServicesData["items"][number]>) => update({ items: items.map((item, at) => (at === index ? { ...item, ...patch } : item)) });
  return (
    <div className="space-y-2.5">
      <ol className="space-y-2.5">
        {items.map((item, index) => (
          <li key={index} className="flex items-start gap-2 rounded-xl bg-slate-50 p-2.5 ring-1 ring-inset ring-(--role-hairline)">
            <span className="tabular mt-2.5 w-6 shrink-0 text-center text-[13px] font-bold text-slate-500">{index + 1}</span>
            <div className="grid min-w-0 flex-1 gap-2 sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
              <input aria-label={`Service ${index + 1}`} value={item.name} onChange={(event) => set(index, { name: event.target.value })} placeholder="Function or service" className="field" />
              <input aria-label={`About service ${index + 1}`} value={item.detail} onChange={(event) => set(index, { detail: event.target.value })} placeholder="What it is, who it serves" className="field" />
            </div>
            <button type="button" onClick={() => update({ items: items.filter((_, at) => at !== index) })} aria-label={`Remove service ${index + 1}`} className="grid h-11 w-11 shrink-0 place-items-center rounded-lg text-slate-500 hover:bg-white hover:text-slate-800">
              <Icon name="trash" size={16} />
            </button>
          </li>
        ))}
      </ol>
      <Button variant="secondary" size="sm" icon="plus" onClick={() => update({ items: [...items, { name: "", detail: "" }] })}>
        Add a service
      </Button>
    </div>
  );
}

/** The organizational chart: boxes joined by lines, top to bottom. */
export function OrgChartDrawing({ people, print = false }: { people: OrgPerson[]; print?: boolean }) {
  const tree = orgTree(people);
  if (tree.length === 0) return null;
  const draw = (nodes: OrgNode[]): ReactNode => (
    <ul>
      {nodes.map((node) => (
        <li key={node.id}>
          <span className="org-box">
            <b>{node.position || "Position"}</b>
            {node.name && <span>{node.name}</span>}
          </span>
          {node.children.length > 0 && draw(node.children)}
        </li>
      ))}
    </ul>
  );
  return <div className={`org-tree ${print ? "org-tree--print" : ""}`}>{draw(tree)}</div>;
}

function AlbumThumb({ photo, on, onPick }: { photo: ReportPhoto; on: boolean; onPick: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let made: string | null = null;
    void pictureUrl("student", photo.id)
      .then((value) => {
        made = value;
        setUrl(value);
      })
      .catch(() => undefined);
    return () => {
      if (made) URL.revokeObjectURL(made);
    };
  }, [photo.id]);
  return (
    <button type="button" onClick={onPick} aria-pressed={on} aria-label={`Use “${photo.caption || photo.title}”`} className={`relative aspect-[4/3] overflow-hidden rounded-lg bg-slate-100 ring-inset ${on ? "ring-4 ring-psu-600" : "ring-1 ring-(--role-hairline)"}`}>
      {url && <img src={url} alt="" className="h-full w-full object-cover" />}
      {on && (
        <span className="absolute right-1 top-1 grid h-6 w-6 place-items-center rounded-full bg-psu-700 text-white">
          <Icon name="check" size={14} />
        </span>
      )}
    </button>
  );
}

export function OrgForm({ data, update, photos }: { data: OrgData; update: (patch: Partial<OrgData>) => void; photos: ReportPhoto[] }) {
  const people = data.people;
  const set = (id: string, patch: Partial<OrgPerson>) => update({ people: people.map((person) => (person.id === id ? { ...person, ...patch } : person)) });
  const add = () => {
    const id = `p${Date.now().toString(36)}`;
    update({ people: [...people, { id, name: "", position: "", parent: people[0]?.id ?? null }] });
  };
  const remove = (id: string) => update({ people: people.filter((person) => person.id !== id).map((person) => (person.parent === id ? { ...person, parent: null } : person)) });

  return (
    <div className="space-y-4">
      <div role="radiogroup" aria-label="How to show the chart" className="inline-flex rounded-xl bg-slate-100 p-1">
        {(
          [
            ["chart", "Build the chart"],
            ["photo", "Use a photo of it"],
          ] as const
        ).map(([mode, label]) => (
          <button key={mode} type="button" role="radio" aria-checked={data.mode === mode} onClick={() => update({ mode })} className={`min-h-10 rounded-lg px-3.5 text-[13.5px] font-bold ${data.mode === mode ? "bg-white text-psu-900 shadow-sm" : "text-slate-600"}`}>
            {label}
          </button>
        ))}
      </div>

      {data.mode === "chart" ? (
        <>
          <ol className="space-y-2">
            {people.map((person, index) => (
              <li key={person.id} className="grid gap-2 rounded-xl bg-slate-50 p-2.5 ring-1 ring-inset ring-(--role-hairline) sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-center">
                <input aria-label={`Position ${index + 1}`} value={person.position} onChange={(event) => set(person.id, { position: event.target.value })} placeholder="Position (e.g. Municipal Mayor)" className="field" />
                <input aria-label={`Name ${index + 1}`} value={person.name} onChange={(event) => set(person.id, { name: event.target.value })} placeholder="Name (optional)" className="field" />
                <select aria-label={`Reports to, ${person.position || `box ${index + 1}`}`} value={person.parent ?? ""} onChange={(event) => set(person.id, { parent: event.target.value || null })} className="field">
                  <option value="">At the top</option>
                  {people
                    .filter((other) => other.id !== person.id)
                    .map((other) => (
                      <option key={other.id} value={other.id}>
                        Reports to {other.position || other.name || "a box"}
                      </option>
                    ))}
                </select>
                <button type="button" onClick={() => remove(person.id)} aria-label={`Remove ${person.position || `box ${index + 1}`}`} className="grid h-11 w-11 place-items-center justify-self-end rounded-lg text-slate-500 hover:bg-white hover:text-slate-800">
                  <Icon name="trash" size={16} />
                </button>
              </li>
            ))}
          </ol>
          <Button variant="secondary" size="sm" icon="plus" onClick={add}>
            Add a box
          </Button>
          {people.length > 0 && (
            <div className="overflow-x-auto rounded-xl bg-psu-50/50 p-4 ring-1 ring-inset ring-(--role-hairline)">
              <OrgChartDrawing people={people} />
            </div>
          )}
        </>
      ) : photos.length ? (
        <div>
          <p className="mb-2 text-[13px] text-slate-600">Pick the photo of the agency's chart from your album.</p>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
            {photos.slice(0, 30).map((photo) => (
              <AlbumThumb key={photo.id} photo={photo} on={data.photoId === photo.id} onPick={() => update({ photoId: data.photoId === photo.id ? null : photo.id })} />
            ))}
          </div>
        </div>
      ) : (
        <p className="rounded-xl bg-slate-100 px-3 py-2.5 text-[13.5px] text-slate-700">
          No photos yet. Take a photo of the chart as an event in today's daily report (Reports, Daily), then pick it here.
        </p>
      )}
      <Field label="A note under the chart (optional)">
        <textarea rows={2} value={data.note} onChange={(event) => update({ note: event.target.value })} placeholder="e.g. where your department sits, who you reported to" className="field resize-y" />
      </Field>
    </div>
  );
}
