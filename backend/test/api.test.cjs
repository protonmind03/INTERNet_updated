const assert = require("node:assert/strict");
const { before, test } = require("node:test");

// The API under test: API_BASE_URL if given, otherwise this machine on the
// port in backend/.env (5000 when that sets none).
require("dotenv").config({
  path: require("node:path").join(__dirname, "..", ".env"),
  quiet: true,
});
const apiBaseUrl = new URL(
  process.env.API_BASE_URL || `http://127.0.0.1:${process.env.PORT || 5000}`
);
const allowedLocalHosts = new Set(["localhost", "127.0.0.1", "::1"]);

if (
  !allowedLocalHosts.has(apiBaseUrl.hostname) &&
  process.env.ALLOW_NONLOCAL_API_TESTS !== "true"
) {
  throw new Error(
    "API tests are restricted to localhost. Set ALLOW_NONLOCAL_API_TESTS=true only for an explicitly approved test server."
  );
}

const studentEmail =
  process.env.STUDENT_DEMO_EMAIL || "student.demo@internet.test";
const studentPassword =
  process.env.STUDENT_DEMO_PASSWORD || "StudentDemo123!";
const coordinatorEmail =
  process.env.COORDINATOR_DEMO_EMAIL ||
  "coordinator@internet.psu.edu.ph";
const coordinatorPassword =
  process.env.COORDINATOR_DEMO_PASSWORD || "Coordinator123!";

let student;
let studentToken;
let coordinator;
let coordinatorToken;

async function jsonRequest(path, options = {}) {
  const response = await fetch(new URL(path, apiBaseUrl), options);
  let body = {};
  const text = await response.text();

  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      throw new Error(
        `Expected JSON from ${path}; received HTTP ${response.status}.`
      );
    }
  }

  return { response, body };
}

// The smallest content the server accepts as each kind of file: uploads
// are checked by their first bytes, not only by their name.
const sampleFiles = {
  jpg: Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0xff, 0xd9]),
  png: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  pdf: Buffer.from("%PDF-1.4\n%%EOF\n"),
};

function authHeaders(token) {
  return { Authorization: ["Bearer", token].join(" ") };
}

