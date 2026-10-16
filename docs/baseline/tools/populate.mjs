// Iteration 0 baseline: the records added to a freshly seeded LOCAL database before the sweeps,
// so lists show rows instead of only empty states. The same script is used for the "after"
// sweep in iteration 17, so both measure the same thing.
//
// Run against a local API only:  API=http://127.0.0.1:5002 node populate.mjs
// It refuses any address that is not this computer.
const API = (process.env.API || "http://127.0.0.1:5002").replace(/\/+$/, "");
if (!/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(API)) throw new Error("populate.mjs runs only against a local API.");

const call = async (method, path, token, body, form) => {
  const response = await fetch(API + path, {
    method,
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { "Content-Type": "application/json" } : {}) },
    body: form ?? (body ? JSON.stringify(body) : undefined),
  });
  return { status: response.status, body: await response.json().catch(() => ({})) };
};
const login = async (role, email, password) => (await call("POST", `/api/login/${role}`, null, { email, password })).body;

const student = await login("student", "student.demo@internet.test", "StudentDemo123!");
const second = await login("student", "student2.demo@internet.test", "StudentDemo123!");
const supervisor = await login("supervisor", "supervisor.demo@internet.test", "SupervisorDemo123!");
const coordinator = await login("coordinator", "coordinator@internet.psu.edu.ph", "Coordinator123!");
const day = (offset) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);
const done = [];
const note = (what, answer) => done.push(`${what}: ${answer.status}`);

// Tasks for both interns.
for (const [who, title] of [[student, "Encode the week's delivery receipts"], [second, "Label the supply cabinet shelves"]]) {
  note(`task for ${who.student.student_id}`, await call("POST", "/api/tasks", supervisor.token, { student_id: who.student.student_id, title, description: "Use the template on the shared drive.", priority: "Medium", due_date: day(4) }));
}
// The second intern's day, recorded offline and closed, so the supervisor has a log to review.
// The first intern is left with no log today, so Time in is offered on their pages.
const started = await call("POST", "/api/attendance/offline-time-in", second.token, { occurred_at: new Date(Date.now() - 3 * 3_600_000).toISOString(), client_request_id: `baseline-${Date.now()}` });
note("offline time-in (second intern)", started);
if (started.body.attendance?.id) {
  note("time-out (second intern)", await call("PUT", `/api/attendance/${started.body.attendance.id}/time-out`, second.token, { accomplishments: "Labelled the cabinet and filed the receipts." }));
}
// A weekly report, an absence notice, a concern and a document from the first intern.
const journals = await call("GET", `/api/journals/student/${student.student.student_id}`, student.token);
note("weekly report", await call("PUT", `/api/journals/student/${student.student.student_id}/${journals.body.current_week_start}`, student.token, {
  activities: "Encoded delivery receipts and checked them against the ledger for the accounting desk.",
  learnings: "How receipts are numbered here, and how to trace one in the ledger.",
}));
note("absence notice", await call("POST", "/api/absences", student.token, { date: day(2), reason: "Medical check-up in the morning." }));
const concern = new FormData();
for (const [key, value] of Object.entries({ student_id: student.student.student_id, report_type: "supervisor", supervisor_name: "Demo Supervisor", company_name: "INTERNet Demo Company", category: "Workplace safety", description: "The storeroom door does not lock, and files are kept inside overnight." })) concern.append(key, value);
note("concern", await call("POST", "/api/complaints", student.token, null, concern));
const requirements = await call("GET", "/api/ojt-requirements", student.token);
const list = Array.isArray(requirements.body) ? requirements.body : requirements.body.requirements || [];
const firstRequirement = list.find((item) => item.is_active !== false && item.due_rule !== "weekly");
if (firstRequirement) {
  const form = new FormData();
  form.append("doc_type", firstRequirement.name);
  form.append("file", new Blob([Buffer.from("%PDF-1.4\n%%EOF\n")], { type: "application/pdf" }), "endorsement.pdf");
  note(`document (${firstRequirement.name})`, await call("POST", "/api/documents", student.token, null, form));
}
console.log(done.join("\n"));
