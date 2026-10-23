import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import Icon from "../../components/Icon";
import MarkPicker from "../../components/MarkPicker";
import { markChoices } from "../../brand/psuMarks";
import {
  Button,
  Card,
  CardHeader,
  EmptyState,
  ErrorNotice,
  FormError,
  FormField,
  Modal,
  RowMenu,
  SkeletonRows,
  StatusBadge,
  type RowMenuItem,
} from "../../components/ui";
import CoordinatorLayout from "../../layouts/CoordinatorLayout";
import { errorText, toast } from "../../lib/toast";
import { coordinatorRequest } from "./request";
import BlockScheduleDialog from "./BlockScheduleDialog";
import { refreshFilterOptions } from "./useStudentFilters";
import { sameId } from "../../lib/ids";

/*
|--------------------------------------------------------------------------
| PROGRAMS
|--------------------------------------------------------------------------
|
| The colleges of the campus, the programs of each college, the majors of
| each program, and the blocks (sections) students are placed in. Students
| are filtered and counted by these everywhere else in the portal.
|
| Nothing here is ever deleted. A row that is no longer wanted is made
| inactive: it leaves the pickers and filters, and every student linked to
| it stays linked.
|
*/

/** `mark_key` and `org_name` (migration 071): the mark from the PSU set and, for programs and majors, the organisation it belongs to. */
type College = { id: number; name: string; short_name: string | null; mark_key?: string | null; is_active: boolean };
type Program = {
  id: number;
  college_id: number;
  name: string;
  short_code: string;
  /** Printed on the Time Record; null prints the name. */
  formal_name?: string | null;
  mark_key?: string | null;
  org_name?: string | null;
  ojt_applies: boolean;
  is_active: boolean;
  students: number;
};
type Major = { id: number; program_id: number; name: string; mark_key?: string | null; org_name?: string | null; is_active: boolean };
type Block = {
  id: number;
  program_id: number;
  major_id: number | null;
  year_level: number;
  section: string;
  term_id: number | null;
  is_active: boolean;
  name: string;
  term_name: string | null;
  term_closed: boolean;
  students: number;
};
type Term = { id: number; name: string; is_closed: boolean };

type Academics = {
  colleges: College[];
  programs: Program[];
  majors: Major[];
  blocks: Block[];
  active_students_without_block: number;
  active_students_without_program: number;
};

/** What is being added or changed in the dialog. */
type Editing =
  | { kind: "college"; row?: College }
  | { kind: "program"; row?: Program; collegeId?: number }
  | { kind: "major"; row?: Major; programId: number }
  | { kind: "block"; row?: Block; programId?: number };

const plural = (count: number, one: string, many = `${one}s`) => `${count} ${count === 1 ? one : many}`;