async function login(role, email, password) {
  const { response, body } = await jsonRequest(`/api/login/${role}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });

  assert.equal(response.status, 200, `${role} demo login should succeed`);
  assert.equal(typeof body.token, "string", `${role} login should return a token`);
  return body;
}

before(async () => {
  const [studentLogin, coordinatorLogin] = await Promise.all([
    login("student", studentEmail, studentPassword),
    login("coordinator", coordinatorEmail, coordinatorPassword),
  ]);

  student = studentLogin.student;
  studentToken = studentLogin.token;
  coordinator = coordinatorLogin.coordinator;
  coordinatorToken = coordinatorLogin.token;
  assert.equal(typeof student.student_id, "string");
  assert.equal(typeof coordinator.coordinator_id, "string");
});

test("student login does not expose the stored password", () => {
  assert.equal(Object.hasOwn(student, "password"), false);
});

test("protected student APIs reject anonymous requests", async () => {
  const paths = [
    `/api/attendance/${encodeURIComponent(student.student_id)}`,
    `/api/notifications/student/${encodeURIComponent(student.student_id)}`,
  ];

  for (const path of paths) {
    const { response } = await jsonRequest(path);
    assert.equal(response.status, 401, `${path} should require a token`);
  }
});

test("live notification streams require a valid role token", async () => {
  const anonymous = await jsonRequest("/api/events");
  assert.equal(anonymous.response.status, 401);

  const response = await fetch(new URL("/api/events", apiBaseUrl), {
    headers: authHeaders(coordinatorToken),
  });
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") || "", /text\/event-stream/);
  const reader = response.body.getReader();
  const firstEvent = await reader.read();
  assert.match(
    new TextDecoder().decode(firstEvent.value),
    /event: connected/
  );
  await reader.cancel();
});

test("push subscriptions and password reset reject anonymous or invalid requests", async () => {
  const anonymousPush = await jsonRequest("/api/push/subscriptions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ subscription: {} }),
  });
  assert.equal(anonymousPush.response.status, 401);

  const invalidReset = await jsonRequest("/api/auth/password-reset/confirm", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: "invalid", password: "NewPassword123!" }),
  });
  assert.equal(invalidReset.response.status, 400);
});

test("optional delivery endpoints report unconfigured services explicitly", async () => {
  const pushKey = await jsonRequest("/api/push/vapid-public-key");
  assert.equal(pushKey.response.status, 503);

  const reset = await jsonRequest("/api/auth/password-reset/request", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      role: "student",
      email: "unknown.account@invalid.example",
    }),
  });
  assert.equal(reset.response.status, 503);
  assert.doesNotMatch(JSON.stringify(reset.body), /unknown\.account/i);
});

test("students cannot read another student's attendance or notifications", async () => {
  const foreignStudentId = `${student.student_id}-not-owned`;

  for (const route of [
    `/api/attendance/${encodeURIComponent(foreignStudentId)}`,
    `/api/notifications/student/${encodeURIComponent(foreignStudentId)}`,
  ]) {
    const { response } = await jsonRequest(route, {
      headers: { Authorization: `Bearer ${studentToken}` },
    });
    assert.equal(response.status, 403, `${route} should enforce ownership`);
  }
});

test("student can read their own attendance and complaint history", async () => {
  const headers = { Authorization: `Bearer ${studentToken}` };

  const attendance = await jsonRequest(
    `/api/attendance/${encodeURIComponent(student.student_id)}`,
    { headers }
  );
  assert.equal(attendance.response.status, 200);
  assert.ok(Array.isArray(attendance.body.attendance));

  const complaints = await jsonRequest(
    `/api/complaints/student/${encodeURIComponent(student.student_id)}`,
    { headers }
  );
  assert.equal(complaints.response.status, 200);
  assert.ok(Array.isArray(complaints.body.complaints));

  const foreignComplaints = await jsonRequest(
    `/api/complaints/student/${encodeURIComponent(`${student.student_id}-not-owned`)}`,
    { headers }
  );
  assert.equal(foreignComplaints.response.status, 403);
});

test("student task list is authenticated and limited to their own records", async () => {
  const ownPath = `/api/tasks/student/${encodeURIComponent(student.student_id)}`;
  const anonymous = await jsonRequest(ownPath);
  assert.equal(anonymous.response.status, 401);

  const ownTasks = await jsonRequest(ownPath, {
    headers: { Authorization: `Bearer ${studentToken}` },
  });
  assert.equal(ownTasks.response.status, 200);
  assert.ok(Array.isArray(ownTasks.body));

  const foreignTasks = await jsonRequest(
    `/api/tasks/student/${encodeURIComponent(`${student.student_id}-not-owned`)}`,
    { headers: { Authorization: `Bearer ${studentToken}` } }
  );
  assert.equal(foreignTasks.response.status, 403);
});

test("student can read their own evaluations", async () => {
  const ownPath = `/api/evaluations/student/${encodeURIComponent(student.student_id)}`;
  const anonymous = await jsonRequest(ownPath);
  assert.equal(anonymous.response.status, 401);

  const { response, body } = await jsonRequest(
    ownPath,
    { headers: { Authorization: `Bearer ${studentToken}` } }
  );

  assert.equal(response.status, 200);
  assert.ok(Array.isArray(body.evaluations));

  const foreign = await jsonRequest(
    `/api/evaluations/student/${encodeURIComponent(`${student.student_id}-not-owned`)}`,
    { headers: { Authorization: `Bearer ${studentToken}` } }
  );
  assert.equal(foreign.response.status, 403);
});

test("student evaluation submission rejects spoofed identities and invalid ratings", async () => {
  const headers = {
    Authorization: `Bearer ${studentToken}`,
    "Content-Type": "application/json",
  };

  const anonymous = await jsonRequest("/api/evaluations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      student_id: student.student_id,
      rating: 5,
    }),
  });
  assert.equal(anonymous.response.status, 401);

  const spoofedStudent = await jsonRequest("/api/evaluations", {
    method: "POST",
    headers,
    body: JSON.stringify({
      student_id: `${student.student_id}-not-owned`,
      rating: 5,
    }),
  });
  assert.equal(spoofedStudent.response.status, 403);

  const invalidRating = await jsonRequest("/api/evaluations", {
    method: "POST",
    headers,
    body: JSON.stringify({
      student_id: student.student_id,
      rating: 6,
    }),
  });
  assert.equal(invalidRating.response.status, 400);
});

test("coordinator complaint oversight requires a coordinator token", async () => {
  const anonymous = await jsonRequest("/api/coordinator/complaints");
  assert.equal(anonymous.response.status, 401);

  const studentAccess = await jsonRequest("/api/coordinator/complaints", {
    headers: { Authorization: `Bearer ${studentToken}` },
  });
  assert.equal(studentAccess.response.status, 403);

  const coordinatorAccess = await jsonRequest("/api/coordinator/complaints", {
    headers: { Authorization: `Bearer ${coordinatorToken}` },
  });
  assert.equal(coordinatorAccess.response.status, 200);
  assert.ok(Array.isArray(coordinatorAccess.body.complaints));
});

test("coordinator record search is role-protected and returns bounded safe results", async () => {
  const anonymous = await jsonRequest(
    `/api/coordinator/search?q=${encodeURIComponent(student.student_id)}`
  );
  assert.equal(anonymous.response.status, 401);

  const studentAccess = await jsonRequest(
    `/api/coordinator/search?q=${encodeURIComponent(student.student_id)}`,
    { headers: authHeaders(studentToken) }
  );
  assert.equal(studentAccess.response.status, 403);

  const shortQuery = await jsonRequest("/api/coordinator/search?q=a", {
    headers: authHeaders(coordinatorToken),
  });
  assert.equal(shortQuery.response.status, 200);
  assert.deepEqual(shortQuery.body.results, []);

  const longQuery = await jsonRequest(
    `/api/coordinator/search?q=${"x".repeat(101)}`,
    { headers: authHeaders(coordinatorToken) }
  );
  assert.equal(longQuery.response.status, 400);

  const matchingStudent = await jsonRequest(
    `/api/coordinator/search?q=${encodeURIComponent(student.student_id)}`,
    { headers: authHeaders(coordinatorToken) }
  );
  assert.equal(matchingStudent.response.status, 200);
  assert.ok(
    matchingStudent.body.results.some(
      (result) =>
        result.type === "student" &&
        result.detail.includes(student.student_id)
    )
  );
  assert.ok(
    matchingStudent.body.results.every(
      (result) => !Object.hasOwn(result, "password")
    )
  );

  const complaintSearch = await jsonRequest(
    `/api/coordinator/complaints?q=${encodeURIComponent(student.student_id)}`,
    { headers: authHeaders(coordinatorToken) }
  );
  assert.equal(complaintSearch.response.status, 200);
  assert.ok(Array.isArray(complaintSearch.body.complaints));
});

test("role-specific task and complaint actions reject the wrong role", async () => {
  const headers = {
    Authorization: `Bearer ${studentToken}`,
    "Content-Type": "application/json",
  };

  const supervisorTaskQueue = await jsonRequest(
    `/api/tasks/supervisor/${encodeURIComponent(`${student.student_id}-not-a-supervisor`)}`,
    { headers }
  );
  assert.equal(supervisorTaskQueue.response.status, 403);

  const assignTask = await jsonRequest("/api/tasks", {
    method: "POST",
    headers,
    body: JSON.stringify({
      student_id: student.student_id,
      title: "Must not be created",
      due_date: "2099-01-01",
    }),
  });
  assert.equal(assignTask.response.status, 403);

  const fileSupervisorComplaint = await jsonRequest(
    "/api/complaints/supervisor",
    {
      method: "POST",
      headers,
      body: JSON.stringify({ description: "Must not be created" }),
    }
  );
  assert.equal(fileSupervisorComplaint.response.status, 403);
});

test("uploaded files are not accessible through public static paths", async () => {
  const filename = `${Date.now()}-123456789.png`;
  const response = await fetch(new URL(`/uploads/${filename}`, apiBaseUrl));
  assert.equal(response.status, 404);
});

test("protected upload endpoint requires authentication and hides unknown files", async () => {
  const filename = `${Date.now()}-123456789.png`;
  const anonymous = await jsonRequest(`/api/uploads/${filename}`);
  assert.equal(anonymous.response.status, 401);

  const unknownFile = await jsonRequest(`/api/uploads/${filename}`, {
    headers: { Authorization: `Bearer ${studentToken}` },
  });
  assert.equal(unknownFile.response.status, 404);
});

test("attendance time-in requires a photo", async () => {
  const form = new FormData();
  form.set("student_id", student.student_id);

  const response = await fetch(new URL("/api/attendance", apiBaseUrl), {
    method: "POST",
    headers: { Authorization: `Bearer ${studentToken}` },
    body: form,
  });
  const body = await response.json();

  assert.equal(response.status, 400);
  assert.match(body.message, /photo is required/i);
});

test("coordinator analytics is protected and returns report sections", async () => {
  const anonymous = await jsonRequest("/api/coordinator/analytics");
  assert.equal(anonymous.response.status, 401);

  const { response, body } = await jsonRequest("/api/coordinator/analytics", {
    headers: { Authorization: `Bearer ${coordinatorToken}` },
  });
  assert.equal(response.status, 200);
  assert.ok(Array.isArray(body.studentsByCompany));
  assert.ok(Array.isArray(body.complaintsByCategory));
  assert.ok(Array.isArray(body.taskFunnel));
  assert.ok(Array.isArray(body.attendanceTrend));
  assert.ok(Array.isArray(body.evaluationSummary));
});

test("coordinator profile is self-scoped and excludes credentials", async () => {
  const profile = await jsonRequest(
    `/api/coordinators/${encodeURIComponent(coordinator.coordinator_id)}/profile`,
    { headers: { Authorization: `Bearer ${coordinatorToken}` } }
  );
  assert.equal(profile.response.status, 200);
  assert.equal(profile.body.coordinator.coordinator_id, coordinator.coordinator_id);
  assert.equal(Object.hasOwn(profile.body.coordinator, "password"), false);

  const foreign = await jsonRequest(
    `/api/coordinators/${encodeURIComponent(`${coordinator.coordinator_id}-other`)}/profile`,
    { headers: { Authorization: `Bearer ${coordinatorToken}` } }
  );
  assert.equal(foreign.response.status, 403);
});

test("coordinator profile and password endpoints validate changes safely", async () => {
  const headers = {
    Authorization: `Bearer ${coordinatorToken}`,
    "Content-Type": "application/json",
  };
  const profileUpdate = await jsonRequest(
    `/api/coordinators/${encodeURIComponent(coordinator.coordinator_id)}/profile`,
    {
      method: "PUT",
      headers,
      body: JSON.stringify({ name: " ", email: "not-an-email" }),
    }
  );
  assert.equal(profileUpdate.response.status, 400);

  const wrongCurrentPassword = await jsonRequest(
    `/api/coordinators/${encodeURIComponent(coordinator.coordinator_id)}/password`,
    {
      method: "PUT",
      headers,
      body: JSON.stringify({
        current_password: "definitely-not-the-current-password",
        new_password: "TemporaryTestPassword123!",
      }),
    }
  );
  assert.equal(wrongCurrentPassword.response.status, 401);

  const shortPassword = await jsonRequest(
    `/api/coordinators/${encodeURIComponent(coordinator.coordinator_id)}/password`,
    {
      method: "PUT",
      headers,
      body: JSON.stringify({
        current_password: "placeholder",
        new_password: "short",
      }),
    }
  );
  assert.equal(shortPassword.response.status, 400);

  const foreignPassword = await jsonRequest(
    `/api/coordinators/${encodeURIComponent(`${coordinator.coordinator_id}-other`)}/password`,
    {
      method: "PUT",
      headers,
      body: JSON.stringify({
        current_password: "placeholder",
        new_password: "TemporaryTestPassword123!",
      }),
    }
  );
  assert.equal(foreignPassword.response.status, 403);
});

/*
 * Tests for the paper-alignment fixes (migration 006 and related routes).
 * Like the tests above, these avoid changing shared demo records: they use
 * validation failures, read-only checks, and a throwaway login identifier.
 */

test("OJT requirements are readable by students but only coordinators can change them", async () => {
  const list = await jsonRequest("/api/ojt-requirements", {
    headers: authHeaders(studentToken),
  });
  assert.equal(list.response.status, 200);
  assert.ok(Array.isArray(list.body.requirements));
  assert.ok(list.body.requirements.length > 0, "seeded requirements should exist");
  assert.ok(list.body.requirements.every((item) => item.is_active === true));

  const studentCreate = await jsonRequest("/api/coordinator/requirements", {
    method: "POST",
    headers: { ...authHeaders(studentToken), "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Should Not Exist" }),
  });
  assert.equal(studentCreate.response.status, 403);

  const blank = await jsonRequest("/api/coordinator/requirements", {
    method: "POST",
    headers: { ...authHeaders(coordinatorToken), "Content-Type": "application/json" },
    body: JSON.stringify({ name: "   " }),
  });
  assert.equal(blank.response.status, 400);
});

test("coordinator schedule management validates input and is coordinator-only", async () => {
  const path = `/api/coordinator/students/${encodeURIComponent(student.student_id)}/schedule`;

  const asStudent = await jsonRequest(path, {
    method: "PUT",
    headers: { ...authHeaders(studentToken), "Content-Type": "application/json" },
    body: JSON.stringify({ schedule: [] }),
  });
  assert.equal(asStudent.response.status, 403);

  const reversed = await jsonRequest(path, {
    method: "PUT",
    headers: { ...authHeaders(coordinatorToken), "Content-Type": "application/json" },
    body: JSON.stringify({
      schedule: [{ day: "Monday", start_time: "17:00", end_time: "08:00" }],
    }),
  });
  assert.equal(reversed.response.status, 400);

  const duplicate = await jsonRequest(path, {
    method: "PUT",
    headers: { ...authHeaders(coordinatorToken), "Content-Type": "application/json" },
    body: JSON.stringify({
      schedule: [
        { day: "Monday", start_time: "08:00", end_time: "12:00" },
        { day: "Monday", start_time: "13:00", end_time: "17:00" },
      ],
    }),
  });
  assert.equal(duplicate.response.status, 400);

  const unknown = await jsonRequest(
    "/api/coordinator/students/NO-SUCH-STUDENT/schedule",
    {
      method: "PUT",
      headers: { ...authHeaders(coordinatorToken), "Content-Type": "application/json" },
      body: JSON.stringify({ schedule: [] }),
    }
  );
  assert.equal(unknown.response.status, 404);

  const read = await jsonRequest(path, { headers: authHeaders(coordinatorToken) });
  assert.equal(read.response.status, 200);
  assert.ok(Array.isArray(read.body.schedule));
});

test("monitoring hours match the student's own verified attendance (no join inflation)", async () => {
  const [monitoring, attendance] = await Promise.all([
    jsonRequest("/api/coordinator/monitoring", {
      headers: authHeaders(coordinatorToken),
    }),
    jsonRequest(`/api/attendance/${encodeURIComponent(student.student_id)}`, {
      headers: authHeaders(studentToken),
    }),
  ]);
  assert.equal(monitoring.response.status, 200);
  assert.equal(attendance.response.status, 200);

  const logs = attendance.body.attendance || attendance.body.logs || attendance.body;
  assert.ok(Array.isArray(logs), "attendance endpoint should return a list");
  const verifiedHours = logs
    .filter((log) => log.status === "Verified")
    .reduce((sum, log) => sum + Number(log.hours || 0), 0);
  const pendingLogs = logs.filter((log) => log.status === "Pending").length;

  const row = monitoring.body.students.find(
    (item) => item.student_id === student.student_id
  );
  assert.ok(row, "demo student should appear in monitoring");
  assert.equal(row.hours_rendered, verifiedHours);
  assert.equal(row.pending_logs, pendingLogs);
  for (const key of [
    "rejected_logs",
    "missing_timeout_logs",
    "stale_pending_logs",
    "overdue_tasks",
  ]) {
    assert.equal(typeof row[key], "number", `${key} should be reported`);
  }
});

test("flagged discrepancy list is coordinator-only and explains each flag", async () => {
  const anonymous = await jsonRequest("/api/coordinator/discrepancies");
  assert.equal(anonymous.response.status, 401);

  const asStudent = await jsonRequest("/api/coordinator/discrepancies", {
    headers: authHeaders(studentToken),
  });
  assert.equal(asStudent.response.status, 403);

  const result = await jsonRequest("/api/coordinator/discrepancies", {
    headers: authHeaders(coordinatorToken),
  });
  assert.equal(result.response.status, 200);
  assert.ok(Array.isArray(result.body.discrepancies));
  for (const item of result.body.discrepancies) {
    assert.ok(Array.isArray(item.reasons) && item.reasons.length > 0);
  }
});

test("coordinator evaluations and student edits reject unknown references", async () => {
  const evaluation = await jsonRequest("/api/evaluations", {
    method: "POST",
    headers: { ...authHeaders(coordinatorToken), "Content-Type": "application/json" },
    body: JSON.stringify({ student_id: "NO-SUCH-STUDENT", rating: 4 }),
  });
  assert.equal(evaluation.response.status, 404);

  const edit = await jsonRequest(
    `/api/coordinator/students/${encodeURIComponent(student.student_id)}`,
    {
      method: "PUT",
      headers: { ...authHeaders(coordinatorToken), "Content-Type": "application/json" },
      body: JSON.stringify({ supervisor_id: "NO-SUCH-SUPERVISOR" }),
    }
  );
  assert.equal(edit.response.status, 400);
});

test("repeated failed logins are locked out", async () => {
  const email = `throttle-${Date.now()}-${Math.random().toString(16).slice(2)}@internet.test`;
  const statuses = [];
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const { response } = await jsonRequest("/api/login/student", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: "wrong-password" }),
    });
    statuses.push(response.status);
    // Failures are recorded after the response is sent.
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  assert.deepEqual(statuses.slice(0, 5), [401, 401, 401, 401, 401]);
  assert.equal(statuses[5], 429);
});

/*
|--------------------------------------------------------------------------
| Pre-deployment fixes (CHANGES.md section 13)
|--------------------------------------------------------------------------
|
| These tests do not create or change records: they use validation paths
| and record ids that do not exist.
|
*/

const supervisorEmail =
  process.env.SUPERVISOR_DEMO_EMAIL || "supervisor.demo@internet.test";
const supervisorPassword =
  process.env.SUPERVISOR_DEMO_PASSWORD || "SupervisorDemo123!";
let supervisorLogin;

async function supervisorSession() {
  supervisorLogin ??= await login("supervisor", supervisorEmail, supervisorPassword);
  return supervisorLogin;
}

function jsonBody(token, method, payload) {
  return {
    method,
    headers: { ...authHeaders(token), "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  };
}

test("health check is public and security headers are set", async () => {
  const { response, body } = await jsonRequest("/api/health");
  assert.equal(response.status, 200);
  assert.equal(body.status, "ok");
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.equal(response.headers.get("x-powered-by"), null);
});

test("only an invalid login is marked SESSION_INVALID", async () => {
  const badToken = await jsonRequest(
    `/api/tasks/student/${encodeURIComponent(student.student_id)}`,
    { headers: authHeaders("not-a-real-token") }
  );
  assert.equal(badToken.response.status, 401);
  assert.equal(badToken.body.code, "SESSION_INVALID");

  const badCoordinatorToken = await jsonRequest("/api/coordinator/students", {
    headers: authHeaders("not-a-real-token"),
  });
  assert.equal(badCoordinatorToken.response.status, 401);
  assert.equal(badCoordinatorToken.body.code, "SESSION_INVALID");

  // A valid login used on another role's route must not sign the user out.
  const wrongRole = await jsonRequest("/api/coordinator/students", {
    headers: authHeaders(studentToken),
  });
  assert.equal(wrongRole.response.status, 403);
  assert.equal(wrongRole.body.code, undefined);

  const wrongCurrentPassword = await jsonRequest(
    `/api/students/${encodeURIComponent(student.student_id)}/password`,
    jsonBody(studentToken, "PUT", {
      current_password: "definitely-not-the-current-password",
      new_password: "TemporaryTestPassword123",
    })
  );
  assert.equal(wrongCurrentPassword.response.status, 401);
  assert.equal(wrongCurrentPassword.body.code, undefined);
});

test("password policy applies to account creation and password change", async () => {
  const weakPasswords = ["1", "alllowercase123", "NoDigitsHereAtAll", "Short1Aa"];
  for (const password of weakPasswords) {
    const created = await jsonRequest(
      "/api/coordinator/students",
      jsonBody(coordinatorToken, "POST", {
        student_id: `POLICY-TEST-${Date.now()}`,
        email: `policy-${Date.now()}@internet.test`,
        password,
        name: "Policy Test",
      })
    );
    assert.equal(created.response.status, 400, `"${password}" should be refused`);
  }

  const weakSupervisor = await jsonRequest(
    "/api/coordinator/supervisors",
    jsonBody(coordinatorToken, "POST", {
      supervisor_id: `POLICY-TEST-${Date.now()}`,
      email: `policy-sup-${Date.now()}@internet.test`,
      password: "weak",
      name: "Policy Test",
    })
  );
  assert.equal(weakSupervisor.response.status, 400);

  const passwordPath = `/api/students/${encodeURIComponent(student.student_id)}/password`;
  const weakChange = await jsonRequest(
    passwordPath,
    jsonBody(studentToken, "PUT", {
      current_password: studentPassword,
      new_password: "short",
    })
  );
  assert.equal(weakChange.response.status, 400);

  const sameAsCurrent = await jsonRequest(
    passwordPath,
    jsonBody(studentToken, "PUT", {
      current_password: studentPassword,
      new_password: studentPassword,
    })
  );
  assert.equal(sameAsCurrent.response.status, 400);

  const nonText = await jsonRequest(
    passwordPath,
    jsonBody(studentToken, "PUT", {
      current_password: studentPassword,
      new_password: { value: "NotAString12345" },
    })
  );
  assert.equal(nonText.response.status, 400);

  // None of the refused changes ended the session or changed the password.
  const stillValid = await jsonRequest(
    `/api/tasks/student/${encodeURIComponent(student.student_id)}`,
    { headers: authHeaders(studentToken) }
  );
  assert.equal(stillValid.response.status, 200);
});

test("local logins are not forced to change password", async () => {
  // Enforcement is production-only; the demo flow must stay usable.
  const result = await jsonRequest("/api/login/coordinator", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: coordinatorEmail, password: coordinatorPassword }),
  });
  assert.equal(result.response.status, 200);
  assert.equal(result.body.must_change_password, false);
  assert.equal(Object.hasOwn(result.body.coordinator, "password"), false);
});

test("complaint resolution validates input and no longer fails on the update", async () => {
  const invalidStatus = await jsonRequest(
    "/api/coordinator/complaints/0/resolve",
    jsonBody(coordinatorToken, "PATCH", { status: "Bogus" })
  );
  assert.equal(invalidStatus.response.status, 400);

  // The update query used to fail for every request (HTTP 500). With an id
  // that does not exist it must now run and report "not found".
  for (const status of ["In Review", "Resolved", "Dismissed"]) {
    const result = await jsonRequest(
      "/api/coordinator/complaints/0/resolve",
      jsonBody(coordinatorToken, "PATCH", { status, resolution_notes: "test" })
    );
    assert.equal(result.response.status, 404, `${status} should reach the database`);
  }

  const wrongRole = await jsonRequest(
    "/api/coordinator/complaints/0/resolve",
    jsonBody(studentToken, "PATCH", { status: "Resolved" })
  );
  assert.equal(wrongRole.response.status, 403);
});

test("attendance review requires a reason to reject", async () => {
  const supervisor = await supervisorSession();

  const noReason = await jsonRequest(
    "/api/attendance/0/status",
    jsonBody(supervisor.token, "PATCH", { status: "Rejected" })
  );
  assert.equal(noReason.response.status, 400);

  const blankReason = await jsonRequest(
    "/api/attendance/0/status",
    jsonBody(supervisor.token, "PATCH", { status: "Rejected", reason: "   " })
  );
  assert.equal(blankReason.response.status, 400);

  const unknownLog = await jsonRequest(
    "/api/attendance/0/status",
    jsonBody(supervisor.token, "PATCH", { status: "Verified" })
  );
  assert.equal(unknownLog.response.status, 404);

  const studentAttempt = await jsonRequest(
    "/api/attendance/0/status",
    jsonBody(studentToken, "PATCH", { status: "Verified" })
  );
  assert.equal(studentAttempt.response.status, 403);
});

test("task due dates must be valid and not in the past", async () => {
  const supervisor = await supervisorSession();
  const assign = (due_date) =>
    jsonRequest(
      "/api/tasks",
      jsonBody(supervisor.token, "POST", {
        student_id: student.student_id,
        title: "Due date validation",
        due_date,
      })
    );

  for (const dueDate of ["2020-01-01", "next friday", "2026-13-45"]) {
    const result = await assign(dueDate);
    assert.equal(result.response.status, 400, `${dueDate} should be refused`);
  }
});

test("notification read-all is authenticated and scoped to the caller", async () => {
  const anonymous = await jsonRequest("/api/notifications/read-all", {
    method: "PUT",
  });
  assert.equal(anonymous.response.status, 401);

  const supervisor = await supervisorSession();
  const supervisorId = supervisor.supervisor.supervisor_id;

  const foreignList = await jsonRequest(
    `/api/notifications/supervisor/${encodeURIComponent(supervisorId)}`,
    { headers: authHeaders(coordinatorToken) }
  );
  assert.equal(foreignList.response.status, 403);

  const ownList = await jsonRequest(
    `/api/notifications/supervisor/${encodeURIComponent(supervisorId)}`,
    { headers: authHeaders(supervisor.token) }
  );
  assert.equal(ownList.response.status, 200);
  assert.ok(Array.isArray(ownList.body.notifications));
  assert.ok(ownList.body.notifications.length <= 100);

  const foreignRead = await jsonRequest("/api/notifications/0/read", {
    method: "PUT",
    headers: authHeaders(supervisor.token),
  });
  assert.equal(foreignRead.response.status, 404);
});

test("coordinator document oversight is read-only and coordinator-only", async () => {
  const supervisor = await supervisorSession();
  for (const token of [studentToken, supervisor.token]) {
    const denied = await jsonRequest("/api/coordinator/documents", {
      headers: authHeaders(token),
    });
    assert.equal(denied.response.status, 403);
  }

  const { response, body } = await jsonRequest("/api/coordinator/documents", {
    headers: authHeaders(coordinatorToken),
  });
  assert.equal(response.status, 200);
  assert.ok(Array.isArray(body.requirements));
  assert.ok(Array.isArray(body.documents));
  assert.ok(Array.isArray(body.students));
  assert.equal(JSON.stringify(body).includes("file_path"), false);
  for (const row of body.students) {
    assert.equal(
      row.approved + row.missing.length,
      body.requirements.length,
      `${row.student_id}: approved + missing should equal the requirement count`
    );
  }

  // The coordinator may review only for a student with no active supervisor,
  // so there is nothing here for them to decide; a student never may.
  const review = await jsonRequest(
    "/api/documents/999999999/review",
    jsonBody(coordinatorToken, "PATCH", { status: "Approved" })
  );
  assert.equal(review.response.status, 404);

  const studentReview = await jsonRequest(
    "/api/documents/999999999/review",
    jsonBody(studentToken, "PATCH", { status: "Approved" })
  );
  assert.equal(studentReview.response.status, 403);

  const unknownFile = await jsonRequest("/api/documents/999999999/file", {
    headers: authHeaders(coordinatorToken),
  });
  assert.equal(unknownFile.response.status, 404);
});

test("editing a student without a supervisor field keeps the supervisor", async () => {
  const before = await jsonRequest(
    `/api/student/${encodeURIComponent(student.student_id)}`,
    { headers: authHeaders(coordinatorToken) }
  );
  assert.equal(before.response.status, 200);

  const edit = await jsonRequest(
    `/api/coordinator/students/${encodeURIComponent(student.student_id)}`,
    jsonBody(coordinatorToken, "PUT", {})
  );
  assert.equal(edit.response.status, 200);
  assert.equal(edit.body.student.supervisor_id, student.supervisor_id);
  assert.ok(edit.body.student.supervisor_id, "demo student should have a supervisor");
});

test("a missed time-out needs a valid time and a reason, and is student-only", async () => {
  const supervisor = await supervisorSession();
  const lateTimeOut = (token, body) =>
    jsonRequest(
      "/api/attendance/0/late-time-out",
      jsonBody(token, "PUT", body)
    );

  const noTime = await lateTimeOut(studentToken, { reason: "Phone battery died." });
  assert.equal(noTime.response.status, 400);

  const noReason = await lateTimeOut(studentToken, {
    time_out: new Date().toISOString(),
    reason: "  ",
  });
  assert.equal(noReason.response.status, 400);

  const unknownLog = await lateTimeOut(studentToken, {
    time_out: new Date().toISOString(),
    reason: "Phone battery died.",
  });
  assert.equal(unknownLog.response.status, 404);

  const wrongRole = await lateTimeOut(supervisor.token, {
    time_out: new Date().toISOString(),
    reason: "Phone battery died.",
  });
  assert.equal(wrongRole.response.status, 403);
});

test("asking for another attendance review needs an explanation and is student-only", async () => {
  const supervisor = await supervisorSession();
  const resubmit = (token, explanation) => {
    const form = new FormData();
    if (explanation !== undefined) form.append("explanation", explanation);
    return jsonRequest("/api/attendance/0/resubmit", {
      method: "POST",
      headers: authHeaders(token),
      body: form,
    });
  };

  const noExplanation = await resubmit(studentToken, " ");
  assert.equal(noExplanation.response.status, 400);

  const unknownLog = await resubmit(studentToken, "The photo shows my workstation.");
  assert.equal(unknownLog.response.status, 404);

  const wrongRole = await resubmit(supervisor.token, "The photo shows my workstation.");
  assert.equal(wrongRole.response.status, 403);
});

test("an attendance decision can be withdrawn only by a reviewer", async () => {
  const supervisor = await supervisorSession();

  const unknownLog = await jsonRequest(
    "/api/attendance/0/status",
    jsonBody(supervisor.token, "PATCH", { status: "Pending" })
  );
  assert.equal(unknownLog.response.status, 404);

  const unknownStatus = await jsonRequest(
    "/api/attendance/0/status",
    jsonBody(supervisor.token, "PATCH", { status: "Approved" })
  );
  assert.equal(unknownStatus.response.status, 400);

  const studentAttempt = await jsonRequest(
    "/api/attendance/0/status",
    jsonBody(studentToken, "PATCH", { status: "Pending" })
  );
  assert.equal(studentAttempt.response.status, 403);
});

test("absences are validated, self-scoped and reviewed only by staff", async () => {
  const supervisor = await supervisorSession();

  const noReason = await jsonRequest(
    "/api/absences",
    jsonBody(studentToken, "POST", { date: "2026-01-01", reason: "" })
  );
  assert.equal(noReason.response.status, 400);

  const badDate = await jsonRequest(
    "/api/absences",
    jsonBody(studentToken, "POST", { date: "yesterday", reason: "I had a fever." })
  );
  assert.equal(badDate.response.status, 400);

  const tooOld = await jsonRequest(
    "/api/absences",
    jsonBody(studentToken, "POST", { date: "2020-01-01", reason: "I had a fever." })
  );
  assert.equal(tooOld.response.status, 400);

  const wrongRole = await jsonRequest(
    "/api/absences",
    jsonBody(supervisor.token, "POST", { date: "2026-01-01", reason: "I had a fever." })
  );
  assert.equal(wrongRole.response.status, 403);

  const own = await jsonRequest(`/api/absences/student/${student.student_id}`, {
    headers: authHeaders(studentToken),
  });
  assert.equal(own.response.status, 200);
  assert.ok(Array.isArray(own.body.absences));

  const other = await jsonRequest("/api/absences/student/someone-else", {
    headers: authHeaders(studentToken),
  });
  assert.equal(other.response.status, 403);

  const studentReview = await jsonRequest(
    "/api/absences/0/review",
    jsonBody(studentToken, "PATCH", { status: "Excused" })
  );
  assert.equal(studentReview.response.status, 403);

  const noNote = await jsonRequest(
    "/api/absences/0/review",
    jsonBody(supervisor.token, "PATCH", { status: "Unexcused" })
  );
  assert.equal(noNote.response.status, 400);

  const unknown = await jsonRequest(
    "/api/absences/0/review",
    jsonBody(supervisor.token, "PATCH", { status: "Excused" })
  );
  assert.equal(unknown.response.status, 404);

  const coordinatorList = await jsonRequest("/api/coordinator/absences", {
    headers: authHeaders(coordinatorToken),
  });
  assert.equal(coordinatorList.response.status, 200);
  assert.ok(Array.isArray(coordinatorList.body.absences));

  const studentList = await jsonRequest("/api/coordinator/absences", {
    headers: authHeaders(studentToken),
  });
  assert.equal(studentList.response.status, 403);
});

test("only the supervisor can edit or cancel a task, with valid details", async () => {
  const supervisor = await supervisorSession();
  const valid = { title: "Inventory sheet", priority: "High", due_date: "2099-01-01" };

  const studentEdit = await jsonRequest("/api/tasks/0", jsonBody(studentToken, "PUT", valid));
  assert.equal(studentEdit.response.status, 403);

  const badPriority = await jsonRequest(
    "/api/tasks/0",
    jsonBody(supervisor.token, "PUT", { ...valid, priority: "Urgent" })
  );
  assert.equal(badPriority.response.status, 400);

  const pastDue = await jsonRequest(
    "/api/tasks/0",
    jsonBody(supervisor.token, "PUT", { ...valid, due_date: "2020-01-01" })
  );
  assert.equal(pastDue.response.status, 400);

  const unknown = await jsonRequest("/api/tasks/0", jsonBody(supervisor.token, "PUT", valid));
  assert.equal(unknown.response.status, 404);

  const notANumber = await jsonRequest("/api/tasks/abc", {
    method: "DELETE",
    headers: authHeaders(supervisor.token),
  });
  assert.equal(notANumber.response.status, 404);

  const studentCancel = await jsonRequest("/api/tasks/0", {
    method: "DELETE",
    headers: authHeaders(studentToken),
  });
  assert.equal(studentCancel.response.status, 403);
});

test("bulk import, announcements and password resets are coordinator-only and validated", async () => {
  const supervisor = await supervisorSession();

  const emptyImport = await jsonRequest(
    "/api/coordinator/students/import",
    jsonBody(coordinatorToken, "POST", { students: [] })
  );
  assert.equal(emptyImport.response.status, 400);

  const badRows = await jsonRequest(
    "/api/coordinator/students/import",
    jsonBody(coordinatorToken, "POST", {
      students: [
        { student_id: "", name: "No Id", email: "no.id@example.com" },
        { student_id: "T-1", name: "Bad Email", email: "not-an-email" },
        { student_id: "T-2", name: "Bad Supervisor", email: "t2@example.com", supervisor_id: "nobody" },
      ],
    })
  );
  assert.equal(badRows.response.status, 400);
  assert.equal(badRows.body.created, 0);
  assert.equal(badRows.body.results.length, 3);
  assert.ok(badRows.body.results.every((row) => row.status === "error" && !row.password));

  const supervisorImport = await jsonRequest(
    "/api/coordinator/students/import",
    jsonBody(supervisor.token, "POST", { students: [{}] })
  );
  assert.equal(supervisorImport.response.status, 403);

  const badAudience = await jsonRequest(
    "/api/coordinator/announcements",
    jsonBody(coordinatorToken, "POST", {
      title: "Orientation",
      message: "Orientation is on Monday.",
      audience: "parents",
    })
  );
  assert.equal(badAudience.response.status, 400);

  const studentAnnouncement = await jsonRequest(
    "/api/coordinator/announcements",
    jsonBody(studentToken, "POST", {
      title: "Orientation",
      message: "Orientation is on Monday.",
      audience: "everyone",
    })
  );
  assert.equal(studentAnnouncement.response.status, 403);

  const history = await jsonRequest("/api/coordinator/announcements", {
    headers: authHeaders(coordinatorToken),
  });
  assert.equal(history.response.status, 200);
  assert.ok(Array.isArray(history.body.announcements));

  const weakReset = await jsonRequest(
    `/api/coordinator/students/${student.student_id}/reset-password`,
    jsonBody(coordinatorToken, "POST", { password: "short" })
  );
  assert.equal(weakReset.response.status, 400);

  const unknownReset = await jsonRequest(
    "/api/coordinator/students/no-such-student/reset-password",
    jsonBody(coordinatorToken, "POST", { password: "TemporaryPass123!" })
  );
  assert.equal(unknownReset.response.status, 404);

  const supervisorReset = await jsonRequest(
    `/api/coordinator/students/${student.student_id}/reset-password`,
    jsonBody(supervisor.token, "POST", { password: "TemporaryPass123!" })
  );
  assert.equal(supervisorReset.response.status, 403);
});

test("a complaint conversation is hidden from people outside it", async () => {
  const supervisor = await supervisorSession();

  const anonymous = await jsonRequest("/api/complaints/1/messages");
  assert.equal(anonymous.response.status, 401);

  const unknown = await jsonRequest("/api/complaints/0/messages", {
    headers: authHeaders(coordinatorToken),
  });
  assert.equal(unknown.response.status, 404);

  const emptyReply = await jsonRequest(
    "/api/complaints/0/messages",
    jsonBody(coordinatorToken, "POST", { message: "" })
  );
  assert.equal(emptyReply.response.status, 400);

  // A complaint the student filed is not the supervisor's to read.
  const mine = await jsonRequest(`/api/complaints/student/${student.student_id}`, {
    headers: authHeaders(studentToken),
  });
  const complaints = Array.isArray(mine.body) ? mine.body : mine.body.complaints || [];
  if (complaints.length > 0) {
    const id = complaints[0].id;
    const owner = await jsonRequest(`/api/complaints/${id}/messages`, {
      headers: authHeaders(studentToken),
    });
    assert.equal(owner.response.status, 200);
    assert.ok(Array.isArray(owner.body.messages));

    const outsider = await jsonRequest(`/api/complaints/${id}/messages`, {
      headers: authHeaders(supervisor.token),
    });
    assert.equal(outsider.response.status, 404);
  }
});

test("a task attachment must be an allowed file type and only a supervisor can send one", async () => {
  const supervisor = await supervisorSession();
  const form = (name, type) => {
    const body = new FormData();
    body.append("student_id", student.student_id);
    body.append("title", "Attachment check");
    body.append("due_date", "2099-01-01");
    body.append("attachment", new Blob([name.endsWith(".pdf") ? sampleFiles.pdf : "x"], { type }), name);
    return body;
  };

  const executable = await jsonRequest("/api/tasks", {
    method: "POST",
    headers: authHeaders(supervisor.token),
    body: form("tool.exe", "application/x-msdownload"),
  });
  assert.equal(executable.response.status, 400);

  const asStudent = await jsonRequest("/api/tasks", {
    method: "POST",
    headers: authHeaders(studentToken),
    body: form("brief.pdf", "application/pdf"),
  });
  assert.equal(asStudent.response.status, 403);

  const unknownTask = await jsonRequest("/api/tasks/0", {
    method: "PUT",
    headers: authHeaders(supervisor.token),
    body: (() => {
      const body = form("brief.pdf", "application/pdf");
      body.append("priority", "Low");
      return body;
    })(),
  });
  assert.equal(unknownTask.response.status, 404);

  const mine = await jsonRequest(`/api/tasks/student/${student.student_id}`, {
    headers: authHeaders(studentToken),
  });
  assert.equal(mine.response.status, 200);
  assert.ok(mine.body.every((task) => "attachment_file" in task && "attachment_name" in task));
});

test("review undo routes are supervisor-only and refuse what cannot be undone", async () => {
  const supervisor = await supervisorSession();

  for (const path of ["/api/tasks/0/review/undo", "/api/documents/0/review/undo"]) {
    const asStudent = await jsonRequest(path, { method: "POST", headers: authHeaders(studentToken) });
    assert.equal(asStudent.response.status, 403);

    const nothingToUndo = await jsonRequest(path, {
      method: "POST",
      headers: authHeaders(supervisor.token),
    });
    assert.equal(nothingToUndo.response.status, 409);
  }

  const notANumber = await jsonRequest("/api/tasks/abc/review/undo", {
    method: "POST",
    headers: authHeaders(supervisor.token),
  });
  assert.equal(notANumber.response.status, 404);

  const absenceUndo = await jsonRequest(
    "/api/absences/0/review",
    jsonBody(supervisor.token, "PATCH", { status: "Pending" })
  );
  assert.equal(absenceUndo.response.status, 404);
});

test("a supervisor only reaches their own interns' schedule, incidents and evaluations", async () => {
  const supervisor = await supervisorSession();

  const schedule = await jsonRequest(
    `/api/supervisor/interns/${student.student_id}/schedule`,
    { headers: authHeaders(supervisor.token) }
  );
  assert.equal(schedule.response.status, 200);
  assert.ok(Array.isArray(schedule.body.schedule));

  const stranger = await jsonRequest("/api/supervisor/interns/no-such-student/schedule", {
    headers: authHeaders(supervisor.token),
  });
  assert.equal(stranger.response.status, 403);

  const asStudent = await jsonRequest(
    `/api/supervisor/interns/${student.student_id}/schedule`,
    { headers: authHeaders(studentToken) }
  );
  assert.equal(asStudent.response.status, 403);

  const incident = new FormData();
  incident.append("reported_student_id", "no-such-student");
  incident.append("category", "Other");
  incident.append("description", "About a student who is not this supervisor's intern.");
  const foreignIncident = await jsonRequest("/api/complaints/supervisor", {
    method: "POST",
    headers: authHeaders(supervisor.token),
    body: incident,
  });
  assert.equal(foreignIncident.response.status, 403);

  const badRating = await jsonRequest(
    "/api/evaluations/0",
    jsonBody(supervisor.token, "PUT", { rating: 9 })
  );
  assert.equal(badRating.response.status, 400);

  const notMine = await jsonRequest(
    "/api/evaluations/0",
    jsonBody(supervisor.token, "PUT", { rating: 4 })
  );
  assert.equal(notMine.response.status, 404);

  const studentEdit = await jsonRequest(
    "/api/evaluations/0",
    jsonBody(studentToken, "PUT", { rating: 4 })
  );
  assert.equal(studentEdit.response.status, 403);

  const removeMissing = await jsonRequest("/api/evaluations/0", {
    method: "DELETE",
    headers: authHeaders(supervisor.token),
  });
  assert.equal(removeMissing.response.status, 404);
});

test("a supervisor who still has active interns cannot be deactivated", async () => {
  const supervisor = await supervisorSession();
  const id = supervisor.supervisor.supervisor_id;

  const refused = await jsonRequest(
    `/api/coordinator/supervisors/${id}/status`,
    jsonBody(coordinatorToken, "PATCH", { is_active: false })
  );
  assert.equal(refused.response.status, 409);
  assert.match(refused.body.message, /active intern/);

  // The account is untouched: its session still works.
  const stillActive = await jsonRequest(`/api/supervisor/${id}/interns`, {
    headers: authHeaders(supervisor.token),
  });
  assert.equal(stillActive.response.status, 200);
});

test("student and supervisor edits validate hours, supervisors and duplicate emails", async () => {
  const supervisor = await supervisorSession();
  const path = `/api/coordinator/students/${student.student_id}`;

  for (const required_hours of [-1, "many", 99999]) {
    const refused = await jsonRequest(path, jsonBody(coordinatorToken, "PUT", { required_hours }));
    assert.equal(refused.response.status, 400);
  }

  const unknownSupervisor = await jsonRequest(
    path,
    jsonBody(coordinatorToken, "PUT", { supervisor_id: "no-such-supervisor" })
  );
  assert.equal(unknownSupervisor.response.status, 400);

  const duplicateEmail = await jsonRequest(
    `/api/coordinator/supervisors/${supervisor.supervisor.supervisor_id}`,
    jsonBody(coordinatorToken, "PUT", { email: supervisor.supervisor.email })
  );
  // Saving an account's own email back is not a duplicate.
  assert.equal(duplicateEmail.response.status, 200);

  const badHoursOnCreate = await jsonRequest(
    "/api/coordinator/students",
    jsonBody(coordinatorToken, "POST", {
      student_id: "T-HOURS",
      email: "t.hours@example.com",
      password: "TemporaryPass123!",
      name: "Bad Hours",
      required_hours: -20,
    })
  );
  assert.equal(badHoursOnCreate.response.status, 400);
});

test("the coordinator dashboard count matches the flagged list", async () => {
  const [dashboard, flagged] = await Promise.all([
    jsonRequest("/api/coordinator/dashboard", { headers: authHeaders(coordinatorToken) }),
    jsonRequest("/api/coordinator/discrepancies", { headers: authHeaders(coordinatorToken) }),
  ]);
  assert.equal(dashboard.response.status, 200);
  assert.equal(flagged.response.status, 200);
  if (flagged.body.discrepancies.length < 300) {
    assert.equal(dashboard.body.flaggedAttendance, flagged.body.discrepancies.length);
  }
});

test("student records, reassignment and settling are coordinator-only and validated", async () => {
  const supervisor = await supervisorSession();
  const id = supervisor.supervisor.supervisor_id;

  const overview = await jsonRequest(
    `/api/coordinator/students/${student.student_id}/overview`,
    { headers: authHeaders(coordinatorToken) }
  );
  assert.equal(overview.response.status, 200);
  assert.equal(overview.body.student.student_id, student.student_id);
  assert.ok(!("password" in overview.body.student));
  for (const key of ["attendance", "tasks", "documents", "evaluations", "absences", "schedule"]) {
    assert.ok(Array.isArray(overview.body[key]), key);
  }

  const asSupervisor = await jsonRequest(
    `/api/coordinator/students/${student.student_id}/overview`,
    { headers: authHeaders(supervisor.token) }
  );
  assert.equal(asSupervisor.response.status, 403);

  const sameSupervisor = await jsonRequest(
    `/api/coordinator/supervisors/${id}/reassign`,
    jsonBody(coordinatorToken, "POST", { to: id })
  );
  assert.equal(sameSupervisor.response.status, 400);

  const unknownTarget = await jsonRequest(
    `/api/coordinator/supervisors/${id}/reassign`,
    jsonBody(coordinatorToken, "POST", { to: "no-such-supervisor" })
  );
  assert.equal(unknownTarget.response.status, 400);

  const supervisorMoves = await jsonRequest(
    `/api/coordinator/supervisors/${id}/reassign`,
    jsonBody(supervisor.token, "POST", { to: "anyone" })
  );
  assert.equal(supervisorMoves.response.status, 403);

  const nothingToSettle = await jsonRequest(
    "/api/coordinator/attendance/0/acknowledge",
    jsonBody(coordinatorToken, "POST", {})
  );
  assert.equal(nothingToSettle.response.status, 409);

  const supervisorSettles = await jsonRequest(
    "/api/coordinator/attendance/0/acknowledge",
    jsonBody(supervisor.token, "POST", {})
  );
  assert.equal(supervisorSettles.response.status, 403);

  const withdrawMissing = await jsonRequest("/api/coordinator/announcements/0", {
    method: "DELETE",
    headers: authHeaders(coordinatorToken),
  });
  assert.equal(withdrawMissing.response.status, 404);

  const companies = await jsonRequest("/api/coordinator/companies", {
    headers: authHeaders(coordinatorToken),
  });
  assert.equal(companies.response.status, 200);
  assert.ok(Array.isArray(companies.body.companies));

  // The demo student has an active supervisor, so the coordinator does not
  // review their documents.
  const coordinatorReview = await jsonRequest(
    "/api/documents/999999999/review",
    jsonBody(coordinatorToken, "PATCH", { status: "Approved" })
  );
  assert.equal(coordinatorReview.response.status, 404);
});

test("the account wipe tool is gone", async () => {
  // The trial-phase tool that deleted accounts and their records was
  // removed. Nobody can reach it, whoever they are and whatever they send.
  const path = "/api/coordinator/accounts/wipe";
  const target = { student_ids: [student.student_id], supervisor_ids: [] };

  const anonymous = await jsonRequest(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...target, password: coordinatorPassword }),
  });
  assert.equal(anonymous.response.status, 404);

  const asStudent = await jsonRequest(
    path,
    jsonBody(studentToken, "POST", { ...target, password: studentPassword })
  );
  assert.equal(asStudent.response.status, 404);

  const asCoordinator = await jsonRequest(
    path,
    jsonBody(coordinatorToken, "POST", { ...target, password: coordinatorPassword })
  );
  assert.equal(asCoordinator.response.status, 404);

  // The account named in the request is untouched.
  const stillThere = await jsonRequest(
    `/api/student/${encodeURIComponent(student.student_id)}`,
    { headers: authHeaders(studentToken) }
  );
  assert.equal(stillThere.response.status, 200);
});

test("time-in is refused without a passed camera check", async () => {
  const photo = () => new Blob([sampleFiles.jpg], { type: "image/jpeg" });
  const timeIn = (extra = {}) => {
    const form = new FormData();
    form.set("student_id", student.student_id);
    form.set("image", photo(), "attendance.jpg");
    for (const [key, value] of Object.entries(extra)) form.set(key, value);
    return jsonRequest("/api/attendance", {
      method: "POST",
      headers: authHeaders(studentToken),
      body: form,
    });
  };

  // Asked first on purpose: a server too old to know this route would also
  // accept the photo below and record a real time-in, so stop here instead.
  const challenge = await jsonRequest("/api/attendance/liveness-challenge", {
    method: "POST",
    headers: authHeaders(studentToken),
  });
  assert.equal(
    challenge.response.status,
    200,
    "the server under test predates the camera check; restart it with the current code"
  );

  const noTicket = await timeIn();
  assert.equal(noTicket.response.status, 400);
  assert.match(noTicket.body.message, /camera check/i);

  assert.equal(challenge.body.prompts.length, 2);
  assert.notEqual(challenge.body.prompts[0], challenge.body.prompts[1]);
  assert.equal(challenge.body.prompts.includes(challenge.body.spare), false);

  // A ticket alone is not enough: the report must cover every prompt on it.
  const onePrompt = await timeIn({
    liveness_ticket: challenge.body.ticket,
    liveness_report: JSON.stringify({ completed: [challenge.body.prompts[0]], flash: "passed" }),
  });
  assert.equal(onePrompt.response.status, 400);

  // When the light check was not conclusive, the spare prompt is required too.
  const noSpare = await timeIn({
    liveness_ticket: challenge.body.ticket,
    liveness_report: JSON.stringify({ completed: challenge.body.prompts, flash: "inconclusive" }),
  });
  assert.equal(noSpare.response.status, 400);

  // A sign-in token is not a camera-check ticket.
  const wrongTicket = await timeIn({
    liveness_ticket: studentToken,
    liveness_report: JSON.stringify({ completed: challenge.body.prompts, flash: "passed" }),
  });
  assert.equal(wrongTicket.response.status, 400);
});

test("only a supervisor can record a time-in in person, and only for their own intern", async () => {
  const supervisor = await supervisorSession();
  const record = (token, fields, withPhoto = true) => {
    const form = new FormData();
    for (const [key, value] of Object.entries(fields)) form.set(key, value);
    if (withPhoto) {
      form.set("image", new Blob([sampleFiles.jpg], { type: "image/jpeg" }), "intern.jpg");
    }
    return jsonRequest("/api/supervisor/attendance/record", {
      method: "POST",
      headers: authHeaders(token),
      body: form,
    });
  };

  const asStudent = await record(studentToken, {
    student_id: student.student_id,
    reason: "Camera not working",
  });
  assert.equal(asStudent.response.status, 403);

  const foreign = await record(supervisor.token, {
    student_id: "no-such-student",
    reason: "Camera not working",
  });
  assert.equal(foreign.response.status, 403);

  const noReason = await record(supervisor.token, { student_id: student.student_id, reason: "" });
  assert.equal(noReason.response.status, 400);

  const noPhoto = await record(
    supervisor.token,
    { student_id: student.student_id, reason: "Camera not working" },
    false
  );
  assert.equal(noPhoto.response.status, 400);
});

test("analytics covers every day of the chosen period and keeps its figures consistent", async () => {
  const headers = authHeaders(coordinatorToken);
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" });

  for (const days of [14, 30, 90]) {
    const { response, body } = await jsonRequest(`/api/coordinator/analytics?days=${days}`, {
      headers,
    });
    assert.equal(response.status, 200);
    assert.equal(body.days, days);

    // One row per calendar day, quiet days included, ending today.
    assert.equal(body.attendanceTrend.length, days);
    assert.equal(body.attendanceTrend.at(-1).day, day.format(new Date()));
    const daysSeen = new Set(body.attendanceTrend.map((row) => row.day));
    assert.equal(daysSeen.size, days);

    // The headline figures are the sum of what the chart shows.
    const charted = body.attendanceTrend.reduce((sum, row) => sum + row.hours, 0);
    assert.ok(Math.abs(charted - body.period.hours) < 0.01);
    const logs = body.attendanceTrend.reduce((sum, row) => sum + row.logs, 0);
    assert.equal(logs, body.period.logs);
    assert.equal(
      body.period.verified + body.period.pending + body.period.rejected,
      body.period.logs
    );
    const { cameraChecked, bySupervisor, unchecked } = body.period.capture;
    assert.equal(cameraChecked + bySupervisor + unchecked, body.period.logs);
  }

  // An unknown period falls back to 14 days.
  const fallback = await jsonRequest("/api/coordinator/analytics?days=7", { headers });
  assert.equal(fallback.body.days, 14);

  const { body } = await jsonRequest("/api/coordinator/analytics", { headers });
  // Every active student sits in exactly one progress band and one company row.
  const banded = body.progress.bands.reduce((sum, band) => sum + band.count, 0);
  assert.equal(banded, body.progress.students);
  const placed = body.companies.reduce((sum, company) => sum + company.students, 0);
  assert.equal(placed, body.progress.students);
  // The task stages are always all four, in working order.
  assert.deepEqual(
    body.taskFunnel.map((stage) => stage.status),
    ["Pending", "In Progress", "Submitted", "Reviewed"]
  );

  // Analytics, the dashboard and Monitoring count the same active students.
  const [dashboard, monitoring] = await Promise.all([
    jsonRequest("/api/coordinator/dashboard", { headers }),
    jsonRequest("/api/coordinator/monitoring", { headers }),
  ]);
  assert.equal(dashboard.body.students.active, body.progress.students);
  assert.equal(monitoring.body.students.length, body.progress.students);
  assert.equal(dashboard.body.hoursTrend.length, 14);
  assert.ok(Math.abs(dashboard.body.totalHoursLogged - body.progress.hours) < 0.01);
});

/*
| Route sweep
|
| Reads every route out of the source, so a route added later is covered
| without touching this file. Requests carry no body and use ids that do
| not exist, so nothing is created or changed.
|
*/

const fs = require("node:fs");
const nodePath = require("node:path");

// The only routes that may answer without a token.
const PUBLIC_ROUTES = new Set([
  "GET /api/health",
  "GET /api/test-db",
  "POST /api/login/student",
  "POST /api/login/supervisor",
  "POST /api/login/coordinator",
  "POST /api/auth/password-reset/request",
  "POST /api/auth/password-reset/confirm",
  "GET /api/push/vapid-public-key",
  "POST /api/client-errors",
]);

function readRoutes() {
  const routes = [];
  for (const file of ["server.ts", "routes/extensions.ts"]) {
    const text = fs.readFileSync(
      nodePath.join(__dirname, "..", "src", file),
      "utf8"
    );
    const pattern =
      /\bapp\.(get|post|put|patch|delete)\(\s*(["'`])([^"'`]+)\2/g;
    const starts = [...text.matchAll(pattern)];
    starts.forEach((match, index) => {
      const end =
        index + 1 < starts.length ? starts[index + 1].index : text.length;
      const body = text.slice(match.index, end);
      // Whatever sits between the path and the handler is middleware.
      const head = body.slice(
        0,
        body.search(/async\s*\(|\(\s*_?req\b|\(\s*req\s*,/)
      );
      let roles = null;
      const roleCall = head.match(/requireRole\(([^)]*)\)/);
      if (roleCall) roles = [...roleCall[1].matchAll(/"(\w+)"/g)].map((m) => m[1]);
      else if (/requireCoordinator/.test(head)) roles = ["coordinator"];
      routes.push({
        method: match[1].toUpperCase(),
        path: match[3],
        key: `${match[1].toUpperCase()} ${match[3]}`,
        roles,
        where: `${file}:${text.slice(0, match.index).split("\n").length}`,
      });
    });
  }
  return routes;
}

const sweepRoutes = readRoutes();
const fillParams = (path, value) =>
  path.replace(/:\w+/g, encodeURIComponent(value));

async function sweepStatus(route, token, paramValue = "sweep-0000") {
  const response = await fetch(
    new URL(fillParams(route.path, paramValue), apiBaseUrl),
    {
      method: route.method,
      headers: token ? authHeaders(token) : {},
    }
  );
  await response.body?.cancel();
  return response.status;
}

test("the route sweep finds the routes", () => {
  // A floor, not an exact count: it only guards against the sweep silently
  // reading nothing if the route files move or change style.
  assert.ok(sweepRoutes.length >= 100, `found only ${sweepRoutes.length} routes`);
});

test("only the listed routes are open to anyone", () => {
  const open = sweepRoutes.filter((route) => !route.roles).map((route) => route.key);
  assert.deepEqual(
    open.sort(),
    [...PUBLIC_ROUTES].sort(),
    "a route without a sign-in check must be added to PUBLIC_ROUTES on purpose"
  );
});

test("every protected route refuses a request with no token or a bad one", async () => {
  for (const route of sweepRoutes.filter((r) => r.roles)) {
    assert.equal(
      await sweepStatus(route, null),
      401,
      `${route.key} (${route.where}) should refuse a request with no token`
    );
    assert.equal(
      await sweepStatus(route, "not.a.token"),
      401,
      `${route.key} (${route.where}) should refuse a made-up token`
    );
  }
});

test("every protected route refuses a signed-in user of the wrong role", async () => {
  const supervisor = await supervisorSession();
  const tokens = {
    student: studentToken,
    supervisor: supervisor.token,
    coordinator: coordinatorToken,
  };

  for (const route of sweepRoutes.filter((r) => r.roles)) {
    for (const [role, token] of Object.entries(tokens)) {
      if (route.roles.includes(role)) continue;
      assert.equal(
        await sweepStatus(route, token),
        403,
        `${route.key} (${route.where}) should refuse a ${role}`
      );
    }
  }
});

test("a student cannot use their token on another student's routes", async () => {
  const mine = sweepRoutes.filter(
    (route) => route.roles?.includes("student") && /:studentId\b/.test(route.path)
  );
  assert.ok(mine.length >= 15, `found only ${mine.length} student-scoped routes`);

  for (const route of mine) {
    const status = await sweepStatus(route, studentToken, "SOMEONE-ELSE-0000");
    assert.ok(
      status === 403 || status === 404,
      `${route.key} (${route.where}) answered ${status} for another student's id`
    );
  }
});
test("API answers are marked as not to be stored, except the two public ones", async () => {
  const stored = (path, token) =>
    fetch(new URL(path, apiBaseUrl), {
      headers: token ? authHeaders(token) : {},
    }).then(async (response) => {
      await response.body?.cancel();
      return response.headers.get("cache-control");
    });

  const id = encodeURIComponent(student.student_id);
  assert.equal(await stored(`/api/dashboard/${id}`, studentToken), "private, no-store");
  assert.equal(await stored("/api/coordinator/dashboard", coordinatorToken), "private, no-store");
  // A refusal says who is not signed in; it is not stored either.
  assert.equal(await stored(`/api/dashboard/${id}`, null), "private, no-store");

  assert.notEqual(await stored("/api/health", null), "private, no-store");
  assert.notEqual(await stored("/api/push/vapid-public-key", null), "private, no-store");

  // The live stream keeps its own header.
  assert.match(await stored("/api/events", coordinatorToken), /no-cache/);
});
test("an upload must really be the kind of file its name says", async () => {
  const supervisor = await supervisorSession();
  const timeIn = (bytes, name, type) => {
    const form = new FormData();
    form.set("student_id", student.student_id);
    form.set("image", new Blob([bytes], { type }), name);
    return jsonRequest("/api/attendance", {
      method: "POST",
      headers: authHeaders(studentToken),
      body: form,
    });
  };

  // Text renamed to .jpg, sent with an image type: the name and the claimed
  // type agree, the content does not.
  const renamed = await timeIn(Buffer.from("just some text"), "photo.jpg", "image/jpeg");
  assert.equal(renamed.response.status, 400);
  assert.match(renamed.body.message, /not a real JPG file/i);

  // A PNG sent under a .jpg name.
  const wrongKind = await timeIn(sampleFiles.png, "photo.jpg", "image/jpeg");
  assert.equal(wrongKind.response.status, 400);
  assert.match(wrongKind.body.message, /not a real JPG file/i);

  // A real JPEG gets past the file check; it is then refused only because
  // no camera check came with it.
  const real = await timeIn(sampleFiles.jpg, "photo.jpg", "image/jpeg");
  assert.equal(real.response.status, 400);
  assert.match(real.body.message, /camera check/i);

  // The same check guards the other upload routes: a task attachment...
  const task = new FormData();
  task.append("student_id", student.student_id);
  task.append("title", "Signature check");
  task.append("due_date", "2099-01-01");
  task.append("attachment", new Blob(["MZ not a pdf"], { type: "application/pdf" }), "brief.pdf");
  const fakePdf = await jsonRequest("/api/tasks", {
    method: "POST",
    headers: authHeaders(supervisor.token),
    body: task,
  });
  assert.equal(fakePdf.response.status, 400);
  assert.match(fakePdf.body.message, /not a real PDF file/i);

  // ...and a requirement document.
  const document = new FormData();
  document.append("doc_type", "Resume");
  document.append("file", new Blob(["plain text"], {
    type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  }), "resume.docx");
  const fakeDocx = await jsonRequest("/api/documents", {
    method: "POST",
    headers: authHeaders(studentToken),
    body: document,
  });
  assert.equal(fakeDocx.response.status, 400);
  assert.match(fakeDocx.body.message, /not a real DOCX file/i);
});
/*
| Crash reports from the browser
*/

test("a crash report keeps four short fields and nothing else", () => {
  // The rule itself, loaded straight from the source.
  require("tsx/cjs");
  const { clientErrorRecord, createRateLimiter } = require("../src/services/clientErrors.ts");

  const record = clientErrorRecord({
    message: "  Cannot read properties of undefined  ",
    stack: "Error: x\n    at Page (index.js:1:1)",
    route: "/reset-password?token=secret-token#top",
    version: "1f5c9a1",
    // None of these may survive.
    token: "Bearer abc",
    student_id: "DEMO-STU-0001",
    email: "someone@example.com",
    userAgent: "Mozilla/5.0",
    extra: { nested: true },
  });
  assert.deepEqual(Object.keys(record).sort(), ["message", "route", "stack", "version"]);
  assert.equal(record.message, "Cannot read properties of undefined");
  assert.equal(record.route, "/reset-password", "the query string is dropped");
  assert.equal(record.version, "1f5c9a1");

  const long = clientErrorRecord({
    message: "m".repeat(5000),
    stack: "s".repeat(50000),
    route: "/" + "r".repeat(5000),
    version: "v".repeat(500),
  });
  assert.equal(long.message.length, 500);
  assert.equal(long.stack.length, 4000);
  assert.equal(long.route.length, 200);
  assert.equal(long.version.length, 40);

  assert.equal(clientErrorRecord({ stack: "no message" }), null);
  assert.equal(clientErrorRecord({ message: 42 }), null);
  assert.equal(clientErrorRecord("text"), null);
  assert.equal(clientErrorRecord(null), null);
  assert.equal(clientErrorRecord({ message: "x", route: "javascript:alert(1)" }).route, "");
  assert.equal(clientErrorRecord({ message: "x", version: "<script>" }).version, "");

  // The limiter: ten in a window, then refused until the window passes.
  const allowed = createRateLimiter(10, 60_000);
  const results = Array.from({ length: 12 }, () => allowed("one-address", 1_000));
  assert.deepEqual(results, [...Array(10).fill(true), false, false]);
  assert.equal(allowed("another-address", 1_000), true, "each address is counted alone");
  assert.equal(allowed("one-address", 62_000), true, "a new window starts after a minute");
});

test("the crash report route is size-capped, validated and rate-limited", async () => {
  const send = (body, raw = false) =>
    fetch(new URL("/api/client-errors", apiBaseUrl), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: raw ? body : JSON.stringify(body),
    }).then(async (response) => {
      await response.body?.cancel();
      return response.status;
    });

  // Too large and unreadable bodies are refused before anything is counted.
  assert.equal(await send({ message: "x", stack: "s".repeat(20_000) }), 413);
  assert.equal(await send("{not json", true), 400);

  // Reports are accepted up to the limit, then refused. An earlier run in
  // the same minute may already have used some of the allowance.
  const statuses = [];
  for (let attempt = 0; attempt < 12; attempt += 1) {
    statuses.push(await send({ message: "Test crash report", route: "/test", version: "test" }));
  }
  assert.ok(statuses.every((status) => status === 204 || status === 429), statuses.join(","));
  assert.ok(statuses.filter((status) => status === 204).length <= 10, statuses.join(","));
  assert.equal(statuses.at(-1), 429, "the limit is reached within twelve reports");
  const firstRefusal = statuses.indexOf(429);
  assert.ok(statuses.slice(firstRefusal).every((status) => status === 429), "once refused, it stays refused");
});
test("monitoring takes an optional date range and is unchanged without one", async () => {
  const headers = authHeaders(coordinatorToken);
  const get = (query = "") => jsonRequest(`/api/coordinator/monitoring${query}`, { headers });

  const plain = await get();
  assert.equal(plain.response.status, 200);
  assert.deepEqual(Object.keys(plain.body), ["students"], "no new top-level field without a range");
  for (const row of plain.body.students) {
    assert.equal("period_hours" in row, false, "no period fields without a range");
    assert.equal("period_logs" in row, false);
  }

  // Empty parameters are the same as none (a cleared date field).
  const empty = await get("?from=&to=");
  assert.deepEqual(empty.body, plain.body);

  // A range that covers everything: the period equals the whole.
  const all = await get("?from=2000-01-01&to=2099-12-31");
  assert.equal(all.response.status, 200);
  assert.deepEqual(all.body.period, { from: "2000-01-01", to: "2099-12-31" });
  assert.equal(all.body.students.length, plain.body.students.length);
  for (const row of all.body.students) {
    const whole = plain.body.students.find((item) => item.student_id === row.student_id);
    assert.equal(row.period_hours, whole.hours_rendered, "period hours equal total hours");
    // Everything that was there before is still there, with the same value.
    for (const key of Object.keys(whole)) assert.deepEqual(row[key], whole[key], key);
  }

  // A range before any log: nothing in the period, overall progress intact.
  const none = await get("?from=1990-01-01&to=1990-12-31");
  for (const row of none.body.students) {
    const whole = plain.body.students.find((item) => item.student_id === row.student_id);
    assert.equal(row.period_hours, 0);
    assert.equal(row.period_logs, 0);
    assert.equal(row.hours_rendered, whole.hours_rendered);
    assert.equal(row.completion, whole.completion);
  }

  // One-sided ranges are allowed, and splitting the timeline loses nothing.
  const [before, after] = await Promise.all([get("?to=2020-12-31"), get("?from=2021-01-01")]);
  assert.deepEqual(before.body.period, { from: null, to: "2020-12-31" });
  for (const row of after.body.students) {
    const earlier = before.body.students.find((item) => item.student_id === row.student_id);
    const whole = plain.body.students.find((item) => item.student_id === row.student_id);
    assert.ok(Math.abs(earlier.period_hours + row.period_hours - whole.hours_rendered) < 0.01);
  }

  for (const bad of ["?from=10/01/2026", "?to=2026-13-40", "?from=2026-10-09&to=2026-10-01", "?from=yesterday"]) {
    assert.equal((await get(bad)).response.status, 400, bad);
  }
  assert.equal((await jsonRequest("/api/coordinator/monitoring?from=2026-01-01")).response.status, 401);
  assert.equal(
    (await jsonRequest("/api/coordinator/monitoring?from=2026-01-01", { headers: authHeaders(studentToken) })).response.status,
    403
  );
});

/*
| Break, back-to-work and time-out recorded offline
*/

test("the rules for a time recorded offline", () => {
  require("tsx/cjs");
  const { readOfflineStamp, offlineMaxAgeHours, CLOCK_SKEW_MS } = require("../src/services/offlineActions.ts");
  const now = new Date("2026-10-10T08:00:00.000Z");
  const ago = (minutes) => new Date(now.getTime() - minutes * 60_000).toISOString();
  const id = "3f2c1a9e-0b7d-4c55-9a11-7e2d5b8c4f10";
  const read = (body, action = "break", log = null) => readOfflineStamp(body, action, log, now, 12);

  // Neither field: an ordinary live request, whatever else is sent.
  assert.deepEqual(read({}), { kind: "live" });
  assert.deepEqual(read(undefined), { kind: "live" });
  assert.deepEqual(read({ note: "x" }), { kind: "live" });

  // Both fields, well formed, recent: accepted with the phone's time.
  const accepted = read({ occurred_at: ago(30), client_request_id: id });
  assert.equal(accepted.kind, "offline");
  assert.equal(accepted.requestId, id);
  assert.equal(accepted.occurredAt.toISOString(), ago(30));

  // One without the other, or malformed.
  assert.equal(read({ occurred_at: ago(30) }).status, 400);
  assert.equal(read({ client_request_id: id }).status, 400);
  assert.equal(read({ occurred_at: ago(30), client_request_id: "short" }).status, 400);
  assert.equal(read({ occurred_at: ago(30), client_request_id: "has spaces in it!" }).status, 400);
  assert.equal(read({ occurred_at: "2026-10-10 08:00", client_request_id: id }).status, 400, "no zone");
  assert.equal(read({ occurred_at: "yesterday", client_request_id: id }).status, 400);
  assert.equal(read({ occurred_at: 1791619200000, client_request_id: id }).status, 400, "a number");
  assert.equal(read({ occurred_at: "2026-13-45T25:00:00Z", client_request_id: id }).status, 400);

  // The future: refused beyond two minutes; within that, brought back to now.
  assert.equal(CLOCK_SKEW_MS, 120_000);
  assert.equal(read({ occurred_at: ago(-3), client_request_id: id }).status, 400);
  const slightlyAhead = read({ occurred_at: ago(-1), client_request_id: id });
  assert.equal(slightlyAhead.kind, "offline");
  assert.equal(slightlyAhead.occurredAt.getTime(), now.getTime());

  // Too old.
  assert.equal(read({ occurred_at: ago(12 * 60 - 1), client_request_id: id }).kind, "offline");
  const old = read({ occurred_at: ago(12 * 60 + 1), client_request_id: id }, "time-out");
  assert.equal(old.status, 409);
  assert.match(old.message, /missed time-out/);

  // Out of order: before a step already on the log.
  const log = { time_in: ago(240), break_time: ago(120), break_end_time: null };
  assert.equal(read({ occurred_at: ago(90), client_request_id: id }, "break-end", log).kind, "offline");
  assert.equal(read({ occurred_at: ago(150), client_request_id: id }, "break-end", log).status, 409);
  assert.equal(read({ occurred_at: ago(300), client_request_id: id }, "time-out", log).status, 409);

  // The age limit setting: a sensible number, or the default.
  assert.equal(offlineMaxAgeHours(undefined), 12);
  assert.equal(offlineMaxAgeHours("24"), 24);
  assert.equal(offlineMaxAgeHours("0"), 12);
  assert.equal(offlineMaxAgeHours("9999"), 12);
  assert.equal(offlineMaxAgeHours("soon"), 12);
});

test("offline steps are validated before anything is changed, and live requests are as before", async () => {
  const id = () => require("node:crypto").randomUUID();
  const minutesAgo = (minutes) => new Date(Date.now() - minutes * 60_000).toISOString();
  // A log id that does not exist: nothing can be changed by these requests.
  const send = (step, body, token = studentToken) =>
    jsonRequest(
      `/api/attendance/999999999/${step}`,
      body === undefined
        ? { method: "PUT", headers: token ? authHeaders(token) : {} }
        : token
          ? jsonBody(token, "PUT", body)
          : { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }
    );

  for (const step of ["break", "break-end", "time-out"]) {
    // Live requests: no body, or a body without the two fields.
    assert.equal((await send(step)).response.status, 404, `${step} with no body`);
    assert.equal((await send(step, {})).response.status, 404, `${step} with an empty body`);

    assert.equal((await send(step, { occurred_at: minutesAgo(5) })).response.status, 400, `${step} without its id`);
    assert.equal((await send(step, { client_request_id: id() })).response.status, 400, `${step} without its time`);
    assert.equal(
      (await send(step, { occurred_at: "10/10/2026 8:00", client_request_id: id() })).response.status,
      400,
      `${step} with a badly written time`
    );
    assert.equal(
      (await send(step, { occurred_at: minutesAgo(-30), client_request_id: id() })).response.status,
      400,
      `${step} in the future`
    );
    const tooOld = await send(step, { occurred_at: minutesAgo(60 * 24 * 4), client_request_id: id() });
    assert.equal(tooOld.response.status, 409, `${step} four days old`);

    // Well formed, but there is no such log of theirs: the usual answer.
    assert.equal(
      (await send(step, { occurred_at: minutesAgo(5), client_request_id: id() })).response.status,
      404,
      `${step} on a log that does not exist`
    );
    assert.equal(
      (await send(step, { occurred_at: minutesAgo(5), client_request_id: id() }, null)).response.status,
      401
    );
  }
});

test("an offline break, return and time-out are recorded once, in order, and marked", async (t) => {
  // This one writes a real log for the demo student, so it runs only where
  // that is wanted (the throwaway database in CI), never by default.
  if (process.env.ALLOW_TEST_WRITES !== "true") {
    t.skip("set ALLOW_TEST_WRITES=true to run against a throwaway database");
    return;
  }
  const supervisor = await supervisorSession();
  const form = new FormData();
  form.set("student_id", student.student_id);
  form.set("reason", "Automated test of offline steps");
  form.set("image", new Blob([sampleFiles.jpg], { type: "image/jpeg" }), "intern.jpg");
  const recorded = await jsonRequest("/api/supervisor/attendance/record", {
    method: "POST",
    headers: authHeaders(supervisor.token),
    body: form,
  });
  if (recorded.response.status === 409) {
    t.skip("the demo student already has a log today");
    return;
  }
  assert.ok(recorded.response.ok, JSON.stringify(recorded.body));
  const logId = recorded.body.attendance.id;
  const timeIn = new Date(recorded.body.attendance.time_in).getTime();
  const uuid = () => require("node:crypto").randomUUID();
  const step = (name, body) =>
    jsonRequest(`/api/attendance/${logId}/${name}`, jsonBody(studentToken, "PUT", body));
  // Whole seconds after the time-in, as if pressed while offline a moment ago.
  const at = (seconds) => new Date(Math.floor(timeIn / 1000) * 1000 + seconds * 1000).toISOString();
  await new Promise((resolve) => setTimeout(resolve, 4200));

  // A step dated before the time-in cannot be right.
  const before = await step("break", {
    occurred_at: new Date(timeIn - 60_000).toISOString(),
    client_request_id: uuid(),
  });
  assert.equal(before.response.status, 409);

  const breakId = uuid();
  const first = await step("break", { occurred_at: at(1), client_request_id: breakId });
  assert.equal(first.response.status, 200, JSON.stringify(first.body));
  assert.equal(first.body.attendance.recorded_offline, true);
  assert.equal(
    new Date(first.body.attendance.break_time).toISOString(),
    at(1),
    "the time recorded is the one the phone sent"
  );

  // The same action again (the app retries until it hears back): the same
  // answer, and nothing changes.
  const again = await step("break", { occurred_at: at(1), client_request_id: breakId });
  assert.equal(again.response.status, 200);
  assert.equal(again.body.replayed, true);
  assert.equal(again.body.attendance.break_time, first.body.attendance.break_time);

  // The id cannot be reused for a different action.
  const reused = await step("break-end", { occurred_at: at(2), client_request_id: breakId });
  assert.equal(reused.response.status, 409);

  // Returning before the break started is refused; after it, accepted.
  const tooEarly = await step("break-end", {
    occurred_at: new Date(timeIn - 1000).toISOString(),
    client_request_id: uuid(),
  });
  assert.equal(tooEarly.response.status, 409);
  const back = await step("break-end", { occurred_at: at(2), client_request_id: uuid() });
  assert.equal(back.response.status, 200, JSON.stringify(back.body));

  const outId = uuid();
  // A time-out carries the note of the day's work; too short a note is refused.
  const noNote = await step("time-out", { occurred_at: at(3), client_request_id: uuid(), accomplishments: "Too short" });
  assert.equal(noNote.response.status, 400);
  const dayNote = "Encoded 40 inventory records and checked them against the ledger.";
  const out = await step("time-out", { occurred_at: at(3), client_request_id: outId, accomplishments: `  ${dayNote}  ` });
  assert.equal(out.response.status, 200, JSON.stringify(out.body));
  assert.equal(out.body.attendance.recorded_offline, true);
  assert.equal(out.body.attendance.accomplishments, dayNote, "stored without the outer spaces");
  assert.equal(new Date(out.body.attendance.time_out).toISOString(), at(3));
  const outAgain = await step("time-out", { occurred_at: at(3), client_request_id: outId });
  assert.equal(outAgain.body.replayed, true);
  assert.equal(outAgain.body.attendance.time_out, out.body.attendance.time_out);

  // The supervisor and the student both see that the log has offline steps.
  const list = await jsonRequest(
    `/api/supervisor/attendance/${encodeURIComponent(supervisor.supervisor.supervisor_id)}`,
    { headers: authHeaders(supervisor.token) }
  );
  assert.equal(list.body.attendance.find((log) => log.id === logId).recorded_offline, true);
  assert.equal(list.body.attendance.find((log) => log.id === logId).accomplishments, dayNote, "the supervisor sees the note");
  const own = await jsonRequest(`/api/attendance/${encodeURIComponent(student.student_id)}`, {
    headers: authHeaders(studentToken),
  });
  assert.equal(own.body.attendance.find((log) => log.id === logId).recorded_offline, true);
});


/*
| Where a notification leads
*/

test("every kind of notification is given a page inside the app", () => {
  require("tsx/cjs");
  const { notificationLink, safeLink, NOTIFICATION_PAGE } = require("../src/services/notificationLinks.ts");

  // [role, type, title, expected page]: the titles the server really writes.
  const cases = [
    ["student", "attendance", "Attendance verified", "/daily-log"],
    ["student", "attendance", "Time-in recorded by your supervisor", "/daily-log"],
    ["student", "attendance", "Absence excused", "/daily-log"],
    ["student", "info", "New task assigned", "/task"],
    ["student", "info", "Revisions requested", "/task"],
    ["student", "task", "Task deadline reached", "/task"],
    ["student", "document", "Document approved", "/documents"],
    ["student", "evaluation", "New evaluation received", "/student/feedback"],
    ["student", "schedule", "OJT schedule updated", "/schedule"],
    ["student", "info", "Supervisor assigned", "/schedule"],
    ["student", "success", "Complaint resolved", "/report"],
    ["student", "info", "Reply on your complaint", "/report"],
    ["student", "info", "Welcome to INTERNet", "/student/dashboard"],
    ["student", "info", "Required hours changed", "/student/dashboard"],
    ["student", "announcement", "Announcement: Orientation", "/announcements"],
    ["supervisor", "attendance", "Attendance log awaiting verification", "/supervisor/dashboard"],
    ["supervisor", "attendance", "Attendance log ready to verify", "/supervisor/dashboard"],
    ["supervisor", "attendance", "Absence filed for review", "/supervisor/dashboard"],
    ["supervisor", "info", "Task submitted", "/supervisor/dashboard"],
    ["supervisor", "document", "Document submitted for review", "/supervisor/dashboard"],
    ["supervisor", "task", "Task past its deadline", "/supervisor/tasks"],
    ["supervisor", "attendance", "Coordinator decided an attendance log", "/supervisor/attendance"],
    ["supervisor", "info", "New intern assigned", "/supervisor/interns"],
    ["supervisor", "schedule", "Intern schedule updated", "/supervisor/interns"],
    ["supervisor", "document", "New document required", "/supervisor/documents"],
    ["supervisor", "info", "Complaint resolved", "/supervisor/complaints"],
    ["supervisor", "announcement", "Announcement: Orientation", "/supervisor/announcements"],
    ["coordinator", "warning", "New complaint filed", "/coordinator/complaints"],
    ["coordinator", "warning", "Reply on a complaint", "/coordinator/complaints"],
    ["coordinator", "attendance", "Attendance log rejected", "/coordinator/monitoring"],
    ["coordinator", "evaluation", "New company feedback", "/coordinator/evaluations"],
    ["coordinator", "info", "Something new", "/coordinator/notifications"],
  ];
  for (const [role, type, title, expected] of cases) {
    assert.equal(notificationLink(role, type, title), expected, `${role}: "${title}"`);
  }

  // A notification about one student takes the coordinator to that student.
  assert.equal(
    notificationLink("coordinator", "attendance", "Student completed required hours", {
      type: "student",
      id: "2021-0001 A/B",
    }),
    "/coordinator/students/2021-0001%20A%2FB"
  );
  // Nothing falls through to "no page": the full list is always the fallback.
  for (const role of ["student", "supervisor", "coordinator"]) {
    const link = notificationLink(role, undefined, "");
    assert.equal(link, NOTIFICATION_PAGE[role]);
    assert.ok(link.startsWith("/"));
  }

  // A link a caller supplies is kept only if it is a path inside the app.
  assert.equal(safeLink("/task"), "/task");
  assert.equal(safeLink("/coordinator/students/2021-0001?tab=logs"), "/coordinator/students/2021-0001?tab=logs");
  assert.equal(safeLink("https://example.com/"), null);
  assert.equal(safeLink("//example.com/x"), null);
  assert.equal(safeLink("javascript:alert(1)"), null);
  assert.equal(safeLink("task"), null);
  assert.equal(safeLink("/a b"), null);
  assert.equal(safeLink("/" + "a".repeat(400)), null);
  assert.equal(safeLink(undefined), null);
  assert.equal(safeLink(42), null);
});

test("notification lists carry the page and record for each notification", async () => {
  const supervisor = await supervisorSession();
  const lists = [
    [`/api/notifications/student/${encodeURIComponent(student.student_id)}`, studentToken],
    [`/api/notifications/supervisor/${encodeURIComponent(supervisor.supervisor.supervisor_id)}`, supervisor.token],
    [`/api/notifications/coordinator/${encodeURIComponent(coordinator.coordinator_id)}`, coordinatorToken],
  ];
  for (const [path, token] of lists) {
    const { response, body } = await jsonRequest(path, { headers: authHeaders(token) });
    assert.equal(response.status, 200, path);
    assert.ok(Array.isArray(body.notifications), path);
    for (const item of body.notifications) {
      // The three fields are always present; older rows hold nulls.
      for (const key of ["link", "entity_type", "entity_id"]) assert.ok(key in item, `${path}: ${key}`);
      if (item.link !== null) assert.match(item.link, /^\/(?!\/)/, `${path}: a path inside the app`);
      // Everything that was returned before is still returned.
      for (const key of ["id", "title", "message", "type", "is_read", "created_at"]) assert.ok(key in item, key);
    }
  }

  // Where the write test has run (CI), the notifications it caused are new
  // ones, so they must have their page and their record.
  if (process.env.ALLOW_TEST_WRITES === "true") {
    const mine = await jsonRequest(lists[0][0], { headers: authHeaders(studentToken) });
    const verified = mine.body.notifications.find((item) => item.title === "Attendance verified");
    if (verified) {
      assert.equal(verified.link, "/daily-log");
    }
    const recorded = mine.body.notifications.find((item) => item.title === "Time-in recorded by your supervisor");
    if (recorded) {
      assert.equal(recorded.link, "/daily-log");
      assert.equal(recorded.entity_type, "attendance");
      assert.match(String(recorded.entity_id), /^\d+$/);
    }
  }
});


/*
| Audit log
*/

test("the audit rules name each action and keep only the listed facts", () => {
  require("tsx/cjs");
  const { auditEntryFor, AUDIT_RULES } = require("../src/services/audit.ts");
  const entry = (method, path, source = {}) =>
    auditEntryFor(method, path, { params: {}, body: {}, result: {}, ...source });

  // Every rule points at a route that exists, so a renamed route cannot
  // silently stop being logged.
  const known = new Set(sweepRoutes.map((route) => route.key));
  for (const rule of AUDIT_RULES) {
    assert.ok(known.has(`${rule.method} ${rule.path}`), `no such route: ${rule.method} ${rule.path}`);
  }
  // And every audited route is one a signed-in account must be allowed to use.
  for (const rule of AUDIT_RULES) {
    const route = sweepRoutes.find((item) => item.key === `${rule.method} ${rule.path}`);
    assert.ok(route.roles || rule.path === "/api/documents/:documentId/review", `${rule.path} has no role check`);
  }

  // Attendance: one route, three actions.
  const status = "/api/attendance/:id/status";
  assert.equal(entry("PATCH", status, { params: { id: "7" }, body: { status: "Verified" } }).action, "attendance.approve");
  assert.equal(entry("PATCH", status, { params: { id: "7" }, body: { status: "Rejected", reason: "No photo" } }).action, "attendance.rejected");
  const undone = entry("PATCH", status, { params: { id: "7" }, body: { status: "Pending" } });
  assert.deepEqual(
    { action: undone.action, type: undone.entityType, id: undone.entityId },
    { action: "attendance.undo", type: "attendance", id: "7" }
  );

  // Only the named fields are kept. A password can never be.
  const reset = entry("POST", "/api/coordinator/:kind/:id/reset-password", {
    params: { kind: "students", id: "2021-0001" },
    body: { password: "SuperSecret123!", extra: "x" },
  });
  assert.deepEqual(reset, {
    action: "account.password_reset",
    entityType: "student",
    entityId: "2021-0001",
    details: {},
  });
  const created = entry("POST", "/api/coordinator/students", {
    body: { student_id: "2021-0002", name: "A Student", email: "a@b.c", password: "SuperSecret123!", company: "Acme" },
  });
  assert.equal(created.entityId, "2021-0002");
  assert.deepEqual(created.details, { name: "A Student", company: "Acme" });
  assert.equal(JSON.stringify(AUDIT_RULES.map((rule) => rule.keep || [])).includes("password"), false);

  // Long text is cut; objects are dropped.
  const long = entry("PATCH", status, { params: { id: "1" }, body: { status: "Rejected", reason: "x".repeat(900) } });
  assert.equal(long.details.reason.length, 300);
  const odd = entry("PATCH", status, { params: { id: "1" }, body: { status: "Rejected", reason: { nested: true } } });
  assert.equal("reason" in odd.details, false);

  // Ids that only exist in the answer.
  assert.equal(
    entry("POST", "/api/supervisor/attendance/record", {
      body: { student_id: "S1", reason: "Camera broken" },
      result: { attendance: { id: 42 } },
    }).entityId,
    "42"
  );
  assert.equal(entry("PATCH", "/api/coordinator/students/:studentId/status", { params: { studentId: "S1" }, body: { is_active: false } }).action, "account.deactivate");
  assert.equal(entry("PATCH", "/api/coordinator/students/:studentId/status", { params: { studentId: "S1" }, body: { is_active: true } }).action, "account.activate");

  // Not audited: reading, and actions on one's own record.
  assert.equal(entry("GET", "/api/coordinator/students"), null);
  assert.equal(entry("PUT", "/api/attendance/:id/break"), null);
  assert.equal(entry("PATCH", status, { params: { id: "1" }, body: {} }), null, "no status, no entry");
});

test("the audit log is coordinator-only, read-only and paged", async () => {
  const path = "/api/coordinator/audit";
  assert.equal((await jsonRequest(path)).response.status, 401);
  assert.equal((await jsonRequest(path, { headers: authHeaders(studentToken) })).response.status, 403);
  const supervisor = await supervisorSession();
  assert.equal((await jsonRequest(path, { headers: authHeaders(supervisor.token) })).response.status, 403);

  const headers = authHeaders(coordinatorToken);
  const first = await jsonRequest(`${path}?limit=5`, { headers });
  assert.equal(first.response.status, 200);
  assert.ok(Array.isArray(first.body.entries));
  assert.equal(typeof first.body.total, "number");
  assert.equal(first.body.limit, 5);
  assert.ok(first.body.entries.length <= 5);
  for (const row of first.body.entries) {
    for (const key of ["id", "actor_role", "actor_id", "action", "details", "created_at"]) assert.ok(key in row, key);
    assert.equal("ip_hash" in row, false, "the address hash is not sent to the browser");
    assert.equal(JSON.stringify(row.details).toLowerCase().includes("password"), false);
  }
  // Newest first.
  const times = first.body.entries.map((row) => new Date(row.created_at).getTime());
  assert.deepEqual(times, [...times].sort((a, b) => b - a));

  // Past the end: no rows, the same total.
  const beyond = await jsonRequest(`${path}?limit=5&offset=1000000`, { headers });
  assert.equal(beyond.body.entries.length, 0);
  assert.equal(beyond.body.total, first.body.total);
  // Limits are kept within bounds.
  assert.equal((await jsonRequest(`${path}?limit=99999`, { headers })).body.limit, 200);
  assert.equal((await jsonRequest(`${path}?limit=-3&offset=-9`, { headers })).body.offset, 0);

  // Filters.
  const none = await jsonRequest(`${path}?from=1990-01-01&to=1990-12-31`, { headers });
  assert.equal(none.body.total, 0);
  assert.equal((await jsonRequest(`${path}?from=31-12-2026`, { headers })).response.status, 400);
  assert.equal((await jsonRequest(`${path}?from=2026-10-09&to=2026-10-01`, { headers })).response.status, 400);
  assert.equal((await jsonRequest(`${path}?actor_role=admin`, { headers })).response.status, 400);
  const onlyAttendance = await jsonRequest(`${path}?action=attendance&limit=200`, { headers });
  assert.ok(onlyAttendance.body.entries.every((row) => row.action.startsWith("attendance.")));

  // There is no way to change it.
  for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
    const attempt = await jsonRequest(path, jsonBody(coordinatorToken, method, { action: "x" }));
    assert.equal(attempt.response.status, 404, `${method} must not exist`);
  }
});

