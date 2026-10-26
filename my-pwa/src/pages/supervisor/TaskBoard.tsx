import { Link } from "react-router-dom";
import Icon, { type IconName } from "../../components/Icon";
import { Avatar, Stars } from "../../components/ui";
import { daysUntil, dueLabel, formatDate } from "../../lib/format";
import { internPath } from "./internPath";
import type { TaskEntry } from "./useSupervisorWork";

/*
|--------------------------------------------------------------------------
| TASKS AS A BOARD (sv10-26)
|--------------------------------------------------------------------------
|
| The same tasks as the list, laid out by where each stands: with the
| intern (not started, or overdue), sent back for changes, handed in and
| waiting for review, and reviewed. A card waiting for review opens the
| review; any other opens that intern's tasks. Team tasks show as each
| member's own card, marked with the team.
|
*/

type Column = { key: string; title: string; icon: IconName; tone: string; test: (task: TaskEntry) => boolean; limit?: number };

const COLUMNS: Column[] = [
  { key: "with", title: "With intern", icon: "hourglass", tone: "board-col--with", test: (task) => task.status === "Pending" },
  { key: "back", title: "Sent back", icon: "refresh", tone: "board-col--back", test: (task) => task.status === "In Progress" },
  { key: "review", title: "To review", icon: "inbox", tone: "board-col--review", test: (task) => task.status === "Submitted" },
  { key: "done", title: "Reviewed", icon: "check-circle", tone: "board-col--done", test: (task) => task.status === "Reviewed", limit: 8 },
];

const PRIORITY: Record<string, string> = { High: "bg-red-500", Medium: "bg-amber-400", Low: "bg-slate-300" };

export default function TaskBoard({ tasks, onReview, onShowReviewed }: { tasks: TaskEntry[]; onReview: (id: number) => void; onShowReviewed: () => void }) {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4" role="list" aria-label="Tasks by where they stand">
      {COLUMNS.map((column) => {
        const all = tasks.filter(column.test).sort((a, b) => String(a.due_date).localeCompare(String(b.due_date)) * (column.key === "done" ? -1 : 1));
        const shown = column.limit ? all.slice(0, column.limit) : all;
        return (
          <section key={column.key} role="listitem" aria-label={`${column.title}, ${all.length}`} className={`board-col ${column.tone}`}>
            <header className="flex items-center gap-2 px-3 pb-2 pt-3">
              <span className="board-col-icon">
                <Icon name={column.icon} size={15} />
              </span>
              <h2 className="text-[14px] font-bold text-slate-900">{column.title}</h2>
              <span className="tabular ml-auto rounded-full bg-white px-2 text-[12px] font-bold text-slate-700 ring-1 ring-inset ring-slate-200">{all.length}</span>
            </header>
            <ul className="space-y-2 px-2 pb-2">
              {shown.length === 0 && <li className="rounded-xl border border-dashed border-slate-300 px-3 py-5 text-center text-[13px] text-slate-500">Nothing here</li>}
              {shown.map((task, index) => {
                const days = daysUntil(task.due_date);
                const late = (task.status === "Pending" || task.status === "In Progress") && !task.scheduled && days !== null && days < 0;
                const body = (
                  <>
                    <span className="flex items-start gap-2">
                      {task.priority && <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${PRIORITY[task.priority] ?? "bg-slate-300"}`} title={`${task.priority} priority`} />}
                      <span className="line-clamp-2 text-[14px] font-semibold leading-snug text-slate-900">{task.title}</span>
                    </span>
                    <span className="mt-2 flex items-center gap-2">
                      <Avatar name={task.student_name} size="sm" />
                      <span className="min-w-0 truncate text-[12.5px] text-slate-600">{task.student_name}</span>
                    </span>
                    <span className="mt-2 flex flex-wrap items-center gap-1.5 text-[12px]">
                      {task.group_task_id && (
                        <span className="inline-flex items-center gap-1 rounded-md bg-psu-50 px-1.5 py-0.5 font-semibold text-psu-800">
                          <Icon name="users" size={11} />
                          {task.team_name || "Team"}
                        </span>
                      )}
                      {task.scheduled ? (
                        <span className="rounded-md bg-slate-100 px-1.5 py-0.5 font-semibold text-slate-700">Scheduled</span>
                      ) : late ? (
                        <span className="rounded-md bg-red-50 px-1.5 py-0.5 font-bold text-red-700">Overdue · {formatDate(task.due_date)}</span>
                      ) : column.key === "done" ? (
                        task.review_rating ? <Stars value={Number(task.review_rating)} size={12} /> : <span className="text-slate-500">Due {formatDate(task.due_date)}</span>
                      ) : (
                        <span className="text-slate-600">{column.key === "review" ? `Due ${formatDate(task.due_date)}` : dueLabel(task.due_date)}</span>
                      )}
                      {task.attachment_file && <Icon name="document" size={12} className="text-slate-400" aria-label="Has a brief attached" />}
                    </span>
                  </>
                );
                return (
                  <li key={task.id} className="board-card" style={{ ["--i" as string]: index }}>
                    {task.status === "Submitted" ? (
                      <button type="button" onClick={() => onReview(task.id)} className="board-card-inner board-card-inner--action">
                        {body}
                        <span className="mt-2.5 inline-flex min-h-9 w-full items-center justify-center rounded-lg bg-psu-600 text-[13px] font-bold text-white">Review</span>
                      </button>
                    ) : (
                      <Link to={internPath(task.student_id, "tasks")} className="board-card-inner">
                        {body}
                      </Link>
                    )}
                  </li>
                );
              })}
            </ul>
            {column.limit && all.length > column.limit && (
              <button type="button" onClick={onShowReviewed} className="mx-2 mb-2 inline-flex min-h-10 w-[calc(100%-1rem)] items-center justify-center rounded-lg text-[13px] font-bold text-psu-700 hover:bg-white">
                All {all.length} reviewed in the list
              </button>
            )}
          </section>
        );
      })}
    </div>
  );
}