export default function CoordinatorPrograms() {
  const [data, setData] = useState<Academics | null>(null);
  const [terms, setTerms] = useState<Term[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<Editing | null>(null);
  const [roster, setRoster] = useState<Block | null>(null);
  // The block being given one schedule for all its students.
  const [scheduling, setScheduling] = useState<Block | null>(null);
  // Which term's blocks are listed: "" for all, "none" for blocks of no term.
  const [blockTerm, setBlockTerm] = useState("");
  const [blockProgram, setBlockProgram] = useState("");

  const load = useCallback(async () => {
    try {
      const [academics, termList] = await Promise.all([
        coordinatorRequest<Academics>("/api/coordinator/academics"),
        coordinatorRequest<{ terms: Term[] }>("/api/coordinator/terms").catch(() => ({ terms: [] })),
      ]);
      setData(academics);
      setTerms(termList.terms || []);
      setError("");
    } catch (loadError) {
      setError(errorText(loadError, "Could not load the programs."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  /** Saves one change, says what happened, and shows the result. */
  const save = async (method: "POST" | "PUT", path: string, body: unknown, fallback: string) => {
    try {
      const result = await coordinatorRequest<{ message?: string }>(path, { method, body });
      toast.success(result.message || "Saved.");
      // The filter bar on the other pages reads the same lists.
      refreshFilterOptions();
      await load();
      return true;
    } catch (saveError) {
      toast.error(errorText(saveError, fallback));
      return false;
    }
  };
  const setActive = (kind: "colleges" | "programs" | "majors" | "blocks", id: number, active: boolean) =>
    void save("PUT", `/api/coordinator/${kind}/${id}`, { is_active: active }, "That could not be changed.");

  const programsOf = (collegeId: number) => (data?.programs ?? []).filter((item) => item.college_id === collegeId);
  const majorsOf = (programId: number) => (data?.majors ?? []).filter((item) => item.program_id === programId);
  const programById = useMemo(() => new Map((data?.programs ?? []).map((item) => [item.id, item])), [data]);
  const majorById = useMemo(() => new Map((data?.majors ?? []).map((item) => [item.id, item])), [data]);

  const blocks = (data?.blocks ?? []).filter(
    (block) =>
      (!blockProgram || sameId(block.program_id, blockProgram)) &&
      (!blockTerm || (blockTerm === "none" ? block.term_id === null : sameId(block.term_id, blockTerm)))
  );

  const collegeMenu = (college: College): RowMenuItem[] => [
    { label: "Add a program", icon: "plus", onSelect: () => setEditing({ kind: "program", collegeId: college.id }) },
    { label: "Rename", icon: "edit", onSelect: () => setEditing({ kind: "college", row: college }) },
    college.is_active
      ? { label: "Make inactive", icon: "lock", tone: "danger", onSelect: () => setActive("colleges", college.id, false) }
      : { label: "Make active", icon: "refresh", tone: "good", onSelect: () => setActive("colleges", college.id, true) },
  ];
  const programMenu = (program: Program): RowMenuItem[] => [
    { label: "Add a major", icon: "plus", onSelect: () => setEditing({ kind: "major", programId: program.id }) },
    { label: "Add a block", icon: "plus", onSelect: () => setEditing({ kind: "block", programId: program.id }) },
    { label: "Edit", icon: "edit", onSelect: () => setEditing({ kind: "program", row: program }) },
    program.is_active
      ? { label: "Make inactive", icon: "lock", tone: "danger", onSelect: () => setActive("programs", program.id, false) }
      : { label: "Make active", icon: "refresh", tone: "good", onSelect: () => setActive("programs", program.id, true) },
  ];
  const majorMenu = (major: Major): RowMenuItem[] => [
    { label: "Rename", icon: "edit", onSelect: () => setEditing({ kind: "major", row: major, programId: major.program_id }) },
    major.is_active
      ? { label: "Make inactive", icon: "lock", tone: "danger", onSelect: () => setActive("majors", major.id, false) }
      : { label: "Make active", icon: "refresh", tone: "good", onSelect: () => setActive("majors", major.id, true) },
  ];
  const blockMenu = (block: Block): RowMenuItem[] => [
    { label: "Students", icon: "users", onSelect: () => setRoster(block) },
    { label: "Set schedule", icon: "calendar", onSelect: () => setScheduling(block) },
    { label: "Edit", icon: "edit", onSelect: () => setEditing({ kind: "block", row: block }) },
    block.is_active
      ? { label: "Make inactive", icon: "lock", tone: "danger", onSelect: () => setActive("blocks", block.id, false) }
      : { label: "Make active", icon: "refresh", tone: "good", onSelect: () => setActive("blocks", block.id, true) },
  ];

  return (
    <CoordinatorLayout
      title="Programs"
      subtitle="Colleges, their programs and majors, and the blocks students are placed in."
      actions={
        <>
          <Button variant="secondary" icon="plus" onClick={() => setEditing({ kind: "college" })}>
            Add college
          </Button>
          <Button icon="plus" onClick={() => setEditing({ kind: "block" })} disabled={!data || data.programs.length === 0}>
            Add block
          </Button>
        </>
      }
    >
      <div className="space-y-6">
        {error && <ErrorNotice message={error} onRetry={() => void load()} />}

        {!loading && data && (data.active_students_without_program > 0 || data.active_students_without_block > 0) && (
          <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-3 text-sm text-amber-900">
            <Icon name="info" size={16} className="mt-0.5 shrink-0" />
            <p>
              {data.active_students_without_block > 0 && (
                <>
                  {plural(data.active_students_without_block, "active student has", "active students have")} no
                  block.{" "}
                  <Link to="/coordinator/students?block=none" className="font-semibold underline">
                    See them
                  </Link>
                  , or use a block's "Students" to add them.{" "}
                </>
              )}
              {data.active_students_without_program > 0 && (
                <>
                  {plural(data.active_students_without_program, "is", "are")} not linked to a program: the
                  program typed on their account is not one listed here. Putting them in a block links
                  them.
                </>
              )}
            </p>
          </div>
        )}

        {/* COLLEGES, PROGRAMS, MAJORS */}
        <Card>
          <CardHeader icon="cap"
            title="Colleges and programs"
            description="OJT applies: whether the program has OJT in its curriculum. Switch it off to keep a program out of the pickers on a student's form."
          />
          <div className="mt-3">
            {loading ? (
              <SkeletonRows rows={5} />
            ) : !data || data.colleges.length === 0 ? (
              <EmptyState icon="building" title="No colleges yet" description="Add a college, then its programs." />
            ) : (
              <ul className="divide-y divide-slate-100 border-t border-slate-100">
                {data.colleges.map((college) => (
                  <li key={college.id} className="px-4 py-4 sm:px-5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="text-sm font-semibold text-slate-900">
                          {college.name}
                          {college.short_name && (
                            <span className="ml-2 font-normal text-slate-600">{college.short_name}</span>
                          )}
                        </h3>
                        <p className="text-xs text-slate-600">
                          {plural(programsOf(college.id).length, "program")}
                          {!college.is_active && " · inactive"}
                        </p>
                      </div>
                      <RowMenu label={`Actions for ${college.name}`} items={collegeMenu(college)} />
                    </div>

                    {programsOf(college.id).length > 0 && (
                      <ul className="mt-3 space-y-2">
                        {programsOf(college.id).map((program) => (
                          <li key={program.id} className="rounded-lg border border-slate-200 p-3">
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                              <span className="tabular rounded-md bg-psu-50 px-2 py-0.5 text-xs font-semibold text-psu-800 ring-1 ring-inset ring-psu-600/15">
                                {program.short_code}
                              </span>
                              <p className="min-w-0 flex-1 text-sm font-medium text-slate-900">{program.name}</p>
                              {!program.is_active && <StatusBadge status="Inactive" tone="neutral" />}
                              <span className="text-xs text-slate-600">{plural(program.students, "student")}</span>
                              <label className="flex items-center gap-1.5 text-xs font-medium text-slate-700">
                                <input
                                  type="checkbox"
                                  checked={program.ojt_applies}
                                  onChange={(event) =>
                                    void save(
                                      "PUT",
                                      `/api/coordinator/programs/${program.id}`,
                                      { ojt_applies: event.target.checked },
                                      "That could not be changed."
                                    )
                                  }
                                  className="h-4 w-4 rounded border-slate-400 text-psu-700"
                                />
                                OJT applies
                                <span className="sr-only"> to {program.name}</span>
                              </label>
                              <RowMenu label={`Actions for ${program.name}`} items={programMenu(program)} />
                            </div>
                            {majorsOf(program.id).length > 0 && (
                              <ul className="mt-2 flex flex-wrap gap-1.5 border-t border-slate-100 pt-2">
                                {majorsOf(program.id).map((major) => (
                                  <li
                                    key={major.id}
                                    className={`flex items-center gap-0.5 rounded-full py-0.5 pl-2.5 text-xs ring-1 ring-inset ${
                                      major.is_active
                                        ? "bg-white text-slate-700 ring-slate-300"
                                        : "bg-slate-100 text-slate-600 ring-slate-300"
                                    }`}
                                  >
                                    {major.name}
                                    {!major.is_active && " (inactive)"}
                                    <RowMenu label={`Actions for the major ${major.name}`} items={majorMenu(major)} />
                                  </li>
                                ))}
                              </ul>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Card>

        {/* BLOCKS */}
        <Card>
          <CardHeader icon="layers"
            title="Blocks"
            description={'A block is named from its program, year and section: "BSIT 4A". Closing a term makes its blocks inactive; reopening it brings them back.'}
          />
          <div className="mt-3 flex flex-wrap items-end gap-3 border-t border-slate-100 px-4 py-3 sm:px-5">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-slate-600">Term</span>
              <select value={blockTerm} onChange={(event) => setBlockTerm(event.target.value)} className="field w-auto">
                <option value="">All terms</option>
                {terms.map((term) => (
                  <option key={term.id} value={String(term.id)}>
                    {term.name}
                    {term.is_closed ? " (closed)" : ""}
                  </option>
                ))}
                <option value="none">No term</option>
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-slate-600">Program</span>
              <select value={blockProgram} onChange={(event) => setBlockProgram(event.target.value)} className="field w-auto max-w-[16rem]">
                <option value="">All programs</option>
                {(data?.programs ?? []).map((program) => (
                  <option key={program.id} value={String(program.id)}>
                    {program.short_code}: {program.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {loading ? (
            <SkeletonRows rows={3} />
          ) : blocks.length === 0 ? (
            <EmptyState
              icon="users"
              title={(data?.blocks.length ?? 0) === 0 ? "No blocks yet" : "No blocks match"}
              description={
                (data?.blocks.length ?? 0) === 0
                  ? 'Add a block for each section that goes on OJT this term, then use its "Students" to place them.'
                  : undefined
              }
            />
          ) : (
            <div className="relative overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="table-head border-y border-slate-100 text-xs text-slate-600">
                    <th scope="col" className="px-5 py-3 font-medium">Block</th>
                    <th scope="col" className="px-3 py-3 font-medium">Major</th>
                    <th scope="col" className="px-3 py-3 font-medium">Term</th>
                    <th scope="col" className="px-3 py-3 text-right font-medium">Students</th>
                    <th scope="col" className="px-3 py-3 font-medium">Status</th>
                    <th scope="col" className="px-5 py-3 font-medium">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {blocks.map((block) => (
                    <tr key={block.id} className="hover:bg-slate-50">
                      <th scope="row" className="whitespace-nowrap px-5 py-3 text-left font-semibold text-slate-900">
                        {block.name}
                        <span className="block text-xs font-normal text-slate-600">
                          {programById.get(block.program_id)?.name}
                        </span>
                      </th>
                      <td className="px-3 py-3 text-slate-700">
                        {block.major_id ? majorById.get(block.major_id)?.name : <span className="text-slate-600">Any</span>}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 text-slate-700">
                        {block.term_name ? `${block.term_name}${block.term_closed ? " (closed)" : ""}` : <span className="text-slate-600">None</span>}
                      </td>
                      <td className="tabular px-3 py-3 text-right text-slate-700">{block.students}</td>
                      <td className="px-3 py-3">
                        <StatusBadge status={block.is_active ? "Active" : "Inactive"} tone={block.is_active ? "good" : "neutral"} />
                      </td>
                      <td className="px-5 py-3 text-right">
                        <RowMenu label={`Actions for ${block.name}`} items={blockMenu(block)} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      {editing && data && (
        <EditDialog
          key={`${editing.kind}-${editing.row?.id ?? "new"}`}
          editing={editing}
          data={data}
          terms={terms}
          onClose={() => setEditing(null)}
          onSave={async (method, path, body) => {
            const saved = await save(method, path, body, "That could not be saved.");
            if (saved) setEditing(null);
            return saved;
          }}
        />
      )}

      {scheduling && (
        <BlockScheduleDialog
          key={scheduling.id}
          blockId={scheduling.id}
          blockName={scheduling.name}
          onClose={() => setScheduling(null)}
        />
      )}

      {roster && (
        <BlockStudents
          key={roster.id}
          block={roster}
          onClose={() => setRoster(null)}
          onChanged={() => {
            refreshFilterOptions();
            void load();
          }}
        />
      )}
    </CoordinatorLayout>
  );
}

/*
|--------------------------------------------------------------------------
| ADD OR EDIT: ONE DIALOG FOR ALL FOUR
|--------------------------------------------------------------------------
*/

function EditDialog({
  editing,
  data,
  terms,
  onClose,
  onSave,
}: {
  editing: Editing;
  data: Academics;
  terms: Term[];
  onClose: () => void;
  onSave: (method: "POST" | "PUT", path: string, body: unknown) => Promise<boolean>;
}) {
  const { kind } = editing;
  const row = editing.row;
  const [name, setName] = useState(row && "name" in row && kind !== "block" ? row.name : "");
  const [shortName, setShortName] = useState(kind === "college" ? editing.row?.short_name || "" : "");
  const [shortCode, setShortCode] = useState(kind === "program" ? editing.row?.short_code || "" : "");
  const [formalName, setFormalName] = useState(kind === "program" ? editing.row?.formal_name || "" : "");
  const [collegeId, setCollegeId] = useState(
    kind === "program" ? String(editing.row?.college_id ?? editing.collegeId ?? "") : ""
  );
  const [programId, setProgramId] = useState(
    kind === "block" ? String(editing.row?.program_id ?? editing.programId ?? "") : ""
  );
  const [majorId, setMajorId] = useState(kind === "block" ? String(editing.row?.major_id ?? "") : "");
  const [year, setYear] = useState(kind === "block" ? String(editing.row?.year_level ?? "4") : "4");
  const [section, setSection] = useState(kind === "block" ? editing.row?.section || "" : "");
  const [termId, setTermId] = useState(kind === "block" ? String(editing.row?.term_id ?? "") : "");
  // The mark from the PSU set, and the organisation's name (programs and majors).
  const [markKey, setMarkKey] = useState(kind !== "block" ? (editing.row as College | Program | Major | undefined)?.mark_key ?? "" : "");
  const [orgName, setOrgName] = useState(kind === "program" || kind === "major" ? (editing.row as Program | Major | undefined)?.org_name ?? "" : "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const what = { college: "college", program: "program", major: "major", block: "block" }[kind];
  const program = data.programs.find((item) => sameId(item.id, programId));
  const preview = program && section.trim() ? `${program.short_code} ${year}${section.trim().toUpperCase()}` : "";

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    let body: Record<string, unknown>;
    if (kind === "college") {
      if (name.trim().length < 2) return setError("Give the college a name.");
      body = { name: name.trim(), short_name: shortName.trim(), mark_key: markKey || null };
    } else if (kind === "program") {
      if (!collegeId) return setError("Choose the program's college.");
      if (name.trim().length < 2) return setError("Give the program a name.");
      if (shortCode.trim().length < 2 || /\s/.test(shortCode.trim())) {
        return setError("The short code is 2 to 20 characters with no spaces, such as BSIT.");
      }
      body = {
        college_id: Number(collegeId),
        name: name.trim(),
        short_code: shortCode.trim(),
        formal_name: formalName.trim() || null,
        mark_key: markKey || null,
        org_name: orgName.trim() || null,
      };
    } else if (kind === "major") {
      if (name.trim().length < 2) return setError("Give the major a name.");
      const marks = { mark_key: markKey || null, org_name: orgName.trim() || null };
      body = row ? { name: name.trim(), ...marks } : { program_id: editing.programId, name: name.trim(), ...marks };
    } else {
      if (!programId) return setError("Choose the block's program.");
      if (!section.trim()) return setError("Give the block a section, such as A.");
      body = {
        ...(row ? {} : { program_id: Number(programId) }),
        major_id: majorId ? Number(majorId) : null,
        year_level: Number(year),
        section: section.trim(),
        term_id: termId ? Number(termId) : null,
      };
    }
    setSaving(true);
    const path = `/api/coordinator/${kind}s${row ? `/${row.id}` : ""}`;
    const saved = await onSave(row ? "PUT" : "POST", path, body);
    if (!saved) setSaving(false);
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={`${row ? "Edit" : "Add a"} ${what}`}
      locked={saving}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" form="academic-form" busy={saving} failed={Boolean(error)}>
            {saving ? "Saving" : "Save"}
          </Button>
        </>
      }
    >
      <form id="academic-form" onSubmit={submit} className="space-y-4" noValidate>
        {kind === "program" && (
          <FormField label="College" htmlFor="academic-college">
            <select id="academic-college" value={collegeId} onChange={(event) => setCollegeId(event.target.value)} className="field">
              <option value="">Choose a college</option>
              {data.colleges.map((college) => (
                <option key={college.id} value={String(college.id)}>
                  {college.name}
                </option>
              ))}
            </select>
          </FormField>
        )}

        {kind !== "block" && (
          <FormField label="Name" htmlFor="academic-name">
            <input
              id="academic-name"
              type="text"
              maxLength={150}
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="field"
            />
          </FormField>
        )}

        {kind === "college" && (
          <FormField label="Short name" htmlFor="academic-short-name" optional hint="For example, CCS.">
            <input
              id="academic-short-name"
              type="text"
              maxLength={20}
              value={shortName}
              onChange={(event) => setShortName(event.target.value)}
              className="field"
            />
          </FormField>
        )}

        {kind === "program" && (
          <FormField
            label="Short code"
            htmlFor="academic-short-code"
            hint='What a block of this program is named with, as in "BSIT 4A". No spaces.'
          >
            <input
              id="academic-short-code"
              type="text"
              maxLength={20}
              value={shortCode}
              onChange={(event) => setShortCode(event.target.value)}
              className="field"
            />
          </FormField>
        )}

        {kind === "program" && (
          <FormField
            label="Formal name"
            htmlFor="academic-formal-name"
            optional
            hint="Printed on the Time Record, as in Bachelor of Science in Information Technology."
          >
            <input
              id="academic-formal-name"
              type="text"
              maxLength={200}
              value={formalName}
              onChange={(event) => setFormalName(event.target.value)}
              className="field"
            />
          </FormField>
        )}

        {(kind === "program" || kind === "major") && (
          <FormField label="Student organisation" htmlFor="academic-org-name" optional hint="Its name is shown beside its mark.">
            <input
              id="academic-org-name"
              type="text"
              maxLength={200}
              value={orgName}
              onChange={(event) => setOrgName(event.target.value)}
              className="field"
            />
          </FormField>
        )}

        {kind !== "block" && (
          <MarkPicker
            name={`academic-mark-${kind}`}
            label={kind === "college" ? "College seal" : "Mark"}
            choices={markChoices(kind === "college" ? "college" : "org")}
            value={markKey}
            onChange={setMarkKey}
            noneCode={kind === "college" ? shortName : kind === "program" ? shortCode : name}
          />
        )}

        {kind === "block" && (
          <>
            <FormField label="Program" htmlFor="academic-program" hint={row ? "A block stays in its program." : undefined}>
              <select
                id="academic-program"
                value={programId}
                disabled={Boolean(row)}
                onChange={(event) => {
                  setProgramId(event.target.value);
                  setMajorId("");
                }}
                className="field"
              >
                <option value="">Choose a program</option>
                {data.programs
                  .filter((item) => item.is_active || sameId(item.id, programId))
                  .map((item) => (
                    <option key={item.id} value={String(item.id)}>
                      {item.short_code}: {item.name}
                    </option>
                  ))}
              </select>
            </FormField>
            {data.majors.some((major) => sameId(major.program_id, programId)) && (
              <FormField
                label="Major"
                htmlFor="academic-major"
                optional
                hint="Leave empty for a block that mixes majors. Students put in a block of one major are given that major."
              >
                <select id="academic-major" value={majorId} onChange={(event) => setMajorId(event.target.value)} className="field">
                  <option value="">Any major</option>
                  {data.majors
                    .filter((major) => sameId(major.program_id, programId) && (major.is_active || sameId(major.id, majorId)))
                    .map((major) => (
                      <option key={major.id} value={String(major.id)}>
                        {major.name}
                      </option>
                    ))}
                </select>
              </FormField>
            )}
            <div className="grid grid-cols-2 gap-4">
              <FormField label="Year level" htmlFor="academic-year">
                <select id="academic-year" value={year} onChange={(event) => setYear(event.target.value)} className="field">
                  {[1, 2, 3, 4, 5, 6].map((level) => (
                    <option key={level} value={String(level)}>
                      {level}
                    </option>
                  ))}
                </select>
              </FormField>
              <FormField label="Section" htmlFor="academic-section">
                <input
                  id="academic-section"
                  type="text"
                  maxLength={10}
                  value={section}
                  onChange={(event) => setSection(event.target.value)}
                  placeholder="A"
                  className="field"
                />
              </FormField>
            </div>
            <FormField label="Term" htmlFor="academic-term" optional hint="A block of a term closes and reopens with it.">
              <select id="academic-term" value={termId} onChange={(event) => setTermId(event.target.value)} className="field">
                <option value="">No term</option>
                {terms
                  .filter((term) => !term.is_closed || sameId(term.id, termId))
                  .map((term) => (
                    <option key={term.id} value={String(term.id)}>
                      {term.name}
                      {term.is_closed ? " (closed)" : ""}
                    </option>
                  ))}
              </select>
            </FormField>
            {preview && (
              <p className="rounded-lg bg-psu-50 px-3 py-2.5 text-sm text-psu-900">
                This block will be named <span className="font-semibold">{preview}</span>.
              </p>
            )}
          </>
        )}

        <FormError message={error} />
      </form>
    </Modal>
  );
}

/*
|--------------------------------------------------------------------------
| A BLOCK'S STUDENTS
|--------------------------------------------------------------------------
*/

type Member = { student_id: string; name: string; program: string | null; is_active: boolean };
type Candidate = { student_id: string; name: string; program: string | null; unlinked: boolean };

function BlockStudents({ block, onClose, onChanged }: { block: Block; onClose: () => void; onChanged: () => void }) {
  const [members, setMembers] = useState<Member[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const data = await coordinatorRequest<{ students: Member[]; candidates: Candidate[] }>(
        `/api/coordinator/blocks/${block.id}/students`
      );
      setMembers(data.students || []);
      setCandidates(data.candidates || []);
      setChosen(new Set());
      setError("");
    } catch (loadError) {
      setError(errorText(loadError, "Could not load the block's students."));
    } finally {
      setLoading(false);
    }
  }, [block.id]);

  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  const add = async () => {
    setSaving(true);
    try {
      const result = await coordinatorRequest<{ message?: string }>(`/api/coordinator/blocks/${block.id}/students`, {
        method: "POST",
        body: { student_ids: [...chosen] },
      });
      toast.success(result.message || "Students added.");
      onChanged();
      await load();
    } catch (addError) {
      setError(errorText(addError, "The students could not be added."));
    } finally {
      setSaving(false);
    }
  };

  const toggle = (id: string) =>
    setChosen((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <Modal
      open
      onClose={onClose}
      title={`${block.name}: students`}
      description={block.is_active ? undefined : "This block is inactive. Make it active to add students."}
      size="lg"
      locked={saving}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Close
          </Button>
          <Button onClick={() => void add()} busy={saving} disabled={chosen.size === 0 || !block.is_active}>
            {chosen.size === 0 ? "Add students" : `Add ${plural(chosen.size, "student")}`}
          </Button>
        </>
      }
    >
      {loading ? (
        <SkeletonRows rows={4} />
      ) : (
        <div className="space-y-5">
          <FormError message={error} />
          <section aria-labelledby="block-members">
            <h3 id="block-members" className="text-sm font-semibold text-slate-900">
              In this block ({members.length})
            </h3>
            {members.length === 0 ? (
              <p className="mt-1 text-sm text-slate-600">Nobody yet.</p>
            ) : (
              <ul className="mt-2 divide-y divide-slate-100 rounded-lg border border-slate-200">
                {members.map((member) => (
                  <li key={member.student_id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                    <Link
                      to={`/coordinator/students/${encodeURIComponent(member.student_id)}`}
                      className="min-w-0 truncate font-medium text-psu-700 hover:underline"
                    >
                      {member.name}
                    </Link>
                    <span className="shrink-0 text-xs text-slate-600">
                      {member.student_id}
                      {!member.is_active && " · deactivated"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section aria-labelledby="block-candidates">
            <h3 id="block-candidates" className="text-sm font-semibold text-slate-900">
              Students with no block ({candidates.length})
            </h3>
            <p className="mt-0.5 text-xs text-slate-600">
              Active students of this program, and students not yet linked to any program. A student of
              another program is moved by changing their program on their own form.
            </p>
            {candidates.length === 0 ? (
              <p className="mt-2 text-sm text-slate-600">Every student who could be added is already in a block.</p>
            ) : (
              <ul className="mt-2 max-h-64 divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200">
                {candidates.map((candidate) => (
                  <li key={candidate.student_id}>
                    <label className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm hover:bg-slate-50">
                      <input
                        type="checkbox"
                        checked={chosen.has(candidate.student_id)}
                        disabled={!block.is_active}
                        onChange={() => toggle(candidate.student_id)}
                        className="h-4 w-4 rounded border-slate-400 text-psu-700"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium text-slate-900">{candidate.name}</span>
                        <span className="block truncate text-xs text-slate-600">
                          {candidate.student_id}
                          {candidate.unlinked &&
                            ` · program as typed: ${candidate.program || "none"} (adding links them to this block's program)`}
                        </span>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </Modal>
  );
}