test("an audited action writes exactly one row, with who did it", async (t) => {
  // Needs a real change to observe, so it runs only on a throwaway database.
  if (process.env.ALLOW_TEST_WRITES !== "true") {
    t.skip("set ALLOW_TEST_WRITES=true to run against a throwaway database");
    return;
  }
  const headers = authHeaders(coordinatorToken);
  const count = async (query) => (await jsonRequest(`/api/coordinator/audit?${query}`, { headers })).body.total;
  const before = await count("action=account.deactivate");

  const id = encodeURIComponent(student.student_id);
  const off = await jsonRequest(`/api/coordinator/students/${id}/status`, jsonBody(coordinatorToken, "PATCH", { is_active: false }));
  assert.equal(off.response.status, 200, JSON.stringify(off.body));
  const on = await jsonRequest(`/api/coordinator/students/${id}/status`, jsonBody(coordinatorToken, "PATCH", { is_active: true }));
  assert.equal(on.response.status, 200, JSON.stringify(on.body));
  // The row is written after the answer is sent; give it a moment.
  await new Promise((resolve) => setTimeout(resolve, 400));

  assert.equal(await count("action=account.deactivate"), before + 1);
  const latest = await jsonRequest("/api/coordinator/audit?action=account&limit=2", { headers });
  assert.deepEqual(latest.body.entries.map((row) => row.action), ["account.activate", "account.deactivate"]);
  for (const row of latest.body.entries) {
    assert.equal(row.actor_role, "coordinator");
    assert.equal(row.actor_id, coordinator.coordinator_id);
    assert.equal(row.entity_type, "student");
    assert.equal(row.entity_id, student.student_id);
    assert.ok(row.actor_name, "the actor's name is filled in");
  }
  // A refused request writes nothing.
  const refused = await jsonRequest(`/api/coordinator/students/${id}/status`, jsonBody(studentToken, "PATCH", { is_active: false }));
  assert.equal(refused.response.status, 403);
  await new Promise((resolve) => setTimeout(resolve, 300));
  assert.equal(await count("action=account.deactivate"), before + 1);

  // The student's sign-in from the start of this run was ended by the
  // deactivation; sign in again for any test that follows.
  const again = await login("student", studentEmail, studentPassword);
  studentToken = again.token;
});


