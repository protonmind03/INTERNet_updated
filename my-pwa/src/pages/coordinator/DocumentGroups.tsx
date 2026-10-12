import { ProgressBar, StatusBadge } from "../../components/ui";

/*
| Requirement progress by group: College, then Program, then Block, then
| the students, each level with how much of what its students owe has been
| approved. A student not linked to a program is under the program text on
| their account; one with no block is under "No block". Every student is
| in the tree once. The files themselves are not arranged this way in
| storage: this is only how the page reads.
*/

export type GroupedStudent = {
  student_id: string;
  name: string;
  program: string | null;
  college?: string | null;
  program_name?: string | null;
  block?: string | null;
  approved: number;
  missing: string[];
};

type Node = { name: string; students: GroupedStudent[]; children: Node[] };

function tree(students: GroupedStudent[]): Node[] {
  const levels: ((student: GroupedStudent) => string)[] = [
    (student) => student.college || "No college",
    (student) => student.program_name || (student.program || "").trim() || "No program",
    (student) => student.block || "No block",
  ];
  const build = (rows: GroupedStudent[], depth: number): Node[] => {
    if (depth === levels.length) return [];
    const groups = new Map<string, GroupedStudent[]>();
    for (const row of rows) {
      const name = levels[depth](row);
      groups.set(name, [...(groups.get(name) ?? []), row]);
    }
    return [...groups.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([name, members]) => ({ name, students: members, children: build(members, depth + 1) }));
  };
  return build(students, 0);
}

const LEVEL_WORD = ["College", "Program", "Block"];

function Summary({ node, total, level }: { node: Node; total: number; level: number }) {
  const owed = node.students.length * total;
  const approved = node.students.reduce((sum, student) => sum + Math.min(total, student.approved), 0);
  const complete = node.students.filter((student) => student.missing.length === 0).length;
  const percent = owed > 0 ? Math.round((approved / owed) * 100) : 0;
  return (
    <summary className="flex cursor-pointer flex-wrap items-center gap-x-4 gap-y-1.5 px-4 py-3 hover:bg-slate-50 sm:px-5">
      <span className="min-w-0 flex-1">
        <span className="block text-xs text-slate-600">{LEVEL_WORD[level]}</span>
        <span className="block break-words text-sm font-semibold text-slate-900">{node.name}</span>
      </span>
      <span className="flex w-full items-center gap-3 sm:w-64">
        <ProgressBar value={percent} label={`${node.name}: ${percent} percent of requirements approved`} />
        <span className="tabular shrink-0 text-sm text-slate-700">{percent}%</span>
      </span>
      <span className="tabular w-full text-sm text-slate-600 sm:w-48 sm:text-right">
        {complete} of {node.students.length} {node.students.length === 1 ? "student" : "students"} complete
      </span>
    </summary>
  );
}

function Branch({ node, total, level }: { node: Node; total: number; level: number }) {
  return (
    <details className={level === 0 ? "border-b border-slate-100 last:border-b-0" : "border-t border-slate-100"} open={level === 0}>
      <Summary node={node} total={total} level={level} />
      <div className={level < 2 ? "ml-3 border-l-2 border-slate-200 sm:ml-5" : ""}>
        {node.children.length > 0 ? (
          node.children.map((child) => <Branch key={child.name} node={child} total={total} level={level + 1} />)
        ) : (
          <ul className="divide-y divide-slate-100 border-t border-slate-100">
            {node.students.map((student) => (
              <li key={student.student_id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2.5 pl-6 pr-4 text-sm sm:pl-8 sm:pr-5">
                <span className="min-w-0 font-medium text-slate-900">{student.name}</span>
                <span className="flex items-center gap-3">
                  <span className="tabular text-slate-700">
                    {student.approved}/{total}
                  </span>
                  {student.missing.length === 0 ? (
                    <StatusBadge status="Complete" tone="good" />
                  ) : (
                    <span className="text-slate-600">Needs {student.missing.join(", ")}</span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </details>
  );
}

export default function DocumentGroups({ students, total }: { students: GroupedStudent[]; total: number }) {
  return (
    <div>
      {tree(students).map((node) => (
        <Branch key={node.name} node={node} total={total} level={0} />
      ))}
    </div>
  );
}