/*
| Companies
*/

test("company records are coordinator-only and validated; the old name list is unchanged", async () => {
  const path = "/api/coordinator/company-records";
  assert.equal((await jsonRequest(path)).response.status, 401);
  assert.equal((await jsonRequest(path, { headers: authHeaders(studentToken) })).response.status, 403);
  const supervisor = await supervisorSession();
  assert.equal((await jsonRequest(path, { headers: authHeaders(supervisor.token) })).response.status, 403);

  const list = await jsonRequest(path, { headers: authHeaders(coordinatorToken) });
  assert.equal(list.response.status, 200);
  assert.ok(Array.isArray(list.body.companies));
  assert.ok(Array.isArray(list.body.unlinked));
  for (const company of list.body.companies) {
    for (const key of ["id", "name", "is_active", "active_students", "students", "supervisors"]) {
      assert.ok(key in company, key);
    }
  }

  // The route the announcements page uses still answers with plain names.
  const names = await jsonRequest("/api/coordinator/companies", { headers: authHeaders(coordinatorToken) });
  assert.equal(names.response.status, 200);
  assert.deepEqual(Object.keys(names.body), ["companies"]);
  assert.ok(names.body.companies.every((name) => typeof name === "string"));

  // Refused before anything is written.
  const post = (body) => jsonRequest(path, jsonBody(coordinatorToken, "POST", body));
  assert.equal((await post({})).response.status, 400);
  assert.equal((await post({ name: "A" })).response.status, 400);
  assert.equal((await post({ name: "Valid Name", contact_email: "not-an-email" })).response.status, 400);
  assert.equal((await post({ name: "Valid Name", moa_start: "01/02/2026" })).response.status, 400);
  assert.equal((await post({ name: "Valid Name", moa_start: "2026-06-01", moa_expiry: "2026-01-01" })).response.status, 400);
  assert.equal((await post({ name: "Valid Name", slots: -1 })).response.status, 400);
  assert.equal((await post({ name: "Valid Name", slots: 2.5 })).response.status, 400);
  assert.equal((await jsonRequest(path, jsonBody(studentToken, "POST", { name: "Valid Name" }))).response.status, 403);

  // Unknown records.
  const put = (id, body) => jsonRequest(`${path}/${id}`, jsonBody(coordinatorToken, "PUT", body));
  assert.equal((await put("999999999", { name: "Valid Name" })).response.status, 404);
  assert.equal((await put("abc", { name: "Valid Name" })).response.status, 404);
  const status = (id, body) => jsonRequest(`${path}/${id}/status`, jsonBody(coordinatorToken, "PATCH", body));
  assert.equal((await status("999999999", { is_active: false })).response.status, 404);
  assert.equal((await status("1", { is_active: "no" })).response.status, 400);
  // No route deletes a company.
  assert.equal((await jsonRequest(`${path}/1`, jsonBody(coordinatorToken, "DELETE", {}))).response.status, 404);
});

test("a company record links the accounts that carry its name, and a rename carries them along", async (t) => {
  if (process.env.ALLOW_TEST_WRITES !== "true") {
    t.skip("set ALLOW_TEST_WRITES=true to run against a throwaway database");
    return;
  }
  const path = "/api/coordinator/company-records";
  const headers = authHeaders(coordinatorToken);
  const records = async () => (await jsonRequest(path, { headers })).body;
  // The demo student and supervisor both carry this name.
  const demoName = student.company;
  assert.ok(demoName, "the demo student has a company");

  let all = await records();
  let record = all.companies.find((company) => company.name.toLowerCase() === demoName.toLowerCase());
  if (!record) {
    assert.ok(all.unlinked.some((item) => item.name.toLowerCase() === demoName.toLowerCase()), "listed as not yet recorded");
    // Different capitals and outer spaces: still the same company.
    const created = await jsonRequest(path, jsonBody(coordinatorToken, "POST", {
      name: `  ${demoName.toUpperCase()}  `,
      contact_person: "Test Contact",
      contact_email: "contact@example.com",
      moa_start: "2026-01-01",
      moa_expiry: "2027-01-01",
      slots: 5,
    }));
    assert.equal(created.response.status, 201, JSON.stringify(created.body));
    assert.equal(created.body.company.moa_expiry, "2027-01-01");
    all = await records();
    record = all.companies.find((company) => company.id === created.body.company.id);
  }
  assert.ok(record.active_students >= 1, "the demo student is counted");
  assert.ok(record.supervisors >= 1, "the demo supervisor is counted");
  assert.ok(!all.unlinked.some((item) => item.name.toLowerCase() === demoName.toLowerCase()));

  // The same name again is refused, whatever its capitals.
  const duplicate = await jsonRequest(path, jsonBody(coordinatorToken, "POST", { name: demoName.toLowerCase() }));
  assert.equal(duplicate.response.status, 409);

  // Renaming rewrites the name on its people; renaming back restores it.
  const renamed = `${demoName} (renamed)`;
  const edit = (name) => jsonRequest(`${path}/${record.id}`, jsonBody(coordinatorToken, "PUT", { name, slots: 5 }));
  assert.equal((await edit(renamed)).response.status, 200);
  const profile = () => jsonRequest(`/api/student/${encodeURIComponent(student.student_id)}`, { headers: authHeaders(studentToken) });
  const during = await profile();
  assert.equal(JSON.stringify(during.body).includes(renamed), true, "the student now shows the new name");
  assert.equal((await edit(demoName)).response.status, 200);
  const after = await profile();
  assert.equal(JSON.stringify(after.body).includes(renamed), false);

  // An account edited to a name with no record becomes unlinked; back again, linked.
  const editStudent = (company) => jsonRequest(
    `/api/coordinator/students/${encodeURIComponent(student.student_id)}`,
    jsonBody(coordinatorToken, "PUT", { name: student.name, email: student.email, program: student.program, company })
  );
  assert.equal((await editStudent("Somewhere With No Record")).response.status, 200);
  all = await records();
  assert.ok(all.unlinked.some((item) => item.name === "Somewhere With No Record"));
  assert.equal((await editStudent(demoName)).response.status, 200);
  all = await records();
  assert.ok(!all.unlinked.some((item) => item.name === "Somewhere With No Record"));
  assert.ok(all.companies.find((company) => company.id === record.id).active_students >= 1);

  // Inactive and active again.
  const off = await jsonRequest(`${path}/${record.id}/status`, jsonBody(coordinatorToken, "PATCH", { is_active: false }));
  assert.equal(off.body.company.is_active, false);
  const on = await jsonRequest(`${path}/${record.id}/status`, jsonBody(coordinatorToken, "PATCH", { is_active: true }));
  assert.equal(on.body.company.is_active, true);
});


/*
| Paged lists
*/

test("the paging rules: what is read, refused and built", () => {
  require("tsx/cjs");
  const { readListRequest, buildListQuery, MAX_PAGE_SIZE } = require("../src/services/listQuery.ts");

  assert.deepEqual(readListRequest({}).request, { limit: null, offset: 0, q: "", status: "", from: "", to: "" });
  assert.equal(readListRequest({ limit: "25", offset: "50" }).request.limit, 25);
  assert.equal(readListRequest({ limit: "99999" }).request.limit, MAX_PAGE_SIZE);
  for (const bad of [{ limit: "0" }, { limit: "-1" }, { limit: "ten" }, { limit: "1.5" }, { offset: "-1" }, { offset: "x" },
    { from: "2026/10/01" }, { to: "2026-13-40" }, { from: "2026-10-09", to: "2026-10-01" }, { q: "x".repeat(101) }]) {
    assert.ok("problem" in readListRequest(bad), JSON.stringify(bad));
  }

  const sql = "SELECT a.id, a.status, s.name AS student_name, a.date FROM a ORDER BY a.date DESC LIMIT 300";
  const options = { order: "date DESC, id DESC", search: ["student_name"], status: "status", date: "date" };
  const request = (overrides) => ({ limit: null, offset: 0, q: "", status: "", from: "", to: "", ...overrides });

  // Nothing asked for: the route's own query runs untouched.
  assert.equal(buildListQuery(sql, 1, options, request({})), null);
  // Parameters the route does not offer are ignored, not applied.
  assert.equal(buildListQuery(sql, 1, { order: "date DESC" }, request({ q: "ana", status: "Pending", from: "2026-01-01" })), null);

  const built = buildListQuery(sql, 1, options, request({ limit: 10, offset: 20, q: "50%_off", status: "Pending", from: "2026-10-01", to: "2026-10-31" }));
  // Values are parameters, numbered after the route's own.
  assert.deepEqual(built.values, ["%50\\%\\_off%", "Pending", "2026-10-01", "2026-10-31", 10, 20]);
  assert.deepEqual(built.countValues, ["%50\\%\\_off%", "Pending", "2026-10-01", "2026-10-31"]);
  assert.match(built.rowsSql, /ILIKE \$2/);
  assert.match(built.rowsSql, /LIMIT \$6 OFFSET \$7$/);
  assert.match(built.rowsSql, /ORDER BY page\."date" DESC, page\."id" DESC/);
  // The route's fixed cap is lifted for a paged request; nothing typed reaches the SQL.
  assert.equal(/LIMIT 300/.test(built.rowsSql), false);
  assert.equal(built.rowsSql.includes("50%_off"), false);
  assert.equal(built.rowsSql.includes("Pending"), false);
  assert.equal(/LIMIT|OFFSET/.test(built.countSql), false);

  // A column name can only come from the route, and must look like one.
  assert.throws(() => buildListQuery(sql, 0, { order: "name; DROP TABLE x" }, request({ limit: 5 })));
  assert.throws(() => buildListQuery(sql, 0, { order: "name", search: ['x" OR 1=1 --'] }, request({ q: "a" })));
});

test("list routes page on request and are unchanged without it", async () => {
  const supervisor = await supervisorSession();
  const lists = [
    ["/api/coordinator/students", "students", coordinatorToken],
    ["/api/coordinator/supervisors", "supervisors", coordinatorToken],
    ["/api/coordinator/complaints", "complaints", coordinatorToken],
    ["/api/coordinator/documents", "documents", coordinatorToken],
    ["/api/coordinator/discrepancies", "discrepancies", coordinatorToken],
    [`/api/supervisor/attendance/${encodeURIComponent(supervisor.supervisor.supervisor_id)}`, "attendance", supervisor.token],
  ];
  for (const [path, key, token] of lists) {
    const get = (query = "") => jsonRequest(`${path}${query}`, { headers: authHeaders(token) });
    const whole = await get();
    assert.equal(whole.response.status, 200, path);
    assert.ok(Array.isArray(whole.body[key]), `${path}: ${key}`);
    for (const added of ["total", "limit", "offset"]) {
      assert.equal(added in whole.body, false, `${path}: no ${added} without paging`);
    }
    const all = whole.body[key];

    // First page.
    const first = await get("?limit=1");
    assert.equal(first.response.status, 200, `${path}?limit=1 ${JSON.stringify(first.body)}`);
    assert.equal(first.body.limit, 1);
    assert.equal(first.body.offset, 0);
    assert.equal(first.body[key].length, Math.min(1, first.body.total));
    assert.ok(first.body.total >= all.length, `${path}: total covers every row`);
    if (all.length > 0) assert.deepEqual(first.body[key][0], all[0], `${path}: the same first row, in the same order`);

    // Last page, and one past the end.
    if (first.body.total > 0) {
      const last = await get(`?limit=1&offset=${first.body.total - 1}`);
      assert.equal(last.body[key].length, 1, `${path}: last page`);
    }
    const beyond = await get(`?limit=5&offset=${first.body.total + 100}`);
    assert.equal(beyond.body[key].length, 0);
    assert.equal(beyond.body.total, first.body.total);

    // Everything in two pages equals the whole.
    if (all.length >= 2 && first.body.total === all.length) {
      const half = Math.ceil(all.length / 2);
      const [a, b] = await Promise.all([get(`?limit=${half}`), get(`?limit=${half}&offset=${half}`)]);
      assert.deepEqual([...a.body[key], ...b.body[key]].map((row) => row.id), all.map((row) => row.id), `${path}: pages join up`);
    }

    // Refused when badly written; still role-checked.
    for (const bad of ["?limit=0", "?limit=abc", "?offset=-2", "?from=01-02-2026", "?from=2026-10-09&to=2026-10-01"]) {
      assert.equal((await get(bad)).response.status, 400, `${path}${bad}`);
    }
    assert.equal((await jsonRequest(`${path}?limit=1`)).response.status, 401);
    assert.equal((await jsonRequest(`${path}?limit=1`, { headers: authHeaders(studentToken) })).response.status, 403);
  }

  // A supervisor still only reaches their own interns' logs when paging.
  const other = await jsonRequest("/api/supervisor/attendance/SOMEONE-ELSE?limit=5", { headers: authHeaders(supervisor.token) });
  assert.ok([403, 404].includes(other.response.status), `another supervisor's list answered ${other.response.status}`);

  // Filters narrow the list and never widen it.
  const everyone = await jsonRequest("/api/coordinator/students?limit=200", { headers: authHeaders(coordinatorToken) });
  const nobody = await jsonRequest("/api/coordinator/students?limit=200&q=zzzz-no-such-student", { headers: authHeaders(coordinatorToken) });
  assert.equal(nobody.body.total, 0);
  const demo = await jsonRequest(`/api/coordinator/students?limit=200&q=${encodeURIComponent(student.student_id)}`, { headers: authHeaders(coordinatorToken) });
  assert.ok(demo.body.total >= 1 && demo.body.total <= everyone.body.total);
  const past = await jsonRequest("/api/coordinator/discrepancies?limit=50&from=1990-01-01&to=1990-12-31", { headers: authHeaders(coordinatorToken) });
  assert.equal(past.body.total, 0);
});


/*
| Terms
*/

test("terms are coordinator-only and validated", async () => {
  const path = "/api/coordinator/terms";
  assert.equal((await jsonRequest(path)).response.status, 401);
  assert.equal((await jsonRequest(path, { headers: authHeaders(studentToken) })).response.status, 403);

  const list = await jsonRequest(path, { headers: authHeaders(coordinatorToken) });
  assert.equal(list.response.status, 200);
  assert.ok(Array.isArray(list.body.terms));
  assert.equal(typeof list.body.unassigned_active_students, "number");

  const post = (body) => jsonRequest(path, jsonBody(coordinatorToken, "POST", body));
  assert.equal((await post({})).response.status, 400);
  assert.equal((await post({ name: "T", start_date: "2026-01-01", end_date: "2026-05-01" })).response.status, 400);
  assert.equal((await post({ name: "A term", start_date: "01/01/2026", end_date: "2026-05-01" })).response.status, 400);
  assert.equal((await post({ name: "A term", start_date: "2026-06-01", end_date: "2026-01-01" })).response.status, 400);
  assert.equal((await jsonRequest(path, jsonBody(studentToken, "POST", { name: "A term", start_date: "2026-01-01", end_date: "2026-05-01" }))).response.status, 403);

  // Unknown terms.
  for (const action of ["close", "reopen", "students"]) {
    assert.equal((await jsonRequest(`${path}/999999999/${action}`, jsonBody(coordinatorToken, "POST", { unassigned: true }))).response.status, 404, action);
    assert.equal((await jsonRequest(`${path}/abc/${action}`, jsonBody(coordinatorToken, "POST", {}))).response.status, 404, action);
  }
  assert.equal((await jsonRequest(`${path}/999999999`, jsonBody(coordinatorToken, "PUT", { name: "A term", start_date: "2026-01-01", end_date: "2026-05-01" }))).response.status, 404);
  // No route deletes a term.
  assert.equal((await jsonRequest(`${path}/1`, jsonBody(coordinatorToken, "DELETE", {}))).response.status, 404);

  // The student list's term filter.
  const students = (query) => jsonRequest(`/api/coordinator/students${query}`, { headers: authHeaders(coordinatorToken) });
  assert.equal((await students("?term=abc")).response.status, 400);
  assert.equal((await students("?term=999999999")).body.students.length, 0);
  const all = await students("");
  const without = await students("?term=none");
  assert.ok(without.body.students.length <= all.body.students.length);
  for (const row of all.body.students) assert.ok("term_id" in row && "term_name" in row);
});

test("closing a term deactivates its students and keeps their records; reopening restores them", async (t) => {
  if (process.env.ALLOW_TEST_WRITES !== "true") {
    t.skip("set ALLOW_TEST_WRITES=true to run against a throwaway database");
    return;
  }
  const path = "/api/coordinator/terms";
  const headers = authHeaders(coordinatorToken);
  const name = `Test term ${Date.now()}`;
  const today = new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10);

  const created = await jsonRequest(path, jsonBody(coordinatorToken, "POST", { name, start_date: "2026-01-01", end_date: "2099-12-31" }));
  assert.equal(created.response.status, 201, JSON.stringify(created.body));
  const id = created.body.term.id;
  assert.equal(created.body.term.students, 0);
  assert.equal((await jsonRequest(path, jsonBody(coordinatorToken, "POST", { name: name.toUpperCase(), start_date: "2026-01-01", end_date: "2026-02-01" }))).response.status, 409);

  // Put the demo student in it.
  const bad = await jsonRequest(`${path}/${id}/students`, jsonBody(coordinatorToken, "POST", { student_ids: [] }));
  assert.equal(bad.response.status, 400);
  const added = await jsonRequest(`${path}/${id}/students`, jsonBody(coordinatorToken, "POST", { student_ids: [student.student_id] }));
  assert.equal(added.body.count, 1, JSON.stringify(added.body));
  const inTerm = await jsonRequest(`/api/coordinator/students?term=${id}`, { headers });
  assert.deepEqual(inTerm.body.students.map((row) => row.student_id), [student.student_id]);
  assert.equal(inTerm.body.students[0].term_name, name);

  const attendanceBefore = await jsonRequest(`/api/attendance/${encodeURIComponent(student.student_id)}`, { headers: authHeaders(studentToken) });
  const logsBefore = attendanceBefore.body.attendance.length;

  // Close: the student can no longer sign in, and nothing of theirs is gone.
  const closed = await jsonRequest(`${path}/${id}/close`, jsonBody(coordinatorToken, "POST", {}));
  assert.equal(closed.response.status, 200, JSON.stringify(closed.body));
  assert.equal(closed.body.deactivated, 1);
  assert.equal((await jsonRequest(`${path}/${id}/close`, jsonBody(coordinatorToken, "POST", {}))).response.status, 409);
  const refused = await jsonRequest("/api/login/student", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: studentEmail, password: studentPassword }) });
  assert.notEqual(refused.response.status, 200, "a student of a closed term cannot sign in");
  const record = await jsonRequest(`/api/coordinator/students?term=${id}&status=inactive`, { headers });
  assert.equal(record.body.students.length, 1, "the student is still listed, as inactive");
  assert.equal((await jsonRequest(`${path}/${id}/students`, jsonBody(coordinatorToken, "POST", { student_ids: [student.student_id] }))).response.status, 409);

  // Reopen: exactly that student is active again.
  const reopened = await jsonRequest(`${path}/${id}/reopen`, jsonBody(coordinatorToken, "POST", {}));
  assert.equal(reopened.body.reactivated, 1, JSON.stringify(reopened.body));
  assert.equal((await jsonRequest(`${path}/${id}/reopen`, jsonBody(coordinatorToken, "POST", {}))).response.status, 409);
  const again = await login("student", studentEmail, studentPassword);
  studentToken = again.token;
  const attendanceAfter = await jsonRequest(`/api/attendance/${encodeURIComponent(student.student_id)}`, { headers: authHeaders(studentToken) });
  assert.equal(attendanceAfter.body.attendance.length, logsBefore, "every attendance log is still there");

  // A student created while a term is running joins it by itself.
  const terms = (await jsonRequest(path, { headers })).body.terms;
  const running = terms.find((term) => !term.is_closed && term.start_date <= today && term.end_date >= today);
  assert.ok(running, "a term is running today");
});


test("monitoring can be narrowed to one term and is unchanged without it", async () => {
  const headers = authHeaders(coordinatorToken);
  const get = (query = "") => jsonRequest(`/api/coordinator/monitoring${query}`, { headers });

  const all = await get();
  assert.equal(all.response.status, 200);
  assert.deepEqual(Object.keys(all.body), ["students"]);

  assert.equal((await get("?term=abc")).response.status, 400);
  assert.equal((await get("?term=1;drop")).response.status, 400);
  assert.equal((await get("?term=999999999")).body.students.length, 0, "an unknown term has nobody");

  // Every active student is in exactly one of: a term, or no term.
  const terms = (await jsonRequest("/api/coordinator/terms", { headers })).body.terms;
  let counted = (await get("?term=none")).body.students.length;
  for (const term of terms) {
    const inTerm = await get(`?term=${term.id}`);
    assert.equal(inTerm.response.status, 200);
    assert.equal(inTerm.body.students.length, term.active_students, `${term.name}: the same count as the Terms page`);
    counted += inTerm.body.students.length;
  }
  assert.equal(counted, all.body.students.length);

  // It combines with the date range.
  const both = await get("?term=none&from=2000-01-01&to=2099-12-31");
  assert.equal(both.response.status, 200);
  assert.deepEqual(both.body.period, { from: "2000-01-01", to: "2099-12-31" });
  assert.equal((await jsonRequest("/api/coordinator/monitoring?term=none", { headers: authHeaders(studentToken) })).response.status, 403);
});

test("the accomplishment note at time-out is optional, and checked when it is sent", async () => {
  // A log id that does not exist: nothing can be changed by these requests.
  const timeOut = (body) =>
    jsonRequest("/api/attendance/999999999/time-out", jsonBody(studentToken, "PUT", body));

  // Not sent: as before (an older copy of the app sends nothing).
  assert.equal((await timeOut({})).response.status, 404);
  // Sent but not a real note: refused before anything else.
  for (const bad of ["", "   ", "Done.", "x".repeat(1001), 42, ["a list"], { a: 1 }]) {
    const refused = await timeOut({ accomplishments: bad });
    assert.equal(refused.response.status, 400, JSON.stringify(bad).slice(0, 30));
    assert.match(refused.body.message, /what you accomplished/i);
  }
  // A real note on a log that is not theirs: the usual answer.
  assert.equal(
    (await timeOut({ accomplishments: "Filed and labelled the week's delivery receipts." })).response.status,
    404
  );
  // Every attendance row now says what was accomplished, or null.
  const own = await jsonRequest(`/api/attendance/${encodeURIComponent(student.student_id)}`, {
    headers: authHeaders(studentToken),
  });
  for (const log of own.body.attendance) assert.ok("accomplishments" in log);
});


/*
| Student contact details and "my coordinator"
*/

test("a student keeps their own contact details; only their staff can read them", async () => {
  const id = encodeURIComponent(student.student_id);
  const put = (body, token = studentToken, target = id) =>
    jsonRequest(`/api/students/${target}/contact`, jsonBody(token, "PUT", body));
  const profile = () => jsonRequest(`/api/students/${id}/profile`, { headers: authHeaders(studentToken) });

  // Only the student, and only their own.
  assert.equal((await jsonRequest(`/api/students/${id}/contact`, { method: "PUT" })).response.status, 401);
  assert.equal((await put({ phone: "09171234567" }, coordinatorToken)).response.status, 403);
  assert.equal((await put({ phone: "09171234567" }, studentToken, "SOMEONE-ELSE")).response.status, 403);

  // Refused before anything is saved.
  for (const bad of [{ phone: "call me" }, { phone: "123" }, { phone: 9171234567 }, { emergency_contact_phone: "0917-123-4567-ext-99999" },
    { emergency_contact_name: "x".repeat(151) }, { emergency_contact_name: "A" }]) {
    assert.equal((await put(bad)).response.status, 400, JSON.stringify(bad).slice(0, 50));
  }

  const before = (await profile()).body.student;
  for (const key of ["phone", "emergency_contact_name", "emergency_contact_phone"]) assert.ok(key in before, key);

  // Save, read back, then put everything back as it was.
  const saved = await put({ phone: " +63 917 123 4567 ", emergency_contact_name: "Maria Santos", emergency_contact_phone: "(075) 123-4567" });
  assert.equal(saved.response.status, 200, JSON.stringify(saved.body));
  assert.deepEqual(saved.body.contact, { phone: "+63 917 123 4567", emergency_contact_name: "Maria Santos", emergency_contact_phone: "(075) 123-4567" });
  // A field that is not sent is left alone; an empty one is cleared.
  const partial = await put({ phone: "" });
  assert.deepEqual(partial.body.contact, { phone: null, emergency_contact_name: "Maria Santos", emergency_contact_phone: "(075) 123-4567" });
  // The name-and-email route still answers as it did, and does not touch these.
  const unchanged = await jsonRequest(`/api/students/${id}/profile`, jsonBody(studentToken, "PUT", { name: before.name, email: before.email }));
  assert.equal(unchanged.response.status, 200);
  assert.equal((await profile()).body.student.emergency_contact_name, "Maria Santos");

  // Their supervisor and the coordinator can read them.
  const supervisor = await supervisorSession();
  const interns = await jsonRequest(`/api/supervisor/${encodeURIComponent(supervisor.supervisor.supervisor_id)}/interns`, { headers: authHeaders(supervisor.token) });
  const intern = interns.body.interns.find((item) => item.student_id === student.student_id);
  assert.equal(intern.emergency_contact_name, "Maria Santos");

  const restore = await put({
    phone: before.phone ?? "",
    emergency_contact_name: before.emergency_contact_name ?? "",
    emergency_contact_phone: before.emergency_contact_phone ?? "",
  });
  assert.equal(restore.response.status, 200);
  assert.deepEqual(
    restore.body.contact,
    { phone: before.phone, emergency_contact_name: before.emergency_contact_name, emergency_contact_phone: before.emergency_contact_phone }
  );
});

test("a student is told who their coordinator is, and nothing private about them", async () => {
  const { response, body } = await jsonRequest(`/api/students/${encodeURIComponent(student.student_id)}/profile`, { headers: authHeaders(studentToken) });
  assert.equal(response.status, 200);
  assert.ok(body.coordinator, "there is an active coordinator");
  assert.deepEqual(Object.keys(body.coordinator).sort(), ["department", "email", "name"]);
  assert.equal(typeof body.coordinator.name, "string");
  assert.match(body.coordinator.email, /@/);
});

test("students and supervisors can list the announcements meant for them", async () => {
  const supervisor = await supervisorSession();
  assert.equal((await jsonRequest("/api/announcements")).response.status, 401);
  // The coordinator has their own list, with who each one was sent to.
  assert.equal((await jsonRequest("/api/announcements", { headers: authHeaders(coordinatorToken) })).response.status, 403);

  for (const token of [studentToken, supervisor.token]) {
    const { response, body } = await jsonRequest("/api/announcements", { headers: authHeaders(token) });
    assert.equal(response.status, 200);
    assert.ok(Array.isArray(body.announcements));
    for (const item of body.announcements) {
      // What was said and when; not who else it went to.
      assert.deepEqual(Object.keys(item).sort(), ["created_at", "id", "message", "title"]);
    }
    const times = body.announcements.map((item) => new Date(item.created_at).getTime());
    assert.deepEqual(times, [...times].sort((a, b) => b - a), "newest first");
  }
});

test("an announcement reaches only the audience and company it was sent to", async (t) => {
  if (process.env.ALLOW_TEST_WRITES !== "true") {
    t.skip("set ALLOW_TEST_WRITES=true to run against a throwaway database");
    return;
  }
  const supervisor = await supervisorSession();
  const stamp = Date.now();
  const send = (body) => jsonRequest("/api/coordinator/announcements", jsonBody(coordinatorToken, "POST", body));
  const mine = async (token) => (await jsonRequest("/api/announcements", { headers: authHeaders(token) })).body.announcements.map((item) => item.title);

  const forStudents = `Students only ${stamp}`;
  const forSupervisors = `Supervisors only ${stamp}`;
  const forOtherCompany = `Another company ${stamp}`;
  const sent = [];
  for (const body of [
    { title: forStudents, message: "For students.", audience: "students" },
    { title: forSupervisors, message: "For supervisors.", audience: "supervisors" },
  ]) {
    const result = await send(body);
    assert.ok(result.response.ok, JSON.stringify(result.body));
    sent.push(result.body.announcement.id);
  }
  // One for a company nobody in the demo data belongs to is refused or reaches nobody.
  const other = await send({ title: forOtherCompany, message: "Elsewhere.", audience: "everyone", company: "A Company With No One" });
  if (other.response.ok) sent.push(other.body.announcement.id);

  const studentSees = await mine(studentToken);
  const supervisorSees = await mine(supervisor.token);
  assert.ok(studentSees.includes(forStudents) && !studentSees.includes(forSupervisors));
  assert.ok(supervisorSees.includes(forSupervisors) && !supervisorSees.includes(forStudents));
  assert.ok(!studentSees.includes(forOtherCompany) && !supervisorSees.includes(forOtherCompany));

  // The notification each got opens the announcements page.
  const notes = await jsonRequest(`/api/notifications/student/${encodeURIComponent(student.student_id)}`, { headers: authHeaders(studentToken) });
  const note = notes.body.notifications.find((item) => item.title === `Announcement: ${forStudents}`);
  assert.equal(note?.link, "/announcements");

  // Withdrawn: gone from the list.
  for (const id of sent) {
    const gone = await jsonRequest(`/api/coordinator/announcements/${id}`, jsonBody(coordinatorToken, "DELETE", {}));
    assert.ok(gone.response.ok, JSON.stringify(gone.body));
  }
  assert.ok(!(await mine(studentToken)).includes(forStudents));
});

/*
| The forgot-to-time-out reminder
*/

// A pool on the throwaway database, for the few checks that have no route
// to go through. Refuses anything that is not on this machine.
function localTestPool() {
  const url = new URL(process.env.DATABASE_PUBLIC_URL || "");
  assert.ok(allowedLocalHosts.has(url.hostname), "direct database tests are for a local database only");
  const { Pool } = require("pg");
  return new Pool({ connectionString: url.toString(), options: "-c timezone=Asia/Manila" });
}

test("a forgotten time-out is reminded once, an hour after the shift ended", async (t) => {
  require("tsx/cjs");
  const { sendTimeOutReminders, clockText, TIME_OUT_REMINDER_DELAY_MINUTES } = require("../src/services/timeOutReminders.ts");
  assert.equal(TIME_OUT_REMINDER_DELAY_MINUTES, 60);
  assert.equal(clockText("17:00:00"), "5:00 PM");
  assert.equal(clockText("00:30:00"), "12:30 AM");
  assert.equal(clockText("12:05:00"), "12:05 PM");
  assert.equal(clockText("08:00"), "8:00 AM");

  if (process.env.ALLOW_TEST_WRITES !== "true") {
    t.skip("set ALLOW_TEST_WRITES=true to run against a throwaway database");
    return;
  }
  const pool = localTestPool();
  // Two days long past, a Monday and a Tuesday, so today's log is not touched.
  const monday = "2001-01-01";
  const tuesday = "2001-01-02";
  const id = student.student_id;
  const sent = [];
  const writer = async (notification) => {
    sent.push(notification);
  };
  const at = (date, time, plusMinutes) =>
    new Date(new Date(`${date}T${time}+08:00`).getTime() + plusMinutes * 60_000);
  try {
    const shift = await pool.query(
      `SELECT MAX(end_time)::text AS end_time FROM ojt_schedule
       WHERE student_id = $1 AND is_active = TRUE AND day = 'Monday'`,
      [id]
    );
    const end = shift.rows[0].end_time;
    assert.ok(end, "the demo student is scheduled on Mondays");
    await pool.query(`DELETE FROM time_out_reminders WHERE student_id = $1 AND reminder_date IN ($2, $3)`, [id, monday, tuesday]);
    await pool.query(`DELETE FROM attendance WHERE student_id = $1 AND date IN ($2, $3)`, [id, monday, tuesday]);
    await pool.query(
      `INSERT INTO attendance (student_id, date, time_in, status) VALUES ($1, $2, $2::date + TIME '08:00', 'Pending')`,
      [id, monday]
    );
    // Tuesday's log was timed out, so it is never reminded.
    await pool.query(
      `INSERT INTO attendance (student_id, date, time_in, time_out, hours, status)
       VALUES ($1, $2, $2::date + TIME '08:00', $2::date + TIME '17:00', 8, 'Pending')`,
      [id, tuesday]
    );

    // Still inside the hour: nothing.
    assert.deepEqual(await sendTimeOutReminders(pool, writer, at(monday, end, 59)), []);
    // An hour after the shift ended: one reminder, to that student.
    assert.deepEqual(await sendTimeOutReminders(pool, writer, at(monday, end, 60)), [id]);
    assert.equal(sent.length, 1);
    assert.equal(sent[0].studentId, id);
    assert.equal(sent[0].type, "attendance");
    assert.match(sent[0].message, new RegExp(clockText(end).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    // Later the same day: not again.
    assert.deepEqual(await sendTimeOutReminders(pool, writer, at(monday, end, 180)), []);
    // The next day, with the log closed: nothing.
    assert.deepEqual(await sendTimeOutReminders(pool, writer, at(tuesday, end, 120)), []);
    assert.equal(sent.length, 1);

    // A reminder that could not be delivered is tried again.
    await pool.query(`DELETE FROM time_out_reminders WHERE student_id = $1 AND reminder_date = $2`, [id, monday]);
    const failing = async () => {
      throw new Error("not delivered");
    };
    const quiet = console.error;
    console.error = () => {};
    try {
      assert.deepEqual(await sendTimeOutReminders(pool, failing, at(monday, end, 90)), []);
    } finally {
      console.error = quiet;
    }
    assert.deepEqual(await sendTimeOutReminders(pool, writer, at(monday, end, 95)), [id]);
  } finally {
    await pool.query(`DELETE FROM time_out_reminders WHERE student_id = $1 AND reminder_date IN ($2, $3)`, [id, monday, tuesday]);
    await pool.query(`DELETE FROM attendance WHERE student_id = $1 AND date IN ($2, $3)`, [id, monday, tuesday]);
    await pool.end();
  }
});

test("the reminder notification opens the student's time log", () => {
  require("tsx/cjs");
  const { notificationLink } = require("../src/services/notificationLinks.ts");
  assert.equal(notificationLink("student", "attendance", "Did you forget to time out?"), "/daily-log");
});
