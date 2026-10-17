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

  // Head turns only, one or two of them, never the same twice.
  const { level, prompts, spare } = challenge.body;
  assert.ok(["standard", "strict"].includes(level));
  assert.ok(prompts.length >= 1 && prompts.length <= 2);
  assert.ok(prompts.every((prompt) => prompt === "turn-left" || prompt === "turn-right"));
  assert.equal(new Set(prompts).size, prompts.length);
  assert.equal(challenge.body.expires_in, 600);
  if (level === "standard") assert.equal(spare, null);

  // A ticket alone is not enough: the report must cover every prompt on it.
  const nothingDone = await timeIn({
    liveness_ticket: challenge.body.ticket,
    liveness_report: JSON.stringify({ completed: prompts.slice(1), flash: "passed" }),
  });
  assert.equal(nothingDone.response.status, 400);

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
  "GET /api/health/ready",
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
  for (const file of ["server.ts", "routes/extensions.ts", "routes/console.ts", "routes/academics.ts", "routes/supervisorDesk.ts", "routes/offlineTimeIn.ts", "routes/attachments.ts", "routes/programme.ts", "routes/deliverables.ts", "routes/appeals.ts"]) {
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
    // The same notifications in the wording used since Round 2: "concern".
    ["student", "success", "Concern resolved", "/report"],
    ["student", "info", "Reply on your concern", "/report"],
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
    ["supervisor", "info", "Concern resolved", "/supervisor/complaints"],
    ["supervisor", "announcement", "Announcement: Orientation", "/supervisor/announcements"],
    ["coordinator", "warning", "New complaint filed", "/coordinator/complaints"],
    ["coordinator", "warning", "Reply on a complaint", "/coordinator/complaints"],
    ["coordinator", "warning", "New concern filed", "/coordinator/complaints"],
    ["coordinator", "warning", "Reply on a concern", "/coordinator/complaints"],
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
      // To the page, and since October 2026 to the log itself when the writer names it.
      assert.match(verified.link, /^\/daily-log(\?focus=attendance-\d+)?$/);
    }
    const recorded = mine.body.notifications.find((item) => item.title === "Time-in recorded by your supervisor");
    if (recorded) {
      // To the log itself; a row written before October 2026 has the page alone.
      assert.ok(
        [`/daily-log?focus=attendance-${recorded.entity_id}`, "/daily-log"].includes(recorded.link),
        recorded.link
      );
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

/*
| Holidays
*/

test("everyone signed in can read the holidays; only the coordinator can change them", async () => {
  const supervisor = await supervisorSession();
  assert.equal((await jsonRequest("/api/holidays")).response.status, 401);
  for (const token of [studentToken, supervisor.token, coordinatorToken]) {
    const { response, body } = await jsonRequest("/api/holidays", { headers: authHeaders(token) });
    assert.equal(response.status, 200);
    assert.ok(Array.isArray(body.holidays));
    for (const item of body.holidays) {
      assert.deepEqual(Object.keys(item).sort(), ["date", "id", "name"]);
      assert.match(item.date, /^\d{4}-\d{2}-\d{2}$/);
    }
    const dates = body.holidays.map((item) => item.date);
    assert.deepEqual(dates, [...dates].sort(), "in date order");
  }

  const path = "/api/coordinator/holidays";
  const post = (body, token = coordinatorToken) => jsonRequest(path, jsonBody(token, "POST", body));
  for (const token of [studentToken, supervisor.token]) {
    assert.equal((await post({ date: "2031-01-01", name: "New Year's Day" }, token)).response.status, 403);
  }
  for (const bad of [{}, { date: "2031-01-01" }, { name: "No date" }, { date: "01/01/2031", name: "Wrong form" },
    { date: "2031-13-45", name: "No such day" }, { date: "2031-01-01", name: "X" }, { date: "2031-01-01", name: "x".repeat(101) },
    { date: 20310101, name: "Not text" }]) {
    assert.equal((await post(bad)).response.status, 400, JSON.stringify(bad).slice(0, 50));
  }
  for (const id of ["999999999", "abc"]) {
    assert.equal((await jsonRequest(`${path}/${id}`, jsonBody(coordinatorToken, "PUT", { date: "2031-01-01", name: "New Year's Day" }))).response.status, 404, id);
    assert.equal((await jsonRequest(`${path}/${id}`, jsonBody(coordinatorToken, "DELETE", {}))).response.status, 404, id);
  }
});

test("a holiday is added, edited and removed, one per date", async (t) => {
  if (process.env.ALLOW_TEST_WRITES !== "true") {
    t.skip("set ALLOW_TEST_WRITES=true to run against a throwaway database");
    return;
  }
  const path = "/api/coordinator/holidays";
  const send = (method, suffix, body) => jsonRequest(`${path}${suffix}`, jsonBody(coordinatorToken, method, body));
  const listed = async () => (await jsonRequest("/api/holidays", { headers: authHeaders(studentToken) })).body.holidays;
  // Two dates far ahead that nothing else uses; clear what an earlier failed run left.
  for (const left of (await listed()).filter((item) => ["2099-12-30", "2099-12-31"].includes(item.date))) {
    await send("DELETE", `/${left.id}`, {});
  }

  const added = await send("POST", "", { date: "2099-12-30", name: "  Rizal Day  " });
  assert.equal(added.response.status, 201, JSON.stringify(added.body));
  assert.deepEqual({ date: added.body.holiday.date, name: added.body.holiday.name }, { date: "2099-12-30", name: "Rizal Day" });
  const id = added.body.holiday.id;
  try {
    // One holiday per date.
    assert.equal((await send("POST", "", { date: "2099-12-30", name: "Another name" })).response.status, 409);
    assert.ok((await listed()).some((item) => item.id === id && item.name === "Rizal Day"));

    const other = await send("POST", "", { date: "2099-12-31", name: "Last day of the year" });
    assert.equal(other.response.status, 201);
    try {
      // Cannot be moved onto a date that has one.
      assert.equal((await send("PUT", `/${id}`, { date: "2099-12-31", name: "Rizal Day" })).response.status, 409);
    } finally {
      assert.equal((await send("DELETE", `/${other.body.holiday.id}`, {})).response.status, 200);
    }
    const edited = await send("PUT", `/${id}`, { date: "2099-12-31", name: "Rizal Day (moved)" });
    assert.equal(edited.response.status, 200);
    assert.deepEqual(edited.body.holiday, { id, date: "2099-12-31", name: "Rizal Day (moved)" });
  } finally {
    const removed = await send("DELETE", `/${id}`, {});
    assert.equal(removed.response.status, 200);
  }
  assert.ok(!(await listed()).some((item) => item.id === id));

  // Each change is in the audit log.
  await new Promise((resolve) => setTimeout(resolve, 400));
  const audit = await jsonRequest("/api/coordinator/audit?action=holiday&limit=20", { headers: authHeaders(coordinatorToken) });
  const actions = audit.body.entries.filter((entry) => String(entry.entity_id) === String(id)).map((entry) => entry.action);
  for (const action of ["holiday.create", "holiday.edit", "holiday.remove"]) assert.ok(actions.includes(action), action);
  const removal = audit.body.entries.find((entry) => String(entry.entity_id) === String(id) && entry.action === "holiday.remove");
  assert.deepEqual(removal.details, { date: "2099-12-31", name: "Rizal Day (moved)" });
});

/*
| Weekly journal
*/

const journalBody = {
  activities: "Encoded the week's delivery receipts and filed them by supplier.",
  learnings: "How the company numbers its receipts, and why the order matters.",
  challenges: "",
};
const shiftDay = (date, days) => {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
};

test("a journal is the student's own, one per week, and checked before it is saved", async () => {
  const supervisor = await supervisorSession();
  const id = encodeURIComponent(student.student_id);
  const mine = await jsonRequest(`/api/journals/student/${id}`, { headers: authHeaders(studentToken) });
  assert.equal(mine.response.status, 200);
  assert.ok(Array.isArray(mine.body.journals));
  assert.deepEqual(mine.body.limits, { min: 30, max: 3000 });
  const week = mine.body.current_week_start;
  assert.match(week, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(new Date(`${week}T00:00:00Z`).getUTCDay(), 1, "the week starts on a Monday");
  const weeks = mine.body.journals.map((item) => item.week_start);
  assert.equal(new Set(weeks).size, weeks.length, "one entry per week");

  const put = (target, body, token = studentToken, who = id) =>
    jsonRequest(`/api/journals/student/${who}/${target}`, jsonBody(token, "PUT", body));
  // Only the student, and only their own.
  assert.equal((await jsonRequest(`/api/journals/student/${id}/${week}`, { method: "PUT" })).response.status, 401);
  assert.equal((await put(week, journalBody, coordinatorToken)).response.status, 403);
  assert.equal((await put(week, journalBody, supervisor.token)).response.status, 403);
  assert.equal((await put(week, journalBody, studentToken, "SOMEONE-ELSE")).response.status, 403);
  assert.equal((await jsonRequest("/api/journals/student/SOMEONE-ELSE", { headers: authHeaders(studentToken) })).response.status, 403);

  // The week: a real Monday that has started.
  for (const bad of ["this-week", "2026-13-40", shiftDay(week, 1), shiftDay(week, -3), shiftDay(week, 7)]) {
    assert.equal((await put(bad, journalBody)).response.status, 400, bad);
  }
  // The text: both required parts, long enough, not too long, and text.
  for (const bad of [{}, { ...journalBody, activities: "Worked." }, { ...journalBody, learnings: "" },
    { ...journalBody, activities: "x".repeat(3001) }, { ...journalBody, challenges: "x".repeat(3001) },
    { ...journalBody, learnings: 12345 }, { ...journalBody, challenges: ["a list"] }]) {
    assert.equal((await put(week, bad)).response.status, 400, JSON.stringify(bad).slice(0, 60));
  }

  // The supervisor's list and decision.
  assert.equal((await jsonRequest("/api/journals/supervisor", { headers: authHeaders(studentToken) })).response.status, 403);
  const list = await jsonRequest("/api/journals/supervisor", { headers: authHeaders(supervisor.token) });
  assert.equal(list.response.status, 200);
  assert.ok(Array.isArray(list.body.journals));
  const review = (target, body, token = supervisor.token) =>
    jsonRequest(`/api/journals/${target}/review`, jsonBody(token, "PATCH", body));
  assert.equal((await review("1", { status: "Reviewed" }, studentToken)).response.status, 403);
  assert.equal((await review("1", { status: "Reviewed" }, coordinatorToken)).response.status, 403);
  assert.equal((await review("999999999", { status: "Approved" })).response.status, 400);
  assert.equal((await review("999999999", { status: "Returned" })).response.status, 400, "returning needs a note");
  assert.equal((await review("999999999", { status: "Reviewed", notes: "x".repeat(1001) })).response.status, 400);
  assert.equal((await review("999999999", { status: "Reviewed" })).response.status, 404);
  assert.equal((await review("abc", { status: "Reviewed" })).response.status, 404);
});

test("a journal goes from the student to the supervisor and back, and closes once reviewed", async (t) => {
  if (process.env.ALLOW_TEST_WRITES !== "true") {
    t.skip("set ALLOW_TEST_WRITES=true to run against a throwaway database");
    return;
  }
  const supervisor = await supervisorSession();
  const id = encodeURIComponent(student.student_id);
  const read = async () => (await jsonRequest(`/api/journals/student/${id}`, { headers: authHeaders(studentToken) })).body;
  const week = (await read()).current_week_start;
  const put = (body) => jsonRequest(`/api/journals/student/${id}/${week}`, jsonBody(studentToken, "PUT", body));
  const review = (journalId, body) => jsonRequest(`/api/journals/${journalId}/review`, jsonBody(supervisor.token, "PATCH", body));
  const pool = localTestPool();
  const clear = () => pool.query(`DELETE FROM journals WHERE student_id = $1 AND week_start = $2`, [student.student_id, week]);
  await clear();
  try {
    const first = await put({ ...journalBody, challenges: "  The scanner jammed twice.  " });
    assert.equal(first.response.status, 201, JSON.stringify(first.body));
    const journal = first.body.journal;
    assert.equal(journal.status, "Submitted");
    assert.equal(journal.week_start, week);
    assert.equal(journal.challenges, "The scanner jammed twice.");

    // Still open: an edit replaces it; there is still one entry for the week.
    const edited = await put({ ...journalBody, activities: `${journalBody.activities} Also answered the front desk phone.` });
    assert.equal(edited.response.status, 200);
    assert.equal(edited.body.journal.id, journal.id);
    assert.equal(edited.body.journal.challenges, null);
    assert.equal((await read()).journals.filter((item) => item.week_start === week).length, 1);

    // The supervisor sees it, with whose it is.
    const listed = (await jsonRequest("/api/journals/supervisor", { headers: authHeaders(supervisor.token) })).body.journals.find((item) => item.id === journal.id);
    assert.equal(listed.student_name, student.name);
    assert.equal(listed.status, "Submitted");

    // Returned with a note: the student sees it and can send it again.
    const returned = await review(journal.id, { status: "Returned", notes: "Say which tasks were yours." });
    assert.equal(returned.response.status, 200, JSON.stringify(returned.body));
    assert.equal(returned.body.journal.status, "Returned");
    assert.equal((await review(journal.id, { status: "Reviewed" })).response.status, 409, "already decided");
    const seen = (await read()).journals.find((item) => item.id === journal.id);
    assert.equal(seen.review_notes, "Say which tasks were yours.");
    const again = await put(journalBody);
    assert.equal(again.response.status, 200);
    assert.equal(again.body.journal.status, "Submitted");
    assert.equal(again.body.journal.reviewed_at, null);

    // Reviewed: closed to the student.
    const reviewed = await review(journal.id, { status: "Reviewed", notes: "Clear and complete." });
    assert.equal(reviewed.body.journal.status, "Reviewed");
    assert.ok(reviewed.body.journal.reviewed_at);
    const locked = await put(journalBody);
    assert.equal(locked.response.status, 409);
    assert.match(locked.body.message, /already reviewed/);

    // The decision can be withdrawn, once.
    const undone = await review(journal.id, { status: "Submitted" });
    assert.equal(undone.response.status, 200);
    assert.deepEqual([undone.body.journal.status, undone.body.journal.review_notes, undone.body.journal.reviewed_at], ["Submitted", null, null]);
    assert.equal((await review(journal.id, { status: "Submitted" })).response.status, 409);

    // The coordinator reads it on the student's record.
    const record = await jsonRequest(`/api/coordinator/students/${id}/overview`, { headers: authHeaders(coordinatorToken) });
    assert.equal(record.response.status, 200);
    assert.ok(record.body.journals.some((item) => item.id === journal.id));

    // Each side was told, and the student's notification opens the journal.
    const notes = await jsonRequest(`/api/notifications/student/${id}`, { headers: authHeaders(studentToken) });
    const told = notes.body.notifications.find((item) => item.title === "Weekly report reviewed");
    assert.equal(told?.link, "/journal");
    const supervisorNotes = await jsonRequest(`/api/notifications/supervisor/${encodeURIComponent(supervisor.supervisor.supervisor_id)}`, { headers: authHeaders(supervisor.token) });
    const asked = supervisorNotes.body.notifications.find((item) => item.title === "Weekly report submitted");
    assert.equal(asked?.link, `/supervisor/dashboard?focus=journal-${journal.id}`);

    // The decisions are in the audit log; the student's own writing is not.
    await new Promise((resolve) => setTimeout(resolve, 400));
    const audit = await jsonRequest("/api/coordinator/audit?action=journal&limit=20", { headers: authHeaders(coordinatorToken) });
    const actions = audit.body.entries.filter((entry) => String(entry.entity_id) === String(journal.id)).map((entry) => entry.action);
    assert.deepEqual([...actions].sort(), ["journal.return", "journal.review", "journal.undo"]);
  } finally {
    await clear();
    await pool.query(`DELETE FROM notifications WHERE entity_type = 'journal' AND (title LIKE 'Weekly journal%' OR title LIKE 'Weekly report%')`);
    await pool.end();
  }
});

/*
| Completion checklist
*/

const CHECKLIST_KEYS = ["hours", "attendance", "documents", "tasks", "evaluation", "feedback"];

test("the completion checklist is the student's own and names the same six things", async () => {
  const supervisor = await supervisorSession();
  const id = encodeURIComponent(student.student_id);
  const path = `/api/students/${id}/completion`;
  assert.equal((await jsonRequest(path)).response.status, 401);
  assert.equal((await jsonRequest(path, { headers: authHeaders(coordinatorToken) })).response.status, 403);
  assert.equal((await jsonRequest(path, { headers: authHeaders(supervisor.token) })).response.status, 403);
  assert.equal((await jsonRequest("/api/students/SOMEONE-ELSE/completion", { headers: authHeaders(studentToken) })).response.status, 403);
  assert.equal((await jsonRequest("/api/students/SOMEONE-ELSE/completion/request", jsonBody(studentToken, "POST", {}))).response.status, 403);
  assert.equal((await jsonRequest(`${path}/request`, jsonBody(coordinatorToken, "POST", {}))).response.status, 403);

  const { response, body } = await jsonRequest(path, { headers: authHeaders(studentToken) });
  assert.equal(response.status, 200);
  assert.deepEqual(body.items.map((item) => item.key), CHECKLIST_KEYS);
  for (const item of body.items) {
    assert.equal(typeof item.done, "boolean", item.key);
    assert.ok(item.detail.length > 5, item.key);
  }
  assert.equal(body.ready, body.items.every((item) => item.done));
  assert.ok("requested_at" in body);

  // The hours line agrees with the student's own verified attendance.
  const own = await jsonRequest(`/api/attendance/${id}`, { headers: authHeaders(studentToken) });
  const verified = own.body.attendance.filter((log) => log.status === "Verified").reduce((sum, log) => sum + Number(log.hours || 0), 0);
  const hours = body.items.find((item) => item.key === "hours");
  assert.ok(hours.detail.startsWith(`${Math.round(verified * 100) / 100} of `), hours.detail);

  // Not everything done and not yet asked: asking is refused, and says how much is left.
  if (!body.ready && !body.requested_at) {
    const refused = await jsonRequest(`${path}/request`, jsonBody(studentToken, "POST", {}));
    assert.equal(refused.response.status, 400);
    assert.match(refused.body.message, /still left on your checklist/);
    const after = await jsonRequest(path, { headers: authHeaders(studentToken) });
    assert.equal(after.body.requested_at, null, "a refused request records nothing");
  }
});

test("a student whose checklist is complete asks for a review once, and the coordinator is told", async (t) => {
  if (process.env.ALLOW_TEST_WRITES !== "true") {
    t.skip("set ALLOW_TEST_WRITES=true to run against a throwaway database");
    return;
  }
  // A student made for this test, with everything done, so the demo
  // student's record is left as it is.
  const pool = localTestPool();
  const sid = "TEST-COMPLETE-0001";
  const clear = async () => {
    for (const table of ["attendance", "documents", "tasks", "notifications"]) {
      await pool.query(`DELETE FROM ${table} WHERE student_id = $1`, [sid]);
    }
    await pool.query(`DELETE FROM evaluations WHERE student_id = $1 OR evaluator_id = $1`, [sid]);
    await pool.query(`DELETE FROM final_evaluations WHERE student_id = $1`, [sid]);
    await pool.query(`DELETE FROM notifications WHERE entity_type = 'student' AND entity_id = $1`, [sid]);
    await pool.query(`DELETE FROM students WHERE student_id = $1`, [sid]);
  };
  await clear();
  try {
    await pool.query(
      `INSERT INTO students (student_id, email, password, name, program, company, supervisor_id, is_active, required_hours)
       SELECT $1, 'complete.test@internet.test', password, 'Complete Test', program, company, supervisor_id, TRUE, 8
       FROM students WHERE student_id = $2`,
      [sid, student.student_id]
    );
    const session = await login("student", "complete.test@internet.test", studentPassword);
    const token = session.token;
    const path = `/api/students/${sid}/completion`;
    const read = async () => (await jsonRequest(path, { headers: authHeaders(token) })).body;
    const ask = () => jsonRequest(`${path}/request`, jsonBody(token, "POST", {}));
    const done = (body) => Object.fromEntries(body.items.map((item) => [item.key, item.done]));

    // Nothing rendered yet. With no open logs or tasks those two lines are already done.
    let state = await read();
    assert.deepEqual(done(state), { hours: false, attendance: true, documents: false, tasks: true, evaluation: false, feedback: false });
    assert.equal((await ask()).response.status, 400);

    // Hours, but one more log still waiting.
    await pool.query(
      `INSERT INTO attendance (student_id, date, time_in, time_out, hours, status)
       VALUES ($1, '2001-02-05', '2001-02-05 08:00', '2001-02-05 17:00', 8, 'Verified'),
              ($1, '2001-02-06', '2001-02-06 08:00', NULL, NULL, 'Pending')`,
      [sid]
    );
    state = await read();
    assert.equal(done(state).hours, true);
    assert.equal(done(state).attendance, false);
    await pool.query(`UPDATE attendance SET time_out = '2001-02-06 17:00', hours = 8, status = 'Verified' WHERE student_id = $1 AND date = '2001-02-06'`, [sid]);

    // Every active requirement approved; a rejected file does not count.
    await pool.query(
      `INSERT INTO documents (student_id, doc_type, original_filename, file_path, mime_type, size_bytes, status)
       SELECT $1, r.name, 'file.pdf', '/uploads/test-complete-' || r.id || '.pdf', 'application/pdf', 10, 'Rejected'
       FROM ojt_requirements r WHERE r.is_active = TRUE`,
      [sid]
    );
    const requirements = (await pool.query(`SELECT COUNT(*)::int AS n FROM ojt_requirements WHERE is_active = TRUE`)).rows[0].n;
    assert.equal(done(await read()).documents, requirements === 0);
    await pool.query(`UPDATE documents SET status = 'Approved' WHERE student_id = $1`, [sid]);
    assert.equal(done(await read()).documents, true);

    // An unfinished task holds it up; a reviewed one does not.
    await pool.query(`INSERT INTO tasks (student_id, title, status, due_date) VALUES ($1, 'Final report', 'Submitted', '2001-03-01')`, [sid]);
    assert.equal(done(await read()).tasks, false);
    await pool.query(`UPDATE tasks SET status = 'Reviewed' WHERE student_id = $1`, [sid]);

    // The two evaluations.
    await pool.query(
      `INSERT INTO evaluations (student_id, evaluator_type, evaluator_id, evaluator_name, category, rating, comments)
       VALUES ($1, 'supervisor', 'SUP', 'A Supervisor', 'Overall', 5, 'Good work.'),
              ($1, 'student', $1, 'Complete Test', 'Company', 4, 'Learned a lot.')`,
      [sid]
    );
    // An ordinary evaluation is not the final one.
    assert.equal(done(await read()).evaluation, false);
    await pool.query(
      `INSERT INTO final_evaluations (student_id, form_id, form_snapshot, supervisor_id, supervisor_name, ratings, average, remarks)
       VALUES ($1, 1, '{}'::jsonb, 'SUP', 'A Supervisor', '{}'::jsonb, 5, 'Good work throughout.')`,
      [sid]
    );
    state = await read();
    assert.ok(state.ready, JSON.stringify(done(state)));
    assert.equal(state.requested_at, null);

    // Asked once.
    const asked = await ask();
    assert.equal(asked.response.status, 201, JSON.stringify(asked.body));
    assert.ok(asked.body.requested_at);
    const again = await ask();
    assert.equal(again.response.status, 409);
    assert.ok((await read()).requested_at);

    // The coordinator is told, the notification opens the student's record, and the record shows it.
    const notes = await jsonRequest(`/api/notifications/coordinator/${encodeURIComponent(coordinator.coordinator_id)}`, { headers: authHeaders(coordinatorToken) });
    const told = notes.body.notifications.find((item) => item.title === "Completion review requested" && item.entity_id === sid);
    assert.equal(told?.link, `/coordinator/students/${sid}`);
    const record = await jsonRequest(`/api/coordinator/students/${sid}/overview`, { headers: authHeaders(coordinatorToken) });
    assert.ok(record.body.student.completion_requested_at);
  } finally {
    await clear();
    await pool.end();
  }
});

/*
| Privacy notice, consent and "Download my data"
*/

test("the privacy rules: the notice, what counts as agreement, and the two switches", () => {
  require("tsx/cjs");
  const { PRIVACY_NOTICE, hasCurrentConsent, consentRequired, photoRetentionDays } = require("../src/services/privacy.ts");

  assert.match(PRIVACY_NOTICE.version, /^[\w.-]{1,40}$/);
  assert.ok(PRIVACY_NOTICE.sections.length >= 4);
  for (const section of PRIVACY_NOTICE.sections) assert.ok(section.heading && section.body.length > 20);
  // Wording nobody has approved must say so, and approved wording must have no gaps left in it.
  const gaps = PRIVACY_NOTICE.sections.some((section) => /\[[A-Z][^\]]*\]/.test(section.body));
  assert.equal(PRIVACY_NOTICE.placeholder || !gaps, true, "a notice with bracketed gaps must be marked a placeholder");
  if (/^draft/i.test(PRIVACY_NOTICE.version)) assert.equal(PRIVACY_NOTICE.placeholder, true);

  // Agreement counts only for the notice as it stands now.
  assert.equal(hasCurrentConsent(PRIVACY_NOTICE.version), true);
  for (const other of [null, undefined, "", "an-older-version"]) assert.equal(hasCurrentConsent(other), false);

  // Both switches are off unless set, exactly.
  assert.equal(consentRequired({}), false);
  assert.equal(consentRequired({ PRIVACY_CONSENT_REQUIRED: "false" }), false);
  assert.equal(consentRequired({ PRIVACY_CONSENT_REQUIRED: "1" }), false);
  assert.equal(consentRequired({ PRIVACY_CONSENT_REQUIRED: "true" }), true);
  for (const off of [undefined, "", "0", "7", "29", "-90", "90 days", "ninety", "1e3", "36.5"]) {
    assert.equal(photoRetentionDays({ PHOTO_RETENTION_DAYS: off }), null, String(off));
  }
  assert.equal(photoRetentionDays({ PHOTO_RETENTION_DAYS: "30" }), 30);
  assert.equal(photoRetentionDays({ PHOTO_RETENTION_DAYS: " 365 " }), 365);
});

test("the privacy notice, consent and data download are the student's own", async () => {
  const supervisor = await supervisorSession();
  const id = encodeURIComponent(student.student_id);
  for (const [method, path] of [["GET", "privacy"], ["POST", "privacy/consent"], ["GET", "data-export"]]) {
    const send = (token, who = id) =>
      jsonRequest(`/api/students/${who}/${path}`, method === "GET" ? { headers: token ? authHeaders(token) : {} } : jsonBody(token, "POST", {}));
    assert.equal((await jsonRequest(`/api/students/${id}/${path}`, { method })).response.status, 401, path);
    assert.equal((await send(coordinatorToken)).response.status, 403, path);
    assert.equal((await send(supervisor.token)).response.status, 403, path);
    assert.equal((await send(studentToken, "SOMEONE-ELSE")).response.status, 403, path);
  }

  const { response, body } = await jsonRequest(`/api/students/${id}/privacy`, { headers: authHeaders(studentToken) });
  assert.equal(response.status, 200);
  assert.equal(typeof body.notice.version, "string");
  assert.equal(typeof body.notice.placeholder, "boolean");
  assert.ok(body.notice.sections.length >= 4);
  assert.equal(body.current, body.consent_version === body.notice.version);

  // Agreeing to a version that was not the one shown is refused, and records nothing.
  for (const bad of [{}, { version: "something-older" }, { version: 1 }]) {
    const refused = await jsonRequest(`/api/students/${id}/privacy/consent`, jsonBody(studentToken, "POST", bad));
    assert.equal(refused.response.status, 409, JSON.stringify(bad));
  }
  const after = await jsonRequest(`/api/students/${id}/privacy`, { headers: authHeaders(studentToken) });
  assert.deepEqual([after.body.consent_at, after.body.consent_version], [body.consent_at, body.consent_version]);
});

test("the data download holds the student's records and never a password", async () => {
  const id = encodeURIComponent(student.student_id);
  const response = await fetch(new URL(`/api/students/${id}/data-export`, apiBaseUrl), { headers: authHeaders(studentToken) });
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-disposition"), /^attachment; filename="internet-my-data-\d{4}-\d{2}-\d{2}\.json"$/);
  assert.match(response.headers.get("cache-control"), /no-store/);
  const raw = await response.text();
  const data = JSON.parse(raw);
  for (const key of ["account", "attendance", "absences", "tasks", "documents", "journals", "evaluations", "complaints", "complaint_messages", "schedule", "notifications"]) {
    assert.ok(key in data, key);
  }
  // The newer records: tasks worked on each day, weekly items, and the student's notification choices.
  for (const key of ["tasks_worked_on", "weekly_requirement_items", "notification_choices"]) {
    assert.ok(Array.isArray(data[key]), key);
  }
  const logIds = new Set(data.attendance.map((row) => row.id));
  for (const row of data.tasks_worked_on) assert.ok(logIds.has(row.attendance_id), "a task worked on belongs to one of the student's own logs");
  for (const row of data.weekly_requirement_items) assert.equal(row.student_id, student.student_id);
  // Notes written about the student by staff are not the student's to download.
  assert.equal("student_notes" in data, false);
  assert.equal(raw.includes('"reminded_at":'), false, "reminder bookkeeping is not part of the record");
  assert.equal(data.account.student_id, student.student_id);
  assert.equal(data.account.email, student.email);
  for (const secret of ["password", "auth_version", "must_change_password"]) {
    assert.equal(raw.includes(`"${secret}":`), false, `${secret} must not be in the download`);
  }
  // Only this student's rows.
  for (const key of ["attendance", "absences", "tasks", "documents", "journals", "complaints", "schedule", "notifications"]) {
    for (const row of data[key]) assert.equal(row.student_id, student.student_id, key);
  }
  // It agrees with what the app itself shows.
  const own = await jsonRequest(`/api/attendance/${id}`, { headers: authHeaders(studentToken) });
  assert.equal(data.attendance.length, own.body.attendance.length);
});

test("agreeing to the privacy notice is recorded once and kept", async (t) => {
  if (process.env.ALLOW_TEST_WRITES !== "true") {
    t.skip("set ALLOW_TEST_WRITES=true to run against a throwaway database");
    return;
  }
  const id = encodeURIComponent(student.student_id);
  const pool = localTestPool();
  const read = async () => (await jsonRequest(`/api/students/${id}/privacy`, { headers: authHeaders(studentToken) })).body;
  const before = await pool.query(`SELECT privacy_consent_at, privacy_consent_version FROM students WHERE student_id = $1`, [student.student_id]);
  try {
    await pool.query(`UPDATE students SET privacy_consent_at = NULL, privacy_consent_version = NULL WHERE student_id = $1`, [student.student_id]);
    const fresh = await read();
    assert.deepEqual([fresh.current, fresh.consent_at, fresh.consent_version], [false, null, null]);

    const agree = () => jsonRequest(`/api/students/${id}/privacy/consent`, jsonBody(studentToken, "POST", { version: fresh.notice.version }));
    const first = await agree();
    assert.equal(first.response.status, 200, JSON.stringify(first.body));
    assert.equal(first.body.current, true);
    assert.equal(first.body.consent_version, fresh.notice.version);
    assert.ok(first.body.consent_at);
    // Agreeing again keeps the first time.
    const second = await agree();
    assert.equal(second.body.consent_at, first.body.consent_at);
    assert.equal((await read()).current, true);

    // An agreement to an older notice is no longer current, and agreeing again takes a new time.
    await pool.query(`UPDATE students SET privacy_consent_version = 'an-older-version', privacy_consent_at = '2001-01-01' WHERE student_id = $1`, [student.student_id]);
    assert.equal((await read()).current, false);
    const renewed = await agree();
    assert.equal(renewed.body.current, true);
    assert.notEqual(new Date(renewed.body.consent_at).getFullYear(), 2001);

    // It is in the data download.
    const download = await jsonRequest(`/api/students/${id}/data-export`, { headers: authHeaders(studentToken) });
    assert.equal(download.body.account.privacy_consent_version, fresh.notice.version);
  } finally {
    await pool.query(`UPDATE students SET privacy_consent_at = $2, privacy_consent_version = $3 WHERE student_id = $1`,
      [student.student_id, before.rows[0].privacy_consent_at, before.rows[0].privacy_consent_version]);
    await pool.end();
  }
});

/*
| Supervisor: correcting the times on a log
*/

test("only the intern's supervisor can correct a log's times, and the request is checked first", async () => {
  const supervisor = await supervisorSession();
  const good = { time_in: "08:00", break_time: "12:00", break_end_time: "13:00", time_out: "17:00", reason: "Phone clock was wrong." };
  const send = (target, body, token = supervisor.token) =>
    jsonRequest(`/api/attendance/${target}/times`, jsonBody(token, "PATCH", body));

  assert.equal((await jsonRequest("/api/attendance/1/times", { method: "PATCH" })).response.status, 401);
  assert.equal((await send("1", good, studentToken)).response.status, 403);
  assert.equal((await send("1", good, coordinatorToken)).response.status, 403);
  assert.equal((await send("abc", good)).response.status, 404);
  assert.equal((await send("999999999", good)).response.status, 404);

  // Refused before the log is even looked up.
  for (const bad of [
    { ...good, time_in: "8am" }, { ...good, time_out: "25:00" }, { ...good, time_in: "" }, { ...good, time_in: 800 },
    { ...good, break_end_time: null }, { ...good, break_time: null },
    { ...good, time_out: "07:00" }, { ...good, break_time: "13:00", break_end_time: "12:00" }, { ...good, break_end_time: "17:30" },
    { ...good, time_out: "08:00" },
    { ...good, reason: "" }, { ...good, reason: "no" }, { ...good, reason: "x".repeat(501) },
  ]) {
    assert.equal((await send("999999999", bad)).response.status, 400, JSON.stringify(bad).slice(0, 90));
  }
});

test("a correction recomputes the hours, tells the intern, and is closed once the coordinator acknowledges", async (t) => {
  if (process.env.ALLOW_TEST_WRITES !== "true") {
    t.skip("set ALLOW_TEST_WRITES=true to run against a throwaway database");
    return;
  }
  const supervisor = await supervisorSession();
  const pool = localTestPool();
  const day = "2001-03-05";
  const clear = async () => {
    await pool.query(`DELETE FROM attendance WHERE student_id = $1 AND date = $2`, [student.student_id, day]);
    await pool.query(`DELETE FROM notifications WHERE student_id = $1 AND title = 'Attendance times corrected'`, [student.student_id]);
  };
  await clear();
  try {
    const made = await pool.query(
      `INSERT INTO attendance (student_id, date, time_in, time_out, hours, status)
       VALUES ($1, $2, $2::date + TIME '08:00', $2::date + TIME '17:00', 9, 'Pending') RETURNING id`,
      [student.student_id, day]
    );
    const id = made.rows[0].id;
    const send = (body) => jsonRequest(`/api/attendance/${id}/times`, jsonBody(supervisor.token, "PATCH", body));
    const stored = async () => (await pool.query(
      `SELECT TO_CHAR(time_in, 'HH24:MI') AS time_in, TO_CHAR(break_time, 'HH24:MI') AS break_time,
              TO_CHAR(break_end_time, 'HH24:MI') AS break_end_time, TO_CHAR(time_out, 'HH24:MI') AS time_out,
              hours::float AS hours, status, time_correction_reason, time_corrected_by FROM attendance WHERE id = $1`, [id])).rows[0];

    // The same times again are not a correction.
    assert.equal((await send({ time_in: "08:00", time_out: "17:00", reason: "Nothing changed." })).response.status, 400);

    // A break added and a later start: 08:30 to 17:00 less one hour is 7.5.
    const fixed = await send({ time_in: "08:30", break_time: "12:00", break_end_time: "13:00", time_out: "17:00", reason: "Arrived at 8:30; lunch was not logged." });
    assert.equal(fixed.response.status, 200, JSON.stringify(fixed.body));
    assert.equal(Number(fixed.body.attendance.hours), 7.5);
    assert.deepEqual(fixed.body.before, { time_in: "08:00", break_time: null, break_end_time: null, time_out: "17:00", hours: 9 });
    assert.deepEqual(fixed.body.after, { time_in: "08:30", break_time: "12:00", break_end_time: "13:00", time_out: "17:00", hours: 7.5 });
    let row = await stored();
    assert.deepEqual([row.time_in, row.break_time, row.break_end_time, row.time_out, row.hours], ["08:30", "12:00", "13:00", "17:00", 7.5]);
    assert.equal(row.status, "Pending", "the status is left as it was");
    assert.equal(row.time_corrected_by, supervisor.supervisor.supervisor_id);

    // The time-out removed: the log is open again and has no hours.
    const reopened = await send({ time_in: "08:30", time_out: null, reason: "They had not left yet." });
    assert.equal(reopened.response.status, 200);
    row = await stored();
    assert.deepEqual([row.break_time, row.time_out, row.hours], [null, null, null]);
    await send({ time_in: "08:30", time_out: "16:30", reason: "Left at 4:30." });
    assert.equal((await stored()).hours, 8);

    // The intern is told, sees it on their log, and the notification opens their attendance.
    const own = await jsonRequest(`/api/attendance/${encodeURIComponent(student.student_id)}`, { headers: authHeaders(studentToken) });
    assert.equal(own.body.attendance.find((log) => log.id === id).time_correction_reason, "Left at 4:30.");
    const notes = await jsonRequest(`/api/notifications/student/${encodeURIComponent(student.student_id)}`, { headers: authHeaders(studentToken) });
    const told = notes.body.notifications.find((item) => item.title === "Attendance times corrected");
    assert.equal(told?.link, `/daily-log?focus=attendance-${id}`);
    assert.match(told.message, /Left at 4:30\./);

    // Before and after are in the audit log.
    await new Promise((resolve) => setTimeout(resolve, 400));
    const audit = await jsonRequest("/api/coordinator/audit?action=attendance.correct_times&limit=10", { headers: authHeaders(coordinatorToken) });
    const first = audit.body.entries.filter((entry) => String(entry.entity_id) === String(id)).pop();
    assert.equal(first.details.before, "in 08:00, no break, out 17:00, 9 h");
    assert.equal(first.details.after, "in 08:30, break 12:00 to 13:00, out 17:00, 7.5 h");

    // Rejected and acknowledged by the coordinator: closed.
    await pool.query(`UPDATE attendance SET status = 'Rejected', flag_acknowledged_at = NOW() WHERE id = $1`, [id]);
    const closed = await send({ time_in: "09:00", time_out: "16:30", reason: "Trying again." });
    assert.equal(closed.response.status, 409);
    assert.equal((await stored()).time_in, "08:30");
  } finally {
    await clear();
    await pool.end();
  }
});

/*
| Time record certification
*/

test("a time record's certifications are read by the people on it, and certified only by the supervisor", async () => {
  const supervisor = await supervisorSession();
  const id = encodeURIComponent(student.student_id);
  const path = `/api/dtr-certifications/${id}`;
  assert.equal((await jsonRequest(path)).response.status, 401);
  for (const token of [studentToken, supervisor.token, coordinatorToken]) {
    const { response, body } = await jsonRequest(path, { headers: authHeaders(token) });
    assert.equal(response.status, 200);
    assert.ok(Array.isArray(body.certifications));
  }
  assert.equal((await jsonRequest("/api/dtr-certifications/SOMEONE-ELSE", { headers: authHeaders(studentToken) })).response.status, 403);
  assert.equal((await jsonRequest("/api/dtr-certifications/SOMEONE-ELSE", { headers: authHeaders(supervisor.token) })).response.status, 403);

  const certify = (body, token = supervisor.token) => jsonRequest("/api/dtr-certifications", jsonBody(token, "POST", body));
  const good = { student_id: student.student_id, month: "2001-04" };
  assert.equal((await certify(good, studentToken)).response.status, 403);
  assert.equal((await certify(good, coordinatorToken)).response.status, 403);
  for (const bad of [{}, { month: "2001-04" }, { ...good, month: "April 2001" }, { ...good, month: "2001-13" }, { ...good, month: "2099-01" }]) {
    assert.equal((await certify(bad)).response.status, 400, JSON.stringify(bad));
  }
  assert.equal((await certify({ student_id: "SOMEONE-ELSE", month: "2001-04" })).response.status, 403);
  // A month with no logs has nothing to certify.
  assert.equal((await certify({ student_id: student.student_id, month: "1999-01" })).response.status, 409);
  for (const target of ["999999999", "abc"]) {
    assert.equal((await jsonRequest(`/api/dtr-certifications/${target}`, jsonBody(supervisor.token, "DELETE", {}))).response.status, 404, target);
  }
  assert.equal((await jsonRequest("/api/dtr-certifications/1", jsonBody(studentToken, "DELETE", {}))).response.status, 403);
});

test("a month is certified once, only when its logs are settled, and can be withdrawn", async (t) => {
  if (process.env.ALLOW_TEST_WRITES !== "true") {
    t.skip("set ALLOW_TEST_WRITES=true to run against a throwaway database");
    return;
  }
  const supervisor = await supervisorSession();
  const pool = localTestPool();
  const month = "2001-04";
  const clear = async () => {
    await pool.query(`DELETE FROM dtr_certifications WHERE student_id = $1 AND month = $2`, [student.student_id, month]);
    await pool.query(`DELETE FROM attendance WHERE student_id = $1 AND TO_CHAR(date, 'YYYY-MM') = $2`, [student.student_id, month]);
    await pool.query(`DELETE FROM notifications WHERE student_id = $1 AND title = 'Time record certified'`, [student.student_id]);
  };
  await clear();
  try {
    await pool.query(
      `INSERT INTO attendance (student_id, date, time_in, time_out, hours, status) VALUES
        ($1, '2001-04-02', '2001-04-02 08:00', '2001-04-02 17:00', 8, 'Verified'),
        ($1, '2001-04-03', '2001-04-03 08:00', '2001-04-03 16:30', 7.5, 'Verified'),
        ($1, '2001-04-04', '2001-04-04 08:00', '2001-04-04 17:00', 8, 'Rejected'),
        ($1, '2001-04-05', '2001-04-05 08:00', '2001-04-05 17:00', 8, 'Pending')`,
      [student.student_id]
    );
    const certify = () => jsonRequest("/api/dtr-certifications", jsonBody(supervisor.token, "POST", { student_id: student.student_id, month }));

    // One log still waiting: not yet.
    const early = await certify();
    assert.equal(early.response.status, 409);
    assert.match(early.body.message, /1 log in that month is still open or waiting/);
    await pool.query(`UPDATE attendance SET status = 'Verified' WHERE student_id = $1 AND date = '2001-04-05'`, [student.student_id]);

    const done = await certify();
    assert.equal(done.response.status, 201, JSON.stringify(done.body));
    const certification = done.body.certification;
    // Verified hours only; the rejected day is logged but not counted.
    assert.deepEqual(
      [certification.month, certification.verified_hours, certification.days_logged, certification.certified_by_name],
      [month, 23.5, 4, supervisor.supervisor.name]
    );
    assert.equal((await certify()).response.status, 409, "one certification per month");

    // The student sees it and is told.
    const seen = await jsonRequest(`/api/dtr-certifications/${encodeURIComponent(student.student_id)}`, { headers: authHeaders(studentToken) });
    assert.ok(seen.body.certifications.some((item) => item.id === certification.id));
    const notes = await jsonRequest(`/api/notifications/student/${encodeURIComponent(student.student_id)}`, { headers: authHeaders(studentToken) });
    assert.equal(notes.body.notifications.find((item) => item.title === "Time record certified")?.link, "/time-record");

    // Withdrawn, then certified again.
    const withdrawn = await jsonRequest(`/api/dtr-certifications/${certification.id}`, jsonBody(supervisor.token, "DELETE", {}));
    assert.equal(withdrawn.response.status, 200);
    assert.equal((await jsonRequest(`/api/dtr-certifications/${certification.id}`, jsonBody(supervisor.token, "DELETE", {}))).response.status, 404);
    assert.equal((await certify()).response.status, 201);

    await new Promise((resolve) => setTimeout(resolve, 400));
    const audit = await jsonRequest("/api/coordinator/audit?action=dtr&limit=10", { headers: authHeaders(coordinatorToken) });
    const actions = audit.body.entries.filter((entry) => entry.entity_id === student.student_id).slice(0, 3).map((entry) => entry.action);
    assert.deepEqual(actions, ["dtr.certify", "dtr.withdraw", "dtr.certify"]);
  } finally {
    await clear();
    await pool.end();
  }
});

/*
| Final evaluation
*/

test("the evaluation form is read by everyone signed in and changed only by the coordinator, with checks", async () => {
  const supervisor = await supervisorSession();
  assert.equal((await jsonRequest("/api/evaluation-form")).response.status, 401);
  for (const token of [studentToken, supervisor.token, coordinatorToken]) {
    const { response, body } = await jsonRequest("/api/evaluation-form", { headers: authHeaders(token) });
    assert.equal(response.status, 200);
    assert.ok(body.form, "there is a form to fill in");
    assert.ok(body.form.criteria.length >= 2);
    assert.equal(typeof body.form.is_sample, "boolean");
    for (const criterion of body.form.criteria) assert.deepEqual(Object.keys(criterion).sort(), ["description", "key", "label"]);
  }
  const save = (body, token = coordinatorToken) => jsonRequest("/api/coordinator/evaluation-form", jsonBody(token, "PUT", body));
  const good = { name: "Final evaluation", scale_max: 5, criteria: [{ label: "Quality of work", description: "" }, { label: "Conduct", description: "" }] };
  assert.equal((await save(good, studentToken)).response.status, 403);
  assert.equal((await save(good, supervisor.token)).response.status, 403);
  for (const bad of [{}, { ...good, name: "x" }, { ...good, scale_max: 2 }, { ...good, scale_max: 11 }, { ...good, scale_max: 4.5 },
    { ...good, criteria: [] }, { ...good, criteria: [{ label: "Only one" }] }, { ...good, criteria: "Quality" },
    { ...good, criteria: [{ label: "Ok one" }, { label: "x" }] }, { ...good, criteria: [{ label: "Same" }, { label: "same" }] },
    { ...good, criteria: [{ label: "Fine", description: "x".repeat(301) }, { label: "Other" }] },
    { ...good, criteria: Array.from({ length: 21 }, (_, index) => ({ label: `Criterion ${index}` })) }]) {
    assert.equal((await save(bad)).response.status, 400, JSON.stringify(bad).slice(0, 80));
  }

  // The final evaluation itself: who may read and write it.
  const id = encodeURIComponent(student.student_id);
  assert.equal((await jsonRequest(`/api/final-evaluations/${id}`)).response.status, 401);
  for (const token of [studentToken, supervisor.token, coordinatorToken]) {
    const read = await jsonRequest(`/api/final-evaluations/${id}`, { headers: authHeaders(token) });
    assert.equal(read.response.status, 200);
    assert.ok("evaluation" in read.body);
  }
  assert.equal((await jsonRequest("/api/final-evaluations/SOMEONE-ELSE", { headers: authHeaders(studentToken) })).response.status, 403);
  assert.equal((await jsonRequest("/api/final-evaluations/SOMEONE-ELSE", { headers: authHeaders(supervisor.token) })).response.status, 403);
  const put = (token, who = id) => jsonRequest(`/api/final-evaluations/${who}`, jsonBody(token, "PUT", { ratings: {}, remarks: "Good work throughout." }));
  assert.equal((await put(studentToken)).response.status, 403);
  assert.equal((await put(coordinatorToken)).response.status, 403);
  assert.equal((await put(supervisor.token, "SOMEONE-ELSE")).response.status, 403);
});

test("a final evaluation rates every criterion once per student and keeps the form it was written on", async (t) => {
  if (process.env.ALLOW_TEST_WRITES !== "true") {
    t.skip("set ALLOW_TEST_WRITES=true to run against a throwaway database");
    return;
  }
  const supervisor = await supervisorSession();
  const pool = localTestPool();
  const id = encodeURIComponent(student.student_id);
  const formsBefore = (await pool.query(`SELECT id, is_active FROM evaluation_forms ORDER BY id`)).rows;
  const kept = (await pool.query(`SELECT * FROM final_evaluations WHERE student_id = $1`, [student.student_id])).rows[0];
  await pool.query(`DELETE FROM final_evaluations WHERE student_id = $1`, [student.student_id]);
  try {
    const form = (await jsonRequest("/api/evaluation-form", { headers: authHeaders(supervisor.token) })).body.form;
    const all = (value) => Object.fromEntries(form.criteria.map((criterion) => [criterion.key, value]));
    const put = (body) => jsonRequest(`/api/final-evaluations/${id}`, jsonBody(supervisor.token, "PUT", { form_id: form.id, ...body }));

    // Every criterion, in range, whole numbers; remarks required.
    const first = form.criteria[0].key;
    for (const bad of [{ ratings: {}, remarks: "Good work throughout." }, { ratings: { ...all(4), [first]: 0 }, remarks: "Good work throughout." },
      { ratings: { ...all(4), [first]: form.scale_max + 1 }, remarks: "Good work throughout." }, { ratings: { ...all(4), [first]: 3.5 }, remarks: "Good work throughout." },
      { ratings: { ...all(4), [first]: "4" }, remarks: "Good work throughout." }, { ratings: all(4), remarks: "Good." }, { ratings: all(4) }]) {
      assert.equal((await put(bad)).response.status, 400, JSON.stringify(bad).slice(0, 80));
    }
    // A form that is no longer the one in use.
    assert.equal((await jsonRequest(`/api/final-evaluations/${id}`, jsonBody(supervisor.token, "PUT", { form_id: form.id + 9999, ratings: all(4), remarks: "Good work throughout." }))).response.status, 409);

    const ratings = { ...all(4), [first]: 5 };
    const sent = await put({ ratings, remarks: "  Reliable and quick to learn.  " });
    assert.equal(sent.response.status, 201, JSON.stringify(sent.body));
    const expected = Math.round(((4 * (form.criteria.length - 1) + 5) / form.criteria.length) * 100) / 100;
    assert.equal(sent.body.evaluation.average, expected);
    assert.equal(sent.body.evaluation.remarks, "Reliable and quick to learn.");
    assert.deepEqual(sent.body.evaluation.form_snapshot.criteria, form.criteria);
    assert.equal(sent.body.evaluation.supervisor_name, supervisor.supervisor.name);

    // Sent again: the same one, changed. Still one per student.
    const changed = await put({ ratings: all(3), remarks: "Reliable and quick to learn." });
    assert.equal(changed.response.status, 200);
    assert.equal(changed.body.evaluation.id, sent.body.evaluation.id);
    assert.equal(changed.body.evaluation.average, 3);

    // The student and the coordinator read the same thing; it is on the checklist and in the download.
    for (const token of [studentToken, coordinatorToken]) {
      const read = await jsonRequest(`/api/final-evaluations/${id}`, { headers: authHeaders(token) });
      assert.equal(read.body.evaluation.average, 3);
    }
    const checklist = await jsonRequest(`/api/students/${id}/completion`, { headers: authHeaders(studentToken) });
    assert.equal(checklist.body.items.find((item) => item.key === "evaluation").done, true);
    const download = await jsonRequest(`/api/students/${id}/data-export`, { headers: authHeaders(studentToken) });
    assert.equal(download.body.final_evaluation.remarks, "Reliable and quick to learn.");
    const notes = await jsonRequest(`/api/notifications/student/${id}`, { headers: authHeaders(studentToken) });
    assert.equal(notes.body.notifications.find((item) => item.title === "Final evaluation submitted")?.link, "/student/feedback");

    // The coordinator changes the form: a new one is in use, no longer a sample; the evaluation keeps its own.
    const saved = await jsonRequest("/api/coordinator/evaluation-form", jsonBody(coordinatorToken, "PUT", {
      name: "Test form", scale_max: 4, criteria: [{ label: "  Punctuality ", description: "On time." }, { label: "Output" }],
    }));
    assert.equal(saved.response.status, 200, JSON.stringify(saved.body));
    assert.deepEqual(saved.body.form.criteria, [{ key: "c1", label: "Punctuality", description: "On time." }, { key: "c2", label: "Output", description: "" }]);
    assert.equal(saved.body.form.is_sample, false);
    const now = (await jsonRequest("/api/evaluation-form", { headers: authHeaders(studentToken) })).body.form;
    assert.equal(now.id, saved.body.form.id);
    const still = await jsonRequest(`/api/final-evaluations/${id}`, { headers: authHeaders(studentToken) });
    assert.deepEqual(still.body.evaluation.form_snapshot.criteria, form.criteria);
    // The old form can no longer be submitted.
    assert.equal((await put({ ratings: all(4), remarks: "Reliable and quick to learn." })).response.status, 409);
  } finally {
    // Put the forms and the student's evaluation back as they were.
    await pool.query(`DELETE FROM evaluation_forms WHERE id <> ALL($1::int[])`, [formsBefore.map((row) => row.id)]);
    for (const row of formsBefore) await pool.query(`UPDATE evaluation_forms SET is_active = $2 WHERE id = $1`, [row.id, row.is_active]);
    await pool.query(`DELETE FROM final_evaluations WHERE student_id = $1`, [student.student_id]);
    if (kept) {
      await pool.query(
        `INSERT INTO final_evaluations (student_id, form_id, form_snapshot, supervisor_id, supervisor_name, ratings, average, remarks, submitted_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [kept.student_id, kept.form_id, kept.form_snapshot, kept.supervisor_id, kept.supervisor_name, kept.ratings, kept.average, kept.remarks, kept.submitted_at, kept.updated_at]
      );
    }
    await pool.query(`DELETE FROM notifications WHERE title LIKE 'Final evaluation %' AND (student_id = $1 OR entity_id = $1)`, [student.student_id]);
    await pool.end();
  }
});

/*
| Notification preferences
*/

test("the notification rules: which category a type falls in, and what each role is offered", () => {
  require("tsx/cjs");
  const { categoryOf, categoriesFor } = require("../src/services/notificationPreferences.ts");
  assert.equal(categoryOf("attendance"), "attendance");
  assert.equal(categoryOf("comment"), "task");
  assert.equal(categoryOf("TASK"), "task");
  for (const other of ["info", "warning", "complaint", "", undefined, null]) assert.equal(categoryOf(other), "other");
  // A student is not offered the summary email; staff are, and it has no push.
  assert.equal(categoriesFor("student").some((item) => item.key === "digest"), false);
  for (const role of ["supervisor", "coordinator"]) {
    const digest = categoriesFor(role).find((item) => item.key === "digest");
    assert.deepEqual([digest.has_push, digest.has_email], [false, true]);
  }
  for (const role of ["student", "supervisor", "coordinator"]) {
    assert.ok(categoriesFor(role).some((item) => item.key === "other"), "nothing is left without a category");
  }
});

test("each person keeps their own notification choices, and they default to on", async (t) => {
  const supervisor = await supervisorSession();
  const path = "/api/notification-preferences";
  assert.equal((await jsonRequest(path)).response.status, 401);
  assert.equal((await jsonRequest(path, { method: "PUT" })).response.status, 401);
  const read = async (token) => (await jsonRequest(path, { headers: authHeaders(token) })).body.categories;
  const put = (body, token = studentToken) => jsonRequest(path, jsonBody(token, "PUT", body));

  for (const token of [studentToken, supervisor.token, coordinatorToken]) {
    for (const item of await read(token)) {
      assert.deepEqual(Object.keys(item).sort(), ["about", "email", "has_email", "has_push", "key", "label", "push"]);
      // A switch that does not exist is never reported as on.
      if (!item.has_push) assert.equal(item.push, false);
      if (!item.has_email) assert.equal(item.email, false);
    }
  }
  for (const bad of [{}, { category: "attendance" }, { category: "nonsense", push: false }, { category: "attendance", push: "no" },
    { category: "attendance", email: false }, { category: "digest", email: false }]) {
    assert.equal((await put(bad)).response.status, 400, JSON.stringify(bad));
  }
  assert.equal((await put({ category: "digest", push: false }, supervisor.token)).response.status, 400, "the summary email is not pushed");

  if (process.env.ALLOW_TEST_WRITES !== "true") return;
  const pool = localTestPool();
  const clear = () => pool.query(`DELETE FROM notification_preferences WHERE account_id IN ($1, $2)`, [student.student_id, supervisor.supervisor.supervisor_id]);
  await clear();
  try {
    const find = (list, key) => list.find((item) => item.key === key);
    assert.equal(find(await read(studentToken), "task").push, true, "on until turned off");
    const off = await put({ category: "task", push: false });
    assert.equal(off.response.status, 200, JSON.stringify(off.body));
    assert.deepEqual([off.body.category.push, off.body.category.email], [false, true], "the other switch is left alone");
    await put({ category: "task", email: false });
    const mine = find(await read(studentToken), "task");
    assert.deepEqual([mine.push, mine.email], [false, false]);
    // Someone else's choices are their own.
    assert.equal(find(await read(supervisor.token), "task").push, true);
    assert.equal((await put({ category: "digest", email: false }, supervisor.token)).body.category.email, false);

    require("tsx/cjs");
    const { allowsChannel } = require("../src/services/notificationPreferences.ts");
    assert.equal(await allowsChannel(pool, "student", student.student_id, "task", "push"), false);
    assert.equal(await allowsChannel(pool, "student", student.student_id, "attendance", "push"), true);
    assert.equal(await allowsChannel(pool, "supervisor", supervisor.supervisor.supervisor_id, "digest", "email"), false);

    // Turned off or not, the notification itself is still written.
    const before = (await jsonRequest(`/api/notifications/student/${encodeURIComponent(student.student_id)}`, { headers: authHeaders(studentToken) })).body.notifications.length;
    await pool.query(`INSERT INTO notifications (student_id, title, message, type, is_read) VALUES ($1, 'Preference check', 'Still here.', 'task', FALSE)`, [student.student_id]);
    const after = (await jsonRequest(`/api/notifications/student/${encodeURIComponent(student.student_id)}`, { headers: authHeaders(studentToken) })).body.notifications;
    assert.ok(after.length >= Math.min(before + 1, after.length) && after.some((item) => item.title === "Preference check"));
    await pool.query(`DELETE FROM notifications WHERE title = 'Preference check'`);
  } finally {
    await clear();
    await pool.end();
  }
});

/*
| Supervisor's daily summary email
*/

test("the summary email rules: the clock, the setting and the wording", () => {
  require("tsx/cjs");
  const { clockSetting, supervisorDigestLines } = require("../src/services/digests.ts");
  const { phClock } = require("../src/services/phTime.ts");
  assert.equal(clockSetting(undefined, "07:30"), "07:30");
  assert.equal(clockSetting(" 06:00 ", "07:30"), "06:00");
  for (const bad of ["7:30", "24:00", "07:60", "morning", ""]) assert.equal(clockSetting(bad, "07:30"), "07:30", bad);
  // 23:45 UTC on a Sunday is 07:45 on Monday in the Philippines.
  assert.deepEqual(phClock(new Date("2026-10-11T23:45:00Z")), { date: "2026-10-12", time: "07:45", weekday: 1 });
  assert.deepEqual(phClock(new Date("2026-10-11T16:00:00Z")), { date: "2026-10-12", time: "00:00", weekday: 1 });
  assert.deepEqual(supervisorDigestLines({ attendance: 0, tasks: 0, documents: 0, absences: 0, journals: 0 }), []);
  assert.deepEqual(
    supervisorDigestLines({ attendance: 1, tasks: 2, documents: 0, absences: 1, journals: 3 }),
    ["1 attendance log", "2 task submissions", "1 absence", "3 weekly reports"]
  );
});

test("a supervisor gets one summary a day, only when something waits and they want it", async (t) => {
  if (process.env.ALLOW_TEST_WRITES !== "true") {
    t.skip("set ALLOW_TEST_WRITES=true to run against a throwaway database");
    return;
  }
  require("tsx/cjs");
  const { sendSupervisorDigests } = require("../src/services/digests.ts");
  const supervisor = await supervisorSession();
  const sid = supervisor.supervisor.supervisor_id;
  const pool = localTestPool();
  const day = "2001-06-04";
  const clear = async () => {
    await pool.query(`DELETE FROM digest_log WHERE period_key LIKE '2001-06-%'`);
    await pool.query(`DELETE FROM absences WHERE student_id = $1 AND date = $2`, [student.student_id, day]);
    await pool.query(`DELETE FROM notification_preferences WHERE account_id = $1 AND category = 'digest'`, [sid]);
  };
  await clear();
  const outbox = [];
  const send = async (email) => {
    outbox.push(email);
  };
  // Summaries for other supervisors in the database are not this test's business.
  const mine = () => outbox.filter((email) => email.to === supervisor.supervisor.email);
  const at = (time, date = day) => new Date(`${date}T${time}:00+08:00`);
  const run = (now, extra = {}) => sendSupervisorDigests(pool, { now, env: { FRONTEND_URL: "https://example.test/" }, smtpReady: true, send, ...extra });
  try {
    // Something is waiting for this supervisor.
    await pool.query(`INSERT INTO absences (student_id, date, reason, status) VALUES ($1, $2, 'Summary email test.', 'Pending')`, [student.student_id, day]);

    // No SMTP: nothing, and nothing is marked as sent.
    assert.deepEqual(await run(at("08:00"), { smtpReady: false }), []);
    // Before the time: nothing.
    await run(at("07:29"));
    assert.equal(mine().length, 0);
    // A later time can be set.
    await run(at("08:00"), { env: { SUPERVISOR_DIGEST_TIME: "09:00" } });
    assert.equal(mine().length, 0);

    // At the time: one email, saying what waits and where to go.
    const sent = await run(at("07:30"));
    assert.ok(sent.includes(sid));
    assert.equal(mine().length, 1);
    const email = mine()[0];
    assert.match(email.subject, /waiting for your decision/);
    assert.match(email.text, /absence/);
    assert.match(email.text, /https:\/\/example\.test\/supervisor\/dashboard/);
    assert.match(email.text, /Profile > Notifications/);
    assert.equal(/password/i.test(email.text), false);

    // Later the same day: not again. The next day: again.
    await run(at("15:00"));
    assert.equal(mine().length, 1);
    await run(at("07:45", "2001-06-05"));
    assert.equal(mine().length, 2);

    // An email that fails is tried again at the next check.
    await run(at("08:00", "2001-06-06"), { send: async () => { throw new Error("mail server down"); } });
    assert.equal(mine().length, 2);
    await run(at("08:05", "2001-06-06"));
    assert.equal(mine().length, 3);

    // Turned off by the supervisor: none.
    await jsonRequest("/api/notification-preferences", jsonBody(supervisor.token, "PUT", { category: "digest", email: false }));
    await run(at("08:00", "2001-06-07"));
    assert.equal(mine().length, 3);
    await jsonRequest("/api/notification-preferences", jsonBody(supervisor.token, "PUT", { category: "digest", email: true }));

    // Nothing waiting: none.
    await pool.query(`DELETE FROM absences WHERE student_id = $1 AND date = $2`, [student.student_id, day]);
    const queue = await jsonRequest("/api/supervisor/review-count", { headers: authHeaders(supervisor.token) });
    if (queue.body.waiting === 0) {
      await run(at("08:00", "2001-06-08"));
      assert.equal(mine().length, 3);
    }
  } finally {
    await clear();
    await pool.end();
  }
});

/*
| Imports: the supervisor import, and checking a file before importing it
*/

test("checking an import file creates nothing and says what would happen to each row", async () => {
  const supervisor = await supervisorSession();
  const stamp = Date.now();
  const check = (kind, rows, token = coordinatorToken) =>
    jsonRequest(`/api/coordinator/${kind}/import`, jsonBody(token, "POST", { [kind]: rows, dry_run: true }));

  for (const kind of ["students", "supervisors"]) {
    assert.equal((await jsonRequest(`/api/coordinator/${kind}/import`, { method: "POST" })).response.status, 401);
    assert.equal((await check(kind, [{}], studentToken)).response.status, 403);
    assert.equal((await check(kind, [{}], supervisor.token)).response.status, 403);
    assert.equal((await check(kind, [])).response.status, 400);
    assert.equal((await check(kind, Array.from({ length: 201 }, () => ({})))).response.status, 400);
  }

  const students = await check("students", [
    { student_id: `DRY-${stamp}`, name: "New Student", email: `dry.${stamp}@example.com` },
    { student_id: student.student_id, name: "Taken Id", email: `other.${stamp}@example.com` },
    { student_id: `DRY2-${stamp}`, name: "Taken Email", email: student.email.toUpperCase() },
    { student_id: `DRY-${stamp}`, name: "Twice In File", email: `twice.${stamp}@example.com` },
    { student_id: `DRY3-${stamp}`, name: "Bad Email", email: "nope" },
    { student_id: `DRY4-${stamp}`, name: "Weak Password", email: `weak.${stamp}@example.com`, password: "short" },
  ]);
  assert.equal(students.response.status, 200, JSON.stringify(students.body));
  assert.equal(students.body.dry_run, true);
  assert.deepEqual(students.body.results.map((row) => row.status), ["ok", "error", "error", "error", "error", "error"]);
  assert.deepEqual([students.body.ready, students.body.failed], [1, 5]);
  assert.match(students.body.results[1].message, /already exists/);
  assert.match(students.body.results[2].message, /already exists/);
  assert.match(students.body.results[3].message, /more than once/);
  assert.ok(students.body.results.every((row) => !("password" in row)), "a check hands out no passwords");

  const supervisors = await check("supervisors", [
    { supervisor_id: `DRYSUP-${stamp}`, name: "New Supervisor", email: `drysup.${stamp}@example.com`, company: "Acme" },
    { supervisor_id: supervisor.supervisor.supervisor_id, name: "Taken", email: `x.${stamp}@example.com` },
    { supervisor_id: "", name: "No Id", email: `y.${stamp}@example.com` },
  ]);
  assert.equal(supervisors.response.status, 200);
  assert.deepEqual(supervisors.body.results.map((row) => row.status), ["ok", "error", "error"]);

  // Nothing was created by any of it.
  const list = await jsonRequest(`/api/coordinator/students?q=${encodeURIComponent(`DRY-${stamp}`)}&limit=5`, { headers: authHeaders(coordinatorToken) });
  assert.equal(list.body.students.length, 0);
});

test("supervisors are imported from a file like students, each with a password to change", async (t) => {
  if (process.env.ALLOW_TEST_WRITES !== "true") {
    t.skip("set ALLOW_TEST_WRITES=true to run against a throwaway database");
    return;
  }
  const pool = localTestPool();
  const stamp = Date.now();
  const ids = [`IMP-A-${stamp}`, `IMP-B-${stamp}`];
  const count = async () => (await jsonRequest("/api/coordinator/audit?action=account.import&limit=1", { headers: authHeaders(coordinatorToken) })).body.total;
  try {
    const before = await count();
    const rows = [
      { supervisor_id: ids[0], name: "Imported One", email: `imp.a.${stamp}@example.com`, company: "Acme", department: "Accounts" },
      { supervisor_id: ids[1], name: "Imported Two", email: `imp.b.${stamp}@example.com`, password: "ChosenPassword123!" },
      { supervisor_id: ids[0], name: "Same Id Again", email: `imp.c.${stamp}@example.com` },
    ];
    await jsonRequest("/api/coordinator/supervisors/import", jsonBody(coordinatorToken, "POST", { supervisors: rows, dry_run: true }));
    const done = await jsonRequest("/api/coordinator/supervisors/import", jsonBody(coordinatorToken, "POST", { supervisors: rows }));
    assert.equal(done.response.status, 201, JSON.stringify(done.body));
    assert.deepEqual([done.body.created, done.body.failed], [2, 1]);
    assert.deepEqual(done.body.results.map((row) => row.status), ["created", "created", "error"]);
    assert.ok(done.body.results[0].password.length >= 12, "a generated password is handed back once");
    assert.equal(done.body.results[1].password, "ChosenPassword123!");

    // They can sign in, and must then set their own password.
    const session = await login("supervisor", `imp.a.${stamp}@example.com`, done.body.results[0].password);
    assert.ok(session.token);
    const stored = await pool.query(`SELECT must_change_password, company, department, password FROM supervisors WHERE supervisor_id = $1`, [ids[0]]);
    assert.equal(stored.rows[0].must_change_password, true);
    assert.deepEqual([stored.rows[0].company, stored.rows[0].department], ["Acme", "Accounts"]);
    assert.notEqual(stored.rows[0].password, done.body.results[0].password, "the password is stored hashed");

    // The import is in the audit log once; the check before it is not.
    await new Promise((resolve) => setTimeout(resolve, 400));
    assert.equal(await count(), before + 1);
  } finally {
    await pool.query(`DELETE FROM supervisors WHERE supervisor_id = ANY($1::text[])`, [ids]);
    await pool.end();
  }
});

/*
| Coordinator accounts
*/

test("coordinator accounts are managed only by coordinators, with the same password rules", async () => {
  const supervisor = await supervisorSession();
  const path = "/api/coordinator/coordinators";
  assert.equal((await jsonRequest(path)).response.status, 401);
  assert.equal((await jsonRequest(path, { headers: authHeaders(studentToken) })).response.status, 403);
  assert.equal((await jsonRequest(path, { headers: authHeaders(supervisor.token) })).response.status, 403);

  const list = await jsonRequest(path, { headers: authHeaders(coordinatorToken) });
  assert.equal(list.response.status, 200);
  assert.equal(list.body.coordinators.filter((row) => row.is_self).length, 1);
  for (const row of list.body.coordinators) {
    assert.deepEqual(Object.keys(row).sort(), ["coordinator_id", "created_at", "department", "email", "is_active", "is_self", "name"]);
  }

  const good = { coordinator_id: "COORD-TEST", name: "Second Coordinator", email: "second@example.com", password: "StartingPass123!" };
  const post = (body, token = coordinatorToken) => jsonRequest(path, jsonBody(token, "POST", body));
  assert.equal((await post(good, supervisor.token)).response.status, 403);
  for (const bad of [{}, { ...good, coordinator_id: "x" }, { ...good, coordinator_id: "has space" }, { ...good, name: "" },
    { ...good, email: "nope" }, { ...good, password: "short" }, { ...good, password: undefined }, { ...good, department: "x".repeat(151) }]) {
    assert.equal((await post(bad)).response.status, 400, JSON.stringify(bad).slice(0, 70));
  }
  // An ID or email already in use.
  assert.equal((await post({ ...good, coordinator_id: coordinator.coordinator_id })).response.status, 409);
  assert.equal((await post({ ...good, email: coordinatorEmail.toUpperCase() })).response.status, 409);

  // Not yourself, by either route.
  const me = encodeURIComponent(coordinator.coordinator_id);
  const off = await jsonRequest(`${path}/${me}/status`, jsonBody(coordinatorToken, "PATCH", { is_active: false }));
  assert.equal(off.response.status, 409);
  assert.match(off.body.message, /your own account/);
  const reset = await jsonRequest(`/api/coordinator/coordinators/${me}/reset-password`, jsonBody(coordinatorToken, "POST", { password: "AnotherPass123!" }));
  assert.equal(reset.response.status, 409);
  assert.equal((await jsonRequest(`${path}/${me}/status`, jsonBody(coordinatorToken, "PATCH", {}))).response.status, 400);
  assert.equal((await jsonRequest(`${path}/NOBODY-HERE/status`, jsonBody(coordinatorToken, "PATCH", { is_active: true }))).response.status, 404);
  // Still signed in after all of that.
  assert.equal((await jsonRequest(path, { headers: authHeaders(coordinatorToken) })).response.status, 200);
});

test("a second coordinator is created, must change their password, and can be deactivated by another but not by themselves", async (t) => {
  if (process.env.ALLOW_TEST_WRITES !== "true") {
    t.skip("set ALLOW_TEST_WRITES=true to run against a throwaway database");
    return;
  }
  const pool = localTestPool();
  const stamp = Date.now();
  const id = `COORD-${stamp}`;
  const email = `coord.${stamp}@example.com`;
  const path = "/api/coordinator/coordinators";
  try {
    const made = await jsonRequest(path, jsonBody(coordinatorToken, "POST", { coordinator_id: id, name: "Second Coordinator", email, department: "CCS", password: "StartingPass123!" }));
    assert.equal(made.response.status, 201, JSON.stringify(made.body));
    assert.equal(made.body.coordinator.is_active, true);
    assert.equal("password" in made.body.coordinator, false);
    assert.equal((await pool.query(`SELECT must_change_password FROM coordinators WHERE coordinator_id = $1`, [id])).rows[0].must_change_password, true);

    // They can sign in and use the coordinator's routes.
    const second = await login("coordinator", email, "StartingPass123!");
    assert.equal((await jsonRequest(path, { headers: authHeaders(second.token) })).response.status, 200);

    // A temporary password from another coordinator ends their sessions.
    const reset = await jsonRequest(`${path}/${id}/reset-password`, jsonBody(coordinatorToken, "POST", { password: "TemporaryPass456!" }));
    assert.equal(reset.response.status, 200, JSON.stringify(reset.body));
    assert.equal((await jsonRequest(path, { headers: authHeaders(second.token) })).response.status, 401);
    const again = await login("coordinator", email, "TemporaryPass456!");

    // Deactivated: signed out at once, and cannot sign in.
    const off = await jsonRequest(`${path}/${id}/status`, jsonBody(coordinatorToken, "PATCH", { is_active: false }));
    assert.equal(off.response.status, 200);
    assert.equal(off.body.coordinator.is_active, false);
    assert.equal((await jsonRequest(path, { headers: authHeaders(again.token) })).response.status, 401);
    const refused = await jsonRequest("/api/login/coordinator", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password: "TemporaryPass456!" }) });
    assert.notEqual(refused.response.status, 200);

    // Reactivated: they can sign in again, and they too cannot deactivate
    // themselves. (Since nobody can deactivate their own account and only
    // an active coordinator can deactivate another, one always remains.)
    assert.equal((await jsonRequest(`${path}/${id}/status`, jsonBody(coordinatorToken, "PATCH", { is_active: true }))).response.status, 200);
    const back = await login("coordinator", email, "TemporaryPass456!");
    const self = await jsonRequest(`${path}/${id}/status`, jsonBody(back.token, "PATCH", { is_active: false }));
    assert.equal(self.response.status, 409);
    assert.equal((await pool.query(`SELECT is_active FROM coordinators WHERE coordinator_id = $1`, [id])).rows[0].is_active, true);

    await new Promise((resolve) => setTimeout(resolve, 400));
    const audit = await jsonRequest("/api/coordinator/audit?action=account&limit=30", { headers: authHeaders(coordinatorToken) });
    const actions = audit.body.entries.filter((entry) => entry.entity_id === id).map((entry) => entry.action);
    for (const action of ["account.create", "account.password_reset", "account.deactivate", "account.activate"]) assert.ok(actions.includes(action), action);
    assert.ok(audit.body.entries.filter((entry) => entry.entity_id === id).every((entry) => entry.entity_type === "coordinator"));
  } finally {
    await pool.query(`DELETE FROM coordinators WHERE coordinator_id = $1`, [id]);
    await pool.end();
  }
});

/*
| Site visits
*/

test("site visits are the coordinator's, and each needs a real company, a past date and findings", async () => {
  const supervisor = await supervisorSession();
  const path = "/api/coordinator/site-visits";
  assert.equal((await jsonRequest(path)).response.status, 401);
  assert.equal((await jsonRequest(path, { headers: authHeaders(studentToken) })).response.status, 403);
  assert.equal((await jsonRequest(path, { headers: authHeaders(supervisor.token) })).response.status, 403);
  const list = await jsonRequest(path, { headers: authHeaders(coordinatorToken) });
  assert.equal(list.response.status, 200);
  assert.ok(Array.isArray(list.body.visits));
  assert.equal((await jsonRequest(`${path}?company_id=abc`, { headers: authHeaders(coordinatorToken) })).response.status, 400);
  assert.equal((await jsonRequest(`${path}?company_id=999999999`, { headers: authHeaders(coordinatorToken) })).body.visits.length, 0);

  const good = { company_id: 999999999, visit_date: "2026-01-15", findings: "Met the supervisor; interns are well placed." };
  const post = (body, token = coordinatorToken) => jsonRequest(path, jsonBody(token, "POST", body));
  assert.equal((await post(good, supervisor.token)).response.status, 403);
  for (const bad of [{}, { ...good, company_id: "Acme" }, { ...good, company_id: 0 }, { ...good, visit_date: "15/01/2026" },
    { ...good, visit_date: "2099-01-01" }, { ...good, findings: "Fine." }, { ...good, findings: "x".repeat(3001) },
    { ...good, follow_up: "x".repeat(1001) }, good]) {
    assert.equal((await post(bad)).response.status, 400, JSON.stringify(bad).slice(0, 70));
  }
  for (const id of ["999999999", "abc"]) {
    assert.equal((await jsonRequest(`${path}/${id}`, jsonBody(coordinatorToken, "DELETE", {}))).response.status, 404, id);
  }
  assert.equal((await jsonRequest(`${path}/abc`, jsonBody(coordinatorToken, "PUT", good))).response.status, 404);
});

test("a visit is logged against a company, shows on the company, and can be corrected or removed", async (t) => {
  if (process.env.ALLOW_TEST_WRITES !== "true") {
    t.skip("set ALLOW_TEST_WRITES=true to run against a throwaway database");
    return;
  }
  const pool = localTestPool();
  const path = "/api/coordinator/site-visits";
  const name = `Visit Test Company ${Date.now()}`;
  let companyId;
  try {
    companyId = (await pool.query(`INSERT INTO companies (name) VALUES ($1) RETURNING id`, [name])).rows[0].id;
    const record = async () => (await jsonRequest("/api/coordinator/company-records", { headers: authHeaders(coordinatorToken) })).body.companies.find((item) => item.id === companyId);
    assert.deepEqual([(await record()).visits, (await record()).last_visit], [0, null]);

    const first = await jsonRequest(path, jsonBody(coordinatorToken, "POST", { company_id: companyId, visit_date: "2026-01-15", findings: "  Met the supervisor; interns are well placed.  ", follow_up: "" }));
    assert.equal(first.response.status, 201, JSON.stringify(first.body));
    assert.equal(first.body.visit.company, name);
    assert.equal(first.body.visit.findings, "Met the supervisor; interns are well placed.");
    assert.equal(first.body.visit.follow_up, null);
    assert.equal(first.body.visit.visited_by_name, coordinator.name);
    await jsonRequest(path, jsonBody(coordinatorToken, "POST", { company_id: companyId, visit_date: "2026-03-02", findings: "Second visit: one intern was moved to another desk.", follow_up: "Ask for the new seating plan." }));

    // Newest first, for that company only; the company shows the count and the latest date.
    const mine = await jsonRequest(`${path}?company_id=${companyId}`, { headers: authHeaders(coordinatorToken) });
    assert.deepEqual(mine.body.visits.map((visit) => visit.visit_date), ["2026-03-02", "2026-01-15"]);
    assert.deepEqual([(await record()).visits, (await record()).last_visit], [2, "2026-03-02"]);

    const edited = await jsonRequest(`${path}/${first.body.visit.id}`, jsonBody(coordinatorToken, "PUT", { company_id: companyId, visit_date: "2026-01-16", findings: "Met the supervisor on the 16th, not the 15th." }));
    assert.equal(edited.response.status, 200);
    assert.equal(edited.body.visit.visit_date, "2026-01-16");
    assert.equal((await jsonRequest(`${path}/${first.body.visit.id}`, jsonBody(coordinatorToken, "DELETE", {}))).response.status, 200);
    assert.equal((await record()).visits, 1);

    await new Promise((resolve) => setTimeout(resolve, 400));
    const audit = await jsonRequest("/api/coordinator/audit?action=site_visit&limit=10", { headers: authHeaders(coordinatorToken) });
    const actions = audit.body.entries.filter((entry) => String(entry.entity_id) === String(companyId)).map((entry) => entry.action);
    assert.deepEqual(actions, ["site_visit.remove", "site_visit.edit", "site_visit.log", "site_visit.log"]);
  } finally {
    if (companyId) {
      await pool.query(`DELETE FROM site_visits WHERE company_id = $1`, [companyId]);
      await pool.query(`DELETE FROM companies WHERE id = $1`, [companyId]);
    }
    await pool.end();
  }
});

/*
| Projections and alerts
*/

test("the projection counts remaining hours off against the schedule, skipping holidays", () => {
  require("tsx/cjs");
  const { projectFinish, missedScheduledDays } = require("../src/services/insights.ts");
  const week = { Monday: 8, Tuesday: 8, Wednesday: 8, Thursday: 8, Friday: 8 };
  const base = { today: "2026-10-09", requiredHours: 100, verifiedHours: 60, schedule: week, holidays: new Set() };

  // Friday 9 October, 40 hours left at 8 a day: Monday to Friday of the next week.
  const plain = projectFinish(base);
  assert.deepEqual([plain.remaining_hours, plain.weekly_hours, plain.projected_finish, plain.at_risk], [40, 40, "2026-10-16", false]);
  // A holiday in that week pushes it to the following Monday.
  assert.equal(projectFinish({ ...base, holidays: new Set(["2026-10-14"]) }).projected_finish, "2026-10-19");
  // Part of a day is still that day.
  assert.equal(projectFinish({ ...base, verifiedHours: 97 }).projected_finish, "2026-10-12");
  // Done: nothing to project, and never at risk.
  const done = projectFinish({ ...base, verifiedHours: 120 });
  assert.deepEqual([done.remaining_hours, done.projected_finish, done.at_risk], [0, null, false]);

  // At risk: after the term ends, or nothing scheduled, or absurdly far off.
  const late = projectFinish({ ...base, termEnd: "2026-10-15" });
  assert.equal(late.at_risk, true);
  assert.match(late.risk_reason, /after the term ends on 2026-10-15/);
  assert.equal(projectFinish({ ...base, termEnd: "2026-10-16" }).at_risk, false, "finishing on the last day is in time");
  const idle = projectFinish({ ...base, schedule: {} });
  assert.deepEqual([idle.projected_finish, idle.at_risk], [null, true]);
  assert.match(idle.risk_reason, /No working days/);
  assert.equal(projectFinish({ ...base, requiredHours: 100000, schedule: { Monday: 1 } }).at_risk, true);

  // Missed days: scheduled days back from yesterday with nothing on them.
  const missed = (accounted, extra = {}) =>
    missedScheduledDays({ today: "2026-10-16", since: "2026-09-01", schedule: week, holidays: new Set(), accounted: new Set(accounted), ...extra });
  assert.equal(missed(["2026-10-15"]), 0);
  // Friday 16th: Thu, Wed, Tue, Mon missed, then Friday the 9th was attended. The weekend does not count.
  assert.equal(missed(["2026-10-09"]), 4);
  assert.equal(missed(["2026-10-08"]), 5);
  assert.equal(missed(["2026-10-08"], { holidays: new Set(["2026-10-13"]) }), 4, "a holiday is not a missed day");
  assert.equal(missed([], { since: "2026-10-14" }), 2, "nothing is expected before the first day");
  assert.equal(missed([], { schedule: {} }), 0);
});

test("projections are scoped to who asks, and alerts are the coordinator's", async () => {
  const supervisor = await supervisorSession();
  assert.equal((await jsonRequest("/api/projections")).response.status, 401);
  const mine = await jsonRequest("/api/projections", { headers: authHeaders(studentToken) });
  assert.equal(mine.response.status, 200);
  assert.deepEqual(mine.body.projections.map((row) => row.student_id), [student.student_id], "a student sees only their own");
  const row = mine.body.projections[0];
  for (const key of ["remaining_hours", "weekly_hours", "projected_finish", "at_risk", "risk_reason", "required_hours", "verified_hours"]) assert.ok(key in row, key);
  assert.equal(row.remaining_hours, Math.max(0, Math.round((row.required_hours - row.verified_hours) * 100) / 100));
  if (row.projected_finish) assert.match(row.projected_finish, /^\d{4}-\d{2}-\d{2}$/);
  // A student cannot widen it.
  const widened = await jsonRequest("/api/projections?term=none", { headers: authHeaders(studentToken) });
  assert.deepEqual(widened.body.projections.map((item) => item.student_id), [student.student_id]);

  const interns = await jsonRequest(`/api/supervisor/${encodeURIComponent(supervisor.supervisor.supervisor_id)}/interns`, { headers: authHeaders(supervisor.token) });
  const theirs = await jsonRequest("/api/projections", { headers: authHeaders(supervisor.token) });
  assert.deepEqual(theirs.body.projections.map((item) => item.student_id).sort(), interns.body.interns.map((item) => item.student_id).sort());

  const all = await jsonRequest("/api/projections", { headers: authHeaders(coordinatorToken) });
  assert.ok(all.body.projections.length >= theirs.body.projections.length);
  assert.equal((await jsonRequest("/api/projections?term=abc", { headers: authHeaders(coordinatorToken) })).response.status, 400);
  assert.equal((await jsonRequest("/api/projections?term=999999999", { headers: authHeaders(coordinatorToken) })).body.projections.length, 0);

  assert.equal((await jsonRequest("/api/coordinator/alerts")).response.status, 401);
  assert.equal((await jsonRequest("/api/coordinator/alerts", { headers: authHeaders(studentToken) })).response.status, 403);
  assert.equal((await jsonRequest("/api/coordinator/alerts", { headers: authHeaders(supervisor.token) })).response.status, 403);
  const alerts = await jsonRequest("/api/coordinator/alerts", { headers: authHeaders(coordinatorToken) });
  assert.equal(alerts.response.status, 200);
  for (const alert of alerts.body.alerts) {
    assert.ok(["slow_supervisors", "moa_expiring", "missed_days", "at_risk"].includes(alert.key));
    assert.ok(alert.items.length > 0, "a kind with nothing in it is left out");
    assert.match(alert.link, /^\/coordinator\//);
  }
  // The at-risk alert and the projections agree.
  const risky = all.body.projections.filter((item) => item.at_risk).length;
  assert.equal(alerts.body.alerts.find((alert) => alert.key === "at_risk")?.items.length ?? 0, risky);
});

test("alerts pick up a slow supervisor and an agreement about to end, and the weekly email reports them once", async (t) => {
  if (process.env.ALLOW_TEST_WRITES !== "true") {
    t.skip("set ALLOW_TEST_WRITES=true to run against a throwaway database");
    return;
  }
  require("tsx/cjs");
  const { coordinatorAlerts, sendCoordinatorDigests } = require("../src/services/insights.ts");
  const supervisor = await supervisorSession();
  const pool = localTestPool();
  const name = `Alert Test Company ${Date.now()}`;
  const clear = async () => {
    await pool.query(`DELETE FROM absences WHERE student_id = $1 AND reason = 'Alert test.'`, [student.student_id]);
    await pool.query(`DELETE FROM companies WHERE name LIKE 'Alert Test Company %'`);
    await pool.query(`DELETE FROM digest_log WHERE kind = 'coordinator_weekly' AND period_key LIKE '2031-%'`);
  };
  await clear();
  try {
    // Monday 6 January 2031, 08:00 in the Philippines.
    const monday = new Date("2031-01-06T08:00:00+08:00");
    await pool.query(`INSERT INTO companies (name, moa_expiry, is_active) VALUES ($1, '2031-01-20', TRUE)`, [name]);
    await pool.query(`INSERT INTO absences (student_id, date, reason, status, created_at) VALUES ($1, '2030-12-20', 'Alert test.', 'Pending', '2031-01-01 09:00')`, [student.student_id]);

    const alerts = await coordinatorAlerts(pool, monday);
    const moa = alerts.find((alert) => alert.key === "moa_expiring");
    assert.ok(moa.items.some((item) => item.label === name && /in 14 days/.test(item.detail)), JSON.stringify(moa));
    const slow = alerts.find((alert) => alert.key === "slow_supervisors");
    assert.ok(slow.items.some((item) => item.label === supervisor.supervisor.name), "five days waiting is more than three");

    const outbox = [];
    const run = (now, env = {}) => sendCoordinatorDigests(pool, { now, env: { FRONTEND_URL: "https://example.test", ...env }, smtpReady: true, send: async (email) => { outbox.push(email); } });
    const mine = () => outbox.filter((email) => email.to === coordinatorEmail);
    // Not on a Sunday, not before the time, not without SMTP.
    await run(new Date("2031-01-05T08:00:00+08:00"));
    await run(new Date("2031-01-06T07:00:00+08:00"));
    assert.deepEqual(await sendCoordinatorDigests(pool, { now: monday, smtpReady: false }), []);
    assert.equal(mine().length, 0);
    // Monday morning: one email, naming what was found.
    await run(monday);
    assert.equal(mine().length, 1);
    assert.match(mine()[0].text, new RegExp(name));
    assert.match(mine()[0].text, /https:\/\/example\.test\/coordinator\/dashboard/);
    await run(new Date("2031-01-06T15:00:00+08:00"));
    assert.equal(mine().length, 1, "once a week");
    // Another day can be chosen.
    await run(new Date("2031-01-08T08:00:00+08:00"), { COORDINATOR_DIGEST_DAY: "wed" });
    assert.equal(mine().length, 2);
  } finally {
    await clear();
    await pool.end();
  }
});

/*
| The programme report, and its agreement with the screens
*/

test("the report's figures match Monitoring, its company rows match its student rows, and the term filter narrows both", async () => {
  const supervisor = await supervisorSession();
  const path = "/api/coordinator/report";
  assert.equal((await jsonRequest(path)).response.status, 401);
  assert.equal((await jsonRequest(path, { headers: authHeaders(studentToken) })).response.status, 403);
  assert.equal((await jsonRequest(path, { headers: authHeaders(supervisor.token) })).response.status, 403);
  assert.equal((await jsonRequest(`${path}?term=abc`, { headers: authHeaders(coordinatorToken) })).response.status, 400);

  const get = async (query = "") => (await jsonRequest(`${path}${query}`, { headers: authHeaders(coordinatorToken) })).body;
  const report = await get();
  const monitoring = (await jsonRequest("/api/coordinator/monitoring", { headers: authHeaders(coordinatorToken) })).body.students;

  // The same students, with the same verified hours, as Monitoring shows.
  assert.deepEqual(report.students.map((row) => row.student_id).sort(), monitoring.map((row) => row.student_id).sort());
  for (const row of report.students) {
    const shown = monitoring.find((item) => item.student_id === row.student_id);
    assert.ok(Math.abs(row.verified_hours - Number(shown.hours_rendered)) < 0.01, `${row.student_id}: ${row.verified_hours} vs ${shown.hours_rendered}`);
    assert.equal(row.completion, Math.min(100, Math.round((row.verified_hours / row.required_hours) * 100)));
    assert.equal(row.remaining_hours, Math.max(0, Math.round((row.required_hours - row.verified_hours) * 100) / 100));
  }
  // And the same projection the projections route gives.
  const projections = (await jsonRequest("/api/projections", { headers: authHeaders(coordinatorToken) })).body.projections;
  for (const row of report.students) {
    const projected = projections.find((item) => item.student_id === row.student_id);
    assert.deepEqual([row.projected_finish, row.at_risk], [projected.projected_finish, projected.at_risk], row.student_id);
  }

  // Every company row is the sum of its students' rows; nobody is counted twice or left out.
  const check = (data) => {
    assert.equal(data.companies.reduce((sum, row) => sum + row.students, 0), data.students.length);
    for (const company of data.companies) {
      const rows = data.students.filter((row) => ((row.company || "").trim() || "No company") === company.company);
      assert.equal(company.students, rows.length, company.company);
      assert.ok(Math.abs(company.verified_hours - rows.reduce((sum, row) => sum + row.verified_hours, 0)) < 0.01, company.company);
      assert.ok(Math.abs(company.required_hours - rows.reduce((sum, row) => sum + row.required_hours, 0)) < 0.01, company.company);
      assert.equal(company.at_risk, rows.filter((row) => row.at_risk).length, company.company);
      assert.equal(company.completed, rows.filter((row) => row.remaining_hours === 0 && row.required_hours > 0).length, company.company);
    }
  };
  check(report);

  // Each term's report is exactly the students Monitoring lists for that term, and the terms add up to the whole.
  const terms = (await jsonRequest("/api/coordinator/terms", { headers: authHeaders(coordinatorToken) })).body.terms;
  let counted = 0;
  for (const term of ["none", ...terms.map((item) => String(item.id))]) {
    const part = await get(`?term=${term}`);
    check(part);
    const listed = (await jsonRequest(`/api/coordinator/monitoring?term=${term}`, { headers: authHeaders(coordinatorToken) })).body.students;
    assert.deepEqual(part.students.map((row) => row.student_id).sort(), listed.map((row) => row.student_id).sort(), `term ${term}`);
    for (const row of part.students) assert.ok(report.students.some((whole) => whole.student_id === row.student_id && whole.verified_hours === row.verified_hours));
    counted += part.students.length;
  }
  assert.equal(counted, report.students.length, "every active student is in exactly one term's report, or in the one for no term");
  assert.equal((await get("?term=999999999")).students.length, 0);
});

/*
| The term filter on the dashboard and Analytics
*/

test("the dashboard and Analytics narrow to one term, and the terms add up to the whole", async () => {
  const headers = authHeaders(coordinatorToken);
  const get = async (path) => {
    const result = await jsonRequest(path, { headers });
    assert.equal(result.response.status, 200, `${path}: ${JSON.stringify(result.body).slice(0, 120)}`);
    return result.body;
  };
  for (const path of ["/api/coordinator/dashboard", "/api/coordinator/analytics"]) {
    assert.equal((await jsonRequest(`${path}?term=abc`, { headers })).response.status, 400, path);
    assert.equal((await jsonRequest(`${path}?term=1;DROP`, { headers })).response.status, 400, path);
    assert.equal((await jsonRequest(`${path}?term=none`, { headers: authHeaders(studentToken) })).response.status, 403, path);
    // Without a term: exactly as before.
    assert.deepEqual(await get(`${path}?term=`), await get(path));
  }

  const terms = ["none", ...(await get("/api/coordinator/terms")).terms.map((item) => String(item.id))];
  const whole = { dashboard: await get("/api/coordinator/dashboard"), analytics: await get("/api/coordinator/analytics?days=30") };
  const sum = { students: 0, hours: 0, analyticsStudents: 0, analyticsHours: 0, tasks: 0 };
  for (const term of terms) {
    const dashboard = await get(`/api/coordinator/dashboard?term=${term}`);
    const analytics = await get(`/api/coordinator/analytics?days=30&term=${term}`);
    const listed = (await get(`/api/coordinator/monitoring?term=${term}`)).students;
    // The dashboard's active students are the ones Monitoring lists for the term.
    assert.equal(Number(dashboard.students.active), listed.length, `term ${term}`);
    assert.equal(Number(analytics.progress.students), listed.length, `term ${term}`);
    const hours = listed.reduce((total, row) => total + Number(row.hours_rendered), 0);
    assert.ok(Math.abs(Number(dashboard.totalHoursLogged) - hours) < 0.01, `term ${term}: ${dashboard.totalHoursLogged} vs ${hours}`);
    assert.ok(Math.abs(Number(analytics.progress.hours) - hours) < 0.01, `term ${term}`);
    // Companies in the term's analytics hold exactly the term's students.
    assert.equal(analytics.companies.reduce((total, row) => total + row.students, 0), listed.length, `term ${term}`);
    sum.students += Number(dashboard.students.active);
    sum.hours += Number(dashboard.totalHoursLogged);
    sum.analyticsStudents += Number(analytics.progress.students);
    sum.analyticsHours += Number(analytics.progress.hours);
    sum.tasks += analytics.taskFunnel.reduce((total, row) => total + row.count, 0);
  }
  assert.equal(sum.students, Number(whole.dashboard.students.active), "every active student is in one term or none");
  assert.ok(Math.abs(sum.hours - Number(whole.dashboard.totalHoursLogged)) < 0.01);
  assert.equal(sum.analyticsStudents, Number(whole.analytics.progress.students));
  assert.ok(Math.abs(sum.analyticsHours - Number(whole.analytics.progress.hours)) < 0.01);
  assert.equal(sum.tasks, whole.analytics.taskFunnel.reduce((total, row) => total + row.count, 0));

  // A term nobody is in: zeros, not an error.
  const empty = await get("/api/coordinator/dashboard?term=999999999");
  assert.equal(Number(empty.students.active), 0);
  assert.equal(Number(empty.totalHoursLogged), 0);
  assert.equal(Number((await get("/api/coordinator/analytics?term=999999999")).progress.students), 0);
});

/*
| The Students page's list, searched, filtered, ordered and paged on the server
*/

test("the student list can be ordered and narrowed to unsupervised students, a page at a time", async () => {
  const headers = authHeaders(coordinatorToken);
  const list = async (query) => {
    const result = await jsonRequest(`/api/coordinator/students${query}`, { headers });
    assert.equal(result.response.status, 200, `${query}: ${JSON.stringify(result.body).slice(0, 120)}`);
    return result.body;
  };
  const everyone = await list("");
  assert.ok(!("total" in everyone), "without paging the answer is as it always was");
  for (const row of everyone.students) assert.ok("progress" in row);

  // Each order really is that order, across pages, with nobody lost or repeated.
  const walk = async (sort) => {
    const rows = [];
    for (let offset = 0; ; offset += 2) {
      const page = await list(`?limit=2&offset=${offset}&sort=${sort}`);
      assert.equal(page.total, everyone.students.length, sort);
      rows.push(...page.students);
      if (page.students.length < 2) break;
    }
    assert.deepEqual(rows.map((row) => row.student_id).sort(), everyone.students.map((row) => row.student_id).sort(), sort);
    return rows;
  };
  const byName = await walk("name");
  assert.deepEqual(byName.map((row) => row.name), [...byName.map((row) => row.name)].sort((a, b) => a.localeCompare(b, "en", { sensitivity: "base" })));
  const byProgress = await walk("progress");
  const share = byProgress.map((row) => Number(row.progress));
  assert.deepEqual(share, [...share].sort((a, b) => a - b), "least progress first");
  for (const row of byProgress) {
    const expected = Number(row.required_hours) > 0 ? Number(row.hours_rendered) / Number(row.required_hours) : 0;
    assert.ok(Math.abs(Number(row.progress) - expected) < 0.0001, row.student_id);
  }
  await walk("supervisor");
  // An order that is not one of the three is by name.
  assert.deepEqual((await walk("password")).map((row) => row.student_id), byName.map((row) => row.student_id));

  // "No supervisor": active students with nobody supervising them, and only those.
  const unassigned = await list("?status=unassigned&limit=200");
  const expected = everyone.students.filter((row) => row.is_active && !row.supervisor_name).map((row) => row.student_id).sort();
  assert.deepEqual(unassigned.students.map((row) => row.student_id).sort(), expected);
  assert.equal(unassigned.total, expected.length);
  // It combines with search and with a term.
  const none = await list("?status=unassigned&q=zzzz-no-such-student&limit=20");
  assert.deepEqual([none.students.length, none.total], [0, 0]);
  const inTerm = await list("?status=active&term=none&limit=200&sort=progress");
  assert.ok(inTerm.students.every((row) => row.is_active && row.term_id === null));
});

/*
| Notifications that open one particular record
*/

test("a notification's link names the record when its page can show that record", () => {
  require("tsx/cjs");
  const { notificationLink, withRecord } = require("../src/services/notificationLinks.ts");
  const link = (role, type, title, entity) => notificationLink(role, type, title, entity);

  // A student's log and task; a supervisor's queue item of any kind; a coordinator's complaint.
  assert.equal(link("student", "attendance", "Attendance verified", { type: "attendance", id: 41 }), "/daily-log?focus=attendance-41");
  assert.equal(link("student", "info", "New task assigned", { type: "task", id: 7 }), "/task?focus=task-7");
  assert.equal(link("supervisor", "task", "Task submitted for review", { type: "task", id: 7 }), "/supervisor/dashboard?focus=task-7");
  assert.equal(link("supervisor", "document", "Document submitted for review", { type: "document", id: 3 }), "/supervisor/dashboard?focus=document-3");
  assert.equal(link("supervisor", "info", "Weekly journal submitted", { type: "journal", id: 9 }), "/supervisor/dashboard?focus=journal-9");
  // The same notifications under the name used since Round 2: "weekly report".
  assert.equal(link("supervisor", "info", "Weekly report submitted", { type: "journal", id: 9 }), "/supervisor/dashboard?focus=journal-9");
  assert.equal(link("supervisor", "info", "Weekly report submitted again"), "/supervisor/dashboard");
  assert.equal(link("student", "info", "Weekly report returned"), "/journal");
  assert.equal(link("student", "info", "Weekly journal returned"), "/journal");
  assert.equal(link("coordinator", "warning", "New complaint filed", { type: "complaint", id: 12 }), "/coordinator/complaints?focus=complaint-12");
  assert.equal(link("coordinator", "warning", "New concern filed", { type: "complaint", id: 12 }), "/coordinator/complaints?focus=complaint-12");

  // No record named: the page alone, as before.
  assert.equal(link("student", "attendance", "Attendance verified"), "/daily-log");
  // A record whose page is a different one from where the notification leads: the page alone.
  assert.equal(link("supervisor", "task", "Task past its deadline", { type: "task", id: 7 }), "/supervisor/tasks");
  assert.equal(link("student", "document", "Document approved", { type: "document", id: 3 }), "/documents");
  // A coordinator's notification about a student still opens that student's record.
  assert.equal(link("coordinator", "info", "Completion review requested", { type: "student", id: "2021-0001" }), "/coordinator/students/2021-0001");
  // An id that is not a plain one is never put in a link.
  for (const bad of ["12&x=1", "a b", "../etc", ""]) {
    assert.equal(withRecord("student", "/task", { type: "task", id: bad }), "/task", JSON.stringify(bad));
  }
  assert.equal(withRecord("student", "/task", { type: "TASK", id: 5 }), "/task?focus=task-5");
});

/*
| Read receipts on announcements
*/

test("an announcement counts each reader once, from the first time it is on their list", async (t) => {
  // The coordinator's list always carries the count.
  const list = async () => (await jsonRequest("/api/coordinator/announcements", { headers: authHeaders(coordinatorToken) })).body.announcements;
  for (const item of await list()) {
    assert.equal(typeof item.read_count, "number");
    assert.ok(item.read_count >= 0);
  }
  if (process.env.ALLOW_TEST_WRITES !== "true") {
    t.skip("set ALLOW_TEST_WRITES=true to run against a throwaway database");
    return;
  }
  const supervisor = await supervisorSession();
  const title = `Read receipt check ${Date.now()}`;
  const sent = await jsonRequest("/api/coordinator/announcements", jsonBody(coordinatorToken, "POST", { title, message: "For everyone.", audience: "everyone" }));
  assert.ok(sent.response.ok, JSON.stringify(sent.body));
  const id = sent.body.announcement.id;
  const count = async () => (await list()).find((item) => item.id === id)?.read_count;
  const open = (token) => jsonRequest("/api/announcements", { headers: authHeaders(token) });
  try {
    assert.equal(await count(), 0, "sending it is not reading it");
    // The reader's own list is unchanged: no receipt details in it.
    const mine = await open(studentToken);
    assert.deepEqual(Object.keys(mine.body.announcements.find((item) => item.id === id)).sort(), ["created_at", "id", "message", "title"]);
    assert.equal(await count(), 1);
    await open(studentToken);
    await open(studentToken);
    assert.equal(await count(), 1, "the same reader is counted once");
    await open(supervisor.token);
    assert.equal(await count(), 2, "a second reader is a second receipt");
  } finally {
    const gone = await jsonRequest(`/api/coordinator/announcements/${id}`, jsonBody(coordinatorToken, "DELETE", {}));
    assert.ok(gone.response.ok);
  }
  // Withdrawn: its receipts go with it.
  const pool = localTestPool();
  try {
    assert.equal((await pool.query(`SELECT COUNT(*)::int AS n FROM announcement_reads WHERE announcement_id = $1`, [id])).rows[0].n, 0);
  } finally {
    await pool.end();
  }
});

/*
| Round 2, Phase 0: email through an HTTPS API, and single-use camera-check tickets
*/

test("email goes by the provider's API when it is set, by SMTP otherwise, and is off with neither", () => {
  require("tsx/cjs");
  const { emailRoute, isEmailConfigured, isSmtpConfigured } = require("../src/services/mailer.ts");
  const smtp = { SMTP_HOST: "smtp.example.com", SMTP_PORT: "587", SMTP_USER: "u", SMTP_PASSWORD: "p", SMTP_FROM: "INTERNet <no-reply@example.com>" };
  const api = { EMAIL_PROVIDER: "resend", EMAIL_API_KEY: "re_test_key", SMTP_FROM: "INTERNet <no-reply@example.com>" };

  assert.equal(emailRoute({}), null);
  assert.equal(isEmailConfigured({}), false);
  assert.equal(emailRoute(smtp), "smtp");
  assert.equal(emailRoute(api), "api");
  // Both set: the API, which is the one that works on the host.
  assert.equal(emailRoute({ ...smtp, ...api }), "api");
  assert.equal(emailRoute({ ...api, EMAIL_PROVIDER: " Resend " }), "api", "the provider's name is not case-sensitive");

  // Half-set is not set.
  assert.equal(emailRoute({ EMAIL_PROVIDER: "resend" }), null);
  assert.equal(emailRoute({ EMAIL_PROVIDER: "resend", EMAIL_API_KEY: "k" }), null, "there must be a sender address");
  assert.equal(emailRoute({ ...api, EMAIL_PROVIDER: "carrier-pigeon" }), null, "a provider this server does not know");
  assert.equal(emailRoute({ ...smtp, EMAIL_PROVIDER: "carrier-pigeon", EMAIL_API_KEY: "k" }), "smtp", "an unknown provider falls back to SMTP");
  for (const missing of ["SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASSWORD", "SMTP_FROM"]) {
    assert.equal(emailRoute({ ...smtp, [missing]: "" }), null, missing);
  }
  // The old name still answers, for the code that has not moved to the new one.
  assert.equal(typeof isSmtpConfigured(), "boolean");
});

test("the provider adapter sends one request, and says plainly why when it fails", async () => {
  require("tsx/cjs");
  const { sendThroughApi } = require("../src/services/mailer.ts");
  const env = { EMAIL_PROVIDER: "resend", EMAIL_API_KEY: "re_secret_key_123", SMTP_FROM: "INTERNet <no-reply@example.com>" };
  const email = { to: "student@example.com", subject: "Reset your password", text: "Use this link." };
  const answer = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });

  // Success: one POST to the provider, the key in the header only.
  const calls = [];
  await sendThroughApi(email, { env, fetcher: async (url, init) => { calls.push({ url, init }); return answer(200, { id: "abc" }); } });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://api.resend.com/emails");
  assert.equal(calls[0].init.method, "POST");
  assert.equal(calls[0].init.headers.Authorization, "Bearer re_secret_key_123");
  assert.deepEqual(JSON.parse(calls[0].init.body), { from: env.SMTP_FROM, to: ["student@example.com"], subject: email.subject, text: email.text });
  assert.equal(calls[0].init.body.includes("re_secret_key_123"), false);
  // An HTML part is sent only when there is one.
  await sendThroughApi({ ...email, html: "<p>Use this link.</p>" }, { env, fetcher: async (url, init) => { calls.push({ url, init }); return answer(200, {}); } });
  assert.equal(JSON.parse(calls[1].init.body).html, "<p>Use this link.</p>");

  // A refusal: the status and the provider's reason, never the key or the recipient.
  for (const [status, body, expected] of [
    [422, { statusCode: 422, name: "validation_error", message: "The from address is not verified." }, /status 422: The from address is not verified\./],
    [401, { message: "API key is invalid" }, /status 401: API key is invalid/],
    [403, { error: { message: "Domain not verified" } }, /status 403: Domain not verified/],
    [500, null, /status 500\.$/],
  ]) {
    await assert.rejects(
      sendThroughApi(email, { env, fetcher: async () => ({ ...answer(status, body), json: async () => { if (body === null) throw new Error("not JSON"); return body; } }) }),
      (error) => {
        assert.match(error.message, expected);
        assert.equal(error.message.includes("re_secret_key_123"), false);
        assert.equal(error.message.includes("student@example.com"), false);
        return true;
      }
    );
  }

  // No answer in time: the request is abandoned and said to have timed out.
  const started = Date.now();
  await assert.rejects(
    sendThroughApi(email, {
      env,
      timeoutMs: 40,
      fetcher: (url, init) => new Promise((resolve, reject) => init.signal.addEventListener("abort", () => reject(new Error(`aborted ${url} with ${init.headers.Authorization}`)))),
    }),
    (error) => {
      assert.match(error.message, /did not answer in time/);
      assert.equal(error.message.includes("re_secret_key_123"), false, "the underlying error is not passed on");
      return true;
    }
  );
  assert.ok(Date.now() - started < 2000);
  // The network failing is told apart from a timeout, still without detail.
  await assert.rejects(sendThroughApi(email, { env, fetcher: async () => { throw new TypeError("fetch failed re_secret_key_123"); } }), /could not be reached: TypeError\.$/);

  // Not configured: refused before any request.
  let asked = 0;
  await assert.rejects(sendThroughApi(email, { env: { EMAIL_PROVIDER: "resend" }, fetcher: async () => { asked += 1; return answer(200, {}); } }), /must be configured/);
  assert.equal(asked, 0);
});

test("with no email settings, password recovery still says it is unavailable", async () => {
  // The server under test has neither kind of email settings, as production has today.
  const reset = await jsonRequest("/api/auth/password-reset/request", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ role: "student", email: studentEmail }),
  });
  assert.equal(reset.response.status, 503);
  assert.match(reset.body.message, /temporarily unavailable/);
});

test("a camera-check ticket is spent by its first time-in and refused the second time", async (t) => {
  if (process.env.ALLOW_TEST_WRITES !== "true") {
    t.skip("set ALLOW_TEST_WRITES=true to run against a throwaway database");
    return;
  }
  require("tsx/cjs");
  const { forgetSpentTickets } = require("../src/services/timeOutReminders.ts");
  const pool = localTestPool();
  const challenge = await jsonRequest("/api/attendance/liveness-challenge", { method: "POST", headers: authHeaders(studentToken) });
  assert.equal(challenge.response.status, 200);
  // The ticket now carries an id of its own.
  const claims = JSON.parse(Buffer.from(challenge.body.ticket.split(".")[1], "base64url").toString());
  assert.match(claims.jti, /^[0-9a-f-]{36}$/);
  const again = await jsonRequest("/api/attendance/liveness-challenge", { method: "POST", headers: authHeaders(studentToken) });
  assert.notEqual(JSON.parse(Buffer.from(again.body.ticket.split(".")[1], "base64url").toString()).jti, claims.jti);

  const timeIn = (ticket, report) => {
    const form = new FormData();
    form.set("student_id", student.student_id);
    form.set("image", new Blob([sampleFiles.jpg], { type: "image/jpeg" }), "attendance.jpg");
    form.set("liveness_ticket", ticket);
    form.set("liveness_report", JSON.stringify(report));
    return jsonRequest("/api/attendance", { method: "POST", headers: authHeaders(studentToken), body: form });
  };
  const passed = { completed: challenge.body.prompts, flash: "passed" };
  const spentRow = async () => (await pool.query(`SELECT 1 FROM liveness_ticket_uses WHERE jti = $1`, [claims.jti])).rows.length;
  try {
    // A report that fails the check does not spend the ticket.
    assert.equal((await timeIn(challenge.body.ticket, { completed: [], flash: "passed" })).response.status, 400);
    assert.equal(await spentRow(), 0);

    // First use: recorded, or refused only because today already has a log. Either way the ticket is spent.
    const first = await timeIn(challenge.body.ticket, passed);
    assert.ok([201, 409].includes(first.response.status), `${first.response.status} ${JSON.stringify(first.body)}`);
    assert.notEqual(first.body.code, "LIVENESS_TICKET_USED");
    assert.equal(await spentRow(), 1);

    // Second use of the same ticket: refused as a spent ticket, before anything else is looked at.
    const second = await timeIn(challenge.body.ticket, passed);
    assert.equal(second.response.status, 409);
    assert.equal(second.body.code, "LIVENESS_TICKET_USED");
    assert.match(second.body.message, /already used/);

    // A fresh ticket is its own: it gets past the spent-ticket check.
    const other = await timeIn(again.body.ticket, { completed: again.body.prompts, flash: "passed" });
    assert.notEqual(other.body.code, "LIVENESS_TICKET_USED");

    // The record of a spent ticket is kept for a day, then removed.
    await pool.query(`INSERT INTO liveness_ticket_uses (jti, used_at) VALUES ('test-old-ticket', NOW() - INTERVAL '25 hours'), ('test-recent-ticket', NOW() - INTERVAL '23 hours') ON CONFLICT DO NOTHING`);
    assert.ok((await forgetSpentTickets(pool)) >= 1);
    const left = (await pool.query(`SELECT jti FROM liveness_ticket_uses WHERE jti LIKE 'test-%'`)).rows.map((row) => row.jti);
    assert.deepEqual(left, ["test-recent-ticket"]);
    assert.equal(await spentRow(), 1, "today's spent ticket is kept");
  } finally {
    await pool.query(`DELETE FROM liveness_ticket_uses WHERE jti LIKE 'test-%'`);
    await pool.end();
  }
});

/*
| Round 2, Phase 1A: the notification list a page at a time
*/

test("notifications come a page at a time when asked, with the totals, and whole when not", async () => {
  const supervisor = await supervisorSession();
  const lists = [
    [`/api/notifications/student/${encodeURIComponent(student.student_id)}`, studentToken, false],
    [`/api/notifications/supervisor/${encodeURIComponent(supervisor.supervisor.supervisor_id)}`, supervisor.token, true],
    [`/api/notifications/coordinator/${encodeURIComponent(coordinator.coordinator_id)}`, coordinatorToken, true],
  ];
  for (const [path, token, capped] of lists) {
    const get = (query = "") => jsonRequest(`${path}${query}`, { headers: authHeaders(token) });

    // Asked for plainly: the answer it has always given, and nothing more.
    const whole = await get();
    assert.equal(whole.response.status, 200, path);
    assert.deepEqual(Object.keys(whole.body), ["notifications"], path);
    const all = whole.body.notifications;

    // The first page: the newest ones, in the same order, with the counts.
    const first = await get("?limit=2");
    assert.equal(first.response.status, 200, path);
    assert.deepEqual(first.body.notifications.map((item) => item.id), all.slice(0, 2).map((item) => item.id), path);
    assert.equal(first.body.limit, 2);
    assert.equal(first.body.offset, 0);
    // The plain list of a supervisor or coordinator stops at 100; a paged one counts them all.
    if (capped) assert.ok(first.body.total >= all.length, path);
    else assert.equal(first.body.total, all.length, path);
    if (!capped || all.length < 100) {
      assert.equal(first.body.unread, all.filter((item) => !item.is_read).length, path);
    }

    // The second page follows on from the first.
    const second = await get("?limit=2&offset=2");
    assert.deepEqual(second.body.notifications.map((item) => item.id), all.slice(2, 4).map((item) => item.id), path);

    // Past the end: no rows, the same total.
    const past = await get(`?limit=20&offset=${first.body.total + 5}`);
    assert.equal(past.response.status, 200, path);
    assert.deepEqual(past.body.notifications, []);
    assert.equal(past.body.total, first.body.total);

    // Unread only: none of them read, and the total is the unread count.
    const unread = await get("?limit=50&status=unread");
    assert.equal(unread.response.status, 200, path);
    assert.ok(unread.body.notifications.every((item) => item.is_read === false), path);
    assert.equal(unread.body.total, first.body.unread, path);
    assert.equal(unread.body.unread, first.body.unread, path);
    assert.equal(unread.body.notifications.length, Math.min(50, first.body.unread), path);

    // A limit that is not a number is refused, not guessed at.
    assert.equal((await get("?limit=many")).response.status, 400, path);
    assert.equal((await get("?limit=0")).response.status, 400, path);
  }

  // Someone else's list is refused whatever the paging says.
  const others = await jsonRequest(
    `/api/notifications/student/${encodeURIComponent(`${student.student_id}-not-owned`)}?limit=20&status=unread`,
    { headers: authHeaders(studentToken) }
  );
  assert.equal(others.response.status, 403);
  const acrossRoles = await jsonRequest(
    `/api/notifications/supervisor/${encodeURIComponent(supervisor.supervisor.supervisor_id)}?limit=20`,
    { headers: authHeaders(studentToken) }
  );
  assert.equal(acrossRoles.response.status, 403);
  const signedOut = await jsonRequest(`/api/notifications/student/${encodeURIComponent(student.student_id)}?limit=20`);
  assert.equal(signedOut.response.status, 401);
});

/*
| Round 2, Phase 1B: the supervisor portal
*/

test("a supervisor is told in one answer which of their interns have a final evaluation", async () => {
  const supervisor = await supervisorSession();
  const path = "/api/supervisor/final-evaluations";
  assert.equal((await jsonRequest(path)).response.status, 401);
  assert.equal((await jsonRequest(path, { headers: authHeaders(studentToken) })).response.status, 403);
  assert.equal((await jsonRequest(path, { headers: authHeaders(coordinatorToken) })).response.status, 403);

  const list = await jsonRequest(path, { headers: authHeaders(supervisor.token) });
  assert.equal(list.response.status, 200);
  assert.ok(Array.isArray(list.body.student_ids));
  assert.equal(new Set(list.body.student_ids).size, list.body.student_ids.length, "each intern once");

  // It agrees with asking about each intern, and names nobody else's.
  const interns = await jsonRequest(
    `/api/supervisor/${encodeURIComponent(supervisor.supervisor.supervisor_id)}/interns`,
    { headers: authHeaders(supervisor.token) }
  );
  const mine = interns.body.interns.map((intern) => String(intern.student_id).trim());
  for (const id of list.body.student_ids) assert.ok(mine.includes(id), `${id} is one of their interns`);
  for (const id of mine) {
    const one = await jsonRequest(`/api/final-evaluations/${encodeURIComponent(id)}`, { headers: authHeaders(supervisor.token) });
    assert.equal(one.response.status, 200);
    assert.equal(list.body.student_ids.includes(id), one.body.evaluation !== null, id);
  }
});

test("a supervisor's profile names the coordinator to write to, and nothing else about them", async () => {
  const supervisor = await supervisorSession();
  const id = encodeURIComponent(supervisor.supervisor.supervisor_id);
  const mine = await jsonRequest(`/api/supervisors/${id}/profile`, { headers: authHeaders(supervisor.token) });
  assert.equal(mine.response.status, 200);
  // What it always answered is still there.
  assert.equal(mine.body.supervisor.supervisor_id, supervisor.supervisor.supervisor_id);
  assert.ok(mine.body.supervisor.email);
  // The coordinator: a name, an email, a department. No id, no password, no sign-in details.
  assert.ok(mine.body.coordinator, "there is an active coordinator in the test data");
  assert.deepEqual(Object.keys(mine.body.coordinator).sort(), ["department", "email", "name"]);
  assert.match(mine.body.coordinator.email, /@/);
  // The same person a student with no coordinator of their own is shown.
  const students = await jsonRequest(`/api/students/${encodeURIComponent(student.student_id)}/profile`, { headers: authHeaders(studentToken) });
  assert.ok(students.body.coordinator);

  assert.equal((await jsonRequest(`/api/supervisors/${id}/profile`)).response.status, 401);
  assert.equal((await jsonRequest(`/api/supervisors/${id}-other/profile`, { headers: authHeaders(supervisor.token) })).response.status, 403);
  assert.equal((await jsonRequest(`/api/supervisors/${id}/profile`, { headers: authHeaders(studentToken) })).response.status, 403);
});

/*
| Round 2, Phase 1C: the coordinator's console
*/

test("each key figure is worked out from dated rows, and its target says which side is good", () => {
  require("tsx/cjs");
  const kpis = require("../src/services/kpis.ts");
  const { KPI_DEFINITIONS, meetsTarget } = require("../src/services/kpiDefinitions.ts");
  const week = { Monday: 8, Tuesday: 8, Wednesday: 8, Thursday: 8, Friday: 8 };
  const none = new Set();
  // Friday 9 October 2026.
  const today = "2026-10-09";
  const student = (over = {}) => ({
    required_hours: 100, schedule: week, term_end: "2026-12-18", since: "2026-09-01",
    verified: [], logged: new Set(), approved: new Map(), ...over,
  });

  // On track: one finishes in time, one cannot before the term ends, one has nothing scheduled.
  const fits = student({ verified: [{ date: "2026-10-01", hours: 60 }] });
  const late = student({ term_end: "2026-10-12" });
  const idle = student({ schedule: {} });
  assert.deepEqual(kpis.onTrackAt(today, [fits, late, idle], none), { value: 33.3, basis: "1 of 3 students" });
  // Hours verified after the day asked about do not count for that day.
  const finishedLater = student({ term_end: "2026-10-12", verified: [{ date: "2026-10-08", hours: 100 }] });
  assert.equal(kpis.onTrackAt(today, [finishedLater], none).value, 100);
  assert.equal(kpis.onTrackAt("2026-10-07", [finishedLater], none).value, 0);
  assert.equal(kpis.onTrackAt(today, [], none).value, null);

  // Attendance: the 28 days before today hold 20 weekdays (11 Sep to 8 Oct); 19 were attended.
  const days = [];
  for (let back = 1; back <= 28; back += 1) days.push(kpis.addDays(today, -back));
  const weekdays = days.filter((day) => ![0, 6].includes(new Date(`${day}T00:00:00Z`).getUTCDay()));
  assert.equal(weekdays.length, 20);
  const present = student({ logged: new Set(weekdays.slice(1)) });
  assert.deepEqual(kpis.attendanceRateAt(today, [present], none), { value: 95, basis: "19 of 20 scheduled days" });
  // A holiday is not a scheduled day; a weekend log adds nothing; today is not counted.
  assert.equal(kpis.attendanceRateAt(today, [present], new Set([weekdays[0]])).value, 100);
  assert.equal(kpis.attendanceRateAt(today, [student({ logged: new Set([today, "2026-10-04"]) })], none).value, 0);
  // Nothing is expected before a student's first day.
  const newcomer = student({ since: "2026-10-07", logged: new Set(["2026-10-07", "2026-10-08"]) });
  assert.deepEqual(kpis.attendanceRateAt(today, [newcomer], none), { value: 100, basis: "2 of 2 scheduled days" });
  assert.equal(kpis.attendanceRateAt(today, [student({ since: null })], none).value, null);

  // Review time: the middle value, of decisions made inside the window only.
  const decisions = [
    { decided_on: "2026-10-08", days: 0.5 },
    { decided_on: "2026-10-01", days: 4 },
    { decided_on: "2026-09-20", days: 1.5 },
    { decided_on: "2026-08-01", days: 30 },
  ];
  assert.deepEqual(kpis.reviewTimeAt(today, decisions), { value: 1.5, basis: "3 logs decided" });
  assert.equal(kpis.reviewTimeAt(today, decisions.slice(0, 2)).value, 2.3);
  assert.equal(kpis.reviewTimeAt("2026-07-01", decisions).value, null);

  // Requirements: only students past half their hours are asked for them.
  const names = ["Endorsement letter", "Medical certificate"];
  const half = [{ date: "2026-09-15", hours: 50 }];
  const complete = student({ verified: half, approved: new Map([["Endorsement letter", "2026-09-01"], ["Medical certificate", "2026-10-02"]]) });
  const missingOne = student({ verified: half, approved: new Map([["Endorsement letter", "2026-09-01"]]) });
  const early = student({ verified: [{ date: "2026-09-15", hours: 49 }] });
  assert.deepEqual(kpis.requirementsCompleteAt(today, [complete, missingOne, early], names), { value: 50, basis: "1 of 2 students past 50%" });
  // A week earlier the second document had not been approved yet.
  assert.equal(kpis.requirementsCompleteAt("2026-10-01", [complete], names).value, 0);
  assert.equal(kpis.requirementsCompleteAt(today, [early], names).value, null);
  assert.equal(kpis.requirementsCompleteAt(today, [missingOne], []).value, 100);

  // Concerns: open, and reported more than 7 days ago.
  const concerns = [
    { created_on: "2026-09-20", closed_on: null },
    { created_on: "2026-09-20", closed_on: "2026-10-05" },
    { created_on: "2026-10-05", closed_on: null },
    { created_on: "2026-10-02", closed_on: null },
  ];
  assert.deepEqual(kpis.oldConcernsAt(today, concerns), { value: 1, basis: "3 open in all" });
  // On 4 October the second one was still open, and old.
  assert.equal(kpis.oldConcernsAt("2026-10-04", concerns).value, 2);
  // Exactly 7 days old is not yet "older than 7 days".
  assert.equal(kpis.oldConcernsAt(today, [{ created_on: "2026-10-02", closed_on: null }]).value, 0);
  assert.equal(kpis.oldConcernsAt(today, [{ created_on: "2026-10-01", closed_on: null }]).value, 1);

  // Agreements: ended, or ending within 30 days.
  assert.equal(kpis.agreementsEndingAt(today, ["2026-01-01", "2026-11-08", "2026-11-09", "2027-06-30"]).value, 2);

  // The whole set: six figures in the stated order, eight weekly points ending today.
  const all = kpis.computeKpis(today, { students: [fits, late, idle], holidays: none, decisions, requirements: names, concerns, expiries: ["2026-11-01"] });
  assert.deepEqual(all.map((kpi) => kpi.key), ["on_track", "attendance_rate", "review_time", "requirements_complete", "old_concerns", "agreements_ending"]);
  for (const kpi of all) {
    assert.equal(kpi.series.length, 8, kpi.key);
    assert.equal(kpi.series[7].date, today);
    assert.equal(kpi.series[0].date, "2026-08-21");
    assert.equal(kpi.series[7].value, kpi.value, `${kpi.key}: the last point is the value`);
    assert.equal(kpi.previous, kpi.series[3].value, `${kpi.key}: compared with 4 weeks earlier`);
    assert.ok(kpi.label && kpi.definition && kpi.link.startsWith("/coordinator/"), kpi.key);
  }
  const of = (key) => all.find((kpi) => kpi.key === key);
  assert.deepEqual([of("on_track").value, of("on_track").target, of("on_track").met], [33.3, 90, false]);
  assert.deepEqual([of("review_time").value, of("review_time").target, of("review_time").met], [1.5, 2, true]);
  assert.deepEqual([of("old_concerns").value, of("old_concerns").met], [1, false]);
  assert.deepEqual([of("agreements_ending").value, of("agreements_ending").met], [1, false]);

  // The targets, and which side of each is good.
  assert.deepEqual(KPI_DEFINITIONS.map((item) => [item.key, item.target, item.direction]), [
    ["on_track", 90, "atLeast"],
    ["attendance_rate", 95, "atLeast"],
    ["review_time", 2, "atMost"],
    ["requirements_complete", 80, "atLeast"],
    ["old_concerns", 0, "atMost"],
    ["agreements_ending", 0, "atMost"],
  ]);
  const [onTrack, , reviewTime] = KPI_DEFINITIONS;
  assert.deepEqual([meetsTarget(onTrack, 90), meetsTarget(onTrack, 89.9), meetsTarget(onTrack, null)], [true, false, null]);
  assert.deepEqual([meetsTarget(reviewTime, 2), meetsTarget(reviewTime, 2.1)], [true, false]);
});

test("the key figures and the action list are the coordinator's, take a term, and agree with the pages behind them", async () => {
  const headers = authHeaders(coordinatorToken);
  const get = async (path) => {
    const result = await jsonRequest(path, { headers });
    assert.equal(result.response.status, 200, `${path}: ${JSON.stringify(result.body).slice(0, 160)}`);
    return result.body;
  };
  const supervisor = await supervisorSession();
  for (const path of ["/api/coordinator/kpis", "/api/coordinator/actions"]) {
    assert.equal((await jsonRequest(path)).response.status, 401, path);
    assert.equal((await jsonRequest(path, { headers: authHeaders(studentToken) })).response.status, 403, path);
    assert.equal((await jsonRequest(path, { headers: authHeaders(supervisor.token) })).response.status, 403, path);
    assert.equal((await jsonRequest(`${path}?term=abc`, { headers })).response.status, 400, path);
    assert.equal((await jsonRequest(`${path}?term=1;DROP`, { headers })).response.status, 400, path);
  }

  // The six figures, from the real records.
  const kpis = await get("/api/coordinator/kpis");
  assert.match(kpis.as_of, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(kpis.kpis.length, 6);
  for (const kpi of kpis.kpis) {
    assert.equal(kpi.series.length, 8, kpi.key);
    assert.equal(kpi.series[7].date, kpis.as_of);
    assert.ok(kpi.value === null || typeof kpi.value === "number", kpi.key);
    assert.equal(kpi.met, kpi.value === null ? null : kpi.direction === "atLeast" ? kpi.value >= kpi.target : kpi.value <= kpi.target, kpi.key);
    if (kpi.unit === "percent" && kpi.value !== null) assert.ok(kpi.value >= 0 && kpi.value <= 100, kpi.key);
    assert.equal(typeof kpi.basis, "string");
  }
  const kpi = (key, list = kpis.kpis) => list.find((item) => item.key === key);

  // The action list, against the pages its rows open.
  const actions = await get("/api/coordinator/actions");
  assert.deepEqual(actions.groups.map((group) => group.who), ["you", "supervisors", "students"]);
  const rows = Object.fromEntries(actions.groups.flatMap((group) => group.rows).map((row) => [row.key, row]));
  for (const row of Object.values(rows)) {
    assert.ok(row.count > 0, `${row.key}: only rows with something to do are listed`);
    assert.ok(row.label && row.reason && row.link.startsWith("/coordinator/"), row.key);
  }
  const count = (key) => rows[key]?.count ?? 0;
  const dashboard = await get("/api/coordinator/dashboard");
  const monitoring = (await get("/api/coordinator/monitoring")).students;
  const alerts = (await get("/api/coordinator/alerts")).alerts;
  const alertCount = (key) => alerts.find((item) => item.key === key)?.items.length ?? 0;
  assert.equal(count("concerns"), dashboard.pendingComplaints);
  assert.equal(count("flagged_logs"), dashboard.flaggedAttendance);
  assert.equal(count("pending_logs"), dashboard.pendingAttendance);
  assert.equal(count("pending_tasks"), dashboard.tasks.awaitingReview);
  assert.equal(count("unassigned"), monitoring.filter((row) => !row.supervisor_name).length);
  assert.equal(count("overdue_tasks"), monitoring.filter((row) => row.overdue_tasks > 0).length);
  assert.equal(count("slow_reviews"), alertCount("slow_supervisors"));
  assert.equal(count("agreements"), alertCount("moa_expiring"));
  assert.equal(count("missed_days"), alertCount("missed_days"));
  assert.equal(count("at_risk"), alertCount("at_risk"));
  // Two of the figures count the same things as two of the rows.
  assert.equal(kpi("agreements_ending").value, alertCount("moa_expiring"));
  const atRisk = (await get("/api/coordinator/report")).students.filter((row) => row.at_risk).length;
  if (monitoring.length > 0) {
    assert.equal(kpi("on_track").value, Math.round(((monitoring.length - atRisk) / monitoring.length) * 1000) / 10);
  }

  // Progress and the supervisors' queues: what the dashboard used to add up from every row.
  assert.equal(actions.progress.students, monitoring.length);
  assert.equal(actions.progress.not_started, monitoring.filter((row) => row.completion <= 0).length);
  assert.equal(actions.progress.under_half, monitoring.filter((row) => row.completion > 0 && row.completion < 50).length);
  assert.equal(actions.progress.past_half, monitoring.filter((row) => row.completion >= 50 && row.completion < 100).length);
  assert.equal(actions.progress.completed, monitoring.filter((row) => row.completion >= 100).length);
  const queues = new Map();
  for (const row of monitoring) {
    if (!row.supervisor_name) continue;
    const queue = queues.get(row.supervisor_name) ?? { interns: 0, logs: 0, tasks: 0 };
    queues.set(row.supervisor_name, { interns: queue.interns + 1, logs: queue.logs + row.pending_logs, tasks: queue.tasks + row.tasks_awaiting_review });
  }
  assert.equal(actions.supervisor_queues.length, queues.size);
  for (const queue of actions.supervisor_queues) {
    assert.deepEqual({ interns: queue.interns, logs: queue.logs, tasks: queue.tasks }, queues.get(queue.name), queue.name);
    assert.equal(queue.waiting, queue.logs + queue.tasks);
  }
  assert.ok(actions.scheduled_not_in >= 0 && actions.scheduled_not_in <= monitoring.length);

  // One term at a time: the terms add up to the whole, and links carry the term.
  const terms = ["none", ...(await get("/api/coordinator/terms")).terms.map((item) => String(item.id))];
  let students = 0;
  let pendingLogs = 0;
  for (const term of terms) {
    const scoped = await get(`/api/coordinator/actions?term=${term}`);
    const listed = (await get(`/api/coordinator/monitoring?term=${term}`)).students;
    assert.equal(scoped.progress.students, listed.length, `term ${term}`);
    students += scoped.progress.students;
    const scopedRows = scoped.groups.flatMap((group) => group.rows);
    pendingLogs += scopedRows.find((row) => row.key === "pending_logs")?.count ?? 0;
    for (const row of scopedRows.filter((item) => /monitoring|students/.test(item.link))) {
      assert.match(row.link, new RegExp(`[?&]term=${term}$`), row.key);
    }
    const scopedKpis = (await get(`/api/coordinator/kpis?term=${term}`)).kpis;
    assert.equal(scopedKpis.length, 6);
    // Agreements belong to companies: the same whichever term is chosen.
    assert.equal(kpi("agreements_ending", scopedKpis).value, kpi("agreements_ending").value);
  }
  assert.equal(students, actions.progress.students);
  assert.equal(pendingLogs, count("pending_logs"));
});

test("the audit rules cover consent, a data export, and what a coordinator opens", () => {
  require("tsx/cjs");
  const { auditEntryFor } = require("../src/services/audit.ts");
  const entry = (method, path, source = {}) =>
    auditEntryFor(method, path, { params: {}, body: {}, result: {}, ...source });

  assert.deepEqual(
    entry("POST", "/api/students/:studentId/privacy/consent", { params: { studentId: "S1" }, body: { version: "2026-10" }, result: { consent_version: "2026-10", consent_at: "x" }, actorRole: "student" }),
    { action: "privacy.consent", entityType: "student", entityId: "S1", details: { version: "2026-10" } }
  );
  // Reads carry how long a repeat stays one entry.
  assert.deepEqual(
    entry("GET", "/api/students/:studentId/data-export", { params: { studentId: "S1" }, actorRole: "student" }),
    { action: "privacy.export", entityType: "student", entityId: "S1", details: {}, quietMinutes: 10 }
  );
  assert.deepEqual(
    entry("GET", "/api/coordinator/students/:studentId/overview", { params: { studentId: "S1" }, actorRole: "coordinator" }),
    { action: "student.view", entityType: "student", entityId: "S1", details: {}, quietMinutes: 10 }
  );
  // A document: logged for a coordinator, with whose it is; not for its owner or their supervisor.
  const file = { params: { documentId: "7" }, noted: { student_id: "S1", doc_type: "Medical certificate", file_path: "/uploads/secret.pdf" } };
  assert.deepEqual(entry("GET", "/api/documents/:documentId/file", { ...file, actorRole: "coordinator" }), {
    action: "document.view", entityType: "document", entityId: "7",
    details: { student_id: "S1", name: "Medical certificate" }, quietMinutes: 10,
  });
  assert.equal(entry("GET", "/api/documents/:documentId/file", { ...file, actorRole: "student" }), null);
  assert.equal(entry("GET", "/api/documents/:documentId/file", { ...file, actorRole: "supervisor" }), null);
  assert.equal(entry("GET", "/api/documents/:documentId/file", file), null);
  // An uploaded photo or attachment, the same action.
  assert.deepEqual(entry("GET", "/api/uploads/:filename", { params: { filename: "1700000000000-abcdef012345.jpg" }, actorRole: "coordinator" }), {
    action: "document.view", entityType: "upload", entityId: "1700000000000-abcdef012345.jpg", details: {}, quietMinutes: 10,
  });
  assert.equal(entry("GET", "/api/uploads/:filename", { params: { filename: "x.jpg" }, actorRole: "supervisor" }), null);
  // Taking the log out: every time, with the filters used.
  assert.deepEqual(entry("GET", "/api/coordinator/audit/export", { actorRole: "coordinator", noted: { rows: 12, filters: ["action=attendance", "from=2026-10-01"] } }), {
    action: "audit.export", entityType: "audit_log", entityId: null,
    details: { rows: 12, filters: ["action=attendance", "from=2026-10-01"] },
  });
  // Other reads are not logged at all.
  assert.equal(entry("GET", "/api/coordinator/students", { actorRole: "coordinator" }), null);
  assert.equal(entry("GET", "/api/coordinator/audit", { actorRole: "coordinator" }), null);
});

test("a coordinator's reads are written once per ten minutes, and a student's export is written", async (t) => {
  if (process.env.ALLOW_TEST_WRITES !== "true") {
    t.skip("set ALLOW_TEST_WRITES=true to run against a throwaway database");
    return;
  }
  const pool = localTestPool();
  const sid = student.student_id;
  const rows = async (action, actorId) =>
    (await pool.query(
      `SELECT COUNT(*)::int AS n FROM audit_log WHERE action = $1 AND actor_id = $2 AND entity_id = $3 AND created_at > NOW() - INTERVAL '10 minutes'`,
      [action, actorId, sid]
    )).rows[0].n;
  // The row is written after the answer is sent, so it is looked for a moment later.
  const settle = () => new Promise((resolve) => setTimeout(resolve, 400));
  try {
    await pool.query(`DELETE FROM audit_log WHERE action IN ('student.view', 'privacy.export') AND entity_id = $1`, [sid]);
    const overview = `/api/coordinator/students/${encodeURIComponent(sid)}/overview`;
    assert.equal((await jsonRequest(overview, { headers: authHeaders(coordinatorToken) })).response.status, 200);
    await settle();
    assert.equal(await rows("student.view", coordinator.coordinator_id), 1, "opening a record is logged");
    assert.equal((await jsonRequest(overview, { headers: authHeaders(coordinatorToken) })).response.status, 200);
    assert.equal((await jsonRequest(overview, { headers: authHeaders(coordinatorToken) })).response.status, 200);
    await settle();
    assert.equal(await rows("student.view", coordinator.coordinator_id), 1, "opening it again straight away is the same entry");
    // An earlier look, more than ten minutes ago, does not hide a new one.
    await pool.query(`UPDATE audit_log SET created_at = NOW() - INTERVAL '11 minutes' WHERE action = 'student.view' AND entity_id = $1`, [sid]);
    assert.equal((await jsonRequest(overview, { headers: authHeaders(coordinatorToken) })).response.status, 200);
    await settle();
    assert.equal(await rows("student.view", coordinator.coordinator_id), 1);
    assert.equal((await pool.query(`SELECT COUNT(*)::int AS n FROM audit_log WHERE action = 'student.view' AND entity_id = $1`, [sid])).rows[0].n, 2);
    // A record that is not there is not logged as opened.
    await jsonRequest(`/api/coordinator/students/NO-SUCH-STUDENT/overview`, { headers: authHeaders(coordinatorToken) });

    // The student's own copy of their data.
    const exported = await jsonRequest(`/api/students/${encodeURIComponent(sid)}/data-export`, { headers: authHeaders(studentToken) });
    assert.equal(exported.response.status, 200);
    await settle();
    assert.equal(await rows("privacy.export", sid), 1);
    assert.equal((await pool.query(`SELECT COUNT(*)::int AS n FROM audit_log WHERE action = 'student.view' AND entity_id = 'NO-SUCH-STUDENT'`)).rows[0].n, 0);
  } finally {
    await pool.query(`DELETE FROM audit_log WHERE action IN ('student.view', 'privacy.export') AND entity_id = $1`, [sid]);
    await pool.end();
  }
});

test("audit filters: a day is the day in the Philippines, a person is found by name, and the export is itself logged", async (t) => {
  const headers = authHeaders(coordinatorToken);
  const list = (query) => jsonRequest(`/api/coordinator/audit?${query}`, { headers });
  // Refused before anything is read.
  for (const query of ["entity_type=Not%20A%20Kind", "from=2026-13-40", "actor_role=admin", "from=2026-03-11&to=2026-03-10"]) {
    assert.equal((await list(query)).response.status, 400, query);
    assert.equal((await jsonRequest(`/api/coordinator/audit/export?${query}`, { headers })).response.status, 400, query);
  }
  assert.equal((await jsonRequest("/api/coordinator/audit/export")).response.status, 401);
  assert.equal((await jsonRequest("/api/coordinator/audit/export", { headers: authHeaders(studentToken) })).response.status, 403);
  // With no filters it answers as it always has.
  const plain = await list("limit=5");
  assert.equal(plain.response.status, 200);
  assert.deepEqual(Object.keys(plain.body).sort(), ["entries", "limit", "offset", "total"]);

  if (process.env.ALLOW_TEST_WRITES !== "true") {
    t.skip("set ALLOW_TEST_WRITES=true to run against a throwaway database");
    return;
  }
  const pool = localTestPool();
  try {
    await pool.query(`DELETE FROM audit_log WHERE entity_type = 'manila_test' OR action = 'audit.export'`);
    // Half an hour either side of midnight in Manila. In UTC both fall on 10 March.
    await pool.query(
      `INSERT INTO audit_log (actor_role, actor_id, action, entity_type, entity_id, details, created_at) VALUES
         ('student', $1, 'manila_test.late', 'manila_test', 'before-midnight', '{"reason":"=SUM(A1)"}', '2026-03-10 23:30:00+08'),
         ('student', $1, 'manila_test.early', 'manila_test', 'after-midnight', '{}', '2026-03-11 00:30:00+08')`,
      [student.student_id]
    );
    const ids = async (query) => {
      const result = await list(`entity_type=manila_test&${query}`);
      assert.equal(result.response.status, 200, query);
      assert.equal(result.body.total, result.body.entries.length, query);
      return result.body.entries.map((entry) => entry.entity_id).sort();
    };
    assert.deepEqual(await ids("from=2026-03-10&to=2026-03-10"), ["before-midnight"], "23:30 belongs to that day");
    assert.deepEqual(await ids("from=2026-03-11&to=2026-03-11"), ["after-midnight"], "00:30 belongs to the next");
    assert.deepEqual(await ids("to=2026-03-10"), ["before-midnight"]);
    assert.deepEqual(await ids("from=2026-03-11"), ["after-midnight"]);
    assert.deepEqual(await ids("from=2026-03-09&to=2026-03-09"), []);
    // The record, the kind of action, and the person by name or by id.
    assert.deepEqual(await ids("entity_id=after-midnight"), ["after-midnight"]);
    assert.deepEqual(await ids("action=manila_test"), ["after-midnight", "before-midnight"]);
    assert.deepEqual(await ids("action=manila_test.late"), ["before-midnight"]);
    const namePart = student.name.split(" ")[0].toLowerCase();
    assert.deepEqual(await ids(`person=${encodeURIComponent(namePart)}`), ["after-midnight", "before-midnight"], "found by part of the name");
    assert.deepEqual(await ids(`person=${encodeURIComponent(student.student_id)}`), ["after-midnight", "before-midnight"]);
    assert.deepEqual(await ids("person=nobody-of-this-name"), []);
    // "person" looks at who did it, not at the record's id.
    assert.deepEqual(await ids("person=before-midnight"), []);
    assert.deepEqual(await ids("actor_role=student"), ["after-midnight", "before-midnight"]);
    assert.deepEqual(await ids("actor_role=supervisor"), []);

    // The export: the same rows as a file, in Philippine time.
    const response = await fetch(new URL("/api/coordinator/audit/export?entity_type=manila_test&from=2026-03-10&to=2026-03-10", apiBaseUrl), { headers });
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type"), /^text\/csv/);
    assert.match(response.headers.get("content-disposition"), /attachment; filename="internet-audit-log-\d{4}-\d{2}-\d{2}\.csv"/);
    const csv = await response.text();
    const lines = csv.replace(/^﻿/, "").trim().split("\r\n");
    assert.equal(lines.length, 2, "a heading and the one entry");
    assert.match(lines[0], /^When \(Philippine time\),Account kind,Account ID,Name,Action,Record kind,Record ID,Details$/);
    assert.ok(lines[1].startsWith(`2026-03-10 23:30:00,student,${student.student_id},`), lines[1]);
    assert.ok(lines[1].includes("manila_test.late,manila_test,before-midnight,"), lines[1]);
    assert.ok(!csv.includes("after-midnight"));
    // Taking it out is in the log, with the filters used and the number of rows.
    await new Promise((resolve) => setTimeout(resolve, 400));
    const logged = await pool.query(`SELECT actor_id, details FROM audit_log WHERE action = 'audit.export' ORDER BY id DESC LIMIT 1`);
    assert.equal(logged.rows.length, 1);
    assert.equal(logged.rows[0].actor_id, coordinator.coordinator_id);
    assert.equal(logged.rows[0].details.rows, 1);
    assert.deepEqual(logged.rows[0].details.filters.sort(), ["entity_type=manila_test", "from=2026-03-10", "to=2026-03-10"]);
    // Reading the list is not an export, and is not logged.
    await list("limit=5");
    await new Promise((resolve) => setTimeout(resolve, 300));
    assert.equal((await pool.query(`SELECT COUNT(*)::int AS n FROM audit_log WHERE action = 'audit.export'`)).rows[0].n, 1);
  } finally {
    await pool.query(`DELETE FROM audit_log WHERE entity_type = 'manila_test' OR action = 'audit.export'`);
    await pool.end();
  }
});

/*
| Round 2, Phase 2: colleges, programs, majors, blocks, and the shared filters
*/

test("a student's place is worked out the same from pickers and from a file's columns", () => {
  require("tsx/cjs");
  const { resolvePlacement } = require("../src/services/academics.ts");
  const catalogue = {
    colleges: [
      { id: 1, name: "College of Computing Sciences", short_name: "CCS", is_active: true },
      { id: 2, name: "College of Teacher Education", short_name: "CTE", is_active: true },
    ],
    programs: [
      { id: 10, college_id: 1, name: "BS Information Technology", short_code: "BSIT", ojt_applies: true, is_active: true },
      { id: 11, college_id: 1, name: "BS Mathematics", short_code: "BSMath", ojt_applies: true, is_active: true },
      { id: 12, college_id: 2, name: "Bachelor of Secondary Education", short_code: "BSEd", ojt_applies: true, is_active: true },
    ],
    majors: [
      { id: 20, program_id: 11, name: "Statistics", is_active: true },
      { id: 21, program_id: 11, name: "Pure Mathematics", is_active: true },
    ],
    blocks: [
      { id: 30, program_id: 10, major_id: null, year_level: 4, section: "A", term_id: 1, is_active: true, name: "BSIT 4A", term_name: "Old", term_closed: true },
      { id: 31, program_id: 10, major_id: null, year_level: 4, section: "A", term_id: 2, is_active: true, name: "BSIT 4A", term_name: "Now", term_closed: false },
      { id: 32, program_id: 11, major_id: 20, year_level: 4, section: "A", term_id: 2, is_active: true, name: "BSMath 4A", term_name: "Now", term_closed: false },
      { id: 33, program_id: 10, major_id: null, year_level: 4, section: "B", term_id: 2, is_active: false, name: "BSIT 4B", term_name: "Now", term_closed: false },
    ],
  };
  const place = (input) => resolvePlacement(catalogue, input);

  // From a file: a program by short code or name, whatever the capitals; a block by its name.
  assert.deepEqual(place({ program: "bsit" }), { program_id: 10, major_id: null, block_id: null, program_text: "BS Information Technology" });
  assert.deepEqual(place({ program: " BS information technology " }).program_id, 10);
  // The same block name in a closed and an open term means the open one.
  assert.deepEqual(place({ college: "ccs", program: "BSIT", block: "bsit4a" }), { program_id: 10, major_id: null, block_id: 31, program_text: "BS Information Technology" });
  // A block of one major brings the major with it.
  assert.deepEqual(place({ program: "BSMath", block: "BSMath 4A" }), { program_id: 11, major_id: 20, block_id: 32, program_text: "BS Mathematics" });
  assert.deepEqual(place({ program: "BSMath", major: "statistics" }).major_id, 20);

  // What does not fit is refused, in words a person can act on.
  assert.match(place({ college: "CTE", program: "BSIT" }).problem, /is not a program of the College of Teacher Education/);
  assert.match(place({ college: "College of Magic", program: "BSIT" }).problem, /no college named "College of Magic"/);
  assert.match(place({ program: "BSIT", major: "Statistics" }).problem, /has no major named "Statistics"/);
  assert.match(place({ program: "BSIT", block: "BSIT 9Z" }).problem, /no active block named "BSIT 9Z"/);
  assert.match(place({ program: "BSIT", block: "BSIT 4B" }).problem, /no active block/, "an inactive block is not offered");
  assert.match(place({ program: "BSMath", major: "Pure Mathematics", block: "BSMath 4A" }).problem, /another major/);
  assert.match(place({ program: "BS Info Tech", block: "BSIT 4A" }).problem, /is not a program's name or short code/);
  assert.match(place({ major: "Statistics" }).problem, /needs a program/);

  // Free text alone is kept as typed, as it always was, and says so.
  assert.deepEqual(place({ program: "BS Info Tech" }), {
    program_id: null, major_id: null, block_id: null, program_text: "BS Info Tech",
    note: '"BS Info Tech" is not one of the listed programs; it is kept as text.',
  });
  assert.deepEqual(place({}), { program_id: null, major_id: null, block_id: null, program_text: null });

  // From the pickers: ids, checked against each other.
  assert.deepEqual(place({ program_id: 11, major_id: 21, block_id: null }), { program_id: 11, major_id: 21, block_id: null, program_text: "BS Mathematics" });
  assert.deepEqual(place({ program_id: "10", block_id: "31", program: "anything typed" }).program_text, "BS Information Technology");
  assert.match(place({ program_id: 10, major_id: 20 }).problem, /Statistics is not a major of BS Information Technology/);
  assert.match(place({ program_id: 10, block_id: 32 }).problem, /BSMath 4A is not a block of BS Information Technology/);
  assert.match(place({ program_id: 999 }).problem, /does not exist/);
  assert.match(place({ program_id: "x" }).problem, /not a program/);
  // Cleared pickers with text that is a program's code: linked all the same.
  assert.deepEqual(place({ program_id: null, major_id: null, block_id: null, program: "BSED" }).program_id, 12);
});

test("filter values are bound as parameters, and no filter means no change to the query", () => {
  require("tsx/cjs");
  const scope = require("../src/services/studentScope.ts");
  assert.deepEqual(scope.readStudentFilters({}), { filters: {} });
  assert.deepEqual(scope.readStudentFilters({ term: "none", college: "2", program: "7", block: "none", company: "4", supervisor: "SUP-1" }), {
    filters: { term: "none", college: 2, program: 7, block: "none", company: 4, supervisor: "SUP-1" },
  });
  for (const [name, bad] of [["term", "x"], ["college", "1;DROP"], ["program", "-1"], ["block", "A"], ["company", "1.5"]]) {
    assert.ok(scope.readStudentFilters({ [name]: bad }).problem, `${name}=${bad} is refused`);
  }
  // Nothing chosen: nothing added, nothing bound.
  assert.equal(scope.filterConditions({}), "");
  assert.equal(scope.filterOfStudent({}, "d.student_id"), "");
  assert.deepEqual(scope.bindFilters("SELECT 1 WHERE x = $1", ["a"], {}), { text: "SELECT 1 WHERE x = $1", values: ["a"] });
  // A hostile supervisor id never reaches the SQL text.
  const filters = { program: 7, supervisor: "x' OR '1'='1" };
  const sql = `SELECT * FROM students s WHERE s.name ILIKE $1${scope.filterConditions(filters)} AND 1 = 1${scope.filterOfStudent(filters, "a.student_id")}`;
  const bound = scope.bindFilters(sql, ["%a%"], filters);
  assert.ok(!bound.text.includes("OR '1'"));
  assert.ok(!/:f_/.test(bound.text), "every marker became a parameter");
  // Each value is bound once, after the query's own parameter, however often it is used.
  assert.deepEqual(bound.values, ["%a%", 7, "x' OR '1'='1"]);
  assert.equal(bound.text.split("$2::int").length - 1, 2);
  assert.equal(bound.text.split("$3::text").length - 1, 2);
  assert.throws(() => scope.filterOfStudent(filters, "a.student_id; DROP TABLE x"));
  assert.equal(scope.filtersAsQuery({ term: "3", program: 7, block: "none" }), "term=3&program=7&block=none");
});

test("the seeded colleges and programs are listed, for a coordinator only", async () => {
  const supervisor = await supervisorSession();
  assert.equal((await jsonRequest("/api/coordinator/academics")).response.status, 401);
  assert.equal((await jsonRequest("/api/coordinator/academics", { headers: authHeaders(studentToken) })).response.status, 403);
  assert.equal((await jsonRequest("/api/coordinator/academics", { headers: authHeaders(supervisor.token) })).response.status, 403);
  const { response, body } = await jsonRequest("/api/coordinator/academics", { headers: authHeaders(coordinatorToken) });
  assert.equal(response.status, 200);
  const colleges = body.colleges.map((item) => item.name);
  for (const name of [
    "College of Arts, Sciences, and Letters", "College of Business and Public Administration", "College of Computing Sciences",
    "College of Hospitality and Tourism Management", "College of Teacher Education", "College of Industrial Technology",
  ]) assert.ok(colleges.includes(name), name);
  const code = (short) => body.programs.find((item) => item.short_code === short);
  for (const short of ["ABEL", "ABEcon", "BSBio", "BSND", "BSSW", "BPA", "BSBA", "BSCS", "BSIT", "BSMath", "BSHM", "BSEd", "BTLEd", "BTVTEd", "BIT"]) {
    assert.ok(code(short), short);
    assert.equal(code(short).ojt_applies, true, short);
  }
  assert.equal(body.colleges.find((item) => item.id === code("BSIT").college_id).name, "College of Computing Sciences");
  const majorsOf = (short) => body.majors.filter((item) => item.program_id === code(short).id).map((item) => item.name).sort();
  assert.deepEqual(majorsOf("BSBA"), ["Financial Management", "Operations Management"]);
  assert.deepEqual(majorsOf("BSMath"), ["CIT", "Pure Mathematics", "Statistics"]);
  assert.equal(majorsOf("BIT").length, 9);
  assert.equal(typeof body.active_students_without_block, "number");
});

test("every coordinator list refuses a filter that is not an id, and an id of nothing matches no student", async () => {
  const headers = authHeaders(coordinatorToken);
  const routes = [
    "/api/coordinator/students", "/api/coordinator/monitoring", "/api/coordinator/dashboard", "/api/coordinator/actions",
    "/api/coordinator/kpis", "/api/coordinator/analytics", "/api/coordinator/documents", "/api/coordinator/evaluations",
    "/api/coordinator/report", "/api/projections", "/api/coordinator/audit",
  ];
  for (const path of routes) {
    for (const bad of ["college=abc", "program=1;DROP", "block=A", "company=-3", "term=x"]) {
      assert.equal((await jsonRequest(`${path}?${bad}`, { headers })).response.status, 400, `${path}?${bad}`);
    }
    for (const nothing of ["college=999999999", "program=999999999", "block=999999999", "company=999999999", "supervisor=NO-SUCH-SUPERVISOR", "program=999999999&block=none&supervisor=none"]) {
      const result = await jsonRequest(`${path}?${nothing}`, { headers });
      assert.equal(result.response.status, 200, `${path}?${nothing}: ${JSON.stringify(result.body).slice(0, 120)}`);
    }
  }
  const none = (path) => jsonRequest(`${path}?program=999999999`, { headers }).then((result) => result.body);
  assert.deepEqual((await none("/api/coordinator/students")).students, []);
  assert.deepEqual((await none("/api/coordinator/monitoring")).students, []);
  assert.equal((await none("/api/coordinator/dashboard")).students.active, 0);
  assert.equal((await none("/api/coordinator/actions")).progress.students, 0);
  assert.equal((await none("/api/coordinator/kpis")).kpis[0].value, null);
  assert.equal((await none("/api/coordinator/analytics")).progress.students, 0);
  assert.deepEqual((await none("/api/coordinator/documents")).students, []);
  assert.deepEqual((await none("/api/coordinator/documents")).documents, []);
  assert.deepEqual((await none("/api/coordinator/evaluations")).evaluations, []);
  const report = await none("/api/coordinator/report");
  assert.deepEqual([report.students, report.companies, report.programs, report.blocks], [[], [], [], []]);
  assert.deepEqual((await none("/api/projections")).projections, []);
  assert.equal((await none("/api/coordinator/audit")).total, 0);
  // A student's own projection is theirs whatever is put in the address.
  const mine = await jsonRequest("/api/projections?program=999999999", { headers: authHeaders(studentToken) });
  assert.equal(mine.body.projections.length, 1);
});

test("programs and blocks are made and changed, students are placed in them, and every list filters by them", async (t) => {
  if (process.env.ALLOW_TEST_WRITES !== "true") {
    t.skip("set ALLOW_TEST_WRITES=true to run against a throwaway database");
    return;
  }
  const headers = authHeaders(coordinatorToken);
  const stamp = String(Date.now()).slice(-7);
  const send = (method, path, payload) => jsonRequest(path, jsonBody(coordinatorToken, method, payload));
  const get = async (path) => {
    const result = await jsonRequest(path, { headers });
    assert.equal(result.response.status, 200, `${path}: ${JSON.stringify(result.body).slice(0, 160)}`);
    return result.body;
  };
  const pool = localTestPool();
  const sid = (n) => `P2-${stamp}-${n}`;
  const made = { college: null, other: null, program: null, sister: null, major: null, block: null, term: null };
  try {
    /* ---- the structure ---- */
    const college = await send("POST", "/api/coordinator/colleges", { name: `Test College ${stamp}`, short_name: `TC${stamp}` });
    assert.equal(college.response.status, 201, JSON.stringify(college.body));
    made.college = college.body.college.id;
    assert.equal((await send("POST", "/api/coordinator/colleges", { name: `  test college ${stamp} ` })).response.status, 409, "one college per name, whatever the capitals");
    assert.equal((await send("POST", "/api/coordinator/colleges", { name: "x" })).response.status, 400);
    const other = await send("POST", "/api/coordinator/colleges", { name: `Other College ${stamp}` });
    made.other = other.body.college.id;

    const program = await send("POST", "/api/coordinator/programs", { college_id: made.college, name: `BS Testing ${stamp}`, short_code: `BST${stamp}` });
    assert.equal(program.response.status, 201, JSON.stringify(program.body));
    made.program = program.body.program.id;
    assert.equal(program.body.program.ojt_applies, true);
    assert.equal((await send("POST", "/api/coordinator/programs", { college_id: made.college, name: `Another ${stamp}`, short_code: `bst${stamp}` })).response.status, 409, "a short code is one of a kind");
    assert.equal((await send("POST", "/api/coordinator/programs", { college_id: made.college, name: `BS Testing ${stamp}`, short_code: `ZZ${stamp}` })).response.status, 409);
    assert.equal((await send("POST", "/api/coordinator/programs", { name: `No College ${stamp}`, short_code: `NC${stamp}` })).response.status, 400);
    assert.equal((await send("POST", "/api/coordinator/programs", { college_id: made.college, name: `Spaced ${stamp}`, short_code: "B S" })).response.status, 400);
    const sister = await send("POST", "/api/coordinator/programs", { college_id: made.other, name: `BS Sister ${stamp}`, short_code: `BSS${stamp}` });
    made.sister = sister.body.program.id;
    // The switch, and a rename; what is not sent is kept.
    const switched = await send("PUT", `/api/coordinator/programs/${made.program}`, { ojt_applies: false });
    assert.deepEqual([switched.body.program.ojt_applies, switched.body.program.name], [false, `BS Testing ${stamp}`]);
    await send("PUT", `/api/coordinator/programs/${made.program}`, { ojt_applies: true });
    assert.equal((await send("PUT", "/api/coordinator/programs/999999999", { name: "Nobody" })).response.status, 404);

    const major = await send("POST", "/api/coordinator/majors", { program_id: made.program, name: "Quality" });
    assert.equal(major.response.status, 201);
    made.major = major.body.major.id;
    assert.equal((await send("POST", "/api/coordinator/majors", { program_id: made.program, name: " quality " })).response.status, 409);
    const sisterMajor = (await send("POST", "/api/coordinator/majors", { program_id: made.sister, name: "Elsewhere" })).body.major.id;

    const term = await send("POST", "/api/coordinator/terms", { name: `Block Term ${stamp}`, start_date: "2031-01-06", end_date: "2031-05-30" });
    assert.equal(term.response.status, 201, JSON.stringify(term.body));
    made.term = term.body.term?.id ?? (await pool.query(`SELECT id FROM terms WHERE name = $1`, [`Block Term ${stamp}`])).rows[0].id;

    const block = await send("POST", "/api/coordinator/blocks", { program_id: made.program, year_level: 4, section: "a", term_id: made.term });
    assert.equal(block.response.status, 201, JSON.stringify(block.body));
    made.block = block.body.block.id;
    assert.equal(block.body.block.name, `BST${stamp} 4A`, "the short code, the year and the section");
    assert.equal((await send("POST", "/api/coordinator/blocks", { program_id: made.program, year_level: 4, section: "A", term_id: made.term })).response.status, 409, "the same block twice");
    assert.equal((await send("POST", "/api/coordinator/blocks", { program_id: made.program, year_level: 9, section: "A" })).response.status, 400);
    assert.equal((await send("POST", "/api/coordinator/blocks", { program_id: made.program, year_level: 4, section: "B", major_id: sisterMajor })).response.status, 400, "a major of another program");
    const blockB = (await send("POST", "/api/coordinator/blocks", { program_id: made.program, year_level: 4, section: "B", term_id: made.term, major_id: made.major })).body.block;
    const edited = await send("PUT", `/api/coordinator/blocks/${blockB.id}`, { section: "C" });
    assert.deepEqual([edited.body.block.name, edited.body.block.major_id, edited.body.block.term_id], [`BST${stamp} 4C`, made.major, made.term], "what an edit leaves out is kept");

    /* ---- students: the import, then the form ---- */
    const rows = [
      { student_id: sid(1), name: "Block One", email: `p2-${stamp}-1@filter.test`, college: `TC${stamp}`, program: `bst${stamp}`, block: `bst${stamp} 4a` },
      { student_id: sid(2), name: "Block Two", email: `p2-${stamp}-2@filter.test`, program: `BS Testing ${stamp}`, major: "quality", block: `BST${stamp} 4C` },
      { student_id: sid(3), name: "No Block", email: `p2-${stamp}-3@filter.test`, program: `BST${stamp}` },
      { student_id: sid(4), name: "Wrong College", email: `p2-${stamp}-4@filter.test`, college: `Other College ${stamp}`, program: `BST${stamp}` },
      { student_id: sid(5), name: "Wrong Major", email: `p2-${stamp}-5@filter.test`, program: `BST${stamp}`, major: "Elsewhere" },
      { student_id: sid(6), name: "No Such Block", email: `p2-${stamp}-6@filter.test`, program: `BST${stamp}`, block: `BST${stamp} 1Z` },
      { student_id: sid(7), name: "Free Text", email: `p2-${stamp}-7@filter.test`, program: "BS Something Unlisted" },
      { student_id: sid(8), name: "Text With Block", email: `p2-${stamp}-8@filter.test`, program: "BS Something Unlisted", block: `BST${stamp} 4A` },
    ];
    const dry = await send("POST", "/api/coordinator/students/import", { students: rows, dry_run: true });
    assert.equal(dry.response.status, 200, JSON.stringify(dry.body).slice(0, 200));
    const said = (list, n) => list.find((item) => item.student_id === sid(n));
    assert.deepEqual(dry.body.results.map((item) => item.status), ["ok", "ok", "ok", "error", "error", "error", "ok", "error"]);
    assert.match(said(dry.body.results, 4).message, /is not a program of the Other College/);
    assert.match(said(dry.body.results, 5).message, /has no major named "Elsewhere"/);
    assert.match(said(dry.body.results, 6).message, /no active block named/);
    assert.match(said(dry.body.results, 7).message, /Ready to import\. "BS Something Unlisted" is not one of the listed programs; it is kept as text\./);
    assert.match(said(dry.body.results, 8).message, /not a program's name or short code/);
    assert.equal((await pool.query(`SELECT COUNT(*)::int AS n FROM students WHERE student_id LIKE $1`, [`P2-${stamp}-%`])).rows[0].n, 0, "a dry run creates nothing");

    const imported = await send("POST", "/api/coordinator/students/import", { students: rows });
    assert.equal(imported.body.created, 4);
    const placed = async (n) => (await pool.query(`SELECT program, program_id, major_id, block_id FROM students WHERE student_id = $1`, [sid(n)])).rows[0];
    assert.deepEqual(await placed(1), { program: `BS Testing ${stamp}`, program_id: made.program, major_id: null, block_id: made.block });
    assert.deepEqual(await placed(2), { program: `BS Testing ${stamp}`, program_id: made.program, major_id: made.major, block_id: blockB.id });
    assert.deepEqual(await placed(3), { program: `BS Testing ${stamp}`, program_id: made.program, major_id: null, block_id: null });
    assert.deepEqual(await placed(7), { program: "BS Something Unlisted", program_id: null, major_id: null, block_id: null });

    // The form: ids from the pickers.
    const password = "FilterTest123!x";
    const form = await send("POST", "/api/coordinator/students", { student_id: sid(9), email: `p2-${stamp}-9@filter.test`, password, name: "Sister Nine", program_id: made.sister, major_id: sisterMajor });
    assert.equal(form.response.status, 201, JSON.stringify(form.body));
    assert.deepEqual(await placed(9), { program: `BS Sister ${stamp}`, program_id: made.sister, major_id: sisterMajor, block_id: null });
    assert.equal((await send("POST", "/api/coordinator/students", { student_id: sid(10), email: `p2-${stamp}-10@filter.test`, password, name: "Bad", program_id: made.program, major_id: sisterMajor })).response.status, 400);
    // An older form: text only. It links itself when the text is a program's code.
    const older = await send("POST", "/api/coordinator/students", { student_id: sid(11), email: `p2-${stamp}-11@filter.test`, password, name: "Older Form", program: `bst${stamp}` });
    assert.equal(older.response.status, 201);
    assert.equal((await placed(11)).program_id, made.program);
    // An edit that sends no ids leaves the place alone; one that sends them moves the student.
    assert.equal((await send("PUT", `/api/coordinator/students/${sid(2)}`, { name: "Block Two Renamed" })).response.status, 200);
    assert.deepEqual(await placed(2), { program: `BS Testing ${stamp}`, program_id: made.program, major_id: made.major, block_id: blockB.id });
    assert.equal((await send("PUT", `/api/coordinator/students/${sid(2)}`, { program_id: made.program, major_id: made.major, block_id: made.block })).response.status, 200);
    assert.equal((await placed(2)).block_id, made.block);
    assert.equal((await send("PUT", `/api/coordinator/students/${sid(2)}`, { program_id: made.program, major_id: null, block_id: blockB.id })).response.status, 200, "a block of a major brings the major");
    assert.deepEqual([(await placed(2)).major_id, (await placed(2)).block_id], [made.major, blockB.id]);
    assert.equal((await send("PUT", `/api/coordinator/students/${sid(2)}`, { program_id: made.sister, major_id: null, block_id: made.block })).response.status, 400, "a block of another program");

    // Students with no block, and adding them to one.
    const inBlock = await get(`/api/coordinator/blocks/${made.block}/students`);
    assert.deepEqual(inBlock.students.map((item) => item.student_id), [sid(1)]);
    const candidates = inBlock.candidates.map((item) => item.student_id);
    assert.ok(candidates.includes(sid(3)) && candidates.includes(sid(11)) && candidates.includes(sid(7)), "of this program, or of none yet");
    assert.ok(!candidates.includes(sid(9)), "not a student of another program");
    const added = await send("POST", `/api/coordinator/blocks/${made.block}/students`, { student_ids: [sid(3), sid(7), sid(9), "NOBODY"] });
    assert.deepEqual([added.body.count, added.body.skipped], [2, 2]);
    assert.deepEqual(await placed(3), { program: `BS Testing ${stamp}`, program_id: made.program, major_id: null, block_id: made.block });
    // Linked to the program now; the text they were given stays as typed.
    assert.deepEqual(await placed(7), { program: "BS Something Unlisted", program_id: made.program, major_id: null, block_id: made.block });
    assert.equal((await placed(9)).program_id, made.sister, "left where they were");
    // Saving that student again, with the same text, does not undo the link.
    assert.equal((await send("PUT", `/api/coordinator/students/${sid(7)}`, { name: "Free Text Renamed", program: "BS Something Unlisted" })).response.status, 200);
    assert.equal((await placed(7)).program_id, made.program);

    /* ---- every list, by each filter ---- */
    // Where they are now: 1, 3, 7 in block A; 2 in block C (a major's); 11 in the program with no block; 9 in the sister program.
    const ours = (list) => list.filter((value) => String(value).startsWith(`P2-${stamp}-`)).sort();
    // A new student is put in the term today falls in, when there is one (migration 021).
    const theirTerm = (await pool.query(`SELECT term_id FROM students WHERE student_id = $1`, [sid(1)])).rows[0].term_id ?? "none";
    const want = {
      [`program=${made.program}`]: [sid(1), sid(11), sid(2), sid(3), sid(7)].sort(),
      [`college=${made.college}`]: [sid(1), sid(11), sid(2), sid(3), sid(7)].sort(),
      [`college=${made.other}`]: [sid(9)],
      [`block=${made.block}`]: [sid(1), sid(3), sid(7)],
      [`program=${made.program}&block=none`]: [sid(11)],
      [`college=${made.college}&program=${made.program}&block=${blockB.id}`]: [sid(2)],
      [`program=${made.sister}&block=${made.block}`]: [],
      [`program=${made.program}&supervisor=none`]: [sid(1), sid(11), sid(2), sid(3), sid(7)].sort(),
      [`program=${made.program}&supervisor=NOBODY`]: [],
      [`program=${made.program}&term=${theirTerm}`]: [sid(1), sid(11), sid(2), sid(3), sid(7)].sort(),
      [`program=${made.program}&term=${made.term}`]: [],
      [`program=${made.program}&company=999999999`]: [],
    };
    for (const [query, ids] of Object.entries(want)) {
      const students = await get(`/api/coordinator/students?${query}`);
      assert.deepEqual(ours(students.students.map((row) => row.student_id)), ids, `students?${query}`);
      assert.deepEqual(ours((await get(`/api/coordinator/monitoring?${query}`)).students.map((row) => row.student_id)), ids, `monitoring?${query}`);
      assert.deepEqual(ours((await get(`/api/coordinator/report?${query}`)).students.map((row) => row.student_id)), ids, `report?${query}`);
      assert.deepEqual(ours((await get(`/api/projections?${query}`)).projections.map((row) => row.student_id)), ids, `projections?${query}`);
      assert.deepEqual(ours((await get(`/api/coordinator/documents?${query}`)).students.map((row) => row.student_id)), ids, `documents?${query}`);
      assert.equal((await get(`/api/coordinator/dashboard?${query}`)).students.active, ids.length, `dashboard?${query}`);
      assert.equal((await get(`/api/coordinator/actions?${query}`)).progress.students, ids.length, `actions?${query}`);
      assert.equal((await get(`/api/coordinator/analytics?${query}`)).progress.students, ids.length, `analytics?${query}`);
      const onTrack = (await get(`/api/coordinator/kpis?${query}`)).kpis[0];
      assert.equal(onTrack.basis, ids.length === 0 ? "No active students" : `0 of ${ids.length} ${ids.length === 1 ? "student" : "students"}`, `kpis?${query}`);
    }
    // The list says where each student is.
    const listed = (await get(`/api/coordinator/students?block=${blockB.id}`)).students[0];
    assert.deepEqual([listed.program_code, listed.major_name, listed.block_name, listed.college_id], [`BST${stamp}`, "Quality", `BST${stamp} 4C`, made.college]);
    // With paging the filters still apply, and the total is of the filtered list.
    const paged = await get(`/api/coordinator/students?program=${made.program}&limit=2`);
    assert.deepEqual([paged.students.length, paged.total], [2, 5]);
    // The action list's links carry the filters to the page they open.
    const rowsOf = (await get(`/api/coordinator/actions?program=${made.program}`)).groups.flatMap((group) => group.rows);
    const unassigned = rowsOf.find((row) => row.key === "unassigned");
    assert.equal(unassigned.count, 5);
    assert.equal(unassigned.link, `/coordinator/students?filter=unassigned&program=${made.program}`);

    // The report: the same students summed by program and by block.
    const report = await get(`/api/coordinator/report?college=${made.college}`);
    assert.deepEqual(report.programs.map((row) => [row.name, row.students]), [[`BS Testing ${stamp}`, 5]]);
    assert.deepEqual(report.blocks.map((row) => [row.name, row.students]), [[`BST${stamp} 4A`, 3], [`BST${stamp} 4C`, 1], ["No block", 1]]);
    const two = report.students.find((row) => row.student_id === sid(2));
    assert.deepEqual([two.college, two.program_code, two.major, two.block], [`Test College ${stamp}`, `BST${stamp}`, "Quality", `BST${stamp} 4C`]);
    assert.equal(report.programs.reduce((sum, row) => sum + row.students, 0), report.students.length);
    assert.equal(report.blocks.reduce((sum, row) => sum + row.students, 0), report.students.length);
    // Unfiltered, the two tables still add up to every student.
    const whole = await get("/api/coordinator/report");
    assert.equal(whole.programs.reduce((sum, row) => sum + row.students, 0), whole.students.length);
    assert.equal(whole.blocks.reduce((sum, row) => sum + row.students, 0), whole.students.length);

    // The audit log, by the student an entry is about.
    await new Promise((resolve) => setTimeout(resolve, 500));
    const about = await get(`/api/coordinator/audit?block=${made.block}&limit=200`);
    assert.ok(about.total > 0);
    for (const entry of about.entries) {
      const subject = entry.entity_type === "student" ? entry.entity_id : entry.details.student_id;
      assert.ok([sid(1), sid(3), sid(7)].includes(subject), `${entry.action} about ${subject}`);
    }
    assert.ok(about.entries.some((entry) => entry.action === "account.edit" && entry.entity_id === sid(7)));
    // And the changes to the structure are in it.
    const logged = async (action, id) =>
      (await pool.query(`SELECT details FROM audit_log WHERE action = $1 AND entity_id = $2 ORDER BY id DESC LIMIT 1`, [action, String(id)])).rows[0]?.details;
    assert.deepEqual(await logged("college.create", made.college), { name: `Test College ${stamp}`, short_name: `TC${stamp}` });
    assert.equal((await logged("program.create", made.program)).short_code, `BST${stamp}`);
    assert.deepEqual(await logged("program.edit", made.program), { ojt_applies: true });
    assert.equal((await logged("major.create", made.major)).name, "Quality");
    assert.equal((await logged("block.create", made.block)).block, `BST${stamp} 4A`);
    assert.deepEqual(await logged("block.edit", blockB.id), { section: "C", block: `BST${stamp} 4C` });
    assert.deepEqual(await logged("block.add_students", made.block), { students: 2, left_out: 2 });

    /* ---- a term's blocks close and reopen with it ---- */
    const quiet = await send("PUT", `/api/coordinator/blocks/${blockB.id}`, { is_active: false });
    assert.equal(quiet.body.block.is_active, false);
    const closed = await send("POST", `/api/coordinator/terms/${made.term}/close`, {});
    assert.equal(closed.response.status, 200, JSON.stringify(closed.body));
    assert.equal(closed.body.blocks_deactivated, 1, "only the block that was still active");
    const active = async () => (await pool.query(`SELECT id, is_active FROM blocks WHERE id = ANY($1::int[]) ORDER BY id`, [[made.block, blockB.id]])).rows.map((row) => row.is_active);
    assert.deepEqual(await active(), [false, false]);
    assert.equal((await send("POST", `/api/coordinator/blocks/${made.block}/students`, { student_ids: [sid(11)] })).response.status, 409, "an inactive block takes no students");
    assert.equal((await send("POST", "/api/coordinator/blocks", { program_id: made.program, year_level: 3, section: "A", term_id: made.term })).response.status, 400, "a closed term takes no new block");
    const reopened = await send("POST", `/api/coordinator/terms/${made.term}/reopen`, {});
    assert.equal(reopened.body.blocks_reactivated, 1);
    assert.deepEqual(await active(), [true, false], "the one switched off by hand stays off");
    // Students keep their block through it all.
    assert.equal((await placed(1)).block_id, made.block);
  } finally {
    await pool.query(`DELETE FROM notifications WHERE student_id LIKE $1`, [`P2-${stamp}-%`]);
    await pool.query(`DELETE FROM students WHERE student_id LIKE $1`, [`P2-${stamp}-%`]);
    const programs = [made.program, made.sister].filter(Boolean);
    await pool.query(`DELETE FROM blocks WHERE program_id = ANY($1::int[])`, [programs]);
    await pool.query(`DELETE FROM majors WHERE program_id = ANY($1::int[])`, [programs]);
    await pool.query(`DELETE FROM programs WHERE id = ANY($1::int[])`, [programs]);
    await pool.query(`DELETE FROM colleges WHERE id = ANY($1::int[])`, [[made.college, made.other].filter(Boolean)]);
    if (made.term) await pool.query(`DELETE FROM terms WHERE id = $1`, [made.term]);
    await pool.query(`DELETE FROM audit_log WHERE entity_id LIKE $1 OR details->>'name' LIKE $2`, [`P2-${stamp}-%`, `%${stamp}%`]);
    await pool.end();
  }
});

/*
| Round 2, Phase 3: the weekly report, tasks worked on, and the time record's columns
*/

test("a weekly report may say what was tried about its problems, and a form that does not know the field leaves it alone", async (t) => {
  const id = encodeURIComponent(student.student_id);
  // Checked before anything is saved, like the other parts.
  const monday = (await jsonRequest(`/api/journals/student/${id}`, { headers: authHeaders(studentToken) })).body.current_week_start;
  const put = (body) => jsonRequest(`/api/journals/student/${id}/${monday}`, jsonBody(studentToken, "PUT", body));
  const base = {
    activities: "Sorted the incoming receipts and entered them in the ledger.",
    learnings: "How the ledger is balanced at the end of each day.",
  };
  assert.equal((await put({ ...base, solutions: "x".repeat(3001) })).response.status, 400);
  assert.equal((await put({ ...base, solutions: ["a list"] })).response.status, 400);
  assert.equal((await put({ ...base, solutions: 12 })).response.status, 400);

  if (process.env.ALLOW_TEST_WRITES !== "true") {
    t.skip("set ALLOW_TEST_WRITES=true to run against a throwaway database");
    return;
  }
  const pool = localTestPool();
  const supervisor = await supervisorSession();
  const stored = async () => (await pool.query(`SELECT challenges, solutions, status FROM journals WHERE student_id = $1 AND week_start = $2`, [student.student_id, monday])).rows[0];
  try {
    await pool.query(`DELETE FROM journals WHERE student_id = $1 AND week_start = $2`, [student.student_id, monday]);
    // Optional: a report without it is a whole report.
    const first = await put({ ...base, challenges: "The scanner jammed twice." });
    assert.equal(first.response.status, 201, JSON.stringify(first.body));
    assert.equal(first.body.journal.solutions, null);
    assert.equal(first.body.message, "Weekly report submitted.");
    // Given: trimmed and kept.
    const second = await put({ ...base, challenges: "The scanner jammed twice.", solutions: "  Cleared the feeder and scanned in smaller batches.  " });
    assert.equal(second.response.status, 200);
    assert.equal(second.body.journal.solutions, "Cleared the feeder and scanned in smaller batches.");
    // An older form sends the three parts it knows: the fourth is not wiped.
    const older = await put({ ...base, challenges: "The scanner jammed three times." });
    assert.equal(older.response.status, 200);
    assert.deepEqual(await stored(), { challenges: "The scanner jammed three times.", solutions: "Cleared the feeder and scanned in smaller batches.", status: "Submitted" });
    // Sent empty on purpose: cleared.
    assert.equal((await put({ ...base, solutions: "" })).body.journal.solutions, null);
    await put({ ...base, solutions: "Asked the clerk to show me the feeder." });

    // The supervisor and the coordinator read the same four parts.
    const listed = (await jsonRequest("/api/journals/supervisor", { headers: authHeaders(supervisor.token) })).body.journals.find((item) => item.week_start === monday && item.student_id === student.student_id);
    assert.equal(listed.solutions, "Asked the clerk to show me the feeder.");
    const record = await jsonRequest(`/api/coordinator/students/${id}/overview`, { headers: authHeaders(coordinatorToken) });
    assert.equal(record.body.journals.find((item) => item.week_start === monday).solutions, "Asked the clerk to show me the feeder.");
    // The review flow is as it was.
    const reviewed = await jsonRequest(`/api/journals/${listed.id}/review`, jsonBody(supervisor.token, "PATCH", { status: "Reviewed" }));
    assert.equal(reviewed.response.status, 200);
    assert.equal(reviewed.body.journal.solutions, "Asked the clerk to show me the feeder.");
    assert.equal((await put({ ...base, solutions: "Too late." })).response.status, 409);
  } finally {
    await pool.query(`DELETE FROM notifications WHERE entity_type = 'journal' AND (title LIKE 'Weekly journal%' OR title LIKE 'Weekly report%')`);
    await pool.query(`DELETE FROM journals WHERE student_id = $1 AND week_start = $2`, [student.student_id, monday]);
    await pool.end();
  }
});

test("tasks worked on are chosen at time-out, must be the student's own, and are read back with the log", async (t) => {
  // A log id that does not exist: these requests can change nothing.
  const nowhere = (body) => jsonRequest("/api/attendance/999999999/time-out", jsonBody(studentToken, "PUT", body));
  const note = "Filed and labelled the week's delivery receipts.";
  for (const bad of ["12", { id: 1 }, ["x"], [0], [-4], [1.5], Array.from({ length: 21 }, (_, index) => index + 1)]) {
    const refused = await nowhere({ accomplishments: note, task_ids: bad });
    assert.equal(refused.response.status, 400, JSON.stringify(bad).slice(0, 40));
  }
  // None chosen, or the field not sent: as before.
  assert.equal((await nowhere({ accomplishments: note, task_ids: [] })).response.status, 404);
  assert.equal((await nowhere({ accomplishments: note })).response.status, 404);
  // Every log the student reads says which tasks, even if none.
  const own = await jsonRequest(`/api/attendance/${encodeURIComponent(student.student_id)}`, { headers: authHeaders(studentToken) });
  for (const log of own.body.attendance) assert.ok(Array.isArray(log.tasks), "each log carries its tasks");

  if (process.env.ALLOW_TEST_WRITES !== "true") {
    t.skip("set ALLOW_TEST_WRITES=true to run against a throwaway database");
    return;
  }
  const pool = localTestPool();
  const supervisor = await supervisorSession();
  const sid = student.student_id;
  // A day long ago, so it cannot collide with a real log; timed in an hour ago, so it can still be timed out.
  const DAY = "2001-02-03";
  const made = { logs: [], tasks: [], other: "TASKLINK-OTHER" };
  const openLog = async () => {
    await pool.query(`DELETE FROM attendance WHERE student_id = $1 AND date = $2`, [sid, DAY]);
    const id = (await pool.query(`INSERT INTO attendance (student_id, date, time_in, status) VALUES ($1, $2, NOW() - INTERVAL '1 hour', 'Pending') RETURNING id`, [sid, DAY])).rows[0].id;
    made.logs.push(id);
    return id;
  };
  const timeOut = (logId, body) => jsonRequest(`/api/attendance/${logId}/time-out`, jsonBody(studentToken, "PUT", body));
  try {
    const task = async (owner, title) => {
      const id = (await pool.query(`INSERT INTO tasks (student_id, title, status, due_date) VALUES ($1, $2, 'In Progress', CURRENT_DATE + 7) RETURNING id`, [owner, title])).rows[0].id;
      made.tasks.push(id);
      return id;
    };
    await pool.query(`INSERT INTO students (student_id, email, password, name, is_active) VALUES ($1, 'tasklink@other.test', 'x', 'Someone Else', FALSE) ON CONFLICT DO NOTHING`, [made.other]);
    const ledger = await task(sid, "Balance the petty cash ledger");
    const filing = await task(sid, "File the delivery receipts");
    const theirs = await task(made.other, "Somebody else's task");

    // Someone else's task in the list: refused whole, and the log stays open.
    let logId = await openLog();
    const stolen = await timeOut(logId, { accomplishments: note, task_ids: [ledger, theirs] });
    assert.equal(stolen.response.status, 400);
    assert.match(stolen.body.message, /assigned to you/);
    assert.equal((await pool.query(`SELECT time_out FROM attendance WHERE id = $1`, [logId])).rows[0].time_out, null);
    assert.equal((await pool.query(`SELECT COUNT(*)::int AS n FROM attendance_tasks WHERE attendance_id = $1`, [logId])).rows[0].n, 0);

    // Two of their own, one named twice: the time-out is recorded and both are linked once.
    const done = await timeOut(logId, { accomplishments: note, task_ids: [filing, ledger, filing] });
    assert.equal(done.response.status, 200, JSON.stringify(done.body));
    assert.deepEqual(done.body.attendance.tasks, [{ id: ledger, title: "Balance the petty cash ledger" }, { id: filing, title: "File the delivery receipts" }]);
    assert.equal(done.body.attendance.accomplishments, note);
    // The student, the supervisor and the coordinator read the same links.
    const mine = (await jsonRequest(`/api/attendance/${encodeURIComponent(sid)}`, { headers: authHeaders(studentToken) })).body.attendance.find((log) => log.id === logId);
    assert.deepEqual(mine.tasks.map((item) => item.title), ["Balance the petty cash ledger", "File the delivery receipts"]);
    const seen = (await jsonRequest(`/api/supervisor/attendance/${encodeURIComponent(supervisor.supervisor.supervisor_id)}`, { headers: authHeaders(supervisor.token) })).body.attendance.find((log) => log.id === logId);
    assert.deepEqual(seen.tasks.map((item) => item.id), [ledger, filing]);
    const record = (await jsonRequest(`/api/coordinator/students/${encodeURIComponent(sid)}/overview`, { headers: authHeaders(coordinatorToken) })).body.attendance.find((log) => log.id === logId);
    assert.deepEqual(record.tasks.map((item) => item.id), [ledger, filing]);

    // A time-out recorded offline carries its tasks, and a repeat of it answers the same.
    logId = await openLog();
    // The moment of the time-in, worked out by the database: the column holds Philippine wall time with no
    // zone, which this process would otherwise read in its own zone (UTC on the CI runner, eight hours out).
    const timeIn = Number((await pool.query(`SELECT EXTRACT(EPOCH FROM time_in AT TIME ZONE 'Asia/Manila') * 1000 AS at FROM attendance WHERE id = $1`, [logId])).rows[0].at);
    const offline = {
      accomplishments: note,
      task_ids: [ledger],
      occurred_at: new Date(Math.floor(timeIn / 1000) * 1000 + 30 * 60 * 1000).toISOString(),
      client_request_id: require("node:crypto").randomUUID(),
    };
    const queued = await timeOut(logId, offline);
    assert.equal(queued.response.status, 200, JSON.stringify(queued.body));
    assert.equal(queued.body.attendance.recorded_offline, true);
    assert.deepEqual(queued.body.attendance.tasks, [{ id: ledger, title: "Balance the petty cash ledger" }]);
    const repeat = await timeOut(logId, offline);
    assert.equal(repeat.response.status, 200);
    assert.equal(repeat.body.replayed, true);
    assert.deepEqual(repeat.body.attendance.tasks, [{ id: ledger, title: "Balance the petty cash ledger" }], "the ledger kept the tasks with the answer");
    assert.equal((await pool.query(`SELECT COUNT(*)::int AS n FROM attendance_tasks WHERE attendance_id = $1`, [logId])).rows[0].n, 1);

    // A link goes when its task does, and when its log does.
    await pool.query(`DELETE FROM tasks WHERE id = $1`, [ledger]);
    assert.equal((await pool.query(`SELECT COUNT(*)::int AS n FROM attendance_tasks WHERE task_id = $1`, [ledger])).rows[0].n, 0);
  } finally {
    await pool.query(`DELETE FROM offline_action_ledger WHERE attendance_id = ANY($1::int[])`, [made.logs]);
    await pool.query(`DELETE FROM attendance WHERE id = ANY($1::int[])`, [made.logs]);
    await pool.query(`DELETE FROM attendance_tasks WHERE attendance_id = ANY($1::int[])`, [made.logs]);
    await pool.query(`DELETE FROM tasks WHERE id = ANY($1::int[])`, [made.tasks]);
    await pool.query(`DELETE FROM notifications WHERE student_id = $1 OR message LIKE '%2001-02-03%'`, [made.other]);
    await pool.query(`DELETE FROM students WHERE student_id = $1`, [made.other]);
    await pool.end();
  }
});

test("a day's times go in the time record's AM and PM columns, and none is made up", () => {
  require("tsx/cjs");
  // The function the printed sheet uses. It lives with the pages and imports
  // nothing, so it can be checked here without a browser.
  const { timeColumns, STEP_LABELS } = require("../../my-pwa/src/lib/timeColumns.ts");
  // Times as the server sends them, read on a Philippine clock.
  const at = (clock, day = "2026-10-12") => `${day}T${clock}:00+08:00`;
  const columns = (times) => {
    const result = timeColumns({ time_in: null, break_time: null, break_end_time: null, time_out: null, ...times }, "Asia/Manila");
    const hhmm = (value) => (value ? new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Manila", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(value)) : null);
    return [hhmm(result.amIn), hhmm(result.amOut), hhmm(result.pmIn), hhmm(result.pmOut), result.noBreak];
  };

  // Lunch taken: the four times as recorded.
  assert.deepEqual(columns({ time_in: at("08:00"), break_time: at("12:00"), break_end_time: at("13:00"), time_out: at("17:00") }), ["08:00", "12:00", "13:00", "17:00", false]);
  // A break taken at 10:00 in the morning is printed at 10:00, not moved to noon.
  assert.deepEqual(columns({ time_in: at("08:00"), break_time: at("10:00"), break_end_time: at("10:15"), time_out: at("17:00") }), ["08:00", "10:00", "10:15", "17:00", false]);
  // Out for lunch and not back yet, and timed out without coming back: only what happened.
  assert.deepEqual(columns({ time_in: at("08:00"), break_time: at("12:05") }), ["08:00", "12:05", null, null, false]);
  assert.deepEqual(columns({ time_in: at("08:00"), break_time: at("12:05"), break_end_time: at("12:50") }), ["08:00", "12:05", "12:50", null, false]);

  // No lunch, morning into afternoon: the two middle cells are one, "No break".
  assert.deepEqual(columns({ time_in: at("08:00"), time_out: at("17:00") }), ["08:00", null, null, "17:00", true]);
  assert.deepEqual(columns({ time_in: at("11:59"), time_out: at("13:00") }), ["11:59", null, null, "13:00", true]);

  // One session only. Over by 12:59 PM: the AM columns.
  assert.deepEqual(columns({ time_in: at("08:00"), time_out: at("12:00") }), ["08:00", "12:00", null, null, false]);
  assert.deepEqual(columns({ time_in: at("08:00"), time_out: at("12:59") }), ["08:00", "12:59", null, null, false]);
  // Starting at 12:00 noon or later: the PM columns.
  assert.deepEqual(columns({ time_in: at("12:00"), time_out: at("17:00") }), [null, null, "12:00", "17:00", false]);
  assert.deepEqual(columns({ time_in: at("13:30"), time_out: at("17:30") }), [null, null, "13:30", "17:30", false]);
  // A short session wholly after noon is an afternoon's work, though it ends before 12:59.
  assert.deepEqual(columns({ time_in: at("12:10"), time_out: at("12:50") }), [null, null, "12:10", "12:50", false]);
  // One minute past: it ran into the afternoon.
  assert.deepEqual(columns({ time_in: at("08:00"), time_out: at("13:00") }), ["08:00", null, null, "13:00", true]);

  // Still open: the time in where it belongs, nothing else, and no "No break" yet.
  assert.deepEqual(columns({ time_in: at("08:00") }), ["08:00", null, null, null, false]);
  assert.deepEqual(columns({ time_in: at("14:00") }), [null, null, "14:00", null, false]);
  // No log, or a time that cannot be read: empty.
  assert.deepEqual(columns({}), [null, null, null, null, false]);
  assert.deepEqual(columns({ time_in: "not a time" }), [null, null, null, null, false]);
  // Closed after midnight: not a morning's work.
  assert.deepEqual(columns({ time_in: at("08:00"), time_out: at("00:30", "2026-10-13") }), ["08:00", null, null, "00:30", true]);
  assert.deepEqual(columns({ time_in: at("18:00"), time_out: at("01:00", "2026-10-13") }), [null, null, "18:00", "01:00", false]);

  // A time is never invented: every time printed is one of the four recorded.
  const recorded = { time_in: at("08:07"), break_time: null, break_end_time: null, time_out: at("16:52") };
  const printed = timeColumns(recorded, "Asia/Manila");
  for (const value of [printed.amIn, printed.amOut, printed.pmIn, printed.pmOut]) {
    assert.ok(value === null || Object.values(recorded).includes(value));
  }
  // The same moment read on another clock goes where that clock puts it.
  assert.equal(timeColumns({ ...recorded, time_in: "2026-10-12T05:00:00Z", time_out: "2026-10-12T09:00:00Z" }, "Asia/Manila").pmIn, "2026-10-12T05:00:00Z");
  assert.equal(timeColumns({ ...recorded, time_in: "2026-10-12T05:00:00Z", time_out: "2026-10-12T09:00:00Z" }, "UTC").amIn, "2026-10-12T05:00:00Z");

  assert.deepEqual(STEP_LABELS, { time_in: "Time in", break_time: "Out for lunch", break_end_time: "Back from lunch", time_out: "Time out" });
});

test("the student's calendar and progress are worked out from the saved lists", () => {
  require("tsx/cjs");
  const calendar = require("../../my-pwa/src/lib/studentCalendar.ts");
  const at = (day, clock) => `${day}T${clock}:00+08:00`;
  const weekdays = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
  const shifts = weekdays.map((day) => ({ day, start_time: "08:00:00", end_time: "17:00:00", hours: 8, focus: null }));
  const log = (date, timeIn, hours, status = "Verified", extra = {}) => ({
    date, time_in: at(date, timeIn), break_time: null, break_end_time: null, time_out: hours === null ? null : at(date, "17:00"), hours, status, ...extra,
  });

  // October 2026 starts on a Thursday: the grid runs Monday 28 September to Sunday 1 November.
  const weeks = calendar.monthWeeks("2026-10");
  assert.equal(weeks.length, 5);
  assert.deepEqual([weeks[0][0], weeks[0][3], weeks[4][6]], ["2026-09-28", "2026-10-01", "2026-11-01"]);
  for (const week of weeks) assert.equal(week.length, 7);
  assert.equal(calendar.monthWeeks("2027-02").length, 4, "a February that starts on a Monday fits four weeks exactly");
  assert.equal(calendar.monthWeeks("2026-08").length, 6);
  assert.deepEqual([calendar.addMonths("2026-12", 1), calendar.addMonths("2026-01", -1)], ["2027-01", "2025-12"]);
  assert.equal(calendar.mondayOf("2026-10-11"), "2026-10-05", "a Sunday belongs to the week before");

  // Week numbers count from the week of the first log, or of the term's start when there is none.
  assert.equal(calendar.countedFrom([log("2026-10-07", "08:00", 8), log("2026-09-30", "08:00", 8)], "2026-09-01"), "2026-09-30");
  assert.equal(calendar.countedFrom([], "2026-09-01"), "2026-09-01");
  assert.equal(calendar.countedFrom([], null), null);
  assert.equal(calendar.weekNumber("2026-09-30", "2026-09-30"), 1);
  assert.equal(calendar.weekNumber("2026-09-28", "2026-09-30"), 1, "the Monday of that same week");
  assert.equal(calendar.weekNumber("2026-11-04", "2026-09-30"), 6);
  assert.equal(calendar.weekNumber("2026-09-27", "2026-09-30"), null, "before the OJT");
  assert.equal(calendar.weekNumber("2026-10-01", null), null);

  // One day's facts.
  const sources = {
    shifts,
    holidays: [{ date: "2026-10-08", name: "Founding Day" }],
    logs: [
      log("2026-10-05", "08:00", 8),
      log("2026-10-06", "08:20", 7.5, "Pending"),
      log("2026-10-07", "07:50", 8, "Verified", { accomplishments: "Filed the receipts.", tasks: [{ id: 3, title: "Ledger" }] }),
      log("2026-10-12", "08:05", null, "Pending"),
    ],
    absences: [{ date: "2026-10-09", status: "Excused", reason: "Clinic visit" }, { date: "2026-10-05", status: "Pending" }],
    tasks: [{ id: 3, title: "Ledger", status: "In Progress", due_date: "2026-10-09" }, { id: 4, title: "No date", status: "Pending", due_date: null }],
  };
  const day = calendar.calendarIndex(sources);
  assert.equal(day("2026-10-05").shift.start_time, "08:00:00");
  assert.equal(day("2026-10-05").absence, null, "a day that was worked is not an absence, whatever was filed");
  assert.equal(day("2026-10-10").shift, null, "Saturday is a day off");
  assert.equal(day("2026-10-08").holiday, "Founding Day");
  assert.deepEqual([day("2026-10-09").absence.status, day("2026-10-09").due.map((task) => task.id)], ["Excused", [3]]);
  assert.deepEqual(day("2026-10-07").log.tasks, [{ id: 3, title: "Ledger" }]);
  // What a square says about hours.
  assert.deepEqual(calendar.hoursMark(day("2026-10-05").log), { text: "8 h", verified: true });
  assert.deepEqual(calendar.hoursMark(day("2026-10-06").log), { text: "7.5 h", verified: false });
  assert.deepEqual(calendar.hoursMark(day("2026-10-12").log), { text: "open", verified: false });
  assert.equal(calendar.hoursMark(null), null);

  // Hours by week: a holiday takes its day off what was scheduled; only verified hours count.
  const byWeek = calendar.weeklyHours("2026-10-12", "2026-10-05", sources, 3);
  assert.deepEqual(byWeek, [
    { week_start: "2026-09-28", scheduled: 0, verified: 0 },
    { week_start: "2026-10-05", scheduled: 32, verified: 16 },
    { week_start: "2026-10-12", scheduled: 40, verified: 0 },
  ]);
  assert.equal(calendar.weeklyHours("2026-10-12", null, sources).length, 8);

  // Attendance on scheduled days, up to yesterday: Mon, Tue, Wed attended; Thu a holiday; Fri missed.
  assert.deepEqual(calendar.attendanceOnScheduledDays("2026-10-12", "2026-10-05", sources), { scheduled: 4, attended: 3 });
  // Today is not counted until it is over.
  assert.deepEqual(calendar.attendanceOnScheduledDays("2026-10-13", "2026-10-05", sources), { scheduled: 5, attended: 4 });
  assert.deepEqual(calendar.attendanceOnScheduledDays("2026-10-12", null, sources), { scheduled: 0, attended: 0 });

  // Time-in against the shift's start: on time, 20 late, 10 early, 5 late. Late is more than 15 minutes.
  assert.equal(calendar.LATE_AFTER_MINUTES, 15);
  assert.deepEqual(calendar.punctuality(sources, "Asia/Manila"), { days: 4, average: 4, late: 1 });
  // Exactly 15 minutes after is not late; 16 is. A day with no shift is left out.
  const edge = { shifts, logs: [log("2026-10-05", "08:15", 8), log("2026-10-06", "08:16", 8), log("2026-10-10", "11:00", 4)] };
  assert.deepEqual(calendar.punctuality(edge, "Asia/Manila"), { days: 2, average: 16, late: 1 });
  assert.deepEqual(calendar.punctuality({ shifts, logs: [] }, "Asia/Manila"), { days: 0, average: 0, late: 0 });
});

test("a student's profile says which term they are in", async () => {
  const mine = await jsonRequest(`/api/students/${encodeURIComponent(student.student_id)}/profile`, { headers: authHeaders(studentToken) });
  assert.equal(mine.response.status, 200);
  // What it always answered is still there.
  assert.ok(mine.body.student && "coordinator" in mine.body);
  assert.ok("term" in mine.body);
  if (mine.body.term !== null) {
    assert.deepEqual(Object.keys(mine.body.term).sort(), ["end_date", "name", "start_date"]);
    assert.match(mine.body.term.start_date, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(mine.body.term.start_date <= mine.body.term.end_date);
  }
});

/*
|--------------------------------------------------------------------------
| Round 2, Phase 4: the supervisor's day
|--------------------------------------------------------------------------
*/

const needsWrites = (t) => {
  if (process.env.ALLOW_TEST_WRITES === "true") return false;
  t.skip("set ALLOW_TEST_WRITES=true to run against a throwaway database");
  return true;
};

test("the release day is read the same everywhere: optional, today or later, never after the due date", () => {
  require("tsx/cjs");
  const { readReleaseDay, released, scheduledLater } = require("../src/services/taskRelease.ts");
  const today = "2026-10-12";
  assert.deepEqual(readReleaseDay(undefined, today, "2026-10-20"), { day: null });
  assert.deepEqual(readReleaseDay("", today, "2026-10-20"), { day: null });
  assert.deepEqual(readReleaseDay(null, today, "2026-10-20"), { day: null });
  // Today is the same as not choosing a day.
  assert.deepEqual(readReleaseDay(today, today, "2026-10-20"), { day: null });
  assert.deepEqual(readReleaseDay("2026-10-15", today, "2026-10-20"), { day: "2026-10-15" });
  assert.deepEqual(readReleaseDay("2026-10-20", today, "2026-10-20"), { day: "2026-10-20" }, "released on the day it is due");
  for (const bad of ["2026-10-11", "2026-10-21", "2026-13-40", "tomorrow", 20261015, ["2026-10-15"]]) {
    assert.ok("problem" in readReleaseDay(bad, today, "2026-10-20"), JSON.stringify(bad));
  }
  // The two conditions are each other's opposite, with or without an alias.
  assert.equal(released(), "(available_from IS NULL OR available_from <= CURRENT_DATE)");
  assert.equal(scheduledLater("t."), "(t.available_from IS NOT NULL AND t.available_from > CURRENT_DATE)");
});

test("a release day is checked before a task is saved", async () => {
  const supervisor = await supervisorSession();
  const assign = (body) => jsonRequest("/api/tasks", jsonBody(supervisor.token, "POST", { student_id: student.student_id, title: "Release check", ...body }));
  for (const [body, word] of [
    [{ due_date: "2099-01-10", available_from: "2099-01-11" }, /on or after the release date/],
    [{ due_date: "2099-01-10", available_from: "2001-01-01" }, /cannot be in the past/],
    [{ due_date: "2099-01-10", available_from: "2099-13-40" }, /valid date/],
    [{ due_date: "2099-01-10", available_from: 5 }, /valid date/],
  ]) {
    const refused = await assign(body);
    assert.equal(refused.response.status, 400, JSON.stringify(body));
    assert.match(refused.body.message, word);
  }
});

test("a task set for a later day is hidden from the intern until that day, then announced once", async (t) => {
  if (needsWrites(t)) return;
  require("tsx/cjs");
  const { releaseDueTasks } = require("../src/services/taskRelease.ts");
  const pool = localTestPool();
  const supervisor = await supervisorSession();
  const sid = student.student_id;
  const title = `Release test ${Date.now()}`;
  const days = (await pool.query(`SELECT TO_CHAR(CURRENT_DATE + 1, 'YYYY-MM-DD') AS tomorrow, TO_CHAR(CURRENT_DATE + 2, 'YYYY-MM-DD') AS later, TO_CHAR(CURRENT_DATE + 7, 'YYYY-MM-DD') AS due`)).rows[0];
  const mine = async () => (await jsonRequest(`/api/tasks/student/${encodeURIComponent(sid)}`, { headers: authHeaders(studentToken) })).body;
  const theirs = async () => (await jsonRequest(`/api/tasks/supervisor/${encodeURIComponent(supervisor.supervisor.supervisor_id)}`, { headers: authHeaders(supervisor.token) })).body.tasks;
  const openTasks = async () => {
    const answer = await jsonRequest(`/api/students/${encodeURIComponent(sid)}/completion`, { headers: authHeaders(studentToken) });
    return JSON.stringify(answer.body);
  };
  const told = async (id, what) =>
    (await pool.query(`SELECT COUNT(*)::int AS n FROM notifications WHERE student_id = $1 AND title = $2 AND (entity_id = $3 OR message LIKE $4)`, [sid, what, String(id), `%${title}%`])).rows[0].n;
  let id;
  try {
    const checklistBefore = await openTasks();
    const made = await jsonRequest("/api/tasks", jsonBody(supervisor.token, "POST", { student_id: sid, title, due_date: days.due, available_from: days.tomorrow }));
    assert.equal(made.response.status, 201, JSON.stringify(made.body));
    id = made.body.task.id;
    assert.equal(made.body.task.scheduled, true);
    assert.equal(made.body.task.release_day, days.tomorrow);
    assert.match(made.body.message, /scheduled/i);

    // HIDDEN BEFORE. Not in the intern's list, not in their checklist or their data, not to be submitted, and nothing said.
    assert.ok(!(await mine()).some((task) => task.id === id), "not in the intern's list");
    assert.equal(await openTasks(), checklistBefore, "the completion checklist does not count it");
    const exported = await jsonRequest(`/api/students/${encodeURIComponent(sid)}/data-export`, { headers: authHeaders(studentToken) });
    assert.ok(!JSON.stringify(exported.body).includes(title), "not in the data download");
    const form = new FormData();
    form.set("submission_notes", "Early.");
    const early = await fetch(new URL(`/api/tasks/${id}/submit`, apiBaseUrl), { method: "POST", headers: authHeaders(studentToken), body: form });
    assert.equal(early.status, 404, "a task not yet released cannot be submitted");
    assert.equal(await told(id, "New task assigned"), 0, "not announced when it is made");
    // The supervisor sees it, marked.
    const row = (await theirs()).find((task) => task.id === id);
    assert.deepEqual([row.scheduled, row.release_day], [true, days.tomorrow]);

    // Changed while it waits: the day can move, the intern is still told nothing, and the due date cannot come before it.
    const edit = (body) => jsonRequest(`/api/tasks/${id}`, jsonBody(supervisor.token, "PUT", { title, priority: "Medium", due_date: days.due, ...body }));
    assert.equal((await edit({ due_date: days.tomorrow, available_from: days.later })).response.status, 400);
    const moved = await edit({ available_from: days.later });
    assert.equal(moved.response.status, 200, JSON.stringify(moved.body));
    assert.equal((await theirs()).find((task) => task.id === id).release_day, days.later);
    assert.equal((await edit({ due_date: days.tomorrow })).response.status, 400, "the due date cannot come before the day already set");
    assert.equal((await edit({ priority: "High" })).response.status, 200);
    assert.equal((await theirs()).find((task) => task.id === id).release_day, days.later, "a form that does not send the day leaves it");
    assert.equal(await told(id, "Task updated"), 0);

    // A round of the loop before the day: nothing.
    const sent = [];
    const collect = async (note) => { sent.push(note); };
    await releaseDueTasks(pool, collect);
    assert.equal(sent.filter((note) => note.entity?.id === id).length, 0);

    // THE DAY COMES. The server's own loop may get there first; either way it is said once.
    await pool.query(`UPDATE tasks SET available_from = CURRENT_DATE WHERE id = $1`, [id]);
    assert.ok((await mine()).some((task) => task.id === id), "in the intern's list on the day");
    assert.equal((await theirs()).find((task) => task.id === id).scheduled, false);
    const announced = async () => sent.filter((note) => note.entity?.id === id && note.title === "New task assigned").length + (await told(id, "New task assigned"));
    await releaseDueTasks(pool, collect);
    assert.equal(await announced(), 1, "announced on the day");
    // NOT TWICE.
    await releaseDueTasks(pool, collect);
    await releaseDueTasks(pool, collect);
    assert.equal(await announced(), 1, "and only once");
    assert.ok((await pool.query(`SELECT released_notified_at FROM tasks WHERE id = $1`, [id])).rows[0].released_notified_at);

    // Once it is out, the day is no longer changed by an edit.
    assert.equal((await edit({ available_from: days.later })).response.status, 200);
    assert.ok((await mine()).some((task) => task.id === id), "still out");

    // A scheduled task cancelled before its day: the intern never hears of it.
    const second = await jsonRequest("/api/tasks", jsonBody(supervisor.token, "POST", { student_id: sid, title: `${title} B`, due_date: days.due, available_from: days.tomorrow }));
    const gone = await jsonRequest(`/api/tasks/${second.body.task.id}`, jsonBody(supervisor.token, "DELETE", {}));
    assert.equal(gone.response.status, 200, JSON.stringify(gone.body));
    assert.equal(await told(second.body.task.id, "Task cancelled"), 0);
  } finally {
    await pool.query(`DELETE FROM notifications WHERE message LIKE $1`, [`%${title}%`]);
    await pool.query(`DELETE FROM tasks WHERE title LIKE $1`, [`${title}%`]);
    await pool.end();
  }
});

test("teams are a supervisor's own, with their own interns, and each name once", async () => {
  const supervisor = await supervisorSession();
  const path = "/api/supervisor/teams";
  assert.equal((await jsonRequest(path, { headers: authHeaders(studentToken) })).response.status, 403);
  assert.equal((await jsonRequest(path, { headers: authHeaders(coordinatorToken) })).response.status, 403);
  const list = await jsonRequest(path, { headers: authHeaders(supervisor.token) });
  assert.equal(list.response.status, 200);
  assert.ok(Array.isArray(list.body.teams));
  const make = (body) => jsonRequest(path, jsonBody(supervisor.token, "POST", body));
  for (const bad of [
    { name: "A", student_ids: [student.student_id] },
    { name: "x".repeat(81), student_ids: [student.student_id] },
    { name: "Nobody", student_ids: [] },
    { name: "Nobody" },
    { name: "Not mine", student_ids: ["NO-SUCH-STUDENT"] },
    { name: "Not ids", student_ids: [5] },
  ]) {
    assert.equal((await make(bad)).response.status, 400, JSON.stringify(bad).slice(0, 60));
  }
  // A team, or a team task, that is not there.
  assert.equal((await jsonRequest(`${path}/999999999`, jsonBody(supervisor.token, "PUT", { name: "Renamed" }))).response.status, 404);
  assert.equal((await jsonRequest(`${path}/abc`, jsonBody(supervisor.token, "DELETE", {}))).response.status, 404);
  const due = "2099-01-10";
  assert.equal((await jsonRequest("/api/tasks/team", jsonBody(supervisor.token, "POST", { group_id: 999999999, title: "T", due_date: due }))).response.status, 404);
  assert.equal((await jsonRequest("/api/tasks/team", jsonBody(supervisor.token, "POST", { title: "T", due_date: due }))).response.status, 400);
  assert.equal((await jsonRequest("/api/tasks/team", jsonBody(supervisor.token, "POST", { group_id: 1, title: "", due_date: due }))).response.status, 400);
  assert.equal((await jsonRequest("/api/tasks/team", jsonBody(supervisor.token, "POST", { group_id: 1, title: "T", due_date: "2001-01-01" }))).response.status, 400);
  assert.equal((await jsonRequest("/api/tasks/team", jsonBody(supervisor.token, "POST", { group_id: 1, title: "T", due_date: due, available_from: "2099-02-01" }))).response.status, 400);
  assert.equal((await jsonRequest("/api/tasks/team/999999999", jsonBody(supervisor.token, "PUT", { title: "T", due_date: due }))).response.status, 404);
  assert.equal((await jsonRequest("/api/tasks/team/999999999", jsonBody(supervisor.token, "DELETE", {}))).response.status, 404);
  assert.equal((await jsonRequest("/api/tasks/team/1", jsonBody(studentToken, "DELETE", {}))).response.status, 403);
});

test("a team task is one task for each member; a change or a cancel leaves alone whoever has submitted", async (t) => {
  if (needsWrites(t)) return;
  const pool = localTestPool();
  const supervisor = await supervisorSession();
  const supervisorId = supervisor.supervisor.supervisor_id;
  const sid = student.student_id;
  const stamp = Date.now();
  const mate = `P4-MATE-${stamp}`;
  const outsider = `P4-OUT-${stamp}`;
  const name = `Team test ${stamp}`;
  const title = `Team task ${stamp}`;
  const teams = "/api/supervisor/teams";
  const as = (method, path, body) => jsonRequest(path, jsonBody(supervisor.token, method, body ?? {}));
  const rows = async () => (await jsonRequest(`/api/tasks/supervisor/${encodeURIComponent(supervisorId)}`, { headers: authHeaders(supervisor.token) })).body.tasks.filter((task) => String(task.title).includes(String(stamp)));
  const mine = async () => (await jsonRequest(`/api/tasks/student/${encodeURIComponent(sid)}`, { headers: authHeaders(studentToken) })).body.filter((task) => String(task.title).includes(String(stamp)));
  const due = (await pool.query(`SELECT TO_CHAR(CURRENT_DATE + 7, 'YYYY-MM-DD') AS due, TO_CHAR(CURRENT_DATE + 1, 'YYYY-MM-DD') AS tomorrow`)).rows[0];
  try {
    await pool.query(`INSERT INTO students (student_id, email, password, name, supervisor_id, is_active) VALUES ($1, $2, 'x', 'Team Mate', $3, TRUE)`, [mate, `mate${stamp}@p4.test`, supervisorId]);
    await pool.query(`INSERT INTO students (student_id, email, password, name, is_active) VALUES ($1, $2, 'x', 'Someone Elsewhere', TRUE)`, [outsider, `out${stamp}@p4.test`]);

    // Somebody else's intern cannot be put in a team.
    assert.equal((await as("POST", teams, { name, student_ids: [sid, outsider] })).response.status, 400);
    const made = await as("POST", teams, { name, student_ids: [sid, mate, sid] });
    assert.equal(made.response.status, 201, JSON.stringify(made.body));
    const teamId = made.body.team.id;
    assert.deepEqual(made.body.team.members.map((member) => member.student_id).sort(), [mate, sid].sort(), "each member once");
    // The same name again, whatever the capitals.
    assert.equal((await as("POST", teams, { name: name.toUpperCase(), student_ids: [sid] })).response.status, 409);
    // Renamed alone, then members alone.
    const renamed = await as("PUT", `${teams}/${teamId}`, { name: `${name} B` });
    assert.deepEqual([renamed.response.status, renamed.body.team.name, renamed.body.team.members.length], [200, `${name} B`, 2]);
    const shrunk = await as("PUT", `${teams}/${teamId}`, { student_ids: [sid] });
    assert.deepEqual([shrunk.body.team.name, shrunk.body.team.members.length], [`${name} B`, 1]);
    assert.equal((await as("PUT", `${teams}/${teamId}`, { student_ids: [outsider] })).response.status, 400);
    await as("PUT", `${teams}/${teamId}`, { student_ids: [sid, mate] });

    // ONE ROW EACH, sharing a number.
    const given = await as("POST", "/api/tasks/team", { group_id: teamId, title, description: "Count the stock room.", due_date: due.due });
    assert.equal(given.response.status, 201, JSON.stringify(given.body));
    assert.equal(given.body.created, 2);
    const first = await rows();
    assert.equal(first.length, 2);
    assert.deepEqual([...new Set(first.map((task) => task.group_task_id))], [given.body.group_task_id]);
    assert.deepEqual(first.map((task) => task.student_id).sort(), [mate, sid].sort());
    assert.ok(first.every((task) => task.team_name === `${name} B` && task.status === "Pending"));
    // Each is told, and the intern sees their own with the team's name.
    const told = await pool.query(`SELECT student_id FROM notifications WHERE title = 'New task assigned' AND message LIKE $1`, [`%${title}%`]);
    assert.deepEqual(told.rows.map((row) => row.student_id).sort(), [mate, sid].sort());
    const own = await mine();
    assert.deepEqual([own.length, own[0].team_name, own[0].group_task_id], [1, `${name} B`, given.body.group_task_id]);

    // One submits. The supervisor sees one of two.
    const form = new FormData();
    form.set("submission_notes", "Counted, sheet attached.");
    const submitted = await fetch(new URL(`/api/tasks/${own[0].id}/submit`, apiBaseUrl), { method: "POST", headers: authHeaders(studentToken), body: form });
    assert.equal(submitted.status, 200);
    assert.deepEqual((await rows()).map((task) => task.status).sort(), ["Pending", "Submitted"]);

    // CHANGED: for the one who has not submitted. It says who was left.
    const changed = await as("PUT", `/api/tasks/team/${given.body.group_task_id}`, { title: `${title} (aisles 1 to 4)`, priority: "High", due_date: due.due });
    assert.deepEqual([changed.response.status, changed.body.updated, changed.body.skipped], [200, 1, 1], JSON.stringify(changed.body));
    assert.match(changed.body.message, /1 member has already submitted/);
    const after = await rows();
    assert.equal(after.find((task) => task.student_id === mate).title, `${title} (aisles 1 to 4)`);
    assert.equal(after.find((task) => task.student_id === sid).title, title, "the submitted one is as it was handed in");

    // CANCELLED: the same way.
    const cancelled = await as("DELETE", `/api/tasks/team/${given.body.group_task_id}`);
    assert.deepEqual([cancelled.response.status, cancelled.body.cancelled, cancelled.body.skipped], [200, 1, 1], JSON.stringify(cancelled.body));
    assert.deepEqual((await rows()).map((task) => task.student_id), [sid]);

    // A team task for a later day is hidden from every member, and nobody is told.
    const later = await as("POST", "/api/tasks/team", { group_id: teamId, title: `${title} later`, due_date: due.due, available_from: due.tomorrow });
    assert.equal(later.response.status, 201, JSON.stringify(later.body));
    assert.match(later.body.message, /scheduled/i);
    assert.ok(!(await mine()).some((task) => task.title === `${title} later`));
    assert.equal((await rows()).filter((task) => task.title === `${title} later` && task.scheduled).length, 2);
    assert.equal((await pool.query(`SELECT COUNT(*)::int AS n FROM notifications WHERE message LIKE $1`, [`%${title} later%`])).rows[0].n, 0);
    // Changed while it waits: a form without the day leaves it; the due date cannot come before it; sent empty, it is out today and announced by the loop.
    const laterPath = `/api/tasks/team/${later.body.group_task_id}`;
    const keptDay = await as("PUT", laterPath, { title: `${title} later`, priority: "Low", due_date: due.due });
    assert.deepEqual([keptDay.response.status, keptDay.body.updated], [200, 2], JSON.stringify(keptDay.body));
    assert.equal((await rows()).filter((task) => task.title === `${title} later` && task.release_day === due.tomorrow).length, 2);
    assert.equal((await as("PUT", laterPath, { title: `${title} later`, due_date: (await pool.query(`SELECT TO_CHAR(CURRENT_DATE, 'YYYY-MM-DD') AS d`)).rows[0].d })).response.status, 400);
    assert.ok(!(await mine()).some((task) => task.title === `${title} later`), "still hidden");
    const second = await as("POST", "/api/tasks/team", { group_id: teamId, title: `${title} out today`, due_date: due.due, available_from: due.tomorrow });
    const outNow = await as("PUT", `/api/tasks/team/${second.body.group_task_id}`, { title: `${title} out today`, due_date: due.due, available_from: "" });
    assert.equal(outNow.response.status, 200, JSON.stringify(outNow.body));
    assert.ok((await mine()).some((task) => task.title === `${title} out today`), "released today");
    const waitingToTell = await pool.query(`SELECT COUNT(*)::int AS n FROM tasks WHERE group_task_id = $1 AND available_from = CURRENT_DATE`, [second.body.group_task_id]);
    assert.equal(waitingToTell.rows[0].n, 2, "kept as a day, so the release loop announces it");
    await as("DELETE", `/api/tasks/team/${second.body.group_task_id}`);
    const dropped = await as("DELETE", `/api/tasks/team/${later.body.group_task_id}`);
    assert.deepEqual([dropped.body.cancelled, dropped.body.skipped], [2, 0]);
    assert.equal((await pool.query(`SELECT COUNT(*)::int AS n FROM notifications WHERE title = 'Task cancelled' AND message LIKE $1`, [`%${title} later%`])).rows[0].n, 0);

    // A member who is no longer this supervisor's intern gets no task.
    await pool.query(`UPDATE students SET is_active = FALSE WHERE student_id = $1`, [mate]);
    const fewer = await as("POST", "/api/tasks/team", { group_id: teamId, title: `${title} fewer`, due_date: due.due });
    assert.equal(fewer.body.created, 1);

    // Removing the team keeps the tasks it was given.
    const removed = await as("DELETE", `${teams}/${teamId}`);
    assert.equal(removed.response.status, 200, JSON.stringify(removed.body));
    const kept = await rows();
    assert.ok(kept.length >= 2 && kept.every((task) => task.team_name === null), "the tasks stay, without the team name");
    assert.equal((await as("DELETE", `${teams}/${teamId}`)).response.status, 404);
  } finally {
    await pool.query(`DELETE FROM notifications WHERE message LIKE $1`, [`%${title}%`]);
    await pool.query(`DELETE FROM tasks WHERE title LIKE $1`, [`${title}%`]);
    await pool.query(`DELETE FROM task_groups WHERE name LIKE $1`, [`${name}%`]);
    await pool.query(`DELETE FROM notifications WHERE student_id = ANY($1::text[])`, [[mate, outsider]]);
    await pool.query(`DELETE FROM students WHERE student_id = ANY($1::text[])`, [[mate, outsider]]);
    await pool.end();
  }
});

test("notes about a student are for their supervisor and the coordinators, and never the student", async (t) => {
  const supervisor = await supervisorSession();
  const sid = encodeURIComponent(student.student_id);
  const path = `/api/student-notes/${sid}`;
  // The student is refused, to read or to write.
  assert.equal((await jsonRequest(path, { headers: authHeaders(studentToken) })).response.status, 403);
  assert.equal((await jsonRequest(path, jsonBody(studentToken, "POST", { message: "Me." }))).response.status, 403);
  assert.equal((await jsonRequest(path)).response.status, 401);
  // Checked before anything is saved.
  for (const bad of [{}, { message: "   " }, { message: "x".repeat(2001) }, { message: 5 }]) {
    assert.equal((await jsonRequest(path, jsonBody(supervisor.token, "POST", bad))).response.status, 400, JSON.stringify(bad).slice(0, 40));
  }
  assert.equal((await jsonRequest("/api/student-notes/NO-SUCH-STUDENT", { headers: authHeaders(coordinatorToken) })).response.status, 404);
  assert.equal((await jsonRequest("/api/student-notes/NO-SUCH-STUDENT", jsonBody(supervisor.token, "POST", { message: "Hello." }))).response.status, 404);

  if (needsWrites(t)) return;
  const pool = localTestPool();
  const stamp = Date.now();
  const outsider = `P4-NOTE-${stamp}`;
  const first = `She has been late three times this week. ${stamp}`;
  const second = `I will call the company on Friday. ${stamp}`;
  try {
    // A student who is not this supervisor's: as if not there.
    await pool.query(`INSERT INTO students (student_id, email, password, name, is_active) VALUES ($1, $2, 'x', 'Not Theirs', TRUE)`, [outsider, `note${stamp}@p4.test`]);
    assert.equal((await jsonRequest(`/api/student-notes/${outsider}`, { headers: authHeaders(supervisor.token) })).response.status, 404);
    assert.equal((await jsonRequest(`/api/student-notes/${outsider}`, jsonBody(supervisor.token, "POST", { message: "Hello." }))).response.status, 404);
    assert.equal((await jsonRequest(`/api/student-notes/${outsider}`, { headers: authHeaders(coordinatorToken) })).response.status, 200, "a coordinator reads any student's");

    const wrote = await jsonRequest(path, jsonBody(supervisor.token, "POST", { message: `  ${first}  ` }));
    assert.equal(wrote.response.status, 201, JSON.stringify(wrote.body));
    assert.deepEqual([wrote.body.note.message, wrote.body.note.author_role, wrote.body.note.mine], [first, "supervisor", true]);
    // The coordinators are told, with a link to the thread.
    const toCoordinator = await pool.query(`SELECT link FROM notifications WHERE coordinator_id = $1 AND title = 'Note from a supervisor' AND message LIKE $2`, [coordinator.coordinator_id, `%${stamp}%`]);
    assert.deepEqual(toCoordinator.rows.map((row) => row.link), [`/coordinator/students/${sid}?tab=notes`]);

    const answered = await jsonRequest(path, jsonBody(coordinatorToken, "POST", { message: second }));
    assert.equal(answered.response.status, 201, JSON.stringify(answered.body));
    const toSupervisor = await pool.query(`SELECT link FROM notifications WHERE supervisor_id = $1 AND title = 'Note from the OJT coordinator' AND message LIKE $2`, [supervisor.supervisor.supervisor_id, `%${stamp}%`]);
    assert.deepEqual(toSupervisor.rows.map((row) => row.link), [`/supervisor/interns/${sid}?tab=notes`]);

    // Each reads the whole thread, in order, and knows which are their own.
    const thread = async (token) => (await jsonRequest(path, { headers: authHeaders(token) })).body.notes.filter((note) => note.message.includes(String(stamp)));
    assert.deepEqual((await thread(supervisor.token)).map((note) => [note.message, note.author_role, note.mine]), [[first, "supervisor", true], [second, "coordinator", false]]);
    assert.deepEqual((await thread(coordinatorToken)).map((note) => note.mine), [false, true]);
    assert.ok((await thread(coordinatorToken)).every((note) => note.author_name && !("author_id" in note)));

    // THE STUDENT: no notification, and not in the copy of their data.
    assert.equal((await pool.query(`SELECT COUNT(*)::int AS n FROM notifications WHERE student_id = $1 AND message LIKE $2`, [student.student_id, `%${stamp}%`])).rows[0].n, 0);
    const exported = await jsonRequest(`/api/students/${sid}/data-export`, { headers: authHeaders(studentToken) });
    assert.ok(!JSON.stringify(exported.body).includes(String(stamp)), "notes are not in the student's download");

    // Each note is in the audit log, without its words.
    const audit = await jsonRequest("/api/coordinator/audit?action=note.create&limit=20", { headers: authHeaders(coordinatorToken) });
    const entries = audit.body.entries.filter((entry) => [wrote.body.note.id, answered.body.note.id].includes(Number(entry.details?.note_id)));
    assert.equal(entries.length, 2);
    assert.ok(entries.every((entry) => entry.entity_type === "student" && String(entry.entity_id) === student.student_id));
    assert.ok(!JSON.stringify(entries).includes(String(stamp)));
  } finally {
    await pool.query(`DELETE FROM student_notes WHERE message LIKE $1`, [`%${stamp}%`]);
    await pool.query(`DELETE FROM notifications WHERE message LIKE $1`, [`%${stamp}%`]);
    await pool.query(`DELETE FROM students WHERE student_id = $1`, [outsider]);
    await pool.end();
  }
});

test("a coordinator reminds a supervisor with reviews waiting, once a day, and it is logged", async (t) => {
  const supervisor = await supervisorSession();
  const supervisorId = supervisor.supervisor.supervisor_id;
  const path = `/api/coordinator/supervisors/${encodeURIComponent(supervisorId)}/remind`;
  assert.equal((await jsonRequest(path, jsonBody(supervisor.token, "POST", {}))).response.status, 403);
  assert.equal((await jsonRequest(path, jsonBody(studentToken, "POST", {}))).response.status, 403);
  assert.equal((await jsonRequest("/api/coordinator/supervisors/NO-SUCH-SUPERVISOR/remind", jsonBody(coordinatorToken, "POST", {}))).response.status, 404);

  if (needsWrites(t)) return;
  const pool = localTestPool();
  const title = "Reminder from your OJT coordinator";
  const clear = async () => {
    await pool.query(`DELETE FROM absences WHERE student_id = $1 AND reason = 'Nudge test.'`, [student.student_id]);
    await pool.query(`DELETE FROM digest_log WHERE kind = 'coordinator_nudge' AND account_id = $1`, [supervisorId]);
    await pool.query(`DELETE FROM notifications WHERE supervisor_id = $1 AND title = $2`, [supervisorId, title]);
  };
  await clear();
  try {
    // Five days waiting: more than the three that make a supervisor "slow".
    await pool.query(`INSERT INTO absences (student_id, date, reason, status, created_at) VALUES ($1, '2001-03-04', 'Nudge test.', 'Pending', (NOW() AT TIME ZONE 'Asia/Manila') - INTERVAL '5 days')`, [student.student_id]);
    const person = async () => {
      const actions = await jsonRequest("/api/coordinator/actions", { headers: authHeaders(coordinatorToken) });
      const row = actions.body.groups.flatMap((group) => group.rows).find((item) => item.key === "slow_reviews");
      return row?.people?.find((item) => item.id === supervisorId);
    };
    // The action list names them, with what waits, and says nobody has reminded them today.
    const before = await person();
    assert.ok(before, "the slow supervisor is on the action list by id");
    assert.deepEqual([before.name, before.reminded_today], [supervisor.supervisor.name, false]);
    assert.match(before.detail, /waiting/);

    const sent = await jsonRequest(path, jsonBody(coordinatorToken, "POST", {}));
    assert.equal(sent.response.status, 200, JSON.stringify(sent.body));
    assert.ok(sent.body.items >= 1 && sent.body.oldest_days >= 5, JSON.stringify(sent.body));
    const notes = await pool.query(`SELECT message, link FROM notifications WHERE supervisor_id = $1 AND title = $2`, [supervisorId, title]);
    assert.equal(notes.rows.length, 1);
    assert.match(notes.rows[0].message, /absence/);
    assert.match(notes.rows[0].message, /oldest has waited \d+ days/);
    assert.equal(notes.rows[0].link, "/supervisor/dashboard");

    // ONCE A DAY, on the server: the second is refused and sends nothing.
    const again = await jsonRequest(path, jsonBody(coordinatorToken, "POST", {}));
    assert.equal(again.response.status, 409);
    assert.match(again.body.message, /already been reminded today/);
    assert.equal((await pool.query(`SELECT COUNT(*)::int AS n FROM notifications WHERE supervisor_id = $1 AND title = $2`, [supervisorId, title])).rows[0].n, 1);
    assert.equal((await person()).reminded_today, true);

    // Logged once: the refused one is not an action.
    const audit = await jsonRequest("/api/coordinator/audit?action=supervisor.remind&limit=50", { headers: authHeaders(coordinatorToken) });
    const mine = audit.body.entries.filter((entry) => String(entry.entity_id) === supervisorId && Number(entry.details?.items) === sent.body.items);
    assert.ok(mine.length >= 1 && mine[0].entity_type === "supervisor", JSON.stringify(audit.body.entries.slice(0, 2)));

    // Nothing waiting: nothing to remind about, and the day is not used up.
    await pool.query(`DELETE FROM digest_log WHERE kind = 'coordinator_nudge' AND account_id = $1`, [supervisorId]);
    const quiet = `P4-QUIET-${Date.now()}`;
    await pool.query(`INSERT INTO supervisors (supervisor_id, email, password, name, is_active) VALUES ($1, $2, 'x', 'Quiet Supervisor', TRUE)`, [quiet, `${quiet.toLowerCase()}@p4.test`]);
    try {
      const none = await jsonRequest(`/api/coordinator/supervisors/${quiet}/remind`, jsonBody(coordinatorToken, "POST", {}));
      assert.equal(none.response.status, 409);
      assert.match(none.body.message, /Nothing is waiting/);
      assert.equal((await pool.query(`SELECT COUNT(*)::int AS n FROM digest_log WHERE kind = 'coordinator_nudge' AND account_id = $1`, [quiet])).rows[0].n, 0);
    } finally {
      await pool.query(`DELETE FROM supervisors WHERE supervisor_id = $1`, [quiet]);
    }
  } finally {
    await clear();
    await pool.end();
  }
});

test("a supervisor gets all their interns' schedules in one answer, and the unread announcement without marking it read", async () => {
  const supervisor = await supervisorSession();
  for (const path of ["/api/supervisor/schedules", "/api/supervisor/site-visit", "/api/supervisor/announcement-unread"]) {
    assert.equal((await jsonRequest(path)).response.status, 401, path);
    assert.equal((await jsonRequest(path, { headers: authHeaders(studentToken) })).response.status, 403, path);
    assert.equal((await jsonRequest(path, { headers: authHeaders(coordinatorToken) })).response.status, 403, path);
  }
  const schedules = await jsonRequest("/api/supervisor/schedules", { headers: authHeaders(supervisor.token) });
  assert.equal(schedules.response.status, 200);
  const interns = await jsonRequest(`/api/supervisor/${encodeURIComponent(supervisor.supervisor.supervisor_id)}/interns`, { headers: authHeaders(supervisor.token) });
  const ids = new Set((interns.body.interns || []).map((intern) => intern.student_id));
  for (const row of schedules.body.schedules) {
    assert.ok(ids.has(row.student_id), "only their own interns");
    assert.match(row.day, /^(Mon|Tues|Wednes|Thurs|Fri|Satur|Sun)day$/);
    assert.match(String(row.start_time), /^\d{2}:\d{2}/);
    assert.equal(typeof row.hours, "number");
  }
  // The demo intern's own schedule, row for row.
  const own = await jsonRequest(`/api/ojt-schedule/${encodeURIComponent(student.student_id)}`, { headers: authHeaders(studentToken) });
  if (own.response.ok && Array.isArray(own.body.schedule)) {
    assert.equal(schedules.body.schedules.filter((row) => row.student_id === student.student_id).length, own.body.schedule.length);
  }

  // Asked twice, the unread announcement is still unread.
  const first = await jsonRequest("/api/supervisor/announcement-unread", { headers: authHeaders(supervisor.token) });
  const second = await jsonRequest("/api/supervisor/announcement-unread", { headers: authHeaders(supervisor.token) });
  assert.equal(first.response.status, 200);
  assert.equal(typeof first.body.unread, "number");
  assert.deepEqual(second.body, first.body);
  assert.ok(first.body.announcement === null || typeof first.body.announcement.title === "string");
});

test("a supervisor sees the latest visit to their company: its date and follow-up, not the findings", async (t) => {
  if (needsWrites(t)) return;
  const pool = localTestPool();
  const supervisor = await supervisorSession();
  const supervisorId = supervisor.supervisor.supervisor_id;
  const visit = async () => (await jsonRequest("/api/supervisor/site-visit", { headers: authHeaders(supervisor.token) })).body.visit;
  const company = (await pool.query(`SELECT company_id FROM supervisors WHERE supervisor_id = $1`, [supervisorId])).rows[0].company_id;
  if (!company) {
    assert.equal(await visit(), null, "no company record, no visit");
    await pool.end();
    t.skip("the demo supervisor has no company record");
    return;
  }
  const clear = () => pool.query(`DELETE FROM site_visits WHERE findings LIKE 'P4 visit test%'`);
  await clear();
  try {
    const add = (date, followUp) => pool.query(`INSERT INTO site_visits (company_id, visit_date, visited_by, visited_by_name, findings, follow_up) VALUES ($1, $2, $3, 'A Coordinator', 'P4 visit test: the coordinator saw an unsafe ladder.', $4)`, [company, date, coordinator.coordinator_id, followUp]);
    await add("2098-01-05", "Older follow-up.");
    await add("2098-02-10", "Send the signed evaluation forms by Friday.");
    const latest = await visit();
    assert.deepEqual([latest.visit_date, latest.follow_up], ["2098-02-10", "Send the signed evaluation forms by Friday."]);
    assert.equal(typeof latest.company, "string");
    assert.deepEqual(Object.keys(latest).sort(), ["company", "follow_up", "visit_date"], "nothing else is sent");
    assert.ok(!JSON.stringify(latest).includes("ladder"), "what the coordinator found stays with the coordinator");
  } finally {
    await clear();
    await pool.end();
  }
});

test("the audit rules cover a note and a reminder, and keep neither's words", () => {
  require("tsx/cjs");
  const { auditEntryFor } = require("../src/services/audit.ts");
  const note = auditEntryFor("POST", "/api/student-notes/:studentId", { params: { studentId: "S1" }, body: { message: "Private words." }, result: { note: { id: 9, message: "Private words." } } });
  assert.deepEqual(note, { action: "note.create", entityType: "student", entityId: "S1", details: { note_id: 9 } });
  const nudge = auditEntryFor("POST", "/api/coordinator/supervisors/:supervisorId/remind", { params: { supervisorId: "SUP1" }, body: {}, result: { items: 4, oldest_days: 6, message: "x" } });
  assert.deepEqual(nudge, { action: "supervisor.remind", entityType: "supervisor", entityId: "SUP1", details: { items: 4, oldest_days: 6 } });
  // Reading the thread is not an action.
  assert.equal(auditEntryFor("GET", "/api/student-notes/:studentId", { params: { studentId: "S1" }, body: {}, result: {} }), null);
});

test("where an intern stands today, and who was late, are worked out from the lists the supervisor holds", () => {
  require("tsx/cjs");
  const { todayState, lateDays, daysWaiting, minutesText, clockMinutes, WAITING_TOO_LONG_DAYS } = require("../../my-pwa/src/lib/supervisorDay.ts");
  const shift = { start_time: "08:00:00" };
  const at = (clock) => clockMinutes(clock);
  const day = (over) => todayState({ shift, holiday: false, log: null, absence: false, nowMinutes: at("09:00"), ...over });

  // What happened comes first: a log decides it, whatever the schedule says.
  assert.equal(day({ log: { time_out: null } }), "on");
  assert.equal(day({ log: { time_out: "2026-10-12T17:00:00+08:00" } }), "done");
  assert.equal(day({ log: { time_out: null }, shift: null }), "on", "timed in on a day off");
  assert.equal(day({ log: { time_out: null }, absence: true }), "on", "a day that was worked is not an absence");
  // Then an absence filed for the day.
  assert.equal(day({ absence: true }), "absent");
  // Then the schedule. Fifteen minutes after the start is still on time; sixteen is not.
  assert.equal(day({ nowMinutes: at("07:30") }), "expected");
  assert.equal(day({ nowMinutes: at("08:15") }), "expected");
  assert.equal(day({ nowMinutes: at("08:16") }), "missing");
  assert.equal(day({ shift: null }), "off");
  assert.equal(day({ holiday: true }), "off", "nobody is late on a holiday");
  assert.equal(day({ shift: { start_time: null } }), "expected", "a shift with no start cannot be late");

  // Late days: against that weekday's shift, in the given time zone, newest first.
  const shifts = [{ day: "Monday", start_time: "08:00:00" }, { day: "Tuesday", start_time: "13:00:00" }];
  const late = lateDays(
    [
      { date: "2026-10-05", time_in: "2026-10-05T08:15:00+08:00" },
      { date: "2026-10-12", time_in: "2026-10-12T08:16:00+08:00" },
      { date: "2026-10-13", time_in: "2026-10-13T14:05:00+08:00" },
      { date: "2026-10-14", time_in: "2026-10-14T11:00:00+08:00" },
      { date: "2026-10-19", time_in: null },
    ],
    shifts,
    "Asia/Manila"
  );
  assert.deepEqual(late, [{ date: "2026-10-13", minutes: 65 }, { date: "2026-10-12", minutes: 16 }]);
  assert.deepEqual(lateDays([{ date: "2026-10-12", time_in: "2026-10-12T09:00:00+08:00" }], [], "Asia/Manila"), [], "no schedule, nobody late");

  // Days waited are whole days; the amber mark starts at three.
  const now = new Date("2026-10-12T10:00:00+08:00");
  assert.equal(daysWaiting("2026-10-12T08:00:00+08:00", now), 0);
  assert.equal(daysWaiting("2026-10-09T10:00:00+08:00", now), 3);
  assert.equal(daysWaiting("2026-10-08T09:00:00+08:00", now), 4);
  assert.equal(daysWaiting("not a date", now), 0);
  assert.equal(daysWaiting("2026-10-13T10:00:00+08:00", now), 0, "never negative");
  assert.equal(WAITING_TOO_LONG_DAYS, 3);
  assert.deepEqual([16, 60, 65, 125].map(minutesText), ["16 min", "1 h", "1 h 5 min", "2 h 5 min"]);
});

/*
|--------------------------------------------------------------------------
| Round 2, Phase 5: the programme
|--------------------------------------------------------------------------
*/

test("a student's status word comes from fixed rules, and the sentence only reads out the figures", () => {
  require("tsx/cjs");
  const { performanceStatus, performanceSentence, attendanceFigures, shortDay, PERFORMANCE_RULES, withStatus } = require("../src/services/performance.ts");
  const figures = (over = {}) => ({
    attendance: { scheduled_days: 25, attended_days: 24, rate: 96 },
    late_time_ins: 0,
    logs_rejected: 0,
    logs_corrected: 0,
    tasks: { assigned: 6, on_time: 4, late: 0, average_rating: 4.5 },
    weekly_reports: { submitted: 5, weeks_worked: 5 },
    requirements: { approved: 6, required: 6 },
    supervisor_rating: null,
    final_evaluation: null,
    concerns: 0,
    ...over,
  });
  const hours = (over = {}) => ({ required_hours: 600, verified_hours: 412, remaining_hours: 188, projected_finish: "2027-01-14", at_risk: false, ...over });
  const today = "2026-10-12";

  // The rules, in order: the first that fits.
  assert.deepEqual(PERFORMANCE_RULES.map((rule) => rule.status), ["Completed", "At risk", "Behind", "On track"]);
  assert.equal(performanceStatus(hours(), figures()), "On track");
  assert.equal(performanceStatus(hours({ verified_hours: 600, remaining_hours: 0, projected_finish: null }), figures({ tasks: { assigned: 6, on_time: 0, late: 5, average_rating: null } })), "Completed");
  assert.equal(performanceStatus(hours({ required_hours: 0, verified_hours: 0, remaining_hours: 0 }), figures()), "On track", "no hours required is not completed");
  assert.equal(performanceStatus(hours({ at_risk: true }), figures()), "At risk");
  assert.equal(performanceStatus(hours({ at_risk: true }), figures({ attendance: { scheduled_days: 25, attended_days: 5, rate: 20 } })), "At risk", "at risk comes before behind");
  // Behind: attendance under 80% once five scheduled days have passed, or two late tasks.
  assert.equal(performanceStatus(hours(), figures({ attendance: { scheduled_days: 10, attended_days: 7, rate: 70 } })), "Behind");
  assert.equal(performanceStatus(hours(), figures({ attendance: { scheduled_days: 10, attended_days: 8, rate: 80 } })), "On track", "80% is not under 80%");
  assert.equal(performanceStatus(hours(), figures({ attendance: { scheduled_days: 4, attended_days: 0, rate: 0 } })), "On track", "four days is too few to say");
  assert.equal(performanceStatus(hours(), figures({ attendance: { scheduled_days: 0, attended_days: 0, rate: null } })), "On track");
  assert.equal(performanceStatus(hours(), figures({ tasks: { assigned: 6, on_time: 4, late: 1, average_rating: null } })), "On track");
  assert.equal(performanceStatus(hours(), figures({ tasks: { assigned: 6, on_time: 4, late: 2, average_rating: null } })), "Behind");

  // The sentence in the brief, from those numbers.
  assert.equal(
    performanceSentence("On track", hours(), figures({ tasks: { assigned: 6, on_time: 4, late: 2, average_rating: null }, final_evaluation: { average: 4.4, scale: 5 } }), today),
    "On track: 412 of 600 hours, finishes 14 Jan 2027. Attendance 96%. 2 tasks late. Final evaluation 4.4 of 5."
  );
  assert.equal(shortDay("2026-11-03", today), "3 Nov", "this year needs no year");
  // Nothing to say, nothing said.
  assert.equal(performanceSentence("On track", hours({ projected_finish: "2026-12-01" }), figures({ attendance: { scheduled_days: 0, attended_days: 0, rate: null } }), today), "On track: 412 of 600 hours, finishes 1 Dec.");
  // Everything there is to say, once each, singular where it is one.
  const full = withStatus(hours({ at_risk: true, projected_finish: null }), figures({
    late_time_ins: 1, tasks: { assigned: 3, on_time: 1, late: 1, average_rating: 3 }, requirements: { approved: 4, required: 6 }, supervisor_rating: 4.25, concerns: 1,
  }), today);
  assert.equal(full.status, "At risk");
  assert.equal(full.summary, "At risk: 412 of 600 hours, no finish date (no working days scheduled). Attendance 96%. 1 late time-in. 1 task late. Requirements 4 of 6. Supervisor rating 4.3 of 5. 1 concern filed.");
  assert.equal(withStatus(hours({ verified_hours: 600, remaining_hours: 0, projected_finish: null }), figures(), today).summary, "Completed: 600 of 600 hours. Attendance 96%.");
  // No single score anywhere in what is sent.
  assert.ok(!Object.keys(full).some((key) => /score|grade|rank/i.test(key)));

  // Attendance on scheduled days: from the first day to yesterday, holidays out, today out.
  const shifts = { Monday: { hours: 8, start: "08:00" }, Tuesday: { hours: 8, start: "08:00" }, Wednesday: { hours: 8, start: "13:00" }, Saturday: { hours: 0, start: null } };
  const counted = attendanceFigures({
    today: "2026-10-14", // a Wednesday
    since: "2026-10-05", // a Monday
    shifts,
    holidays: new Set(["2026-10-06"]),
    logs: [
      { date: "2026-10-05", time_in: "08:15" }, // on time: exactly fifteen minutes
      { date: "2026-10-07", time_in: "13:16" }, // late by sixteen
      { date: "2026-10-10", time_in: "09:00" }, // a Saturday, not scheduled: not late, not counted
      { date: "2026-10-12", time_in: "10:30" }, // late
      { date: "2026-10-14", time_in: "13:00" }, // today: not counted as a scheduled day yet
    ],
  });
  // Scheduled: Mon 5, Wed 7, Mon 12, Tue 13 (Tue 6 is a holiday). Attended three of them.
  assert.deepEqual(counted, { attendance: { scheduled_days: 4, attended_days: 3, rate: 75 }, late_time_ins: 2 });
  assert.deepEqual(attendanceFigures({ today: "2026-10-14", since: null, shifts, holidays: new Set(), logs: [] }).attendance, { scheduled_days: 0, attended_days: 0, rate: null });
});

test("the performance table is the coordinator's, takes the filters, and its hours equal Monitoring's for a seeded block", async (t) => {
  const supervisor = await supervisorSession();
  const path = "/api/coordinator/performance";
  assert.equal((await jsonRequest(path)).response.status, 401);
  assert.equal((await jsonRequest(path, { headers: authHeaders(studentToken) })).response.status, 403);
  assert.equal((await jsonRequest(path, { headers: authHeaders(supervisor.token) })).response.status, 403);
  assert.equal((await jsonRequest(`${path}?block=abc`, { headers: authHeaders(coordinatorToken) })).response.status, 400);
  const one = `/api/coordinator/students/${encodeURIComponent(student.student_id)}/performance`;
  assert.equal((await jsonRequest(one, { headers: authHeaders(studentToken) })).response.status, 403);
  assert.equal((await jsonRequest(one, { headers: authHeaders(supervisor.token) })).response.status, 403);

  const get = async (query = "") => (await jsonRequest(`${path}${query}`, { headers: authHeaders(coordinatorToken) })).body;
  const all = await get();
  // The rules come with the figures, and every student has a word from them and a sentence that starts with it.
  assert.deepEqual(all.rules.map((rule) => rule.status), ["Completed", "At risk", "Behind", "On track"]);
  assert.equal(all.thresholds.late_after_minutes, 15);
  for (const row of all.students) {
    assert.ok(all.rules.some((rule) => rule.status === row.performance.status), row.student_id);
    assert.ok(row.performance.summary.startsWith(`${row.performance.status}: `), row.performance.summary);
    assert.equal(row.performance.status === "At risk", row.at_risk && !(row.required_hours > 0 && row.remaining_hours === 0), `${row.student_id}: at risk is Monitoring's rule`);
  }
  // The same students and hours as Monitoring, unfiltered.
  const monitoring = (await jsonRequest("/api/coordinator/monitoring", { headers: authHeaders(coordinatorToken) })).body.students;
  assert.deepEqual(all.students.map((row) => row.student_id).sort(), monitoring.map((row) => row.student_id).sort());
  // The student record's own answer is the same row.
  const own = (await jsonRequest(one, { headers: authHeaders(coordinatorToken) })).body;
  const inTable = all.students.find((row) => row.student_id === student.student_id);
  assert.deepEqual(own.student.performance, inTable.performance);
  assert.equal(own.student.verified_hours, inTable.verified_hours);
  assert.equal((await jsonRequest("/api/coordinator/students/NO-SUCH-STUDENT/performance", { headers: authHeaders(coordinatorToken) })).body.student, null);
  // The plain report is as it was: no performance unless asked for.
  const plain = (await jsonRequest("/api/coordinator/report", { headers: authHeaders(coordinatorToken) })).body;
  assert.ok(plain.students.every((row) => !("performance" in row)));

  if (needsWrites(t)) return;
  const pool = localTestPool();
  const stamp = Date.now();
  const ids = [`P5-A-${stamp}`, `P5-B-${stamp}`];
  let blockId;
  try {
    const program = (await pool.query(`SELECT id FROM programs WHERE short_code = 'BSIT'`)).rows[0].id;
    blockId = (await pool.query(`INSERT INTO blocks (program_id, year_level, section) VALUES ($1, 4, $2) RETURNING id`, [program, `P${String(stamp).slice(-6)}`])).rows[0].id;
    for (const [index, id] of ids.entries()) {
      await pool.query(
        `INSERT INTO students (student_id, email, password, name, program, required_hours, supervisor_id, is_active, program_id, block_id)
         VALUES ($1, $2, 'x', $3, 'BS Information Technology', 100, $4, TRUE, $5, $6)`,
        [id, `${id.toLowerCase()}@p5.test`, `Seeded ${index === 0 ? "One" : "Two"}`, supervisor.supervisor.supervisor_id, program, blockId]
      );
      // Every day of the week, so the test reads the same whatever day it is run on.
      for (const day of ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]) {
        await pool.query(`INSERT INTO ojt_schedule (student_id, day, start_time, end_time, hours, is_active) VALUES ($1, $2, '08:00', '17:00', 8, TRUE)`, [id, day]);
      }
    }
    const [first, second] = ids;
    // One: 20 verified hours over three days (one late, one with corrected times), 5 pending hours that do not count, one rejected log.
    await pool.query(
      `INSERT INTO attendance (student_id, date, time_in, time_out, hours, status, time_corrected_at) VALUES
        ($1, CURRENT_DATE - 9, (CURRENT_DATE - 9) + TIME '08:00', (CURRENT_DATE - 9) + TIME '17:00', 8, 'Verified', NULL),
        ($1, CURRENT_DATE - 8, (CURRENT_DATE - 8) + TIME '09:30', (CURRENT_DATE - 8) + TIME '17:00', 6.5, 'Verified', NOW()),
        ($1, CURRENT_DATE - 7, (CURRENT_DATE - 7) + TIME '08:05', (CURRENT_DATE - 7) + TIME '14:00', 5.5, 'Verified', NULL),
        ($1, CURRENT_DATE - 6, (CURRENT_DATE - 6) + TIME '08:00', (CURRENT_DATE - 6) + TIME '13:00', 5, 'Pending', NULL),
        ($1, CURRENT_DATE - 5, (CURRENT_DATE - 5) + TIME '08:00', (CURRENT_DATE - 5) + TIME '12:00', 4, 'Rejected', NULL)`,
      [first]
    );
    // Tasks: one on time and rated, one handed in late, one overdue, one for a later day that counts for nothing.
    await pool.query(
      `INSERT INTO tasks (student_id, title, status, due_date, submitted_at, review_rating, available_from) VALUES
        ($1, 'P5 on time', 'Reviewed', CURRENT_DATE - 3, (CURRENT_DATE - 4) + TIME '10:00', 4, NULL),
        ($1, 'P5 handed in late', 'Submitted', CURRENT_DATE - 5, (CURRENT_DATE - 2) + TIME '10:00', NULL, NULL),
        ($1, 'P5 overdue', 'Pending', CURRENT_DATE - 1, NULL, NULL, NULL),
        ($1, 'P5 not yet released', 'Pending', CURRENT_DATE + 9, NULL, NULL, CURRENT_DATE + 3)`,
      [first]
    );
    await pool.query(`INSERT INTO journals (student_id, week_start, activities, learnings) VALUES ($1, DATE_TRUNC('week', CURRENT_DATE - 9)::date, 'P5 did.', 'P5 learned.')`, [first]);
    await pool.query(`INSERT INTO evaluations (student_id, evaluator_type, evaluator_id, category, rating) VALUES ($1, 'supervisor', $2, 'Overall Performance', 4), ($1, 'supervisor', $2, 'Punctuality', 3)`, [first, supervisor.supervisor.supervisor_id]);
    await pool.query(`INSERT INTO complaints (student_id, report_type, category, description, reported_student_id, filed_by_supervisor_id) VALUES (NULL, 'supervisor', 'Conduct', 'P5 concern.', $1, $2)`, [first, supervisor.supervisor.supervisor_id]);
    // Two: all the hours.
    await pool.query(`INSERT INTO attendance (student_id, date, time_in, time_out, hours, status) VALUES ($1, CURRENT_DATE - 9, (CURRENT_DATE - 9) + TIME '08:00', (CURRENT_DATE - 9) + TIME '17:00', 100, 'Verified')`, [second]);

    const block = await get(`?block=${blockId}`);
    assert.deepEqual(block.students.map((row) => row.student_id).sort(), [...ids].sort(), "the block filter narrows the table to the block");
    // THE HOURS EQUAL MONITORING'S, student by student and in sum.
    const shown = (await jsonRequest(`/api/coordinator/monitoring?block=${blockId}`, { headers: authHeaders(coordinatorToken) })).body.students;
    assert.equal(shown.length, 2);
    for (const row of block.students) {
      const there = shown.find((item) => item.student_id === row.student_id);
      assert.ok(Math.abs(row.verified_hours - Number(there.hours_rendered)) < 0.01, `${row.student_id}: ${row.verified_hours} vs ${there.hours_rendered}`);
    }
    const sum = (rows, key) => rows.reduce((total, row) => total + Number(row[key]), 0);
    assert.ok(Math.abs(sum(block.students, "verified_hours") - sum(shown, "hours_rendered")) < 0.01);
    assert.ok(Math.abs(sum(block.students, "verified_hours") - 120) < 0.01, "20 verified for one, 100 for the other; pending and rejected hours are not counted");

    const a = block.students.find((row) => row.student_id === first).performance;
    assert.deepEqual([a.late_time_ins, a.logs_rejected, a.logs_corrected], [1, 1, 1]);
    assert.deepEqual(a.tasks, { assigned: 3, on_time: 1, late: 2, average_rating: 4 });
    assert.deepEqual(a.weekly_reports.submitted, 1);
    assert.ok(a.weekly_reports.weeks_worked >= 1 && a.weekly_reports.weeks_worked <= 2);
    assert.equal(a.requirements.approved, 0);
    assert.ok(a.requirements.required >= 1);
    assert.equal(a.supervisor_rating, 3.5);
    assert.equal(a.final_evaluation, null);
    assert.equal(a.concerns, 1);
    assert.ok(a.attendance.scheduled_days >= 5 && a.attendance.attended_days <= a.attendance.scheduled_days);
    assert.equal(a.attendance.rate, Math.round((a.attendance.attended_days / a.attendance.scheduled_days) * 100));
    assert.match(a.summary, /^(Behind|At risk): 20 of 100 hours/);
    assert.match(a.summary, /2 tasks late\./);
    assert.match(a.summary, /Supervisor rating 3\.5 of 5\./);
    assert.match(a.summary, /1 concern filed\.$/);
    const b = block.students.find((row) => row.student_id === second).performance;
    assert.equal(b.status, "Completed");
    assert.match(b.summary, /^Completed: 100 of 100 hours\./);
  } finally {
    await pool.query(`DELETE FROM complaints WHERE reported_student_id = ANY($1::text[])`, [ids]);
    for (const table of ["evaluations", "journals", "tasks", "attendance", "ojt_schedule", "notifications", "students"]) {
      await pool.query(`DELETE FROM ${table} WHERE student_id = ANY($1::text[])`, [ids]);
    }
    if (blockId) await pool.query(`DELETE FROM blocks WHERE id = $1`, [blockId]);
    await pool.end();
  }
});

test("a key figure's target can be replaced, within what its unit allows, and nothing else about it changes", () => {
  require("tsx/cjs");
  const { KPI_DEFINITIONS, readTarget } = require("../src/services/kpiDefinitions.ts");
  const { computeKpis } = require("../src/services/kpis.ts");
  const of = (key) => KPI_DEFINITIONS.find((item) => item.key === key);
  // Percent: whole, 0 to 100. Days: one decimal, 0 to 60. Count: whole, 0 to 1000.
  assert.deepEqual(readTarget(of("on_track"), 85), { target: 85 });
  for (const bad of [-1, 101, 85.5, "85", null, NaN, Infinity]) assert.ok("problem" in readTarget(of("on_track"), bad), String(bad));
  assert.deepEqual(readTarget(of("review_time"), 1.5), { target: 1.5 });
  for (const bad of [1.55, 61, -0.1]) assert.ok("problem" in readTarget(of("review_time"), bad), String(bad));
  assert.deepEqual(readTarget(of("old_concerns"), 3), { target: 3 });
  for (const bad of [2.5, 1001]) assert.ok("problem" in readTarget(of("old_concerns"), bad), String(bad));

  const inputs = { students: [], holidays: new Set(), decisions: [], requirements: [], concerns: [{ created_on: "2026-09-01", closed_on: null }, { created_on: "2026-09-02", closed_on: null }], expiries: [] };
  const plain = computeKpis("2026-10-12", inputs).find((kpi) => kpi.key === "old_concerns");
  assert.deepEqual([plain.value, plain.target, plain.default_target, plain.met], [2, 0, 0, false]);
  const moved = computeKpis("2026-10-12", inputs, { old_concerns: 2 }).find((kpi) => kpi.key === "old_concerns");
  assert.deepEqual([moved.value, moved.target, moved.default_target, moved.met], [2, 2, 0, true], "the same count, judged against the new target");
  assert.equal(moved.label, plain.label);
  assert.deepEqual(moved.series, plain.series);
  // The other five are untouched.
  assert.ok(computeKpis("2026-10-12", inputs, { old_concerns: 2 }).filter((kpi) => kpi.key !== "old_concerns").every((kpi) => kpi.target === kpi.default_target));
});

test("the coordinator changes the key figures' targets, the defaults come back with null, and a change is logged", async (t) => {
  const supervisor = await supervisorSession();
  const path = "/api/coordinator/kpi-targets";
  assert.equal((await jsonRequest(path, jsonBody(studentToken, "PUT", { targets: { on_track: 80 } }))).response.status, 403);
  assert.equal((await jsonRequest(path, jsonBody(supervisor.token, "PUT", { targets: { on_track: 80 } }))).response.status, 403);
  const put = (targets) => jsonRequest(path, jsonBody(coordinatorToken, "PUT", { targets }));
  for (const bad of [undefined, [], {}, { nonsense: 5 }, { on_track: 101 }, { on_track: "80" }, { review_time: 1.25 }, { old_concerns: -1 }]) {
    assert.equal((await put(bad)).response.status, 400, JSON.stringify(bad));
  }
  if (needsWrites(t)) return;
  const pool = localTestPool();
  const kpi = async (key) => (await jsonRequest("/api/coordinator/kpis", { headers: authHeaders(coordinatorToken) })).body.kpis.find((item) => item.key === key);
  await pool.query(`DELETE FROM kpi_targets`);
  try {
    const before = await kpi("on_track");
    assert.deepEqual([before.target, before.default_target], [90, 90]);
    const saved = await put({ on_track: 75, review_time: 3.5 });
    assert.equal(saved.response.status, 200, JSON.stringify(saved.body));
    assert.deepEqual([saved.body.targets.on_track, saved.body.targets.review_time, saved.body.targets.attendance_rate], [75, 3.5, 95]);
    assert.equal(saved.body.changed, "on_track: 90 to 75; review_time: 2 to 3.5");
    const after = await kpi("on_track");
    assert.deepEqual([after.target, after.default_target, after.value], [75, 90, before.value], "the value is the same; only what it is judged against moved");
    assert.equal(after.met, after.value === null ? null : after.value >= 75);
    assert.equal((await pool.query(`SELECT updated_by FROM kpi_targets WHERE key = 'on_track'`)).rows[0].updated_by, coordinator.coordinator_id);

    // Saved again unchanged: nothing moved, nothing logged.
    const same = await put({ on_track: 75 });
    assert.deepEqual([same.response.status, same.body.changed_count], [200, 0]);
    // null, or the default itself, puts the default back and keeps no row.
    const reset = await put({ on_track: null, review_time: 2 });
    assert.deepEqual([reset.body.targets.on_track, reset.body.targets.review_time], [90, 2]);
    assert.equal((await pool.query(`SELECT COUNT(*)::int AS n FROM kpi_targets`)).rows[0].n, 0);
    assert.equal((await kpi("on_track")).target, 90);

    await new Promise((resolve) => setTimeout(resolve, 300));
    const audit = await jsonRequest("/api/coordinator/audit?action=kpi.targets&limit=5", { headers: authHeaders(coordinatorToken) });
    const changes = audit.body.entries.map((entry) => entry.details?.changed);
    assert.ok(changes.includes("on_track: 90 to 75; review_time: 2 to 3.5"), JSON.stringify(changes));
    assert.ok(changes.includes("on_track: 75 to 90; review_time: 3.5 to 2"), JSON.stringify(changes));
    assert.equal(changes.filter((item) => item === "").length, 0, "the unchanged save is not in the log");
  } finally {
    await pool.query(`DELETE FROM kpi_targets`);
    await pool.end();
  }
});

test("saved views of the filter bar are each coordinator's own, named once, and hold only the bar's choices", async (t) => {
  const supervisor = await supervisorSession();
  const path = "/api/coordinator/filter-views";
  assert.equal((await jsonRequest(path, { headers: authHeaders(studentToken) })).response.status, 403);
  assert.equal((await jsonRequest(path, { headers: authHeaders(supervisor.token) })).response.status, 403);
  const save = (body) => jsonRequest(path, jsonBody(coordinatorToken, "POST", body));
  for (const bad of [
    { name: "", filters: { term: "1" } },
    { name: "x".repeat(61), filters: { term: "1" } },
    { name: "Nothing chosen", filters: {} },
    { name: "Nothing chosen" },
    { name: "Not an id", filters: { block: "abc" } },
    { name: "Only strangers", filters: { risk: "1", q: "ana" } },
  ]) {
    assert.equal((await save(bad)).response.status, 400, JSON.stringify(bad).slice(0, 60));
  }
  assert.equal((await jsonRequest(`${path}/999999999`, jsonBody(coordinatorToken, "DELETE", {}))).response.status, 404);
  assert.equal((await jsonRequest(`${path}/abc`, jsonBody(coordinatorToken, "DELETE", {}))).response.status, 404);

  if (needsWrites(t)) return;
  const pool = localTestPool();
  const stamp = Date.now();
  const other = `P5-COORD-${stamp}`;
  try {
    const made = await save({ name: `  BSIT 4A ${stamp} `, filters: { program: "9", block: "none", supervisor: "", risk: "1", extra: { a: 1 } } });
    assert.equal(made.response.status, 201, JSON.stringify(made.body));
    assert.deepEqual([made.body.view.name, made.body.view.filters], [`BSIT 4A ${stamp}`, { program: "9", block: "none" }], "only the bar's own choices, as text");
    assert.equal((await save({ name: `bsit 4a ${stamp}`, filters: { term: "none" } })).response.status, 409, "the same name, whatever the capitals");
    const mine = (await jsonRequest(path, { headers: authHeaders(coordinatorToken) })).body.views;
    assert.ok(mine.some((view) => view.id === made.body.view.id));

    // Another coordinator's views are not listed, and cannot be removed.
    await pool.query(`INSERT INTO coordinators (coordinator_id, email, password, name, is_active) VALUES ($1, $2, 'x', 'Another Coordinator', TRUE)`, [other, `${other.toLowerCase()}@p5.test`]);
    const theirs = (await pool.query(`INSERT INTO filter_views (coordinator_id, name, filters) VALUES ($1, $2, '{"term":"none"}') RETURNING id`, [other, `Theirs ${stamp}`])).rows[0].id;
    assert.ok(!(await jsonRequest(path, { headers: authHeaders(coordinatorToken) })).body.views.some((view) => view.id === theirs));
    assert.equal((await jsonRequest(`${path}/${theirs}`, jsonBody(coordinatorToken, "DELETE", {}))).response.status, 404);
    assert.equal((await pool.query(`SELECT COUNT(*)::int AS n FROM filter_views WHERE id = $1`, [theirs])).rows[0].n, 1);

    const gone = await jsonRequest(`${path}/${made.body.view.id}`, jsonBody(coordinatorToken, "DELETE", {}));
    assert.equal(gone.response.status, 200);
    assert.ok(!(await jsonRequest(path, { headers: authHeaders(coordinatorToken) })).body.views.some((view) => view.id === made.body.view.id));
  } finally {
    await pool.query(`DELETE FROM filter_views WHERE name LIKE $1`, [`%${stamp}%`]);
    await pool.query(`DELETE FROM coordinators WHERE coordinator_id = $1`, [other]);
    await pool.end();
  }
});

test("a term's setup checklist is seven lines, each counted, none done by saying so", async (t) => {
  require("tsx/cjs");
  const { setupLines } = require("../src/services/termSetup.ts");
  const counts = (over = {}) => ({ students: 12, without_company: 0, without_supervisor: 0, without_block: 0, without_schedule: 0, companies: 3, supervisors: 4, requirements: 6, form_is_sample: false, welcome_title: "Welcome to OJT", ...over });
  const keys = ["companies", "supervisors", "students", "schedules", "requirements", "evaluation_form", "welcome"];
  assert.deepEqual(setupLines(7, counts()).map((line) => line.key), keys);
  assert.ok(setupLines(7, counts()).every((line) => line.done && line.link.startsWith("/coordinator/") && line.detail));
  const line = (over, key) => setupLines(7, counts(over)).find((item) => item.key === key);
  // A term with nobody in it has nothing done about its students, however many companies exist.
  for (const key of ["companies", "supervisors", "students", "schedules"]) {
    assert.deepEqual([line({ students: 0 }, key).done, line({ students: 0 }, key).detail], [false, "No students are in this term yet."], key);
  }
  assert.deepEqual([line({ without_block: 1 }, "students").done, line({ without_block: 1 }, "students").detail], [false, "1 student of 12 is not in a block."]);
  assert.equal(line({ without_schedule: 5 }, "schedules").detail, "5 students of 12 have no weekly schedule.");
  assert.equal(line({ companies: 0 }, "companies").done, false);
  assert.equal(line({ without_supervisor: 2 }, "supervisors").done, false);
  assert.equal(line({ requirements: 0 }, "requirements").done, false);
  assert.equal(line({ form_is_sample: true }, "evaluation_form").done, false);
  assert.equal(line({ form_is_sample: null }, "evaluation_form").done, false);
  assert.equal(line({ welcome_title: null }, "welcome").done, false);
  assert.equal(line({}, "students").link, "/coordinator/students?term=7");

  const supervisor = await supervisorSession();
  assert.equal((await jsonRequest("/api/coordinator/terms/1/setup", { headers: authHeaders(studentToken) })).response.status, 403);
  assert.equal((await jsonRequest("/api/coordinator/terms/1/setup", { headers: authHeaders(supervisor.token) })).response.status, 403);
  assert.equal((await jsonRequest("/api/coordinator/terms/999999999/setup", { headers: authHeaders(coordinatorToken) })).response.status, 404);
  assert.equal((await jsonRequest("/api/coordinator/terms/abc/setup", { headers: authHeaders(coordinatorToken) })).response.status, 404);

  if (needsWrites(t)) return;
  const pool = localTestPool();
  const stamp = Date.now();
  const sid = `P5-SETUP-${stamp}`;
  let termId;
  try {
    termId = (await pool.query(`INSERT INTO terms (name, start_date, end_date) VALUES ($1, '2099-06-01', '2099-10-30') RETURNING id`, [`Setup test ${stamp}`])).rows[0].id;
    const get = async () => (await jsonRequest(`/api/coordinator/terms/${termId}/setup`, { headers: authHeaders(coordinatorToken) })).body;
    const empty = await get();
    assert.deepEqual(empty.lines.map((item) => item.key), keys);
    assert.equal(empty.term.name, `Setup test ${stamp}`);
    assert.equal(empty.lines.find((item) => item.key === "students").done, false);
    assert.equal(empty.lines.find((item) => item.key === "welcome").done, false, "nothing has been announced near a term that starts in 2099");
    assert.equal(empty.done, empty.lines.filter((item) => item.done).length);

    // A student with no block and no schedule; then a schedule; the line follows the record.
    await pool.query(`INSERT INTO students (student_id, email, password, name, is_active, term_id, supervisor_id) VALUES ($1, $2, 'x', 'Setup Student', TRUE, $3, $4)`, [sid, `${sid.toLowerCase()}@p5.test`, termId, supervisor.supervisor.supervisor_id]);
    await pool.query(`UPDATE students SET term_id = $2 WHERE student_id = $1`, [sid, termId]);
    const one = await get();
    assert.equal(one.lines.find((item) => item.key === "students").detail, "1 student of 1 is not in a block.");
    assert.equal(one.lines.find((item) => item.key === "schedules").done, false);
    assert.equal(one.lines.find((item) => item.key === "supervisors").done, true);
    await pool.query(`INSERT INTO ojt_schedule (student_id, day, start_time, end_time, hours, is_active) VALUES ($1, 'Monday', '08:00', '17:00', 8, TRUE)`, [sid]);
    assert.equal((await get()).lines.find((item) => item.key === "schedules").done, true);
  } finally {
    await pool.query(`DELETE FROM ojt_schedule WHERE student_id = $1`, [sid]);
    await pool.query(`DELETE FROM students WHERE student_id = $1`, [sid]);
    if (termId) await pool.query(`DELETE FROM terms WHERE id = $1`, [termId]);
    await pool.end();
  }
});

test("one schedule is set for a block: a preview first, then those with a different one overwritten or skipped, and logged", async (t) => {
  require("tsx/cjs");
  const { readSchedule, compareSchedule, scheduleKey } = require("../src/services/schedules.ts");
  const week = [{ day: "Monday", start_time: "08:00", end_time: "17:00" }, { day: "Wednesday", start_time: "08:00:00", end_time: "12:30", focus: "  Filing  " }];
  assert.deepEqual(readSchedule(week).days, [
    { day: "Monday", start: "08:00", end: "17:00", focus: null, hours: 9 },
    { day: "Wednesday", start: "08:00", end: "12:30", focus: "Filing", hours: 4.5 },
  ]);
  for (const bad of [[{ day: "Funday", start_time: "08:00", end_time: "17:00" }], [{ day: "Monday", start_time: "8", end_time: "17:00" }], [{ day: "Monday", start_time: "17:00", end_time: "08:00" }], [week[0], week[0]]]) {
    assert.ok("problem" in readSchedule(bad), JSON.stringify(bad).slice(0, 50));
  }
  const days = readSchedule(week).days;
  assert.equal(scheduleKey(days), "Monday 08:00-17:00; Wednesday 08:00-12:30");
  assert.equal(compareSchedule([], days), "none");
  assert.equal(compareSchedule([{ day: "Wednesday", start: "08:00", end: "12:30" }, { day: "Monday", start: "08:00", end: "17:00" }], days), "same", "the order does not matter");
  assert.equal(compareSchedule([{ day: "Monday", start: "08:00", end: "17:00" }], days), "different");
  assert.equal(compareSchedule([{ day: "Monday", start: "09:00", end: "17:00" }, { day: "Wednesday", start: "08:00", end: "12:30" }], days), "different");

  const supervisor = await supervisorSession();
  const body = { schedule: week, existing: "skip" };
  assert.equal((await jsonRequest("/api/coordinator/blocks/1/schedule", jsonBody(studentToken, "PUT", body))).response.status, 403);
  assert.equal((await jsonRequest("/api/coordinator/blocks/1/schedule", jsonBody(supervisor.token, "PUT", body))).response.status, 403);
  assert.equal((await jsonRequest("/api/coordinator/blocks/1/schedule/preview", jsonBody(supervisor.token, "POST", body))).response.status, 403);
  const as = (method, path, payload) => jsonRequest(path, jsonBody(coordinatorToken, method, payload));
  assert.equal((await as("PUT", "/api/coordinator/blocks/999999999/schedule", body)).response.status, 404);
  assert.equal((await as("POST", "/api/coordinator/blocks/999999999/schedule/preview", body)).response.status, 404);
  assert.equal((await as("PUT", "/api/coordinator/blocks/999999999/schedule", { schedule: week })).response.status, 400, "overwrite or skip must be said");
  assert.equal((await as("PUT", "/api/coordinator/blocks/999999999/schedule", { schedule: [], existing: "skip" })).response.status, 400);
  assert.equal((await as("POST", "/api/coordinator/blocks/999999999/schedule/preview", { schedule: [{ day: "Monday", start_time: "17:00", end_time: "08:00" }] })).response.status, 400);

  if (needsWrites(t)) return;
  const pool = localTestPool();
  const stamp = Date.now();
  const ids = { none: `P5-SCH-A-${stamp}`, same: `P5-SCH-B-${stamp}`, different: `P5-SCH-C-${stamp}`, inactive: `P5-SCH-D-${stamp}` };
  let blockId;
  const active = async (id) => (await pool.query(`SELECT INITCAP(day) AS day, TO_CHAR(start_time, 'HH24:MI') AS start, TO_CHAR(end_time, 'HH24:MI') AS "end", hours::float AS hours FROM ojt_schedule WHERE student_id = $1 AND is_active = TRUE ORDER BY day`, [id])).rows;
  try {
    const program = (await pool.query(`SELECT id FROM programs WHERE short_code = 'BSIT'`)).rows[0].id;
    blockId = (await pool.query(`INSERT INTO blocks (program_id, year_level, section) VALUES ($1, 4, $2) RETURNING id`, [program, `S${String(stamp).slice(-6)}`])).rows[0].id;
    for (const [kind, id] of Object.entries(ids)) {
      await pool.query(`INSERT INTO students (student_id, email, password, name, is_active, program_id, block_id) VALUES ($1, $2, 'x', $3, $4, $5, $6)`, [id, `${id.toLowerCase()}@p5.test`, `Sched ${kind}`, kind !== "inactive", program, blockId]);
    }
    await pool.query(`INSERT INTO ojt_schedule (student_id, day, start_time, end_time, hours, is_active) VALUES ($1, 'Monday', '08:00', '17:00', 9, TRUE), ($1, 'Wednesday', '08:00', '12:30', 4.5, TRUE)`, [ids.same]);
    await pool.query(`INSERT INTO ojt_schedule (student_id, day, start_time, end_time, hours, is_active) VALUES ($1, 'Friday', '13:00', '17:00', 4, TRUE)`, [ids.different]);

    // THE PREVIEW changes nothing and names who stands where.
    const preview = await as("POST", `/api/coordinator/blocks/${blockId}/schedule/preview`, { schedule: week });
    assert.equal(preview.response.status, 200, JSON.stringify(preview.body));
    assert.deepEqual([preview.body.none, preview.body.same, preview.body.different], [1, 1, 1]);
    assert.deepEqual(Object.fromEntries(preview.body.students.map((row) => [row.student_id, row.state])), { [ids.none]: "none", [ids.same]: "same", [ids.different]: "different" }, "a deactivated student is not in it");
    assert.equal(preview.body.students.find((row) => row.student_id === ids.different).current, "Friday 13:00-17:00");
    assert.deepEqual(await active(ids.none), []);

    // SKIP: the one with none gets it; the different one is left.
    const skipped = await as("PUT", `/api/coordinator/blocks/${blockId}/schedule`, { schedule: week, existing: "skip" });
    assert.deepEqual([skipped.response.status, skipped.body.applied, skipped.body.skipped, skipped.body.unchanged], [200, 1, 1, 1], JSON.stringify(skipped.body));
    assert.match(skipped.body.message, /1 student with a different schedule was left as it is\./);
    assert.deepEqual(await active(ids.none), [{ day: "Monday", start: "08:00", end: "17:00", hours: 9 }, { day: "Wednesday", start: "08:00", end: "12:30", hours: 4.5 }]);
    assert.deepEqual((await active(ids.different)).map((row) => row.day), ["Friday"]);
    assert.deepEqual(await active(ids.inactive), []);

    // OVERWRITE: now the different one too. The earlier rows are kept, switched off.
    const over = await as("PUT", `/api/coordinator/blocks/${blockId}/schedule`, { schedule: week, existing: "overwrite" });
    assert.deepEqual([over.body.applied, over.body.skipped, over.body.unchanged], [1, 0, 2], JSON.stringify(over.body));
    assert.deepEqual((await active(ids.different)).map((row) => row.day), ["Monday", "Wednesday"]);
    assert.equal((await pool.query(`SELECT COUNT(*)::int AS n FROM ojt_schedule WHERE student_id = $1 AND is_active = FALSE`, [ids.different])).rows[0].n, 1);
    // Each student whose schedule changed is told, once.
    const told = await pool.query(`SELECT student_id FROM notifications WHERE title = 'OJT schedule updated' AND student_id = ANY($1::text[])`, [Object.values(ids)]);
    assert.deepEqual(told.rows.map((row) => row.student_id).sort(), [ids.none, ids.different].sort());

    await new Promise((resolve) => setTimeout(resolve, 300));
    const audit = await jsonRequest("/api/coordinator/audit?action=schedule.bulk_set&limit=10", { headers: authHeaders(coordinatorToken) });
    const mine = audit.body.entries.filter((entry) => String(entry.entity_id) === String(blockId));
    assert.equal(mine.length, 2);
    assert.ok(mine.some((entry) => entry.details.existing === "skip" && entry.details.applied === 1 && entry.details.skipped === 1));
    assert.ok(mine.every((entry) => entry.entity_type === "block" && entry.details.schedule === "Monday 08:00-17:00; Wednesday 08:00-12:30"));

    // TWO COORDINATORS AT ONCE: each student ends with one of the two schedules whole, never a mix of both.
    const tuesday = [{ day: "Tuesday", start_time: "08:00", end_time: "12:00" }];
    const weekend = [{ day: "Thursday", start_time: "13:00", end_time: "17:00" }, { day: "Saturday", start_time: "08:00", end_time: "12:00" }];
    for (let round = 0; round < 3; round += 1) {
      const both = await Promise.all([
        as("PUT", `/api/coordinator/blocks/${blockId}/schedule`, { schedule: tuesday, existing: "overwrite" }),
        as("PUT", `/api/coordinator/blocks/${blockId}/schedule`, { schedule: weekend, existing: "overwrite" }),
      ]);
      assert.deepEqual(both.map((answer) => answer.response.status), [200, 200]);
      for (const id of [ids.none, ids.same, ids.different]) {
        const now = (await active(id)).map((row) => row.day).sort().join(",");
        assert.ok(now === "Tuesday" || now === "Saturday,Thursday", `${id} has a mixed schedule: ${now}`);
      }
    }
  } finally {
    const all = Object.values(ids);
    await pool.query(`DELETE FROM notifications WHERE student_id = ANY($1::text[])`, [all]);
    await pool.query(`DELETE FROM ojt_schedule WHERE student_id = ANY($1::text[])`, [all]);
    await pool.query(`DELETE FROM students WHERE student_id = ANY($1::text[])`, [all]);
    if (blockId) await pool.query(`DELETE FROM blocks WHERE id = $1`, [blockId]);
    await pool.end();
  }
});

test("an analytics range is the last N days, or any first and last day, grouped by day, week or month", () => {
  require("tsx/cjs");
  const { readRange, defaultGroup, MAX_RANGE_DAYS } = require("../src/services/analyticsRange.ts");
  const today = "2026-10-12";
  // Nothing sent, or the page's old "days": as it always was.
  assert.deepEqual(readRange({}, today), { from: "2026-09-29", to: "2026-10-12", days: 14, group: "day" });
  assert.deepEqual(readRange({ days: "30" }, today), { from: "2026-09-13", to: "2026-10-12", days: 30, group: "day" });
  assert.deepEqual(readRange({ days: "90" }, today), { from: "2026-07-15", to: "2026-10-12", days: 90, group: "week" });
  assert.equal(readRange({ days: "17" }, today).days, 14, "not one of the quick periods");
  // Any range, counted with both ends.
  assert.deepEqual(readRange({ from: "2026-01-01", to: "2026-01-31" }, today), { from: "2026-01-01", to: "2026-01-31", days: 31, group: "day" });
  assert.deepEqual(readRange({ from: "2026-01-01", to: "2026-01-01" }, today).days, 1);
  assert.equal(readRange({ from: "2025-01-01", to: "2026-10-12" }, today).group, "month");
  assert.equal(readRange({ from: "2026-01-01", to: "2026-01-31", group: "month" }, today).group, "month", "the group asked for wins");
  assert.deepEqual([defaultGroup(31), defaultGroup(32), defaultGroup(184), defaultGroup(185)], ["day", "week", "week", "month"]);
  // The range wins over "days" when both are sent.
  assert.equal(readRange({ days: "90", from: "2026-10-01", to: "2026-10-07" }, today).days, 7);
  for (const bad of [
    { from: "2026-01-01" },
    { to: "2026-01-01" },
    { from: "2026-02-30", to: "2026-03-01" },
    { from: "01/02/2026", to: "2026-03-01" },
    { from: "2026-03-02", to: "2026-03-01" },
    { from: "2024-01-01", to: "2026-10-12" },
    { group: "year" },
    { from: "2026-01-01", to: "2026-01-31", group: "hour" },
  ]) {
    assert.ok("problem" in readRange(bad, today), JSON.stringify(bad));
  }
  assert.equal(MAX_RANGE_DAYS, 731);
  assert.ok(!("problem" in readRange({ from: "2024-10-12", to: "2026-10-12" }, today)), "two years to the day is allowed");
});

test("analytics takes a date range and a grouping, and the groups add up to the days", async () => {
  const path = "/api/coordinator/analytics";
  const get = (query = "") => jsonRequest(`${path}${query}`, { headers: authHeaders(coordinatorToken) });
  for (const bad of ["?from=2026-01-01", "?from=2026-02-30&to=2026-03-01", "?from=2026-03-02&to=2026-03-01", "?from=2020-01-01&to=2026-01-01", "?group=year"]) {
    assert.equal((await get(bad)).response.status, 400, bad);
  }
  assert.equal((await jsonRequest(`${path}?from=2026-01-01&to=2026-01-31`, { headers: authHeaders(studentToken) })).response.status, 403);

  // Unsent, the answer is the last 14 days by day, with everything it had before.
  const plain = (await get()).body;
  assert.deepEqual([plain.days, plain.group, plain.attendanceTrend.length, plain.trend.length], [14, "day", 14, 14]);
  for (const key of ["period", "progress", "companies", "complaintsByCategory", "taskFunnel", "evaluationSummary"]) assert.ok(key in plain, key);
  assert.deepEqual(plain.trend.map((row) => [row.start, row.hours, row.logs, row.students]), plain.attendanceTrend.map((row) => [row.day, row.hours, row.logs, row.students]), "by day, the groups are the days");

  // The same fourteen days asked for by their dates give the same figures.
  const dated = (await get(`?from=${plain.from}&to=${plain.to}`)).body;
  assert.deepEqual(dated.period, plain.period);
  assert.deepEqual(dated.attendanceTrend, plain.attendanceTrend);
  assert.deepEqual((await get("?days=14")).body.period, plain.period);

  // Ninety days: by week unless told otherwise; every group inside the range; hours and logs add up either way.
  const sum = (rows, key) => Math.round(rows.reduce((total, row) => total + Number(row[key]), 0) * 100) / 100;
  const ninety = (await get("?days=90")).body;
  assert.deepEqual([ninety.days, ninety.group, ninety.attendanceTrend.length], [90, "week", 90]);
  assert.ok(ninety.trend.length >= 13 && ninety.trend.length <= 14);
  assert.equal(ninety.trend[0].start, ninety.from);
  assert.equal(ninety.trend.at(-1).end, ninety.to);
  for (const [index, row] of ninety.trend.entries()) {
    assert.ok(row.start <= row.end && row.start >= ninety.from && row.end <= ninety.to);
    if (index > 0) assert.equal(new Date(`${row.start}T00:00:00Z`).getUTCDay(), 1, "a week starts on Monday");
  }
  for (const group of ["day", "week", "month"]) {
    const grouped = (await get(`?days=90&group=${group}`)).body;
    assert.equal(grouped.group, group);
    assert.equal(sum(grouped.trend, "hours"), sum(ninety.attendanceTrend, "hours"), `${group}: hours`);
    assert.equal(sum(grouped.trend, "logs"), sum(ninety.attendanceTrend, "logs"), `${group}: logs`);
    assert.equal(sum(grouped.trend, "hours"), Math.round(grouped.period.hours * 100) / 100, `${group}: the chart and the total agree`);
  }
  const months = (await get(`?from=${ninety.from}&to=${ninety.to}&group=month`)).body.trend;
  assert.ok(months.length >= 3 && months.length <= 4);
  assert.ok(months.slice(1).every((row) => row.start.endsWith("-01")));

  // A range in the past: "previous" is the same number of days just before it, not counted from today.
  const past = (await get("?from=2001-02-01&to=2001-02-10")).body;
  assert.deepEqual([past.days, past.from, past.to, past.attendanceTrend.length], [10, "2001-02-01", "2001-02-10", 10]);
  assert.equal(past.period.logs, sum(past.attendanceTrend, "logs"));
  const before = (await get("?from=2001-01-22&to=2001-01-31")).body;
  assert.equal(past.period.previousLogs, before.period.logs);
  assert.equal(past.period.previousHours, before.period.hours);
});

test("files in a ZIP are named for a person, never collide, and a ZIP is capped by count and size", () => {
  require("tsx/cjs");
  const { zipNames, zipProblem, ZIP_MAX_FILES, ZIP_MAX_BYTES } = require("../src/services/documentZip.ts");
  assert.deepEqual([ZIP_MAX_FILES, ZIP_MAX_BYTES], [500, 500 * 1024 * 1024]);
  assert.equal(zipProblem(0, 0), "No documents match those filters.");
  assert.equal(zipProblem(1, 10), "");
  assert.equal(zipProblem(500, ZIP_MAX_BYTES), "", "exactly at both caps is allowed");
  assert.match(zipProblem(501, 1024 * 1024), /^That is 501 files \(1 MB\)\. One ZIP holds at most 500 files or 500 MB\. Narrow the filters/);
  assert.match(zipProblem(3, ZIP_MAX_BYTES + 1), /^That is 3 files \(500 MB\)\./);
  assert.match(zipProblem(40, 3 * 1024 * 1024 * 1024), /\(3\.0 GB\)/);

  const names = zipNames([
    { student_name: "Ana Reyes", doc_type: "MOA", original_filename: "moa.pdf" },
    { student_name: "Ana Reyes", doc_type: "MOA", original_filename: "MOA.pdf" },
    { student_name: "Ana Reyes", doc_type: "MOA", original_filename: "moa.pdf" },
    { student_name: "Ben / Cruz", doc_type: "Medical: 2026", original_filename: "..\\..\\etc\\passwd" },
    { student_name: null, doc_type: "", original_filename: "" },
    { student_name: "Dela Cruz, Juan", doc_type: "Waiver", original_filename: "scan.final.JPG" },
    { student_name: "Eve", doc_type: "Waiver", original_filename: "x".repeat(300) + ".pdf" },
  ]);
  assert.deepEqual(names.slice(0, 6), [
    "Ana Reyes - MOA - moa.pdf",
    "Ana Reyes - MOA - MOA (2).pdf",
    "Ana Reyes - MOA - moa (3).pdf",
    "Ben Cruz - Medical 2026 - etc passwd",
    "Unknown student - Document - file",
    "Dela Cruz, Juan - Waiver - scan.final.JPG",
  ]);
  assert.equal(new Set(names.map((name) => name.toLowerCase())).size, names.length, "no two names are the same, whatever the capitals");
  for (const name of names) {
    assert.ok(!/[\\/:*?"<>|]/.test(name) && !name.includes(".."), name);
    assert.ok(name.length <= 260, "short enough for any file system");
  }
});

test("the coordinator downloads the filtered documents as one ZIP, named for people, and it is logged with the filters", async (t) => {
  const supervisor = await supervisorSession();
  const path = "/api/coordinator/documents/zip";
  assert.equal((await jsonRequest(path)).response.status, 401);
  assert.equal((await jsonRequest(path, { headers: authHeaders(studentToken) })).response.status, 403);
  assert.equal((await jsonRequest(path, { headers: authHeaders(supervisor.token) })).response.status, 403);
  const refused = async (query, status) => {
    const answer = await jsonRequest(`${path}${query}`, { headers: authHeaders(coordinatorToken) });
    assert.equal(answer.response.status, status, query);
    return answer.body.message;
  };
  await refused("?status=Lost", 400);
  await refused("?block=abc", 400);
  await refused(`?doc_type=${"x".repeat(101)}`, 400);
  assert.equal(await refused("?doc_type=No%20such%20requirement", 404), "No documents match those filters.");

  // The list now says where each student is placed, for the grouped view.
  const list = (await jsonRequest("/api/coordinator/documents", { headers: authHeaders(coordinatorToken) })).body;
  for (const row of list.students) for (const key of ["college", "program_name", "block"]) assert.ok(key in row, key);

  if (needsWrites(t)) return;
  const { unzipSync } = require("fflate");
  const pool = localTestPool();
  const stamp = Date.now();
  const requirement = list.requirements[0];
  assert.ok(requirement, "an active requirement to upload against");
  const made = [];
  try {
    const upload = async (name) => {
      const form = new FormData();
      form.append("doc_type", requirement);
      form.append("file", new Blob([sampleFiles.pdf], { type: "application/pdf" }), name);
      const answer = await jsonRequest("/api/documents", { method: "POST", headers: authHeaders(studentToken), body: form });
      assert.equal(answer.response.status, 201, JSON.stringify(answer.body));
      made.push(answer.body.document.id);
      return answer.body.document.id;
    };
    const first = await upload(`zip test ${stamp}.pdf`);
    const second = await upload(`zip test ${stamp}.pdf`);
    await pool.query(`UPDATE documents SET status = 'Approved' WHERE id = $1`, [first]);
    // A record whose file is gone from storage.
    made.push((await pool.query(`INSERT INTO documents (student_id, doc_type, original_filename, file_path, mime_type, size_bytes, status) VALUES ($1, $2, $3, $4, 'application/pdf', 10, 'Approved') RETURNING id`, [student.student_id, requirement, `lost ${stamp}.pdf`, `${stamp}-aaaaaaaaaaaa.pdf`])).rows[0].id);

    const fetchZip = async (query) => {
      const response = await fetch(new URL(`${path}${query}`, apiBaseUrl), { headers: authHeaders(coordinatorToken) });
      assert.equal(response.status, 200, query);
      assert.match(response.headers.get("content-type"), /application\/zip/);
      return unzipSync(new Uint8Array(await response.arrayBuffer()));
    };
    const supervisorId = encodeURIComponent(supervisor.supervisor.supervisor_id);
    const mineOnly = (files) => Object.keys(files).filter((name) => name.includes(String(stamp)) || name === "NOT INCLUDED.txt").sort();

    // Approved only, this requirement, this supervisor's students: the approved upload, and a note about the lost one.
    const approved = await fetchZip(`?supervisor=${supervisorId}&status=Approved&doc_type=${encodeURIComponent(requirement)}`);
    const readable = `${student.name} - ${requirement} - zip test ${stamp}.pdf`;
    assert.deepEqual(mineOnly(approved), ["NOT INCLUDED.txt", readable].sort());
    assert.deepEqual(Buffer.from(approved[readable]), sampleFiles.pdf, "the file itself, byte for byte");
    assert.match(Buffer.from(approved["NOT INCLUDED.txt"]).toString(), new RegExp(`${student.name} - ${requirement} - lost ${stamp}\\.pdf`));
    // The stored names never appear.
    const stored = (await pool.query(`SELECT file_path FROM documents WHERE id = ANY($1::int[])`, [made])).rows.map((row) => row.file_path.split("/").pop());
    for (const name of Object.keys(approved)) assert.ok(!stored.some((secret) => name.includes(secret.replace(/\.[a-z]+$/, ""))), name);

    // Every status: both uploads, the second told apart from the first.
    const all = await fetchZip(`?supervisor=${supervisorId}&doc_type=${encodeURIComponent(requirement)}`);
    assert.ok(mineOnly(all).includes(readable));
    assert.ok(mineOnly(all).includes(`${student.name} - ${requirement} - zip test ${stamp} (2).pdf`));
    assert.ok(second);
    // Filters that leave nobody: nothing to send.
    await refused(`?supervisor=none&doc_type=${encodeURIComponent(requirement)}&company=999999999`, 404);

    await new Promise((resolve) => setTimeout(resolve, 400));
    const audit = await jsonRequest("/api/coordinator/audit?action=document.bulk_download&limit=5", { headers: authHeaders(coordinatorToken) });
    const entries = audit.body.entries.filter((entry) => String(entry.details?.filters || "").includes(`doc_type=${requirement}`));
    assert.ok(entries.length >= 2, JSON.stringify(audit.body.entries.slice(0, 2)));
    const logged = entries.find((entry) => String(entry.details.filters).includes("status=Approved"));
    assert.equal(logged.details.filters, `supervisor=${supervisor.supervisor.supervisor_id}; status=Approved; doc_type=${requirement}`);
    assert.ok(logged.details.files >= 1 && logged.details.missing >= 1 && logged.details.bytes > 0);
  } finally {
    await pool.query(`DELETE FROM notifications WHERE message LIKE $1`, [`%zip test ${stamp}%`]);
    await pool.query(`DELETE FROM documents WHERE id = ANY($1::int[])`, [made]);
    await pool.end();
  }
});

test("a deliverable is due on a day, by a week of the term or every week; a weekly one never repeats the weekly report", () => {
  require("tsx/cjs");
  const { readDeliverable, dueText, duplicatesWeeklyReport, appliesTo, oneOff } = require("../src/services/deliverables.ts");
  const everyone = { program_ids: [], block_ids: [] };
  // Nothing sent: as every requirement was before.
  assert.deepEqual(readDeliverable({}, "MOA"), { due_date: null, due_rule: null, reviewer_role: "supervisor", applies_to: everyone });
  assert.deepEqual(readDeliverable({ due_date: "2026-11-14", reviewer_role: "coordinator", applies_to: { program_ids: [9, 3, 9], block_ids: [4] } }, "MOA"), {
    due_date: "2026-11-14", due_rule: null, reviewer_role: "coordinator", applies_to: { program_ids: [3, 9], block_ids: [4] },
  });
  assert.equal(readDeliverable({ due_rule: "week:6" }, "Midterm narrative").due_rule, "week:6");
  assert.equal(readDeliverable({ due_rule: "weekly" }, "Timesheet signed by the supervisor").due_rule, "weekly");
  for (const bad of [
    { due_date: "2026-02-30" },
    { due_date: "soon" },
    { due_rule: "week:0" },
    { due_rule: "week:53" },
    { due_rule: "monthly" },
    { due_date: "2026-11-14", due_rule: "weekly" },
    { reviewer_role: "student" },
    { applies_to: { program_ids: ["9"] } },
    { applies_to: { block_ids: [0] } },
    { applies_to: [1, 2] },
  ]) {
    assert.ok("problem" in readDeliverable(bad, "MOA"), JSON.stringify(bad));
  }
  // THE WEEKLY REPORT IS NOT ASKED FOR TWICE.
  for (const name of ["Weekly report", "weekly Journal", "Weekly Reports (signed)", "OJT journal"]) {
    assert.ok(duplicatesWeeklyReport(name), name);
    assert.match(readDeliverable({ due_rule: "weekly" }, name).problem, /already write a weekly report/);
    // The same name due once is not a weekly duplicate.
    assert.ok(!("problem" in readDeliverable({ due_date: "2026-11-14" }, name)), name);
  }
  assert.ok(!duplicatesWeeklyReport("Weekly timesheet"));
  assert.deepEqual(
    [{ due_date: "2026-11-14", due_rule: null }, { due_date: null, due_rule: "week:6" }, { due_date: null, due_rule: "weekly" }, { due_date: null, due_rule: null }].map(dueText),
    ["Due 2026-11-14", "Due by the end of week 6 of the term", "Due every week", ""]
  );
  assert.match(appliesTo("r", "s"), /r\.applies_to->'program_ids'.*s\.program_id/s);
  assert.equal(oneOff("r"), "r.due_rule IS DISTINCT FROM 'weekly'");
});

test("deliverable settings are the coordinator's, and a student's list of what is due is their own", async () => {
  const supervisor = await supervisorSession();
  const settings = "/api/coordinator/requirements/1/deliverable";
  assert.equal((await jsonRequest(settings, jsonBody(studentToken, "PUT", {}))).response.status, 403);
  assert.equal((await jsonRequest(settings, jsonBody(supervisor.token, "PUT", {}))).response.status, 403);
  assert.equal((await jsonRequest("/api/coordinator/requirements/999999999/deliverable", jsonBody(coordinatorToken, "PUT", {}))).response.status, 404);
  assert.equal((await jsonRequest("/api/coordinator/requirements/abc/deliverable", jsonBody(coordinatorToken, "PUT", {}))).response.status, 404);
  const mine = `/api/students/${encodeURIComponent(student.student_id)}/deliverables`;
  assert.equal((await jsonRequest(mine, { headers: authHeaders(coordinatorToken) })).response.status, 403);
  assert.equal((await jsonRequest(mine, { headers: authHeaders(supervisor.token) })).response.status, 403);
  assert.equal((await jsonRequest("/api/students/SOMEONE-ELSE/deliverables", { headers: authHeaders(studentToken) })).response.status, 403);
  const own = await jsonRequest(mine, { headers: authHeaders(studentToken) });
  assert.equal(own.response.status, 200);
  assert.ok(Array.isArray(own.body.deliverables) && Array.isArray(own.body.weekly));
  // The list everyone reads now says who reviews each requirement; a student's has their own due day.
  const forCoordinator = (await jsonRequest("/api/ojt-requirements?all=1", { headers: authHeaders(coordinatorToken) })).body.requirements;
  for (const row of forCoordinator) for (const key of ["due_date", "due_rule", "reviewer_role", "applies_to"]) assert.ok(key in row, key);
  const forStudent = (await jsonRequest("/api/ojt-requirements", { headers: authHeaders(studentToken) })).body.requirements;
  for (const row of forStudent) {
    assert.ok("due_on" in row && row.is_active === true);
    assert.notEqual(row.due_rule, "weekly", "a weekly deliverable is not one of the documents");
  }
});

test("a deliverable applies to who it names, is reviewed by who it says, comes due once a week, and is reminded once", async (t) => {
  if (needsWrites(t)) return;
  require("tsx/cjs");
  const { createWeeklyItems, sendDeliverableReminders } = require("../src/services/deliverables.ts");
  const pool = localTestPool();
  const supervisor = await supervisorSession();
  const sid = student.student_id;
  const stamp = Date.now();
  const names = { once: `P5 clearance ${stamp}`, elsewhere: `P5 other program ${stamp}`, weekly: `P5 timesheet ${stamp}`, theirs: `P5 coordinator form ${stamp}` };
  const ids = {};
  const before = (await pool.query(`SELECT term_id, program_id, block_id FROM students WHERE student_id = $1`, [sid])).rows[0];
  let termId;
  const as = (method, path, body) => jsonRequest(path, jsonBody(coordinatorToken, method, body));
  const requirementsOf = async () => (await jsonRequest("/api/ojt-requirements", { headers: authHeaders(studentToken) })).body.requirements;
  const due = async () => (await jsonRequest(`/api/students/${encodeURIComponent(sid)}/deliverables`, { headers: authHeaders(studentToken) })).body;
  const checklist = async () => (await jsonRequest(`/api/students/${encodeURIComponent(sid)}/completion`, { headers: authHeaders(studentToken) })).body;
  const upload = async (docType, extra = {}) => {
    const form = new FormData();
    form.append("doc_type", docType);
    for (const [key, value] of Object.entries(extra)) form.append(key, String(value));
    form.append("file", new Blob([sampleFiles.pdf], { type: "application/pdf" }), `${docType}.pdf`);
    return jsonRequest("/api/documents", { method: "POST", headers: authHeaders(studentToken), body: form });
  };
  try {
    // A term that started three Mondays ago, so there are weeks to be due.
    termId = (await pool.query(`INSERT INTO terms (name, start_date, end_date) VALUES ($1, DATE_TRUNC('week', CURRENT_DATE)::date - 14, CURRENT_DATE + 60) RETURNING id`, [`P5 term ${stamp}`])).rows[0].id;
    await pool.query(`UPDATE students SET term_id = $2 WHERE student_id = $1`, [sid, termId]);
    const otherProgram = (await pool.query(`SELECT id FROM programs WHERE id IS DISTINCT FROM $1 ORDER BY id LIMIT 1`, [before.program_id])).rows[0].id;
    for (const [key, name] of Object.entries(names)) {
      const made = await as("POST", "/api/coordinator/requirements", { name, sort_order: 900 });
      assert.equal(made.response.status, 201, JSON.stringify(made.body));
      ids[key] = made.body.requirement.id;
    }
    const checklistBefore = await checklist();

    // Unknown program: refused. Then each one's settings.
    assert.equal((await as("PUT", `/api/coordinator/requirements/${ids.once}/deliverable`, { applies_to: { program_ids: [999999999] } })).response.status, 400);
    const tomorrow = (await pool.query(`SELECT TO_CHAR(CURRENT_DATE + 1, 'YYYY-MM-DD') AS d`)).rows[0].d;
    const set = async (key, body) => {
      const saved = await as("PUT", `/api/coordinator/requirements/${ids[key]}/deliverable`, body);
      assert.equal(saved.response.status, 200, JSON.stringify(saved.body));
      return saved.body;
    };
    const once = await set("once", { due_date: tomorrow });
    assert.deepEqual([once.requirement.due_date, once.requirement.reviewer_role, once.summary], [tomorrow, "supervisor", `Due ${tomorrow}; reviewed by the supervisor; for everyone`]);
    await set("elsewhere", { due_rule: "week:2", applies_to: { program_ids: [otherProgram] } });
    await set("weekly", { due_rule: "weekly" });
    await set("theirs", { reviewer_role: "coordinator", due_rule: "week:1" });

    // WHO IT APPLIES TO. The other program's deliverable is not this student's: not listed, not to be uploaded, not counted.
    const listed = (await requirementsOf()).map((row) => row.name);
    assert.ok(listed.includes(names.once) && listed.includes(names.theirs));
    assert.ok(!listed.includes(names.elsewhere), "another program's deliverable is not asked of this student");
    assert.ok(!listed.includes(names.weekly), "a weekly deliverable is not one document");
    assert.equal((await upload(names.elsewhere)).response.status, 400);
    assert.equal((await requirementsOf()).find((row) => row.name === names.once).due_on, tomorrow);
    // Week 1 of a term that began 14 days before this week's Monday ended 8 days before it.
    const weekOne = (await pool.query(`SELECT TO_CHAR(start_date + 6, 'YYYY-MM-DD') AS d FROM terms WHERE id = $1`, [termId])).rows[0].d;
    assert.equal((await requirementsOf()).find((row) => row.name === names.theirs).due_on, weekOne);
    // The completion checklist asks for the two that are documents and are this student's; not the weekly, not the other program's.
    const checklistAfter = await checklist();
    const requirementLine = (body) => JSON.stringify(body).match(/(\d+) of (\d+)/g);
    assert.notDeepEqual(requirementLine(checklistAfter), null);
    const coordinatorRow = (await jsonRequest(`/api/coordinator/documents?q=${encodeURIComponent(sid)}`, { headers: authHeaders(coordinatorToken) })).body.students.find((row) => row.student_id === sid);
    assert.ok(coordinatorRow.missing.includes(names.once) && coordinatorRow.missing.includes(names.theirs));
    assert.ok(!coordinatorRow.missing.includes(names.elsewhere) && !coordinatorRow.missing.includes(names.weekly));
    assert.equal(coordinatorRow.required, coordinatorRow.missing.length + coordinatorRow.approved);
    assert.ok(checklistBefore);

    // EVERY WEEK, from the week the deliverable was saved: made today, only this week is asked for.
    await createWeeklyItems(pool);
    assert.equal((await pool.query(`SELECT COUNT(*)::int AS n FROM deliverable_items WHERE requirement_id = $1 AND student_id = $2`, [ids.weekly, sid])).rows[0].n, 1, "no overdue weeks from before it existed");
    // Saved three weeks ago (the term's first week): three weeks so far, one item each, however often the loop runs.
    await pool.query(`UPDATE ojt_requirements SET updated_at = NOW() - INTERVAL '15 days' WHERE id = $1`, [ids.weekly]);
    await createWeeklyItems(pool);
    await createWeeklyItems(pool);
    const items = (await pool.query(`SELECT id, TO_CHAR(period_start, 'YYYY-MM-DD') AS period_start, TO_CHAR(due_date, 'YYYY-MM-DD') AS due_date, status FROM deliverable_items WHERE requirement_id = $1 AND student_id = $2 ORDER BY period_start`, [ids.weekly, sid])).rows;
    assert.equal(items.length, 3, "one item for each of the three weeks, made once");
    for (const item of items) {
      assert.equal(new Date(`${item.period_start}T00:00:00Z`).getUTCDay(), 1, "a week starts on Monday");
      assert.equal(new Date(`${item.due_date}T00:00:00Z`).getUTCDay(), 0, "and is due on its Sunday");
    }
    assert.equal((await pool.query(`SELECT COUNT(*)::int AS n FROM deliverable_items WHERE requirement_id = $1`, [ids.elsewhere])).rows[0].n, 0, "only weekly deliverables have items");
    const mineDue = await due();
    assert.equal(mineDue.weekly.filter((row) => row.name === names.weekly).length, 3);
    assert.ok(mineDue.weekly.filter((row) => row.name === names.weekly).every((row) => row.status === "Not submitted"));
    assert.deepEqual(mineDue.deliverables.filter((row) => Object.values(names).includes(row.name)).map((row) => [row.name, row.status]).sort(), [[names.once, "Not submitted"], [names.theirs, "Not submitted"]].sort());

    // REMINDED ONCE: tomorrow's one-off, and this week's item if it is due today or tomorrow.
    const sent = [];
    const collect = async (note) => { sent.push(note); };
    // The server's own loop may get there first; either way it is said once.
    const reminded = async (name) =>
      sent.filter((note) => note.studentId === sid && note.message.includes(name)).length +
      (await pool.query(`SELECT COUNT(*)::int AS n FROM notifications WHERE student_id = $1 AND title = 'Requirement due' AND message LIKE $2`, [sid, `%${name}%`])).rows[0].n;
    await sendDeliverableReminders(pool, collect);
    assert.equal(await reminded(names.once), 1, "reminded the day before it is due");
    assert.equal(await reminded(names.elsewhere), 0, "not about another program's deliverable");
    assert.ok(sent.every((note) => note.title === "Requirement due" && !note.message.includes(names.once) || note.message.includes(tomorrow)));
    await sendDeliverableReminders(pool, collect);
    await sendDeliverableReminders(pool, collect);
    assert.equal(await reminded(names.once), 1, "not twice");

    // A WEEK HANDED IN. The file is for that week; the supervisor reviews it; the week follows the file.
    const handed = await upload(names.weekly, { item_id: items[0].id });
    assert.equal(handed.response.status, 201, JSON.stringify(handed.body));
    const weekly = async () => (await due()).weekly.find((row) => row.item_id === items[0].id);
    assert.equal((await weekly()).status, "Submitted");
    const queue = (await jsonRequest("/api/documents/supervisor", { headers: authHeaders(supervisor.token) })).body.documents;
    assert.ok(queue.some((row) => row.id === handed.body.document.id), "in the supervisor's queue");
    const approve = (token, id, body = { status: "Approved" }) => jsonRequest(`/api/documents/${id}/review`, jsonBody(token, "PATCH", body));
    assert.equal((await approve(supervisor.token, handed.body.document.id)).response.status, 200);
    assert.equal((await weekly()).status, "Approved");
    // Somebody else's item, or an item of another requirement, is not taken over by an upload.
    const stray = await upload(names.once, { item_id: items[1].id });
    assert.equal(stray.response.status, 201);
    assert.equal((await pool.query(`SELECT document_id FROM deliverable_items WHERE id = $1`, [items[1].id])).rows[0].document_id, null);

    // REVIEWED BY THE COORDINATOR. Not in the supervisor's queue, not theirs to decide; the coordinator's to decide.
    const form = await upload(names.theirs);
    assert.equal(form.response.status, 201, JSON.stringify(form.body));
    const queueAfter = (await jsonRequest("/api/documents/supervisor", { headers: authHeaders(supervisor.token) })).body.documents;
    assert.ok(!queueAfter.some((row) => row.id === form.body.document.id), "not in the supervisor's queue");
    const refused = await approve(supervisor.token, form.body.document.id);
    assert.ok([404, 409].includes(refused.response.status), String(refused.response.status));
    const told = await pool.query(`SELECT COUNT(*)::int AS n FROM notifications WHERE coordinator_id = $1 AND title = 'Document submitted for review' AND message LIKE $2`, [coordinator.coordinator_id, `%${names.theirs}%`]);
    assert.equal(told.rows[0].n, 1, "the coordinator is told, not the supervisor");
    const inList = (await jsonRequest(`/api/coordinator/documents?q=${encodeURIComponent(names.theirs)}`, { headers: authHeaders(coordinatorToken) })).body.documents.find((row) => row.id === form.body.document.id);
    assert.equal(inList.reviewer_role, "coordinator");
    assert.equal((await approve(coordinatorToken, form.body.document.id, { status: "Rejected" })).response.status, 400, "a rejection still needs a reason");
    assert.equal((await approve(coordinatorToken, form.body.document.id)).response.status, 200);
    // The supervisor's own kind is still not the coordinator's while the student has an active supervisor.
    assert.equal((await approve(coordinatorToken, stray.body.document.id)).response.status, 409);

    await new Promise((resolve) => setTimeout(resolve, 300));
    const audit = await jsonRequest("/api/coordinator/audit?action=requirement.deliverable&limit=20", { headers: authHeaders(coordinatorToken) });
    const logged = audit.body.entries.find((entry) => String(entry.entity_id) === String(ids.weekly));
    assert.deepEqual([logged.details.name, logged.details.settings], [names.weekly, "Due every week; reviewed by the supervisor; for everyone"]);
  } finally {
    const all = Object.values(ids);
    await pool.query(`DELETE FROM notifications WHERE message LIKE $1`, [`%${stamp}%`]);
    await pool.query(`DELETE FROM deliverable_items WHERE requirement_id = ANY($1::int[])`, [all]);
    await pool.query(`DELETE FROM deliverable_reminders WHERE requirement_id = ANY($1::int[])`, [all]);
    await pool.query(`DELETE FROM documents WHERE doc_type LIKE $1`, [`%${stamp}%`]);
    await pool.query(`DELETE FROM ojt_requirements WHERE id = ANY($1::int[])`, [all]);
    await pool.query(`UPDATE students SET term_id = $2 WHERE student_id = $1`, [sid, before.term_id]);
    if (termId) await pool.query(`DELETE FROM terms WHERE id = $1`, [termId]);
    await pool.end();
  }
});

test("giving, changing and cancelling a task, and writing an evaluation, each leave an audit line", async (t) => {
  if (process.env.ALLOW_TEST_WRITES !== "true") {
    t.skip("set ALLOW_TEST_WRITES=true to run against a throwaway database");
    return;
  }
  const supervisor = await supervisorSession();
  const studentId = student.student_id;
  const send = async (method, path, payload) => {
    const { response, body } = await jsonRequest(path, payload === undefined ? { method, headers: authHeaders(supervisor.token) } : jsonBody(supervisor.token, method, payload));
    return { status: response.status, body };
  };
  const lines = async (action) => {
    const found = await jsonRequest(`/api/coordinator/audit?action=${action}&limit=5`, { headers: authHeaders(coordinatorToken) });
    assert.equal(found.response.status, 200);
    return found.body.entries;
  };
  // The row is written after the answer has gone out.
  const lineFor = async (action, match) => {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const line = (await lines(action)).find(match);
      if (line) return line;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    return null;
  };
  const title = `Audit check ${Date.now()}`;
  const due = new Date(Date.now() + 5 * 86_400_000).toISOString().slice(0, 10);

  const made = await send("POST", "/api/tasks", { student_id: studentId, title, description: "not kept", priority: "Low", due_date: due });
  assert.equal(made.status, 201);
  const taskId = made.body.task.id;
  const assigned = await lineFor("task.assign", (line) => String(line.entity_id) === String(taskId));
  assert.ok(assigned, "assigning a task is logged");
  assert.equal(assigned.details.title, title);
  assert.equal(assigned.details.description, undefined, "the description is not kept");

  const edited = await send("PUT", `/api/tasks/${taskId}`, { title: `${title} b`, description: "", priority: "Low", due_date: due });
  assert.equal(edited.status, 200);
  assert.ok(await lineFor("task.edit", (line) => String(line.entity_id) === String(taskId)), "changing a task is logged");

  const cancelled = await send("DELETE", `/api/tasks/${taskId}`);
  assert.equal(cancelled.status, 200);
  assert.equal(cancelled.body.task.title, `${title} b`);
  const gone = await lineFor("task.cancel", (line) => String(line.entity_id) === String(taskId));
  assert.ok(gone, "cancelling a task is logged");
  assert.equal(String(gone.details.student_id), String(studentId));

  const category = `Audit ${Date.now()}`.slice(0, 40);
  const written = await send("POST", "/api/evaluations", { student_id: studentId, category, rating: 4, comments: "not kept" });
  assert.equal(written.status, 201);
  const evaluationId = written.body.evaluation.id;
  const created = await lineFor("evaluation.create", (line) => line.details.category === category);
  assert.ok(created, "writing an evaluation is logged");
  assert.equal(created.details.comments, undefined, "the comments are not kept");
  const changed = await send("PUT", `/api/evaluations/${evaluationId}`, { rating: 3, comments: "", category });
  assert.equal(changed.status, 200);
  assert.ok(await lineFor("evaluation.edit", (line) => line.details.category === category && Number(line.details.rating) === 3), "changing an evaluation is logged");
  const removed = await send("DELETE", `/api/evaluations/${evaluationId}`);
  assert.equal(removed.status, 200);
  assert.ok(await lineFor("evaluation.remove", (line) => line.details.category === category), "removing an evaluation is logged");
});

test("a record a person removes is copied whole, with who removed it, by the statement that deletes it", async (t) => {
  require("tsx/cjs");
  const { deleteKeeping } = require("../src/services/removedRecords.ts");
  // Only the tables it knows, and never a name or a placeholder from outside.
  assert.throws(() => deleteKeeping({ table: "students", alias: "s", where: "WHERE s.id = $1", select: "s.id", actor: ["$2", "$3"] }), /does not know/);
  assert.throws(() => deleteKeeping({ table: "tasks", alias: "t; DROP", where: "WHERE t.id = $1", select: "t.id", actor: ["$2", "$3"] }), /alias/);
  assert.throws(() => deleteKeeping({ table: "tasks", alias: "t", where: "WHERE t.id = $1", select: "t.id", actor: ["'x'", "$3"] }), /placeholders/);

  if (needsWrites(t)) return;
  const supervisor = await supervisorSession();
  const pool = localTestPool();
  const send = async (token, method, path, payload) => {
    const { response, body } = await jsonRequest(path, payload === undefined ? { method, headers: authHeaders(token) } : jsonBody(token, method, payload));
    return { status: response.status, body };
  };
  const kept = async (table, id) =>
    (await pool.query(`SELECT * FROM removed_records WHERE table_name = $1 AND record_id = $2`, [table, String(id)])).rows;
  try {
    // A CANCELLED TASK: the whole row is kept, description and all.
    const title = `Removal check ${Date.now()}`;
    const due = new Date(Date.now() + 5 * 86_400_000).toISOString().slice(0, 10);
    const made = await send(supervisor.token, "POST", "/api/tasks", { student_id: student.student_id, title, description: "Kept when cancelled", priority: "Low", due_date: due });
    assert.equal(made.status, 201, JSON.stringify(made.body));
    const taskId = made.body.task.id;
    assert.deepEqual(await kept("tasks", taskId), [], "nothing is kept while the task exists");
    assert.equal((await send(supervisor.token, "DELETE", `/api/tasks/${taskId}`)).status, 200);
    const task = await kept("tasks", taskId);
    assert.equal(task.length, 1);
    assert.equal(task[0].student_id, student.student_id);
    assert.equal(task[0].data.title, title);
    assert.equal(task[0].data.description, "Kept when cancelled");
    assert.deepEqual([task[0].removed_by_role, task[0].removed_by_id], ["supervisor", supervisor.supervisor.supervisor_id]);
    assert.equal((await pool.query(`SELECT 1 FROM tasks WHERE id = $1`, [taskId])).rows.length, 0);

    // A REFUSED REMOVAL keeps nothing: another account cannot cancel it, so no copy is written.
    const second = await send(supervisor.token, "POST", "/api/tasks", { student_id: student.student_id, title: `${title} b`, priority: "Low", due_date: due });
    const secondId = second.body.task.id;
    assert.equal((await send(studentToken, "DELETE", `/api/tasks/${secondId}`)).status, 403);
    assert.deepEqual(await kept("tasks", secondId), []);
    assert.equal((await send(supervisor.token, "DELETE", `/api/tasks/${secondId}`)).status, 200);

    // A REMOVED EVALUATION keeps its comments.
    const written = await send(supervisor.token, "POST", "/api/evaluations", { student_id: student.student_id, category: `Removal ${Date.now()}`.slice(0, 40), rating: 5, comments: "Kept when removed" });
    assert.equal(written.status, 201, JSON.stringify(written.body));
    const evaluationId = written.body.evaluation.id;
    assert.equal((await send(supervisor.token, "DELETE", `/api/evaluations/${evaluationId}`)).status, 200);
    const evaluation = await kept("evaluations", evaluationId);
    assert.equal(evaluation.length, 1);
    assert.equal(evaluation[0].data.comments, "Kept when removed");
    assert.equal(evaluation[0].student_id, student.student_id);

    // A HOLIDAY has no student; it is kept all the same, under the coordinator who removed it.
    const holiday = await send(coordinatorToken, "POST", "/api/coordinator/holidays", { date: "2031-12-08", name: `Removal check ${Date.now()}` });
    assert.equal(holiday.status, 201, JSON.stringify(holiday.body));
    const holidayId = holiday.body.holiday.id;
    assert.equal((await send(coordinatorToken, "DELETE", `/api/coordinator/holidays/${holidayId}`)).status, 200);
    const day = await kept("holidays", holidayId);
    assert.equal(day.length, 1);
    assert.equal(day[0].student_id, null);
    assert.deepEqual([day[0].removed_by_role, day[0].removed_by_id], ["coordinator", coordinator.coordinator_id]);
  } finally {
    await pool.query(`DELETE FROM removed_records WHERE data->>'title' LIKE 'Removal check %' OR data->>'name' LIKE 'Removal check %' OR data->>'category' LIKE 'Removal %'`);
    await pool.end();
  }
});

test("a test notification is for a signed-in account, and says so when push is not set up", async () => {
  assert.equal((await jsonRequest("/api/push/test", { method: "POST" })).response.status, 401);
  // This API runs without the push keys, as the tests above also expect.
  for (const token of [studentToken, coordinatorToken, (await supervisorSession()).token]) {
    const answer = await jsonRequest("/api/push/test", { method: "POST", headers: authHeaders(token) });
    assert.equal(answer.response.status, 503);
    assert.equal(answer.body.message, "Browser push notifications are not configured.");
  }
});

test("the day's email allowance: off unless set, a share kept for password resets, and counted one at a time", async (t) => {
  require("tsx/cjs");
  const { emailDailyLimit, accountReserve, allowanceFor, claimEmail, returnEmail, emailsSentToday, EmailLimitError } = require("../src/services/emailBudget.ts");
  for (const off of [undefined, "", "abc", "5", "-100", "10.5", "1e3"]) assert.equal(emailDailyLimit({ EMAIL_DAILY_LIMIT: off }), null, String(off));
  assert.equal(emailDailyLimit({ EMAIL_DAILY_LIMIT: " 100 " }), 100);
  assert.deepEqual([accountReserve(100), accountReserve(10), accountReserve(3000)], [20, 5, 600]);
  assert.deepEqual([allowanceFor("routine", 100), allowanceFor("account", 100)], [80, 100]);
  assert.match(new EmailLimitError("routine").message, /reminder and summary/);

  // No limit: nothing is asked of the database at all.
  const untouched = { query: () => { throw new Error("must not be called"); } };
  assert.equal(await claimEmail(untouched, "routine", {}), true);
  await returnEmail(untouched, {});

  // The mailer asks before it sends, and does not send what is refused.
  const { sendEmail, useEmailBudget } = require("../src/services/mailer.ts");
  const kept = { ...process.env };
  const asked = [];
  let returned = 0;
  try {
    // An SMTP server that is not there: a send that gets as far as trying fails at once.
    Object.assign(process.env, { SMTP_HOST: "127.0.0.1", SMTP_PORT: "1", SMTP_USER: "u", SMTP_PASSWORD: "p", SMTP_FROM: "test@internet.test" });
    delete process.env.EMAIL_PROVIDER;
    const email = { to: "someone@internet.test", subject: "s", text: "t" };
    useEmailBudget({ claim: async (kind) => { asked.push(kind); return false; }, giveBack: async () => { returned += 1; } });
    await assert.rejects(sendEmail(email), (error) => error instanceof EmailLimitError);
    await assert.rejects(sendEmail({ ...email, kind: "account" }), (error) => error instanceof EmailLimitError);
    assert.deepEqual(asked, ["routine", "account"], "an email with no kind is a routine one");
    assert.equal(returned, 0, "a refused email was never counted, so nothing is given back");
    useEmailBudget({ claim: async () => true, giveBack: async () => { returned += 1; } });
    await assert.rejects(sendEmail(email), (error) => !(error instanceof EmailLimitError));
    assert.equal(returned, 1, "an email counted and then not sent is given back");
  } finally {
    useEmailBudget(null);
    for (const key of ["SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASSWORD", "SMTP_FROM", "EMAIL_PROVIDER"]) {
      if (kept[key] === undefined) delete process.env[key]; else process.env[key] = kept[key];
    }
  }

  if (needsWrites(t)) return;
  const pool = localTestPool();
  const today = `(NOW() AT TIME ZONE 'UTC')::date`;
  const before = (await pool.query(`SELECT sent FROM email_daily_counts WHERE day = ${today}`)).rows[0]?.sent ?? null;
  try {
    await pool.query(`DELETE FROM email_daily_counts WHERE day = ${today}`);
    const env = { EMAIL_DAILY_LIMIT: "10" };
    // Ten a day, five kept back: five routine emails, then only account ones, then none.
    const routine = [];
    for (let index = 0; index < 7; index += 1) routine.push(await claimEmail(pool, "routine", env));
    assert.deepEqual(routine, [true, true, true, true, true, false, false]);
    assert.equal(await emailsSentToday(pool), 5);
    const account = [];
    for (let index = 0; index < 6; index += 1) account.push(await claimEmail(pool, "account", env));
    assert.deepEqual(account, [true, true, true, true, true, false]);
    assert.equal(await emailsSentToday(pool), 10);
    await returnEmail(pool, env);
    assert.equal(await emailsSentToday(pool), 9);
    // Twenty at once for the one place left: exactly one gets it.
    const rush = await Promise.all(Array.from({ length: 20 }, () => claimEmail(pool, "account", env)));
    assert.equal(rush.filter(Boolean).length, 1);
    assert.equal(await emailsSentToday(pool), 10);
  } finally {
    await pool.query(`DELETE FROM email_daily_counts WHERE day = ${today}`);
    if (before !== null) await pool.query(`INSERT INTO email_daily_counts (day, sent) VALUES (${today}, $1)`, [before]);
    await pool.end();
  }
});

test("what is switched on is for coordinators, and says on or off without any setting's value", async () => {
  const path = "/api/coordinator/system-status";
  assert.equal((await jsonRequest(path)).response.status, 401);
  assert.equal((await jsonRequest(path, { headers: authHeaders(studentToken) })).response.status, 403);
  assert.equal((await jsonRequest(path, { headers: authHeaders((await supervisorSession()).token) })).response.status, 403);
  const status = await jsonRequest(path, { headers: authHeaders(coordinatorToken) });
  assert.equal(status.response.status, 200);
  // This API runs with neither email nor push set up.
  assert.deepEqual(status.body.email, { on: false, through: null, reset_links: false, daily_limit: null, kept_for_password_resets: null, sent_today: null });
  assert.deepEqual(status.body.push, { on: false });
  assert.ok(["object storage", "the server's own disk"].includes(status.body.files.kept_in));
  assert.equal(typeof status.body.privacy.consent_asked, "boolean");
  assert.equal(typeof status.body.privacy.notice_is_placeholder, "boolean");
  // Nothing that looks like a setting's value: no address, no key, no connection string.
  const raw = JSON.stringify(status.body);
  assert.equal(/@|:\/\/|secret|key|password/i.test(raw.replace(/kept_for_password_resets/g, "")), false, raw);

  // A test email: coordinators only, and a plain answer when email is not set up.
  assert.equal((await jsonRequest("/api/coordinator/email-test", { method: "POST" })).response.status, 401);
  assert.equal((await jsonRequest("/api/coordinator/email-test", { method: "POST", headers: authHeaders(studentToken) })).response.status, 403);
  const test = await jsonRequest("/api/coordinator/email-test", { method: "POST", headers: authHeaders(coordinatorToken) });
  assert.equal(test.response.status, 503);
  assert.match(test.body.message, /not set up/);
});

test("uploaded files go to a bucket when one is set, and a file from before the switch is still found on the disk", async () => {
  const http = require("node:http");
  const os = require("node:os");
  const fsp = require("node:fs/promises");
  const nodePath = require("node:path");
  // The store reads its folder when it is first loaded, so the folder is named before that.
  const folder = await fsp.mkdtemp(nodePath.join(os.tmpdir(), "internet-store-"));
  const keptEnv = process.env.PRIVATE_UPLOAD_DIR;
  process.env.PRIVATE_UPLOAD_DIR = folder;
  require("tsx/cjs");
  const store = require("../src/services/privateFileStore.ts");
  if (keptEnv === undefined) delete process.env.PRIVATE_UPLOAD_DIR; else process.env.PRIVATE_UPLOAD_DIR = keptEnv;

  // All four settings or none; one of two kinds of remote store, never both.
  assert.equal(store.bucketSettings({}), null);
  assert.throws(() => store.bucketSettings({ R2_BUCKET: "b" }), /Missing: R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY/);
  const four = { R2_ACCOUNT_ID: "acct", R2_ACCESS_KEY_ID: "id", R2_SECRET_ACCESS_KEY: "s", R2_BUCKET: " files " };
  assert.deepEqual(store.bucketSettings(four), { endpoint: "https://acct.r2.cloudflarestorage.com", accessKeyId: "id", secretAccessKey: "s", bucket: "files" });
  assert.equal(store.bucketSettings({ ...four, R2_ENDPOINT: "http://127.0.0.1:9" }).endpoint, "http://127.0.0.1:9");

  // A stand-in for the bucket: it keeps what it is sent and notes how it was asked.
  const objects = new Map();
  const seen = [];
  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      seen.push({ method: req.method, url: req.url, authorization: req.headers.authorization || "", checksum: Object.keys(req.headers).filter((name) => name.startsWith("x-amz-checksum") || name === "x-amz-sdk-checksum-algorithm") });
      const key = decodeURIComponent(req.url.split("?")[0]);
      if (req.method === "PUT") {
        objects.set(key, { body: Buffer.concat(chunks), type: req.headers["content-type"] });
        res.writeHead(200, { ETag: '"x"' }).end();
      } else if (req.method === "GET" && objects.has(key)) {
        const found = objects.get(key);
        res.writeHead(200, { "Content-Type": found.type, "Content-Length": found.body.length }).end(found.body);
      } else if (req.method === "GET") {
        res.writeHead(404, { "Content-Type": "application/xml" }).end('<?xml version="1.0"?><Error><Code>NoSuchKey</Code><Message>The specified key does not exist.</Message></Error>');
      } else if (req.method === "DELETE") {
        objects.delete(key);
        res.writeHead(204).end();
      } else {
        res.writeHead(405).end();
      }
    });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const endpoint = `http://127.0.0.1:${server.address().port}`;
  const bucket = store.bucketStore({ endpoint, accessKeyId: "test-key-id", secretAccessKey: "test-secret", bucket: "files" });
  const previous = store.useRemoteStore(bucket);
  const file = (name, text) => ({ buffer: Buffer.from(text), mimetype: "image/png", originalname: name });
  try {
    assert.equal(store.fileStoreKind(), "bucket");
    // A NEW FILE goes to the bucket and nowhere else.
    const name = await store.savePrivateFile(file("photo.png", "new photo"));
    assert.ok(objects.has(`/files/${name}`), "the object is in the bucket, under the bucket's name in the path");
    assert.equal(objects.get(`/files/${name}`).type, "image/png");
    assert.deepEqual(await fsp.readdir(folder), [], "nothing is written to the disk");
    const back = await store.readPrivateFile(name);
    assert.equal(back.buffer.toString(), "new photo");
    assert.equal(back.contentType, "image/png");
    // Every request is signed with the key's id, and carries no checksum the store did not ask for.
    assert.ok(seen.every((request) => request.authorization.startsWith("AWS4-HMAC-SHA256 Credential=test-key-id/")));
    assert.equal(seen.every((request) => !request.authorization.includes("test-secret")), true);
    assert.deepEqual(seen.flatMap((request) => request.checksum), []);

    // A FILE FROM BEFORE THE SWITCH is on the disk only: it is still found.
    const old = "1700000000000-aaaaaaaaaaaa.pdf";
    await fsp.writeFile(nodePath.join(folder, old), "old document");
    const older = await store.readPrivateFile(old);
    assert.equal(older.buffer.toString(), "old document");
    assert.equal(older.contentType, "application/pdf");

    // A file that is nowhere says so, the way the routes expect.
    await assert.rejects(store.readPrivateFile("1700000000001-bbbbbbbbbbbb.png"), (error) => error.statusCode === 404);
    // A name that is not one the store made is refused before anything is asked.
    const asked = seen.length;
    await assert.rejects(store.readPrivateFile("../secrets.png"), /Invalid private file name/);
    assert.equal(seen.length, asked);

    // REMOVING takes it from both places.
    await store.deletePrivateFile(name);
    await store.deletePrivateFile(old);
    assert.equal(objects.size, 0);
    assert.deepEqual(await fsp.readdir(folder), []);

    // THE CHECK writes, reads back and removes, leaving nothing behind.
    await store.checkFileStore();
    assert.equal(objects.size, 0);

    // A store that refuses: the check fails with the store's reason, and says nothing was kept.
    await new Promise((resolve) => server.close(resolve));
    await assert.rejects(store.checkFileStore());
  } finally {
    store.useRemoteStore(previous);
    if (server.listening) await new Promise((resolve) => server.close(resolve));
    await fsp.rm(folder, { recursive: true, force: true });
  }

  // ON THE DISK (no remote store), the same check works there.
  assert.equal(store.fileStoreKind(), "disk");
});

test("the file storage check is for coordinators and names where files are kept", async () => {
  const path = "/api/coordinator/storage-test";
  assert.equal((await jsonRequest(path, { method: "POST" })).response.status, 401);
  assert.equal((await jsonRequest(path, { method: "POST", headers: authHeaders(studentToken) })).response.status, 403);
  const checked = await jsonRequest(path, { method: "POST", headers: authHeaders(coordinatorToken) });
  assert.equal(checked.response.status, 200, JSON.stringify(checked.body));
  // This API keeps files on the disk.
  assert.equal(checked.body.kept_in, "the server's own disk");
  assert.match(checked.body.message, /written to the server's own disk, read back and removed/);
});

test("a fault is kept as its label and kind, never its message, once however often it repeats", async (t) => {
  require("tsx/cjs");
  const { problemFromLog, problemFromBrowser, fingerprintOf, createProblemKeeper, watchServerErrors } = require("../src/services/problems.ts");

  // WHAT IS KEPT of a log line: the label and the kind of error.
  const duplicate = Object.assign(new Error('duplicate key value violates unique constraint (email)=(someone@example.test)'), { code: "23505" });
  assert.deepEqual(problemFromLog(["ASSIGN TASK ERROR:", duplicate]), { source: "server", label: "ASSIGN TASK ERROR", detail: "Error 23505", route: "" });
  assert.equal(JSON.stringify(problemFromLog(["ASSIGN TASK ERROR:", duplicate])).includes("someone@"), false, "the message is not kept");
  assert.equal(problemFromLog(["SUMMARY EMAIL ERROR (supervisor_daily):", new TypeError("x")]).label, "SUMMARY EMAIL ERROR (supervisor_daily)");
  assert.equal(problemFromLog(["SUMMARY EMAIL ERROR (supervisor_daily):", new TypeError("x")]).detail, "TypeError");
  assert.equal(problemFromLog(["Unexpected PostgreSQL pool error:", Object.assign(new Error("x"), { code: "ECONNREFUSED" })]).detail, "Error ECONNREFUSED");
  // Not fault lines: a notice with no "error" in its label, a browser report (kept by its own route), a non-string.
  assert.equal(problemFromLog(["Task deadline emails have stopped for today: the allowance is used."]), null);
  assert.equal(problemFromLog(["CLIENT ERROR:", "{}"]), null);
  assert.equal(problemFromLog([new Error("bare")]), null);
  // Text after the first colon never becomes part of the label.
  assert.equal(problemFromLog(["LOGIN ERROR: for someone@example.test"]).label, "LOGIN ERROR");
  // An error code that is not a plain code is dropped.
  assert.equal(problemFromLog(["SAVE ERROR:", { name: "Error", code: "has spaces and someone@example.test" }]).detail, "Error");

  const crash = problemFromBrowser({ message: "Cannot read properties of undefined (reading 'name')", route: "/task", version: "abc1234", stack: "ignored" });
  assert.deepEqual(crash, { source: "browser", label: "Cannot read properties of undefined (reading 'name')", detail: "abc1234", route: "/task" });
  assert.notEqual(fingerprintOf(crash), fingerprintOf({ ...crash, route: "/schedule" }), "the same crash on another page is another kind");

  // HOW OFTEN it is written: at once the first time, then at most once a minute, with the count caught up.
  const writes = [];
  let clock = 1_000_000;
  const keeper = createProblemKeeper({ query: async (sql, values) => { if (/^INSERT/.test(sql.trim())) writes.push(values[5]); return { rows: [] }; } }, { now: () => clock });
  const fault = problemFromLog(["ASSIGN TASK ERROR:", duplicate]);
  await keeper.keep(fault);
  for (let index = 0; index < 50; index += 1) await keeper.keep(fault);
  assert.deepEqual(writes, [1], "fifty more in the same minute are held back");
  clock += 61_000;
  await keeper.keep(fault);
  assert.deepEqual(writes, [1, 51], "the next write carries the ones held back");
  // A flood of different faults: only so many kinds are taken in a minute.
  clock += 61_000;
  for (let index = 0; index < 100; index += 1) await keeper.keep({ source: "server", label: `FLOOD ${index} ERROR`, detail: "", route: "" });
  assert.equal(writes.length, 2 + 40);

  // A database that cannot be written to never throws into the caller, and the count is not lost.
  const failing = [];
  let down = true;
  const shaky = createProblemKeeper({ query: async (sql, values) => { if (down) throw new Error("down"); failing.push(values[5]); return { rows: [] }; } }, { now: () => clock });
  await shaky.keep(fault);
  down = false;
  clock += 61_000;
  await shaky.keep(fault);
  assert.deepEqual(failing, [2]);

  // WATCHING THE LOG: the line is still printed, and handed over only when it is a fault line.
  const printed = [];
  const handed = [];
  const real = console.error;
  console.error = (...args) => printed.push(args[0]);
  const stop = watchServerErrors((problem) => handed.push(problem.label));
  try {
    console.error("SAVE HOLIDAY ERROR:", new Error("x"));
    console.error("Just a sentence.");
  } finally {
    stop();
    console.error = real;
  }
  assert.deepEqual(printed, ["SAVE HOLIDAY ERROR:", "Just a sentence."]);
  assert.deepEqual(handed, ["SAVE HOLIDAY ERROR"]);

  // THROUGH THE API: a browser's crash report shows up for a coordinator, and for nobody else.
  assert.equal((await jsonRequest("/api/coordinator/problems")).response.status, 401);
  assert.equal((await jsonRequest("/api/coordinator/problems", { headers: authHeaders(studentToken) })).response.status, 403);
  const ready = await jsonRequest("/api/health/ready");
  assert.deepEqual([ready.response.status, ready.body], [200, { status: "ok" }]);
  // The crash-report test above sent "Test crash report" from /test; the route allows only a few a
  // minute, so that report is the one looked for here rather than sending another.
  let mine = null;
  for (let attempt = 0; attempt < 20 && !mine; attempt += 1) {
    const list = await jsonRequest("/api/coordinator/problems", { headers: authHeaders(coordinatorToken) });
    assert.equal(list.response.status, 200);
    assert.equal(list.body.days, 7);
    mine = list.body.problems.find((row) => row.label === "Test crash report") ?? null;
    if (!mine) await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.ok(mine, "the crash is in the coordinator's list");
  assert.deepEqual([mine.source, mine.route, mine.detail], ["browser", "/test", "test"]);
  assert.ok(mine.times >= 1);
  assert.deepEqual(Object.keys(mine).sort(), ["detail", "first_seen", "id", "label", "last_seen", "route", "source", "times"], "no stack and nothing about who");
});

test("a time-in recorded with no connection: checked like the other offline steps, one per day, sent twice counts once, and verified only knowingly", async (t) => {
  const path = "/api/attendance/offline-time-in";
  const stamp = (minutesAgo, id = `offline-in-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`) => ({
    occurred_at: new Date(Date.now() - minutesAgo * 60_000).toISOString(),
    client_request_id: id,
  });
  // Students only, and only with both the time and the request id.
  assert.equal((await jsonRequest(path, { method: "POST" })).response.status, 401);
  assert.equal((await jsonRequest(path, jsonBody(coordinatorToken, "POST", stamp(5)))).response.status, 403);
  assert.equal((await jsonRequest(path, jsonBody((await supervisorSession()).token, "POST", stamp(5)))).response.status, 403);
  assert.equal((await jsonRequest(path, jsonBody(studentToken, "POST", {}))).response.status, 400);
  assert.equal((await jsonRequest(path, jsonBody(studentToken, "POST", { occurred_at: new Date().toISOString() }))).response.status, 400);
  // The phone's time is not believed blindly: not ahead of the server, not older than the limit.
  const ahead = await jsonRequest(path, jsonBody(studentToken, "POST", stamp(-30)));
  assert.equal(ahead.response.status, 400);
  assert.match(ahead.body.message, /in the future/);
  const old = await jsonRequest(path, jsonBody(studentToken, "POST", stamp(13 * 60)));
  assert.equal(old.response.status, 409);
  assert.match(old.body.message, /This time-in was recorded more than 12 hours ago/);

  if (needsWrites(t)) return;
  // A student of the demo supervisor with no log on any day, made for this test.
  const bcrypt = require("bcryptjs");
  const pool = localTestPool();
  const supervisor = await supervisorSession();
  const sid = `OFF-IN-${Date.now()}`;
  const email = `${sid.toLowerCase()}@offline.test`;
  try {
    await pool.query(
      `INSERT INTO students (student_id, email, password, name, is_active, supervisor_id) VALUES ($1, $2, $3, 'Offline Timein', TRUE, $4)`,
      [sid, email, await bcrypt.hash("OfflineTest123!", 4), supervisor.supervisor.supervisor_id]
    );
    const mine = await login("student", email, "OfflineTest123!");
    const send = (body) => jsonRequest(path, jsonBody(mine.token, "POST", body));

    // RECORDED: the phone's time, the day it falls on in the Philippines, no photo, no camera check, waiting for review.
    const first = stamp(90);
    const made = await send({ ...first, note: "  Signal was down at the site.  " });
    assert.equal(made.response.status, 201, JSON.stringify(made.body));
    const log = made.body.attendance;
    assert.deepEqual(
      [log.status, log.image_url, log.capture_method, log.recorded_offline, log.offline_time_in, log.note, log.time_out],
      ["Pending", null, null, true, true, "Signal was down at the site.", null]
    );
    const stored = (await pool.query(
      `SELECT EXTRACT(EPOCH FROM time_in AT TIME ZONE 'Asia/Manila') * 1000 AS at,
              TO_CHAR(date, 'YYYY-MM-DD') AS day,
              TO_CHAR(($2::timestamptz AT TIME ZONE 'Asia/Manila')::date, 'YYYY-MM-DD') AS expected
       FROM attendance WHERE id = $1`,
      [log.id, first.occurred_at]
    )).rows[0];
    assert.ok(Math.abs(Number(stored.at) - new Date(first.occurred_at).getTime()) < 1000, "the time kept is the moment the phone recorded");
    assert.equal(stored.day, stored.expected, "the log belongs to the Philippine day of that moment");
    assert.equal(log.date, stored.day);

    // SENT AGAIN (the answer never reached the phone): the same log, not a second one.
    const again = await send(first);
    assert.deepEqual([again.response.status, again.body.attendance.id, again.body.replayed], [200, log.id, true]);
    // ANOTHER time-in for the same day: refused, with the day's log so the phone can attach its later steps to it.
    const second = await send(stamp(30));
    assert.deepEqual([second.response.status, second.body.code, second.body.attendance.id], [409, "DAY_HAS_LOG", log.id]);
    assert.equal((await pool.query(`SELECT COUNT(*)::int AS n FROM attendance WHERE student_id = $1`, [sid])).rows[0].n, 1);
    // Two at once for a day with no log yet would be the same race; the day's unique index decides it.

    // THE STUDENT sees it marked, and so does the supervisor, who is told there is no photo.
    const own = await jsonRequest(`/api/attendance/${sid}`, { headers: authHeaders(mine.token) });
    assert.equal(own.body.attendance.find((row) => row.id === log.id).offline_time_in, true);
    const told = await pool.query(
      `SELECT message FROM notifications WHERE supervisor_id = $1 AND title = 'Time-in recorded without a connection' AND message LIKE $2`,
      [supervisor.supervisor.supervisor_id, "Offline Timein%"]
    );
    assert.equal(told.rows.length, 1, "told once, not again for the resend or the refused second time-in");
    assert.match(told.rows[0].message, /There is no photo and no camera check/);

    // THE LATER STEPS of the day attach to it, offline or not, and must come after the time-in.
    const before = await jsonRequest(`/api/attendance/${log.id}/time-out`, jsonBody(mine.token, "PUT", { ...stamp(120), accomplishments: "Filed the day's records." }));
    assert.equal(before.response.status, 409, "a time-out before the time-in is refused");
    const out = await jsonRequest(`/api/attendance/${log.id}/time-out`, jsonBody(mine.token, "PUT", { ...stamp(1), accomplishments: "Filed the day's records." }));
    assert.equal(out.response.status, 200, JSON.stringify(out.body));

    // VERIFYING: not in a batch and not without saying so; then it counts.
    const blind = await jsonRequest(`/api/attendance/${log.id}/status`, jsonBody(supervisor.token, "PATCH", { status: "Verified", expected_status: "Pending" }));
    assert.deepEqual([blind.response.status, blind.body.code], [409, "CONFIRM_OFFLINE_TIME_IN"]);
    assert.equal((await pool.query(`SELECT status FROM attendance WHERE id = $1`, [log.id])).rows[0].status, "Pending");
    const knowing = await jsonRequest(`/api/attendance/${log.id}/status`, jsonBody(supervisor.token, "PATCH", { status: "Verified", expected_status: "Pending", confirm_offline_time_in: true }));
    assert.equal(knowing.response.status, 200, JSON.stringify(knowing.body));
    assert.equal((await pool.query(`SELECT status FROM attendance WHERE id = $1`, [log.id])).rows[0].status, "Verified");
    // Rejecting never needed the confirmation: saying no to a log with no photo is always allowed.
    const no = await jsonRequest(`/api/attendance/${log.id}/status`, jsonBody(supervisor.token, "PATCH", { status: "Rejected", reason: "Was not on site.", expected_status: "Verified" }));
    assert.equal(no.response.status, 200, JSON.stringify(no.body));
  } finally {
    await pool.query(`DELETE FROM notifications WHERE student_id = $1 OR message LIKE 'Offline Timein%'`, [sid]);
    await pool.query(`DELETE FROM attendance WHERE student_id = $1`, [sid]);
    await pool.query(`DELETE FROM audit_log WHERE entity_id = $1`, [sid]);
    await pool.query(`DELETE FROM students WHERE student_id = $1`, [sid]);
    await pool.end();
  }
});

test("pictures on an entry: added by whoever wrote it, seen by whoever may see it, at most three, checked by their bytes, and never deleted", async (t) => {
  require("tsx/cjs");
  const { pictureKind, isAuthor, maySee } = require("../src/routes/attachments.ts");
  // WHAT COUNTS AS A PICTURE is decided by its first bytes, not its name.
  const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from("a small jpeg body")]);
  const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from("png body")]);
  const webp = Buffer.concat([Buffer.from("RIFF"), Buffer.from([1, 0, 0, 0]), Buffer.from("WEBPVP8 ")]);
  assert.deepEqual([pictureKind(jpeg).mime, pictureKind(png).mime, pictureKind(webp).mime], ["image/jpeg", "image/png", "image/webp"]);
  assert.equal(pictureKind(Buffer.from("%PDF-1.4")), null);
  assert.equal(pictureKind(Buffer.from("<svg onload=alert(1)>")), null);
  // WHO: a concern is never shown to the student's supervisor, who may be its subject.
  const entry = { studentId: "S1", filedBySupervisor: null, supervisorOfStudent: "SUP1", open: true };
  const student1 = { role: "student", id: "S1" }, theirSupervisor = { role: "supervisor", id: "SUP1" }, coordinatorAuth = { role: "coordinator", id: "C1" };
  assert.deepEqual(["attendance", "journal", "complaint"].map((type) => maySee(type, entry, theirSupervisor)), [true, true, false]);
  assert.deepEqual(["attendance", "journal", "complaint"].map((type) => maySee(type, entry, student1)), [true, true, true]);
  assert.equal(maySee("complaint", entry, coordinatorAuth), true);
  assert.equal(maySee("attendance", entry, { role: "student", id: "S2" }), false);
  assert.equal(isAuthor("attendance", entry, theirSupervisor), false, "a supervisor adds nothing to an intern's log");
  const filed = { studentId: "S1", filedBySupervisor: "SUP1", supervisorOfStudent: "SUP1", open: true };
  assert.equal(isAuthor("complaint", filed, theirSupervisor), true);
  assert.equal(isAuthor("complaint", filed, student1), false, "a concern a supervisor filed about a student is not the student's");

  assert.equal((await jsonRequest("/api/attachments?owner_type=attendance&owner_id=1")).response.status, 401);
  assert.equal((await jsonRequest("/api/attachments/1/file")).response.status, 401);
  assert.equal((await jsonRequest("/api/attachments?owner_type=tasks&owner_id=1", { headers: authHeaders(studentToken) })).response.status, 400);
  assert.equal((await jsonRequest("/api/attachments/999999999/file", { headers: authHeaders(coordinatorToken) })).response.status, 404);

  if (needsWrites(t)) return;
  const bcrypt = require("bcryptjs");
  const pool = localTestPool();
  const supervisor = await supervisorSession();
  const sid = `PIC-${Date.now()}`;
  const email = `${sid.toLowerCase()}@pictures.test`;
  const send = async (token, fields, bytes, name = "photo.jpg", type = "image/jpeg") => {
    const form = new FormData();
    for (const [key, value] of Object.entries(fields)) form.append(key, String(value));
    if (bytes) form.append("file", new Blob([bytes], { type }), name);
    const response = await fetch(new URL("/api/attachments", apiBaseUrl), { method: "POST", headers: authHeaders(token), body: form });
    return { status: response.status, body: await response.json().catch(() => ({})) };
  };
  const list = async (token, type, id) => (await jsonRequest(`/api/attachments?owner_type=${type}&owner_id=${id}`, { headers: authHeaders(token) })).body;
  try {
    await pool.query(
      `INSERT INTO students (student_id, email, password, name, is_active, supervisor_id) VALUES ($1, $2, $3, 'Picture Student', TRUE, $4)`,
      [sid, email, await bcrypt.hash("PictureTest123!", 4), supervisor.supervisor.supervisor_id]
    );
    const mine = await login("student", email, "PictureTest123!");
    const logId = (await pool.query(`INSERT INTO attendance (student_id, date, time_in, time_out, hours, status) VALUES ($1, CURRENT_DATE - 3, NOW() - INTERVAL '3 days', NOW() - INTERVAL '3 days' + INTERVAL '8 hours', 8, 'Pending') RETURNING id`, [sid])).rows[0].id;
    const journalId = (await pool.query(`INSERT INTO journals (student_id, week_start, activities, learnings) VALUES ($1, DATE_TRUNC('week', CURRENT_DATE)::date - 7, 'Filed records for the week.', 'How the filing system works.') RETURNING id`, [sid])).rows[0].id;
    const concernId = (await pool.query(`INSERT INTO complaints (student_id, report_type, category, description) VALUES ($1, 'supervisor', 'Conduct', 'A concern for the picture test.') RETURNING id`, [sid])).rows[0].id;
    const log = { owner_type: "attendance", owner_id: logId };

    // REFUSED: no picture, not a picture, too large, someone else's entry, an entry that does not exist.
    assert.equal((await send(mine.token, log, null)).status, 400);
    const pdf = await send(mine.token, log, Buffer.from("%PDF-1.4\n%%EOF"), "really-a.jpg");
    assert.equal(pdf.status, 400);
    assert.match(pdf.body.message, /not a JPG, PNG or WebP/);
    assert.equal((await send(mine.token, log, Buffer.concat([jpeg, Buffer.alloc(4 * 1024 * 1024 + 10)]))).status, 413);
    assert.equal((await send(studentToken, log, jpeg)).status, 404, "another student's log");
    assert.equal((await send(supervisor.token, log, jpeg)).status, 404, "the supervisor adds nothing to the intern's log");
    assert.equal((await send(mine.token, { owner_type: "attendance", owner_id: 999999999 }, jpeg)).status, 404);
    assert.equal((await pool.query(`SELECT COUNT(*)::int AS n FROM attachments WHERE student_id = $1`, [sid])).rows[0].n, 0);

    // ADDED: three, each stored with what the server worked out from the bytes; the fourth is refused.
    const first = await send(mine.token, { ...log, caption: "  The shelves after sorting.  ", width: 1600, height: 1200 }, jpeg);
    assert.equal(first.status, 201, JSON.stringify(first.body));
    assert.deepEqual(
      [first.body.attachment.mime_type, first.body.attachment.size_bytes, first.body.attachment.caption, first.body.attachment.width, first.body.attachment.position],
      ["image/jpeg", jpeg.length, "The shelves after sorting.", 1600, 0]
    );
    // A PNG sent under a JPEG's name and type is stored as what it is.
    const second = await send(mine.token, log, png, "photo.jpg", "image/jpeg");
    assert.equal(second.body.attachment.mime_type, "image/png");
    const third = await send(mine.token, log, webp, "photo.webp", "image/webp");
    assert.equal(third.status, 201);
    const fourth = await send(mine.token, log, jpeg);
    assert.equal(fourth.status, 409);
    assert.match(fourth.body.message, /at most 3 pictures/);
    const stored = (await pool.query(`SELECT sha256, file_path, uploaded_by_role, uploaded_by_id FROM attachments WHERE id = $1`, [first.body.attachment.id])).rows[0];
    assert.equal(stored.sha256, require("node:crypto").createHash("sha256").update(jpeg).digest("hex"));
    assert.match(stored.file_path, /^\/uploads\/\d+-[a-f0-9]{12}\.jpg$/, "kept under a name of the store's own making");
    assert.deepEqual([stored.uploaded_by_role, stored.uploaded_by_id], ["student", sid]);

    // SEEN by the student, their supervisor and a coordinator; by no other student. Only the writer may add.
    const own = await list(mine.token, "attendance", logId);
    assert.deepEqual([own.attachments.length, own.can_add, own.max], [3, true, 3]);
    assert.equal("file_path" in own.attachments[0], false, "where the file is kept is not told");
    const forSupervisor = await list(supervisor.token, "attendance", logId);
    assert.deepEqual([forSupervisor.attachments.length, forSupervisor.can_add], [3, false]);
    assert.equal((await list(coordinatorToken, "attendance", logId)).attachments.length, 3);
    assert.deepEqual((await list(studentToken, "attendance", logId)).attachments, []);
    const fileOf = (token, id) => fetch(new URL(`/api/attachments/${id}/file`, apiBaseUrl), { headers: authHeaders(token) });
    const opened = await fileOf(supervisor.token, first.body.attachment.id);
    assert.deepEqual([opened.status, opened.headers.get("content-type"), opened.headers.get("x-content-type-options")], [200, "image/jpeg", "nosniff"]);
    assert.ok(Buffer.from(await opened.arrayBuffer()).equals(jpeg));
    assert.equal((await fileOf(studentToken, first.body.attachment.id)).status, 404);

    // A CONCERN's pictures: the student who filed it and coordinators. Not the student's supervisor.
    const onConcern = await send(mine.token, { owner_type: "complaint", owner_id: concernId }, jpeg);
    assert.equal(onConcern.status, 201, JSON.stringify(onConcern.body));
    assert.deepEqual((await list(supervisor.token, "complaint", concernId)).attachments, []);
    assert.equal((await fileOf(supervisor.token, onConcern.body.attachment.id)).status, 404);
    assert.equal((await fileOf(coordinatorToken, onConcern.body.attachment.id)).status, 200);
    // A weekly report takes them too.
    assert.equal((await send(mine.token, { owner_type: "journal", owner_id: journalId }, png, "p.png", "image/png")).status, 201);
    assert.equal((await list(supervisor.token, "journal", journalId)).attachments.length, 1);

    // A coordinator opening one is logged, against the student.
    let viewed = null;
    for (let attempt = 0; attempt < 20 && !viewed; attempt += 1) {
      const audit = await jsonRequest("/api/coordinator/audit?action=picture.view&limit=5", { headers: authHeaders(coordinatorToken) });
      viewed = audit.body.entries.find((row) => row.entity_id === sid) ?? null;
      if (!viewed) await new Promise((resolve) => setTimeout(resolve, 100));
    }
    assert.ok(viewed, "the coordinator's view is in the audit log");
    assert.equal(viewed.details.on, "complaint");

    // REMOVED: off the entry, by the writer only; the row stays.
    assert.equal((await jsonRequest(`/api/attachments/${second.body.attachment.id}`, { method: "DELETE", headers: authHeaders(supervisor.token) })).response.status, 404);
    assert.equal((await jsonRequest(`/api/attachments/${second.body.attachment.id}`, { method: "DELETE", headers: authHeaders(mine.token) })).response.status, 200);
    assert.equal((await list(mine.token, "attendance", logId)).attachments.length, 2);
    assert.equal((await fileOf(mine.token, second.body.attachment.id)).status, 404, "a removed picture is no longer served");
    assert.equal((await pool.query(`SELECT removed_at IS NOT NULL AS removed FROM attachments WHERE id = $1`, [second.body.attachment.id])).rows[0].removed, true);
    // The place it left can be used again.
    assert.equal((await send(mine.token, log, jpeg)).status, 201);

    // ONCE THE ENTRY IS DECIDED nothing is added or taken away, and what is there is still seen.
    await pool.query(`UPDATE attendance SET status = 'Verified' WHERE id = $1`, [logId]);
    assert.equal((await send(mine.token, log, jpeg)).status, 409);
    assert.equal((await jsonRequest(`/api/attachments/${first.body.attachment.id}`, { method: "DELETE", headers: authHeaders(mine.token) })).response.status, 409);
    const after = await list(mine.token, "attendance", logId);
    assert.deepEqual([after.attachments.length, after.can_add], [3, false]);

    // The student's data download lists their pictures, removed ones too, and never where they are kept.
    const download = await jsonRequest(`/api/students/${sid}/data-export`, { headers: authHeaders(mine.token) });
    assert.equal(download.body.pictures.length, 6);
    assert.equal(JSON.stringify(download.body.pictures).includes("/uploads/"), false);
  } finally {
    await pool.query(`DELETE FROM attachments WHERE student_id = $1`, [sid]);
    await pool.query(`DELETE FROM audit_log WHERE entity_id = $1`, [sid]);
    await pool.query(`DELETE FROM complaints WHERE student_id = $1`, [sid]);
    await pool.query(`DELETE FROM journals WHERE student_id = $1`, [sid]);
    await pool.query(`DELETE FROM attendance WHERE student_id = $1`, [sid]);
    await pool.query(`DELETE FROM notifications WHERE student_id = $1`, [sid]);
    await pool.query(`DELETE FROM students WHERE student_id = $1`, [sid]);
    await pool.end();
  }
});

test("the phone's clock gap: worked out from the clock it sends, kept per offline step, the largest kept on the log, and shown to the supervisor", async (t) => {
  require("tsx/cjs");
  const { readClockSkew } = require("../src/services/offlineActions.ts");
  const now = new Date("2026-10-16T02:00:00Z");
  assert.equal(readClockSkew({ client_sent_at: "2026-10-16T02:07:00Z" }, now), 420, "seven minutes ahead");
  assert.equal(readClockSkew({ client_sent_at: "2026-10-16T09:53:00+08:00" }, now), -420, "seven minutes behind, written in Philippine time");
  assert.equal(readClockSkew({ client_sent_at: "2026-10-16T02:00:00.400Z" }, now), 0);
  for (const unusable of [{}, { client_sent_at: "" }, { client_sent_at: "2026-10-16 02:00" }, { client_sent_at: "2026-10-16T02:00:00" }, { client_sent_at: 1760580000000 }, { client_sent_at: "2026-13-40T99:99:99Z" }, { client_sent_at: "2099-01-01T00:00:00Z" }, null]) {
    assert.equal(readClockSkew(unusable, now), null, JSON.stringify(unusable));
  }

  if (needsWrites(t)) return;
  const bcrypt = require("bcryptjs");
  const pool = localTestPool();
  const supervisor = await supervisorSession();
  const sid = `SKEW-${Date.now()}`;
  const email = `${sid.toLowerCase()}@skew.test`;
  // A phone whose clock runs seven minutes slow: every time it gives is seven minutes early.
  const slow = (minutesAgo) => new Date(Date.now() - (minutesAgo + 7) * 60_000).toISOString();
  try {
    await pool.query(
      `INSERT INTO students (student_id, email, password, name, is_active, supervisor_id) VALUES ($1, $2, $3, 'Clock Gap', TRUE, $4)`,
      [sid, email, await bcrypt.hash("SkewTest123!", 4), supervisor.supervisor.supervisor_id]
    );
    const mine = await login("student", email, "SkewTest123!");
    const started = await jsonRequest("/api/attendance/offline-time-in", jsonBody(mine.token, "POST", {
      occurred_at: slow(120), client_request_id: `skew-in-${Date.now()}`, client_sent_at: slow(0),
    }));
    assert.equal(started.response.status, 201, JSON.stringify(started.body));
    const logId = started.body.attendance.id;
    const gapOf = async () => (await pool.query(`SELECT clock_skew_seconds FROM attendance WHERE id = $1`, [logId])).rows[0].clock_skew_seconds;
    assert.ok(Math.abs((await gapOf()) + 420) <= 5, `about -420 seconds, got ${await gapOf()}`);

    // A step from an older copy of the app, which does not send its clock: recorded, gap left as it was.
    const lunch = await jsonRequest(`/api/attendance/${logId}/break`, jsonBody(mine.token, "PUT", { occurred_at: slow(60), client_request_id: `skew-lunch-${Date.now()}` }));
    assert.equal(lunch.response.status, 200, JSON.stringify(lunch.body));
    const lunchRow = (await pool.query(`SELECT clock_skew_seconds FROM offline_action_ledger WHERE attendance_id = $1 AND action = 'break'`, [logId])).rows[0];
    assert.equal(lunchRow.clock_skew_seconds, null, "not measured, not zero");
    assert.ok(Math.abs((await gapOf()) + 420) <= 5);

    // A step from a phone whose clock is now further out: that step keeps its own gap, and the log keeps the larger one.
    const later = await jsonRequest(`/api/attendance/${logId}/break-end`, jsonBody(mine.token, "PUT", {
      occurred_at: new Date(Date.now() - 30 * 60_000).toISOString(), client_request_id: `skew-back-${Date.now()}`,
      client_sent_at: new Date(Date.now() - 15 * 60_000).toISOString(),
    }));
    assert.equal(later.response.status, 200, JSON.stringify(later.body));
    const backRow = (await pool.query(`SELECT clock_skew_seconds FROM offline_action_ledger WHERE attendance_id = $1 AND action = 'break-end'`, [logId])).rows[0];
    assert.ok(Math.abs(backRow.clock_skew_seconds + 900) <= 5, `about -900, got ${backRow.clock_skew_seconds}`);
    assert.ok(Math.abs((await gapOf()) + 900) <= 5, "the larger gap is the one kept on the log");

    // A live step (no offline fields) never touches it.
    const out = await jsonRequest(`/api/attendance/${logId}/time-out`, jsonBody(mine.token, "PUT", { accomplishments: "Sorted the files for the audit." }));
    assert.equal(out.response.status, 200, JSON.stringify(out.body));
    assert.ok(Math.abs((await gapOf()) + 900) <= 5);

    // The supervisor's list carries it, for the review card.
    const list = await jsonRequest(`/api/supervisor/attendance/${encodeURIComponent(supervisor.supervisor.supervisor_id)}`, { headers: authHeaders(supervisor.token) });
    assert.equal(list.response.status, 200);
    const rows = list.body.attendance ?? list.body.logs ?? list.body;
    const row = (Array.isArray(rows) ? rows : []).find((item) => item.id === logId);
    assert.ok(row, "the log is in the supervisor's list");
    assert.ok(Math.abs(row.clock_skew_seconds + 900) <= 5);
  } finally {
    await pool.query(`DELETE FROM offline_action_ledger WHERE student_id = $1`, [sid]);
    await pool.query(`DELETE FROM notifications WHERE student_id = $1 OR message LIKE 'Clock Gap%'`, [sid]);
    await pool.query(`DELETE FROM attendance WHERE student_id = $1`, [sid]);
    await pool.query(`DELETE FROM students WHERE student_id = $1`, [sid]);
    await pool.end();
  }
});

test("old time-in photos are removed each night at 02:30 when retention is set: once, under a lock, logs kept, last run on the status card", async (t) => {
  if (needsWrites(t)) return;
  require("tsx/cjs");
  const { runPhotoPurgeIfDue } = require("../src/services/photoPurge.ts");
  const { Pool } = require("pg");
  const pool = new Pool({ connectionString: process.env.DATABASE_PUBLIC_URL, options: "-c timezone=Asia/Manila" });
  const env = { PHOTO_RETENTION_DAYS: "30" };
  // 10:00 in the Philippines on a date of its own, so earlier runs of the suite are not in the way.
  const day = new Date(Date.UTC(2091, 0, 1 + (Date.now() % 3000)));
  const at = (time) => new Date(`${day.toISOString().slice(0, 10)}T${time}:00+08:00`);
  const sid = `PURGE-${Date.now()}`;
  const removed = [];
  const removeFile = async (name) => { removed.push(name); };
  try {
    await pool.query(`INSERT INTO students (student_id, email, password, name, is_active) VALUES ($1, $2, 'x', 'Purge Check', TRUE)`, [sid, `${sid.toLowerCase()}@purge.test`]);
    const log = async (daysAgo, status, file) => (await pool.query(
      `INSERT INTO attendance (student_id, date, time_in, time_out, hours, status, image_url)
       VALUES ($1, CURRENT_DATE - $2::int, NOW() - make_interval(days => $2), NOW() - make_interval(days => $2) + INTERVAL '8 hours', 8, $3, $4) RETURNING id`,
      [sid, daysAgo, status, `/uploads/${file}`]
    )).rows[0].id;
    const old = await log(45, "Verified", "1700000000000-aaaaaaaaaaa1.jpg");
    const oldRejected = await log(40, "Rejected", "1700000000000-aaaaaaaaaaa2.jpg");
    const oldWaiting = await log(50, "Pending", "1700000000000-aaaaaaaaaaa3.jpg");
    const recent = await log(10, "Verified", "1700000000000-aaaaaaaaaaa4.jpg");
    const imageOf = async (id) => (await pool.query(`SELECT image_url FROM attendance WHERE id = $1`, [id])).rows[0].image_url;

    // Off without the setting, and before 02:30.
    assert.equal(await runPhotoPurgeIfDue(pool, { now: at("10:00"), env: {}, removeFile }), null);
    assert.equal(await runPhotoPurgeIfDue(pool, { now: at("02:29"), env, removeFile }), null);
    assert.deepEqual(removed, []);

    // Two servers checking at the same moment: one run.
    const both = await Promise.all([
      runPhotoPurgeIfDue(pool, { now: at("02:31"), env, removeFile }),
      runPhotoPurgeIfDue(pool, { now: at("02:31"), env, removeFile }),
    ]);
    const runs = both.filter(Boolean);
    assert.equal(runs.length, 1, "only one of them ran");
    assert.ok(runs[0].removed >= 2);
    for (const id of [old, oldRejected]) assert.equal(await imageOf(id), null, "an old decided photo is removed");
    assert.match(await imageOf(oldWaiting), /aaaaaaaaaaa3/, "a photo still waiting for review is kept");
    assert.match(await imageOf(recent), /aaaaaaaaaaa4/, "a recent photo is kept");
    assert.ok(removed.includes("1700000000000-aaaaaaaaaaa1.jpg"));
    assert.equal((await pool.query(`SELECT COUNT(*)::int AS n FROM attendance WHERE student_id = $1`, [sid])).rows[0].n, 4, "the logs themselves are kept");
    // Later the same night: already done.
    assert.equal(await runPhotoPurgeIfDue(pool, { now: at("23:00"), env, removeFile }), null);
    const recorded = await pool.query(`SELECT retention_days, by_hand FROM photo_purge_runs WHERE ran_on = $1::date`, [day.toISOString().slice(0, 10)]);
    assert.deepEqual(recorded.rows, [{ retention_days: 30, by_hand: false }]);

    // The coordinator's status card names the last run.
    const status = await jsonRequest("/api/coordinator/system-status", { headers: authHeaders(coordinatorToken) });
    assert.equal(status.body.privacy.photo_purge_time, "02:30");
    assert.ok(status.body.privacy.last_photo_purge, "a run is shown");
    assert.equal(typeof status.body.privacy.last_photo_purge.removed, "number");
  } finally {
    await pool.query(`DELETE FROM photo_purge_runs WHERE ran_on = $1::date`, [day.toISOString().slice(0, 10)]);
    await pool.query(`DELETE FROM attendance WHERE student_id = $1`, [sid]);
    await pool.query(`DELETE FROM students WHERE student_id = $1`, [sid]);
    await pool.end();
  }
});

test("camera details and GPS tags are taken out of every uploaded image, the picture itself untouched", async (t) => {
  require("tsx/cjs");
  const { stripImageMetadata } = require("../src/services/imageMetadata.ts");
  const { jpegWithGps, pngWithGps, webpWithGps } = require("./fixtures/gps-images.cjs");
  const clean = (buffer, secrets) => secrets.every((secret) => !buffer.includes(Buffer.from(secret, "latin1")));

  const jpeg = jpegWithGps();
  assert.equal(clean(jpeg.file, jpeg.secrets), false, "the fixture really carries them");
  const jpegOut = stripImageMetadata(jpeg.file);
  assert.ok(jpegOut.equals(jpeg.kept), "only APP1 and APP13 go; JFIF, the tables and the picture are copied as they were");
  assert.ok(clean(jpegOut, jpeg.secrets));

  const png = pngWithGps();
  const pngOut = stripImageMetadata(png.file);
  assert.ok(pngOut.equals(png.kept), "eXIf, tEXt and iTXt go; IHDR, IDAT and IEND stay with their checksums");
  assert.ok(clean(pngOut, png.secrets));

  const webp = webpWithGps();
  const webpOut = stripImageMetadata(webp.file);
  assert.ok(clean(webpOut, webp.secrets));
  assert.ok(webpOut.includes(Buffer.from("/PICTURE-DATA-UNCHANGED")));
  assert.equal(webpOut.readUInt32LE(4), webpOut.length - 8, "the RIFF size is right after the chunks go");
  const flags = webpOut[webpOut.indexOf(Buffer.from("VP8X")) + 8];
  assert.equal(flags & 0x0c, 0, "the header no longer says EXIF or XMP follow");

  // Anything else, or a file cut short, comes back as it was.
  for (const other of [Buffer.from("%PDF-1.4\n%%EOF"), Buffer.from([0x50, 0x4b, 0x03, 0x04, 1, 2]), jpeg.file.subarray(0, 40), Buffer.alloc(0)]) {
    assert.ok(stripImageMetadata(other).equals(other));
  }

  if (needsWrites(t)) return;
  // THROUGH THE API: a document, a concern's evidence and a picture are each stored clean.
  const pool = localTestPool();
  const sid = student.student_id;
  const form = (fields, name, bytes, type) => {
    const body = new FormData();
    for (const [key, value] of Object.entries(fields)) body.append(key, String(value));
    body.append(name.field, new Blob([bytes], { type }), name.file);
    return body;
  };
  const created = { documents: [], complaints: [], attendance: [] };
  try {
    const requirement = (await pool.query(`SELECT name FROM ojt_requirements WHERE is_active AND due_rule IS DISTINCT FROM 'weekly' ORDER BY sort_order DESC LIMIT 1`)).rows[0].name;
    await pool.query(`DELETE FROM documents WHERE student_id = $1 AND doc_type = $2 AND status = 'Pending'`, [sid, requirement]);
    const uploaded = await fetch(new URL("/api/documents", apiBaseUrl), { method: "POST", headers: authHeaders(studentToken), body: form({ doc_type: requirement }, { field: "file", file: "scan.jpg" }, jpeg.file, "image/jpeg") });
    const document = await uploaded.json();
    assert.equal(uploaded.status, 201, JSON.stringify(document));
    const documentId = document.document?.id ?? document.id;
    created.documents.push(documentId);
    const stored = Buffer.from(await (await fetch(new URL(`/api/documents/${documentId}/file`, apiBaseUrl), { headers: authHeaders(studentToken) })).arrayBuffer());
    assert.ok(stored.equals(jpeg.kept), "the stored document is the picture without its camera details");

    const concern = await fetch(new URL("/api/complaints", apiBaseUrl), {
      method: "POST",
      headers: authHeaders(studentToken),
      body: form({ student_id: sid, report_type: "supervisor", supervisor_name: "Demo Supervisor", company_name: "Demo Company", category: "Workplace safety", description: "A photo of the broken lock, taken this morning." }, { field: "evidence", file: "lock.png" }, png.file, "image/png"),
    });
    const filed = await concern.json();
    assert.equal(concern.status, 201, JSON.stringify(filed));
    const concernRow = (await pool.query(`SELECT id, evidence_url FROM complaints WHERE student_id = $1 ORDER BY id DESC LIMIT 1`, [sid])).rows[0];
    created.complaints.push(concernRow.id);
    // Read from the folder itself: the store module may already be loaded,
    // by the bucket test, pointing at a folder of its own.
    if (process.env.PRIVATE_UPLOAD_DIR) {
      const evidence = fs.readFileSync(nodePath.join(process.env.PRIVATE_UPLOAD_DIR, concernRow.evidence_url.replace(/^\/uploads\//, "")));
      assert.ok(evidence.equals(png.kept), "the stored evidence is the picture without its camera details");
    }

    // A picture on a log (the app redraws it; this is the server covering a client that did not).
    const logId = (await pool.query(`INSERT INTO attendance (student_id, date, time_in, status) VALUES ($1, CURRENT_DATE - 400, NOW() - INTERVAL '400 days', 'Pending') RETURNING id`, [sid])).rows[0].id;
    created.attendance.push(logId);
    const picture = await fetch(new URL("/api/attachments", apiBaseUrl), { method: "POST", headers: authHeaders(studentToken), body: form({ owner_type: "attendance", owner_id: logId }, { field: "file", file: "p.webp" }, webp.file, "image/webp") });
    const added = await picture.json();
    assert.equal(picture.status, 201, JSON.stringify(added));
    const pictureBytes = Buffer.from(await (await fetch(new URL(`/api/attachments/${added.attachment.id}/file`, apiBaseUrl), { headers: authHeaders(studentToken) })).arrayBuffer());
    assert.ok(clean(pictureBytes, webp.secrets));
    assert.equal(added.attachment.size_bytes, pictureBytes.length, "the size recorded is the cleaned file's");
  } finally {
    if (created.attendance.length) await pool.query(`DELETE FROM attachments WHERE owner_type = 'attendance' AND owner_id = ANY($1::int[])`, [created.attendance]);
    if (created.attendance.length) await pool.query(`DELETE FROM attendance WHERE id = ANY($1::int[])`, [created.attendance]);
    if (created.documents.length) await pool.query(`DELETE FROM documents WHERE id = ANY($1::int[])`, [created.documents]);
    if (created.complaints.length) await pool.query(`DELETE FROM complaints WHERE id = ANY($1::int[])`, [created.complaints]);
    await pool.end();
  }
});

test("uploads are counted per account: refused with a plain sentence past the room or the day's files, counted only when stored", async (t) => {
  require("tsx/cjs");
  const { quotaLimits, quotaProblem } = require("../src/services/uploadQuota.ts");
  const MB = 1024 * 1024;
  assert.deepEqual(quotaLimits("student", {}), { bytes: 300 * MB, dailyFiles: 60 });
  assert.deepEqual(quotaLimits("supervisor", {}), { bytes: 200 * MB, dailyFiles: 60 });
  assert.deepEqual(quotaLimits("student", { UPLOAD_QUOTA_MB_STUDENT: "50", UPLOAD_DAILY_FILES: "5" }), { bytes: 50 * MB, dailyFiles: 5 });
  for (const ignored of ["0", "-3", "1.5", "lots", ""]) assert.equal(quotaLimits("supervisor", { UPLOAD_QUOTA_MB_SUPERVISOR: ignored }).bytes, 200 * MB, ignored);
  const usage = (used, today) => ({ used_bytes: used, files_today: today, quota_bytes: 300 * MB, daily_files: 60 });
  assert.equal(quotaProblem(usage(0, 0), 5 * MB), null);
  assert.equal(quotaProblem(usage(300 * MB - 5 * MB, 0), 5 * MB), null, "exactly full is allowed");
  assert.match(quotaProblem(usage(300 * MB - 5 * MB, 0), 5 * MB + 1), /past the 300 MB each account may keep/);
  assert.match(quotaProblem(usage(0, 60), 1), /uploaded 60 files today/);

  // The coordinator's view, coordinators only.
  const path = `/api/coordinator/students/${encodeURIComponent(student.student_id)}/upload-usage`;
  assert.equal((await jsonRequest(path)).response.status, 401);
  assert.equal((await jsonRequest(path, { headers: authHeaders(studentToken) })).response.status, 403);
  assert.equal((await jsonRequest("/api/coordinator/students/NO-SUCH-STUDENT/upload-usage", { headers: authHeaders(coordinatorToken) })).response.status, 404);
  const seen = await jsonRequest(path, { headers: authHeaders(coordinatorToken) });
  assert.equal(seen.response.status, 200);
  assert.deepEqual(Object.keys(seen.body).sort(), ["daily_files", "files_today", "quota_bytes", "used_bytes"]);

  if (needsWrites(t)) return;
  const bcrypt = require("bcryptjs");
  const pool = localTestPool();
  const sid = `QUOTA-${Date.now()}`;
  const email = `${sid.toLowerCase()}@quota.test`;
  const requirement = (await pool.query(`SELECT name FROM ojt_requirements WHERE is_active AND due_rule IS DISTINCT FROM 'weekly' ORDER BY sort_order LIMIT 1`)).rows[0].name;
  const pdf = Buffer.from("%PDF-1.4\n%%EOF\n");
  try {
    const supervisor = await supervisorSession();
    // A document needs a supervisor to go to.
    await pool.query(`INSERT INTO students (student_id, email, password, name, is_active, supervisor_id) VALUES ($1, $2, $3, 'Quota Check', TRUE, $4)`, [sid, email, await bcrypt.hash("QuotaTest123!", 4), supervisor.supervisor.supervisor_id]);
    const mine = await login("student", email, "QuotaTest123!");
    const upload = async () => {
      const form = new FormData();
      form.append("doc_type", requirement);
      form.append("file", new Blob([pdf], { type: "application/pdf" }), "endorsement.pdf");
      const response = await fetch(new URL("/api/documents", apiBaseUrl), { method: "POST", headers: authHeaders(mine.token), body: form });
      return { status: response.status, body: await response.json().catch(() => ({})) };
    };
    const ledger = async () => (await pool.query(`SELECT kind, bytes, source FROM upload_ledger WHERE account_id = $1 ORDER BY id`, [sid])).rows;

    // Stored, and counted once, under the document's own id.
    const first = await upload();
    assert.equal(first.status, 201, JSON.stringify(first.body));
    assert.deepEqual((await ledger()).map((row) => [row.kind, Number(row.bytes), row.source]), [["document", pdf.length, "documents"]]);

    // Past the room: 413, a plain sentence, and nothing stored or counted.
    await pool.query(`DELETE FROM documents WHERE student_id = $1`, [sid]);
    await pool.query(`INSERT INTO upload_ledger (role, account_id, kind, bytes, created_at) VALUES ('student', $1, 'document', $2, NOW() - INTERVAL '3 days')`, [sid, 300 * MB - 4]);
    const full = await upload();
    assert.equal(full.status, 413);
    assert.equal(full.body.code, "UPLOAD_QUOTA");
    assert.match(full.body.message, /300 MB each account may keep/);
    assert.equal((await pool.query(`SELECT COUNT(*)::int AS n FROM documents WHERE student_id = $1`, [sid])).rows[0].n, 0);
    assert.equal((await ledger()).length, 2, "a refused upload is not counted");

    // Past the day's files: 413 and a sentence that says to try tomorrow.
    await pool.query(`DELETE FROM upload_ledger WHERE account_id = $1`, [sid]);
    await pool.query(`INSERT INTO upload_ledger (role, account_id, kind, bytes) SELECT 'student', $1, 'evidence', 10 FROM generate_series(1, 60)`, [sid]);
    const busy = await upload();
    assert.equal(busy.status, 413);
    assert.match(busy.body.message, /60 files today/);

    // The coordinator sees it.
    const view = await jsonRequest(`/api/coordinator/students/${sid}/upload-usage`, { headers: authHeaders(coordinatorToken) });
    assert.deepEqual([view.body.files_today, view.body.used_bytes], [60, 600]);
  } finally {
    await pool.query(`DELETE FROM upload_ledger WHERE account_id = $1`, [sid]);
    await pool.query(`DELETE FROM notifications WHERE student_id = $1`, [sid]);
    await pool.query(`DELETE FROM documents WHERE student_id = $1`, [sid]);
    await pool.query(`DELETE FROM students WHERE student_id = $1`, [sid]);
    await pool.end();
  }
});

/*
|--------------------------------------------------------------------------
| Iteration 1: ids, Philippine time, and a test for every route
|--------------------------------------------------------------------------
*/

test("ids are compared one way, as trimmed text where an empty id names nothing, on both sides (M2)", () => {
  require("tsx/cjs");
  const server = require("../src/services/ids.ts");
  const app = require("../../my-pwa/src/lib/ids.ts");
  for (const { sameId, cleanId } of [server, app]) {
    assert.equal(sameId("DEMO-STU-0001", " DEMO-STU-0001 "), true);
    assert.equal(sameId(12, "12"), true, "a numeric id and the picker's text");
    assert.equal(sameId("DEMO-STU-0001", "DEMO-STU-0002"), false);
    assert.equal(sameId("abc", "ABC"), false, "ids keep their capitals");
    for (const [left, right] of [["", ""], [null, null], [undefined, ""], ["  ", " "]]) {
      assert.equal(sameId(left, right), false, `${JSON.stringify(left)} and ${JSON.stringify(right)} name nothing`);
    }
    assert.equal(cleanId("  STU-1 "), "STU-1");
    assert.equal(cleanId(null), "");
  }
  assert.equal(server.sqlSameId("s.supervisor_id", "$1"), "TRIM(s.supervisor_id::text) = TRIM($1::text)");
});

test("ids a coordinator types are saved without outer spaces, so a plain comparison finds them (M2)", async (t) => {
  if (needsWrites(t)) return;
  const pool = localTestPool();
  const supervisor = await supervisorSession();
  const stamp = Date.now();
  const sid = `TRIM-${stamp}`;
  const supId = `TRIMSUP-${stamp}`;
  try {
    const made = await jsonRequest("/api/coordinator/students", jsonBody(coordinatorToken, "POST", {
      student_id: `  ${sid} `,
      email: `${sid.toLowerCase()}@trim.test`,
      password: "TrimTest123!",
      name: "Trim Check",
      supervisor_id: ` ${supervisor.supervisor.supervisor_id}  `,
    }));
    assert.equal(made.response.status, 201, JSON.stringify(made.body));
    const supMade = await jsonRequest("/api/coordinator/supervisors", jsonBody(coordinatorToken, "POST", {
      supervisor_id: ` ${supId} `,
      email: `${supId.toLowerCase()}@trim.test`,
      password: "TrimTest123!",
      name: "Trim Supervisor",
    }));
    assert.equal(supMade.response.status, 201, JSON.stringify(supMade.body));
    const stored = (await pool.query(`SELECT student_id, supervisor_id FROM students WHERE student_id = $1`, [sid])).rows[0];
    assert.deepEqual(stored, { student_id: sid, supervisor_id: supervisor.supervisor.supervisor_id });
    assert.equal((await pool.query(`SELECT 1 FROM supervisors WHERE supervisor_id = $1`, [supId])).rows.length, 1);

    // An edit that names the supervisor with spaces keeps the same one, and announces no change.
    const edited = await jsonRequest(`/api/coordinator/students/${sid}`, jsonBody(coordinatorToken, "PUT", { supervisor_id: `${supervisor.supervisor.supervisor_id} ` }));
    assert.equal(edited.response.status, 200, JSON.stringify(edited.body));
    assert.equal(edited.body.student.supervisor_id, supervisor.supervisor.supervisor_id);
    const announced = await pool.query(`SELECT COUNT(*)::int AS n FROM notifications WHERE student_id = $1 AND title = 'Supervisor assigned'`, [sid]);
    assert.equal(announced.rows[0].n, 1, "only the first assignment is announced");
  } finally {
    await pool.query(`DELETE FROM notifications WHERE student_id = $1 OR supervisor_id = $2 OR message LIKE '%Trim Check%'`, [sid, supId]);
    await pool.query(`DELETE FROM students WHERE student_id = $1`, [sid]);
    await pool.query(`DELETE FROM supervisors WHERE supervisor_id = $1`, [supId]);
    await pool.end();
  }
});

test("Philippine time comes from one module, and its SQL reads the same on a UTC connection (M3)", async () => {
  require("tsx/cjs");
  const ph = require("../src/services/phTime.ts");
  // 16:30 UTC on the 16th is half past midnight on Saturday the 17th in Manila.
  assert.deepEqual(ph.phClock(new Date("2026-10-16T16:30:00Z")), { date: "2026-10-17", time: "00:30", weekday: 6 });
  assert.equal(ph.phToday(new Date("2026-10-16T15:59:00Z")), "2026-10-16");
  assert.equal(ph.phMoment("2026-10-17", "08:00").toISOString(), "2026-10-17T00:00:00.000Z");
  assert.equal(ph.PH_PG_OPTIONS, "-c timezone=Asia/Manila");

  const { Client } = require("pg");
  const url = new URL(process.env.DATABASE_PUBLIC_URL || "");
  assert.ok(allowedLocalHosts.has(url.hostname), "direct database tests are for a local database only");
  const wall = "'2026-10-17 08:00:00'::timestamp";
  const read = async (zone) => {
    const client = new Client({ connectionString: url.toString(), options: `-c timezone=${zone}` });
    await client.connect();
    try {
      return (await client.query(
        `SELECT ${ph.phSql.today}::text AS today,
                EXTRACT(EPOCH FROM ${ph.phSql.moment(wall)})::bigint AS helper,
                EXTRACT(EPOCH FROM ${wall}::timestamptz)::bigint AS naive,
                ${ph.phSql.date("'2026-10-16T16:30:00Z'::timestamptz")}::text AS day,
                TO_CHAR(${ph.phSql.wallTime("'2026-10-16T16:30:00Z'::timestamptz")}, 'HH24:MI') AS clock`
      )).rows[0];
    } finally {
      await client.end();
    }
  };
  const moment = Date.parse("2026-10-17T08:00:00+08:00") / 1000;
  for (const zone of ["UTC", "Asia/Manila", "America/Los_Angeles"]) {
    const before = ph.phToday();
    const row = await read(zone);
    assert.equal(Number(row.helper), moment, `${zone}: a stored Philippine time is the same moment`);
    assert.equal(row.day, "2026-10-17", zone);
    assert.equal(row.clock, "00:30", zone);
    assert.ok([before, ph.phToday()].includes(row.today), `${zone}: today is the Philippine day`);
  }
  // Without the helper, a UTC reader is eight hours off. This is why it exists.
  assert.equal(Number((await read("UTC")).naive), moment + 8 * 3600);
});

test("the app shows Philippine days and times whatever zone the device is set to (M3)", () => {
  require("tsx/cjs");
  const ph = require("../../my-pwa/src/lib/phTime.ts");
  const format = require("../../my-pwa/src/lib/format.ts");
  const kept = process.env.TZ;
  try {
    // A device in Kiribati (UTC+14), then one on UTC: the answers must not move.
    for (const zone of ["Pacific/Kiritimati", "UTC"]) {
      process.env.TZ = zone;
      assert.equal(ph.phDateKey("2026-10-16T17:00:00.000Z"), "2026-10-17", zone);
      assert.equal(ph.phDateKey("2026-10-16"), "2026-10-16", zone);
      assert.equal(ph.phHour(new Date("2026-10-16T17:00:00Z")), 1, zone);
      assert.equal(format.formatTime("2026-10-16T17:05:00.000Z").replace(/\s/g, " "), "1:05 AM", zone);
      assert.equal(format.formatDate("2026-10-17"), "Oct 17, 2026", zone);
      assert.equal(ph.formatPhDay("2026-10-17", { weekday: "short" }), "Sat", zone);
      assert.equal(ph.phCalendarDate(2026, 12, 32).toISOString(), "2026-12-31T16:00:00.000Z", "a day past the month's end rolls over");
      assert.equal(ph.phAddDays("2026-10-31", 1), "2026-11-01");
      assert.equal(ph.daysBetween("2026-10-17", "2026-10-20"), 3);
      assert.equal(format.greetingFor(new Date("2026-10-16T23:00:00Z")), "Good morning", `${zone}: 7 AM in Manila`);
    }
  } finally {
    if (kept === undefined) delete process.env.TZ;
    else process.env.TZ = kept;
  }
});

test("the backend's date lint refuses a date formatted without its time zone (M3)", () => {
  require("tsx/cjs");
  const { timeZoneProblems } = require("../src/scripts/lint-time-zone.ts");
  const lines = (source) => timeZoneProblems(source).map((problem) => problem.line);
  assert.deepEqual(lines(`const a = d.toLocaleDateString("en-PH");`), [1]);
  assert.deepEqual(lines(`const a = d.toLocaleTimeString("en-PH", { hour: "numeric" });`), [1]);
  assert.deepEqual(lines(`const a = new Date().toLocaleString();`), [1]);
  assert.deepEqual(lines(`const a = new Intl.DateTimeFormat("en-CA", options(x));`), [1]);
  assert.deepEqual(lines(`const a = d.toLocaleDateString("en-PH", { timeZone: PH_TIME_ZONE, month: "short" });`), []);
  assert.deepEqual(lines(`const a = new Intl.DateTimeFormat("en-CA", {\n  timeZone,\n  year: "numeric",\n});`), []);
  assert.deepEqual(lines(`// d.toLocaleDateString()\nconst s = "x.toLocaleDateString()";\nconst n = (5).toLocaleString("en-PH");`), [], "comments, strings and numbers are left alone");
});

test("the route check reads every registration and matches an address however its id is written (M10)", () => {
  require("tsx/cjs");
  const { registeredRoutes, routePattern } = require("../src/scripts/check-route-tests.ts");
  assert.ok(routePattern("/api/attendance/:id/break-end").test("jsonRequest(`/api/attendance/${logId}/break-end`, x)"));
  assert.ok(routePattern("/api/absences/:id").test('fetch("/api/absences/12", x)'));
  assert.ok(!routePattern("/api/attendance/:id").test("`/api/attendance/${logId}/break-end`"), "a longer address is another route");
  assert.ok(routePattern("/api/coordinator/students").test("`/api/coordinator/students?term=${id}`"));
  // It sees the same routes the guard sweep reads.
  const source = nodePath.join(__dirname, "..", "src");
  const files = [nodePath.join(source, "server.ts"), ...fs.readdirSync(nodePath.join(source, "routes")).map((file) => nodePath.join(source, "routes", file))];
  assert.equal(registeredRoutes(files).length, sweepRoutes.length);
});

test("supervisor routes not named elsewhere: dashboard, own concerns, and own password (M10)", async (t) => {
  const supervisor = await supervisorSession();
  const id = supervisor.supervisor.supervisor_id;
  const other = encodeURIComponent(`${id}-other`);

  const dashboard = await jsonRequest(`/api/supervisor/dashboard/${encodeURIComponent(id)}`, { headers: authHeaders(supervisor.token) });
  assert.equal(dashboard.response.status, 200, JSON.stringify(dashboard.body));
  assert.equal(typeof dashboard.body.totalInterns, "number");
  assert.equal((await jsonRequest(`/api/supervisor/dashboard/${other}`, { headers: authHeaders(supervisor.token) })).response.status, 403);
  assert.equal((await jsonRequest(`/api/supervisor/dashboard/${encodeURIComponent(id)}`, { headers: authHeaders(studentToken) })).response.status, 403);

  const concerns = await jsonRequest(`/api/complaints/supervisor/${encodeURIComponent(id)}`, { headers: authHeaders(supervisor.token) });
  assert.equal(concerns.response.status, 200);
  assert.ok(Array.isArray(concerns.body.complaints));
  assert.ok(concerns.body.complaints.every((row) => row.filed_by_supervisor_id === id), "only the concerns this supervisor filed");
  assert.equal((await jsonRequest(`/api/complaints/supervisor/${other}`, { headers: authHeaders(supervisor.token) })).response.status, 403);

  // Someone else's password, never; checked before anything is read.
  const notMine = await jsonRequest(`/api/supervisors/${other}/password`, jsonBody(supervisor.token, "PUT", { current_password: supervisorPassword, new_password: "Whatever123!x" }));
  assert.equal(notMine.response.status, 403);
  if (needsWrites(t)) return;

  // A throwaway supervisor changes their own: a wrong current one is refused, then it works and the new one signs in.
  const bcrypt = require("bcryptjs");
  const pool = localTestPool();
  const supId = `PWSUP-${Date.now()}`;
  const email = `${supId.toLowerCase()}@password.test`;
  try {
    await pool.query(`INSERT INTO supervisors (supervisor_id, email, password, name, is_active) VALUES ($1, $2, $3, 'Password Check', TRUE)`, [supId, email, await bcrypt.hash("OldPassword123!", 4)]);
    const mine = await login("supervisor", email, "OldPassword123!");
    const wrong = await jsonRequest(`/api/supervisors/${supId}/password`, jsonBody(mine.token, "PUT", { current_password: "NotThePassword1!", new_password: "NewPassword456!" }));
    assert.equal(wrong.response.status, 401);
    const same = await jsonRequest(`/api/supervisors/${supId}/password`, jsonBody(mine.token, "PUT", { current_password: "OldPassword123!", new_password: "OldPassword123!" }));
    assert.equal(same.response.status, 400);
    const changed = await jsonRequest(`/api/supervisors/${supId}/password`, jsonBody(mine.token, "PUT", { current_password: "OldPassword123!", new_password: "NewPassword456!" }));
    assert.equal(changed.response.status, 200, JSON.stringify(changed.body));
    await login("supervisor", email, "NewPassword456!");
  } finally {
    await pool.query(`DELETE FROM supervisors WHERE supervisor_id = $1`, [supId]);
    await pool.end();
  }
});

test("student routes not named elsewhere: company, documents, unread count and read-all (M10)", async (t) => {
  const own = encodeURIComponent(student.student_id);
  const company = await jsonRequest(`/api/company/${own}`, { headers: authHeaders(studentToken) });
  assert.equal(company.response.status, 200, JSON.stringify(company.body));
  assert.equal((await jsonRequest("/api/company/someone-else", { headers: authHeaders(studentToken) })).response.status, 403);

  const documents = await jsonRequest("/api/documents/student", { headers: authHeaders(studentToken) });
  assert.equal(documents.response.status, 200);
  assert.ok(documents.body.documents.every((row) => row.student_id === student.student_id), "only the student's own");
  assert.equal((await jsonRequest("/api/documents/student")).response.status, 401);
  assert.equal((await jsonRequest("/api/documents/student", { headers: authHeaders(coordinatorToken) })).response.status, 403);

  assert.equal((await jsonRequest("/api/notifications/student/someone-else/unread-count", { headers: authHeaders(studentToken) })).response.status, 403);
  assert.equal((await jsonRequest("/api/notifications/student/someone-else/read-all", jsonBody(studentToken, "PUT", {}))).response.status, 403);
  if (needsWrites(t)) return;

  const bcrypt = require("bcryptjs");
  const pool = localTestPool();
  const sid = `UNREAD-${Date.now()}`;
  const email = `${sid.toLowerCase()}@unread.test`;
  try {
    await pool.query(`INSERT INTO students (student_id, email, password, name, is_active) VALUES ($1, $2, $3, 'Unread Check', TRUE)`, [sid, email, await bcrypt.hash("UnreadTest123!", 4)]);
    await pool.query(`INSERT INTO notifications (student_id, title, message, type) VALUES ($1, 'One', 'First', 'info'), ($1, 'Two', 'Second', 'info')`, [sid]);
    const mine = await login("student", email, "UnreadTest123!");
    const count = async () => (await jsonRequest(`/api/notifications/student/${sid}/unread-count`, { headers: authHeaders(mine.token) })).body.count;
    assert.equal(await count(), 2);
    const read = await jsonRequest(`/api/notifications/student/${sid}/read-all`, jsonBody(mine.token, "PUT", {}));
    assert.equal(read.response.status, 200);
    assert.equal(await count(), 0);
  } finally {
    await pool.query(`DELETE FROM notifications WHERE student_id = $1`, [sid]);
    await pool.query(`DELETE FROM students WHERE student_id = $1`, [sid]);
    await pool.end();
  }
});

test("absences: the supervisor's list holds their interns' requests, and a student withdraws an unreviewed one (M10)", async (t) => {
  const supervisor = await supervisorSession();
  const list = await jsonRequest("/api/absences/supervisor", { headers: authHeaders(supervisor.token) });
  assert.equal(list.response.status, 200);
  assert.ok(Array.isArray(list.body.absences));
  assert.equal((await jsonRequest("/api/absences/supervisor", { headers: authHeaders(studentToken) })).response.status, 403);
  assert.equal((await jsonRequest("/api/absences/not-a-number", jsonBody(studentToken, "DELETE", {}))).response.status, 404);
  if (needsWrites(t)) return;

  require("tsx/cjs");
  const { phToday } = require("../src/services/phTime.ts");
  const bcrypt = require("bcryptjs");
  const pool = localTestPool();
  const sid = `ABSENT-${Date.now()}`;
  const email = `${sid.toLowerCase()}@absence.test`;
  try {
    await pool.query(`INSERT INTO students (student_id, email, password, name, is_active, supervisor_id) VALUES ($1, $2, $3, 'Absence Check', TRUE, $4)`, [sid, email, await bcrypt.hash("AbsenceTest123!", 4), supervisor.supervisor.supervisor_id]);
    const mine = await login("student", email, "AbsenceTest123!");
    const filed = await jsonRequest("/api/absences", jsonBody(mine.token, "POST", { date: shiftDay(phToday(), 10), reason: "A medical appointment." }));
    assert.equal(filed.response.status, 201, JSON.stringify(filed.body));
    const absenceId = filed.body.absence.id;
    const seen = (await jsonRequest("/api/absences/supervisor", { headers: authHeaders(supervisor.token) })).body.absences;
    assert.ok(seen.some((row) => row.id === absenceId), "the supervisor sees their intern's request");

    // Only its owner withdraws it, and only once.
    assert.equal((await jsonRequest(`/api/absences/${absenceId}`, jsonBody(studentToken, "DELETE", {}))).response.status, 404, "another student cannot");
    assert.equal((await jsonRequest(`/api/absences/${absenceId}`, jsonBody(mine.token, "DELETE", {}))).response.status, 200);
    assert.equal((await jsonRequest(`/api/absences/${absenceId}`, jsonBody(mine.token, "DELETE", {}))).response.status, 404);
    assert.equal((await pool.query(`SELECT 1 FROM absences WHERE id = $1`, [absenceId])).rows.length, 0);
  } finally {
    await pool.query(`DELETE FROM notifications WHERE student_id = $1 OR message LIKE 'Absence Check %'`, [sid]);
    await pool.query(`DELETE FROM removed_records WHERE student_id = $1`, [sid]);
    await pool.query(`DELETE FROM absences WHERE student_id = $1`, [sid]);
    await pool.query(`DELETE FROM students WHERE student_id = $1`, [sid]);
    await pool.end();
  }
});

test("coordinator edits not named elsewhere: college, major, company, term, site visit and a coordinator's status (M10)", async (t) => {
  // A coordinator never deactivates themselves; a bad value is refused first.
  const me = encodeURIComponent(coordinator.coordinator_id);
  assert.equal((await jsonRequest(`/api/coordinator/coordinators/${me}/status`, jsonBody(coordinatorToken, "PATCH", { is_active: "no" }))).response.status, 400);
  assert.equal((await jsonRequest(`/api/coordinator/coordinators/${me}/status`, jsonBody(coordinatorToken, "PATCH", { is_active: false }))).response.status, 409);
  assert.equal((await jsonRequest("/api/coordinator/colleges/999999999", jsonBody(coordinatorToken, "PUT", { name: "Nobody" }))).response.status, 404);
  assert.equal((await jsonRequest("/api/coordinator/majors/999999999", jsonBody(coordinatorToken, "PUT", { name: "Nobody" }))).response.status, 404);
  assert.equal((await jsonRequest("/api/coordinator/company-records/abc", jsonBody(coordinatorToken, "PUT", { name: "Nobody" }))).response.status, 404);
  assert.equal((await jsonRequest("/api/coordinator/terms/abc", jsonBody(coordinatorToken, "PUT", {}))).response.status, 404);
  assert.equal((await jsonRequest("/api/coordinator/site-visits/abc", jsonBody(coordinatorToken, "DELETE", {}))).response.status, 404);
  if (needsWrites(t)) return;

  const send = (method, path, payload) => jsonRequest(path, jsonBody(coordinatorToken, method, payload));
  const pool = localTestPool();
  const stamp = String(Date.now()).slice(-7);
  const made = { college: null, program: null, major: null, company: null, term: null, student: null };
  const bcrypt = require("bcryptjs");
  try {
    made.college = (await send("POST", "/api/coordinator/colleges", { name: `Edit College ${stamp}`, short_name: `EC${stamp}` })).body.college.id;
    const college = await send("PUT", `/api/coordinator/colleges/${made.college}`, { name: `Edited College ${stamp}`, is_active: false });
    assert.equal(college.response.status, 200, JSON.stringify(college.body));
    assert.deepEqual([college.body.college.name, college.body.college.short_name, college.body.college.is_active], [`Edited College ${stamp}`, `EC${stamp}`, false], "what is not sent is kept");
    assert.equal((await send("PUT", `/api/coordinator/colleges/${made.college}`, { is_active: "yes" })).response.status, 400);

    made.program = (await send("POST", "/api/coordinator/programs", { college_id: made.college, name: `BS Edit ${stamp}`, short_code: `BSE${stamp}` })).body.program.id;
    made.major = (await send("POST", "/api/coordinator/majors", { program_id: made.program, name: "Before" })).body.major.id;
    const major = await send("PUT", `/api/coordinator/majors/${made.major}`, { name: "After" });
    assert.equal(major.response.status, 200, JSON.stringify(major.body));
    assert.deepEqual([major.body.major.name, major.body.major.is_active], ["After", true]);
    assert.equal((await send("PUT", `/api/coordinator/majors/${made.major}`, { name: "x" })).response.status, 400);

    made.company = (await pool.query(`INSERT INTO companies (name) VALUES ($1) RETURNING id`, [`Edit Company ${stamp}`])).rows[0].id;
    const company = await send("PUT", `/api/coordinator/company-records/${made.company}`, { name: `Edited Company ${stamp}`, slots: 4, contact_email: "hr@example.com" });
    assert.equal(company.response.status, 200, JSON.stringify(company.body));
    assert.equal(company.body.company.name, `Edited Company ${stamp}`);
    assert.equal((await send("PUT", `/api/coordinator/company-records/${made.company}`, { name: `Edited Company ${stamp}`, contact_email: "not an email" })).response.status, 400);
    const off = await send("PATCH", `/api/coordinator/company-records/${made.company}/status`, { is_active: false });
    assert.equal(off.response.status, 200);
    assert.equal(off.body.company.is_active, false);
    assert.equal((await send("PATCH", `/api/coordinator/company-records/${made.company}/status`, {})).response.status, 400);
    assert.equal((await send("PATCH", "/api/coordinator/company-records/999999999/status", { is_active: true })).response.status, 404);

    const visit = (await send("POST", "/api/coordinator/site-visits", { company_id: made.company, visit_date: "2026-02-10", findings: "First look at the desks." })).body.visit;
    const revisit = await send("PUT", `/api/coordinator/site-visits/${visit.id}`, { company_id: made.company, visit_date: "2026-02-11", findings: "It was the 11th." });
    assert.equal(revisit.response.status, 200, JSON.stringify(revisit.body));
    assert.equal(revisit.body.visit.visit_date, "2026-02-11");
    assert.equal((await send("DELETE", `/api/coordinator/site-visits/${visit.id}`, {})).response.status, 200);
    assert.equal((await send("PUT", `/api/coordinator/site-visits/${visit.id}`, { company_id: made.company, visit_date: "2026-02-11", findings: "This visit was removed a moment ago." })).response.status, 404);

    made.term = (await send("POST", "/api/coordinator/terms", { name: `Edit Term ${stamp}`, start_date: "2032-01-05", end_date: "2032-05-28" })).body.term.id;
    const term = await send("PUT", `/api/coordinator/terms/${made.term}`, { name: `Edited Term ${stamp}`, start_date: "2032-01-12", end_date: "2032-05-28" });
    assert.equal(term.response.status, 200, JSON.stringify(term.body));
    assert.equal(term.body.term.name, `Edited Term ${stamp}`);
    assert.equal((await send("PUT", `/api/coordinator/terms/${made.term}`, { name: `Edited Term ${stamp}`, start_date: "2032-06-01", end_date: "2032-05-28" })).response.status, 400, "a term ends after it starts");

    made.student = `TERM-${stamp}`;
    await pool.query(`INSERT INTO students (student_id, email, password, name, is_active) VALUES ($1, $2, $3, 'Term Check', TRUE)`, [made.student, `${made.student.toLowerCase()}@term.test`, await bcrypt.hash("TermTest123!", 4)]);
    assert.equal((await send("POST", `/api/coordinator/terms/${made.term}/students`, { student_ids: [] })).response.status, 400);
    const added = await send("POST", `/api/coordinator/terms/${made.term}/students`, { student_ids: [` ${made.student} `] });
    assert.equal(added.response.status, 200, JSON.stringify(added.body));
    assert.equal(added.body.count, 1);
    assert.equal((await pool.query(`SELECT term_id FROM students WHERE student_id = $1`, [made.student])).rows[0].term_id, made.term);
  } finally {
    if (made.student) await pool.query(`DELETE FROM students WHERE student_id = $1`, [made.student]);
    if (made.term) await pool.query(`DELETE FROM terms WHERE id = $1`, [made.term]);
    if (made.company) {
      await pool.query(`DELETE FROM removed_records WHERE table_name = 'site_visits' AND data->>'company_id' = $1::text`, [made.company]);
      await pool.query(`DELETE FROM site_visits WHERE company_id = $1`, [made.company]);
      await pool.query(`DELETE FROM companies WHERE id = $1`, [made.company]);
    }
    if (made.major) await pool.query(`DELETE FROM majors WHERE id = $1`, [made.major]);
    if (made.program) await pool.query(`DELETE FROM programs WHERE id = $1`, [made.program]);
    if (made.college) await pool.query(`DELETE FROM colleges WHERE id = $1`, [made.college]);
    await pool.end();
  }
});

/*
|--------------------------------------------------------------------------
| Iteration 3: student capture
|--------------------------------------------------------------------------
*/

test("the camera check's levels: one or two head turns by default, both and the light test when strict", () => {
  require("tsx/cjs");
  const { pickLivenessPrompts, requiredPrompts } = require("../src/services/liveness.ts");
  // A fixed "random" choice, so each branch is seen.
  const always = (value) => () => value;
  assert.deepEqual(pickLivenessPrompts("standard", always(0)), { prompts: ["turn-left"], spare: null });
  assert.deepEqual(pickLivenessPrompts("standard", always(1)), { prompts: ["turn-right", "turn-left"], spare: null });
  assert.deepEqual(pickLivenessPrompts("strict", always(0)), { prompts: ["turn-left", "turn-right"], spare: "blink" });
  for (let run = 0; run < 50; run += 1) {
    const { prompts, spare } = pickLivenessPrompts("standard");
    assert.ok(prompts.length >= 1 && prompts.length <= 2 && spare === null);
    assert.ok(prompts.every((prompt) => prompt.startsWith("turn-")), "no blink or smile by default");
  }

  // Standard: the turns, whatever the light test says (it does not run).
  const standard = { level: "standard", prompts: ["turn-right"], spare: null };
  assert.deepEqual(requiredPrompts(standard, "skipped"), ["turn-right"]);
  // Strict: the spare too, unless the light test passed.
  const strict = { level: "strict", prompts: ["turn-left", "turn-right"], spare: "blink" };
  assert.deepEqual(requiredPrompts(strict, "passed"), ["turn-left", "turn-right"]);
  assert.deepEqual(requiredPrompts(strict, "inconclusive"), ["turn-left", "turn-right", "blink"]);
  assert.deepEqual(requiredPrompts(strict, "skipped"), ["turn-left", "turn-right", "blink"], "reduced motion skips the light test, so the spare is asked");
  // A ticket issued before the levels keeps its old rule.
  assert.deepEqual(requiredPrompts({ prompts: ["blink", "smile"], spare: "turn-left" }, "inconclusive"), ["blink", "smile", "turn-left"]);
});

test("a rejected time-in photo puts the student on the strict check until a log is verified; rejecting a day does not", async (t) => {
  if (needsWrites(t)) return;
  require("tsx/cjs");
  const { phToday } = require("../src/services/phTime.ts");
  const bcrypt = require("bcryptjs");
  const pool = localTestPool();
  const supervisor = await supervisorSession();
  const sid = `STRICT-${Date.now()}`;
  const email = `${sid.toLowerCase()}@strict.test`;
  try {
    await pool.query(`INSERT INTO students (student_id, email, password, name, is_active, supervisor_id) VALUES ($1, $2, $3, 'Strict Check', TRUE, $4)`, [sid, email, await bcrypt.hash("StrictTest123!", 4), supervisor.supervisor.supervisor_id]);
    const mine = await login("student", email, "StrictTest123!");
    const challenge = async () => (await jsonRequest("/api/attendance/liveness-challenge", { method: "POST", headers: authHeaders(mine.token) })).body;
    const strictNow = async () => (await pool.query(`SELECT liveness_strict FROM students WHERE student_id = $1`, [sid])).rows[0].liveness_strict;
    const decide = (id, status, extra = {}) => jsonRequest(`/api/attendance/${id}/status`, jsonBody(supervisor.token, "PATCH", { status, ...extra }));
    const log = async (daysAgo, open = false) =>
      (await pool.query(
        `INSERT INTO attendance (student_id, date, time_in, time_out, hours, status, image_url)
         VALUES ($1, $2::date, $2::date + TIME '08:00', CASE WHEN $3 THEN NULL ELSE $2::date + TIME '16:00' END, CASE WHEN $3 THEN NULL ELSE 8 END, 'Pending', '/uploads/strict-check.jpg') RETURNING id`,
        [sid, shiftDay(phToday(), -daysAgo), open]
      )).rows[0].id;

    assert.equal((await challenge()).level, "standard");

    // Rejecting a whole day does not change the check.
    const past = await log(3);
    assert.equal((await decide(past, "Rejected", { reason: "Not at work that day." })).response.status, 200);
    assert.equal(await strictNow(), false);

    // Rejecting the photo does: both head turns, the light test and a blink as the spare.
    const today = await log(0, true);
    const rejected = await jsonRequest(`/api/attendance/${today}/reject-time-in`, jsonBody(supervisor.token, "POST", { reason: "The photo is too dark to see a face." }));
    assert.equal(rejected.response.status, 200, JSON.stringify(rejected.body));
    assert.equal(await strictNow(), true);
    const hard = await challenge();
    assert.equal(hard.level, "strict");
    assert.deepEqual([...hard.prompts].sort(), ["turn-left", "turn-right"]);
    assert.equal(hard.spare, "blink");

    // Verified: back to the standard check. Withdrawn: strict again.
    const second = await log(2);
    assert.equal((await decide(second, "Verified")).response.status, 200);
    assert.equal(await strictNow(), false);
    assert.equal((await challenge()).level, "standard");
    assert.equal((await decide(second, "Pending")).response.status, 200);
    assert.equal(await strictNow(), true);

    // An appeal that overturns the photo rejection takes it away too.
    const appeal = await jsonRequest("/api/appeals", jsonBody(mine.token, "POST", { attendance_id: today, kind: "time_in_rejection", reason: "The light in the office was off this morning." }));
    assert.equal(appeal.response.status, 201, JSON.stringify(appeal.body));
    const overturned = await jsonRequest(`/api/coordinator/appeals/${appeal.body.appeal.id}`, jsonBody(coordinatorToken, "PUT", { decision: "overturned", note: "The photo is dark but the face is visible." }));
    assert.equal(overturned.response.status, 200, JSON.stringify(overturned.body));
    assert.equal(await strictNow(), false);
  } finally {
    await pool.query(`DELETE FROM notifications WHERE student_id = $1 OR message LIKE 'Strict Check%' OR message LIKE '%Strict Check%'`, [sid]);
    await pool.query(`DELETE FROM attendance WHERE student_id = $1`, [sid]);
    await pool.query(`DELETE FROM students WHERE student_id = $1`, [sid]);
    await pool.end();
  }
});

test("a concern's new coordinator replies are counted for its student until they open the conversation", async (t) => {
  if (needsWrites(t)) return;
  const bcrypt = require("bcryptjs");
  const pool = localTestPool();
  const sid = `REPLY-${Date.now()}`;
  const email = `${sid.toLowerCase()}@reply.test`;
  try {
    await pool.query(`INSERT INTO students (student_id, email, password, name, is_active) VALUES ($1, $2, $3, 'Reply Check', TRUE)`, [sid, email, await bcrypt.hash("ReplyTest123!", 4)]);
    const mine = await login("student", email, "ReplyTest123!");
    const concernId = (await pool.query(
      `INSERT INTO complaints (student_id, report_type, category, description) VALUES ($1, 'supervisor', 'Workplace safety', 'The fire exit is locked.') RETURNING id`,
      [sid]
    )).rows[0].id;
    const newReplies = async () =>
      (await jsonRequest(`/api/complaints/student/${sid}`, { headers: authHeaders(mine.token) })).body.complaints.find((row) => row.id === concernId).new_replies;

    assert.equal(await newReplies(), 0);
    // The student's own message is not news to them.
    assert.equal((await jsonRequest(`/api/complaints/${concernId}/messages`, jsonBody(mine.token, "POST", { message: "It was locked again today." }))).response.status, 201);
    assert.equal(await newReplies(), 0);
    // Two coordinator replies: counted.
    for (const message of ["We will call the company.", "They have unlocked it."]) {
      assert.equal((await jsonRequest(`/api/complaints/${concernId}/messages`, jsonBody(coordinatorToken, "POST", { message }))).response.status, 201);
    }
    assert.equal(await newReplies(), 2);
    // The coordinator reading it changes nothing for the student.
    assert.equal((await jsonRequest(`/api/complaints/${concernId}/messages`, { headers: authHeaders(coordinatorToken) })).response.status, 200);
    assert.equal(await newReplies(), 2);
    // The student opening it: read.
    assert.equal((await jsonRequest(`/api/complaints/${concernId}/messages`, { headers: authHeaders(mine.token) })).response.status, 200);
    assert.equal(await newReplies(), 0);
  } finally {
    await pool.query(`DELETE FROM notifications WHERE student_id = $1 OR message LIKE '%Workplace safety%'`, [sid]);
    await pool.query(`DELETE FROM complaints WHERE student_id = $1`, [sid]);
    await pool.query(`DELETE FROM students WHERE student_id = $1`, [sid]);
    await pool.end();
  }
});

test("after the head turns the photo waits for the button, which is enabled only on a good frame", () => {
  require("tsx/cjs");
  const { createEngine, MIN_SHARPNESS } = require("../../my-pwa/src/lib/liveness/engine.ts");
  let now = 0;
  const face = (extra = {}) => ({
    time: (now += 40), faces: 1, centerX: 0.5, centerY: 0.5, size: 0.5, turn: 0.5,
    eyeMostOpen: 0.05, eyeMostClosed: 0.1, smile: 0, mouthOpen: 0, mouthWidth: 0.4,
    brightness: 120, speed: 0, sharpness: 80, ...extra,
  });
  const run = (engine, frames, extra) => {
    let view;
    for (let index = 0; index < frames; index += 1) view = engine.step(face(extra));
    return view;
  };
  const toCapture = () => {
    now = 0;
    const engine = createEngine({ prompts: ["turn-left"], spare: null, flash: false });
    run(engine, 20); // framed and held
    run(engine, 5, { turn: 0.7 }); // the turn
    let view = run(engine, 20); // facing forward again, past the celebration
    assert.equal(view.phase, "capture");
    return engine;
  };

  // No flash and no spare on the standard level: one prompt, then the photo.
  const engine = toCapture();
  assert.deepEqual(engine.report().completed, ["turn-left"]);
  assert.equal(engine.report().flash, "skipped");

  // Never taken by itself, however long the good frames go on.
  let view = run(engine, 200);
  assert.equal(view.phase, "capture");
  assert.equal(view.shoot, true);
  assert.equal(engine.takePhoto(now).phase, "passed");

  // Not enabled on a blurred frame, eyes closed or a turned head; a tap then does nothing.
  for (const bad of [{ sharpness: MIN_SHARPNESS - 1 }, { eyeMostClosed: 0.9, eyeMostOpen: 0.9 }, { turn: 0.7 }]) {
    const waiting = toCapture();
    run(waiting, 10);
    view = run(waiting, 3, bad);
    assert.equal(view.shoot, false, JSON.stringify(bad));
    assert.equal(waiting.takePhoto(now).phase, "capture");
    // Good frames again: enabled after a few in a row.
    assert.equal(run(waiting, 1).shoot, false, "one good frame is not enough");
    assert.equal(run(waiting, 3).shoot, true);
  }

  // A second face: the check starts over at once.
  const crowded = toCapture();
  view = crowded.step(face({ faces: 2 }));
  assert.deepEqual([view.phase, view.notice], ["position", "another-face"]);

  // The face gone: up to 1.5 seconds is forgiven, longer starts over.
  const lost = toCapture();
  run(lost, 30, { faces: 0 }); // 1.2 s
  assert.equal(run(lost, 3).phase, "capture");
  view = run(lost, 40, { faces: 0 }); // 1.6 s
  assert.deepEqual([view.phase, view.hint, view.notice], ["position", "no-face", "face-lost"]);
  // Why it started over stays until the person is back in place and it moves on.
  assert.equal(run(lost, 3).notice, "face-lost");
  assert.equal(run(lost, 20).notice, null);

  // The strict level: the light test first, and the spare when it is unclear.
  now = 0;
  const strict = createEngine({ prompts: ["turn-left", "turn-right"], spare: "blink", flash: true });
  assert.equal(run(strict, 20).phase, "flash");
  assert.deepEqual(strict.finishFlash("inconclusive", now).prompts, ["turn-left", "turn-right", "blink"]);
  // Strict with reduced motion: no light test, the spare asked from the start.
  assert.deepEqual(createEngine({ prompts: ["turn-left", "turn-right"], spare: "blink", flash: false }).step(face()).prompts, ["turn-left", "turn-right", "blink"]);
});

/*
|--------------------------------------------------------------------------
| Iteration 4: offline time-in with an attested photo
|--------------------------------------------------------------------------
*/

/** A phone's key, as WebCrypto would make it: P-256, signatures as raw r||s. */
function phoneKey() {
  const { generateKeyPairSync, sign } = require("node:crypto");
  const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  const jwk = publicKey.export({ format: "jwk" });
  return {
    jwk: { kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y },
    sign: (message) => sign("sha256", Buffer.from(message, "utf8"), { key: privateKey, dsaEncoding: "ieee-p1363" }).toString("base64url"),
  };
}

test("an attested offline time-in's rules: the key, the signed text, the signature and the clock", () => {
  require("tsx/cjs");
  const rules = require("../src/services/offlineAttestation.ts");
  const key = phoneKey();
  assert.ok("jwk" in rules.readPublicJwk(key.jwk));
  assert.ok("problem" in rules.readPublicJwk({ ...key.jwk, d: "secret" }), "a private key is refused");
  assert.ok("problem" in rules.readPublicJwk({ ...key.jwk, crv: "P-384" }));
  assert.ok("problem" in rules.readPublicJwk({ ...key.jwk, x: "not a point" }));
  assert.match(rules.keyThumbprint(key.jwk), /^[A-Za-z0-9_-]{43}$/);
  assert.equal(rules.keyThumbprint(key.jwk), rules.keyThumbprint({ y: key.jwk.y, x: key.jwk.x, crv: "P-256", kty: "EC" }), "member order does not matter");

  const attestation = {
    voucher_jti: "0b5b3f0e-6a3c-4f55-9f2a-1d2e3f4a5b6c",
    key_id: rules.keyThumbprint(key.jwk),
    photo_sha256: "a".repeat(64),
    local_time: "2026-10-17T00:30:00.000Z",
    counter: 7,
    offset_at_issue_ms: -1500,
  };
  const message = rules.attestationMessage(attestation);
  assert.equal(message, JSON.stringify(["internet-offline-time-in-v1", attestation.voucher_jti, attestation.key_id, "a".repeat(64), attestation.local_time, 7, -1500]));
  // The app builds the very same text.
  const app = require("../../my-pwa/src/lib/attestation.ts");
  assert.equal(app.attestationMessage(attestation), message);

  const signature = key.sign(message);
  assert.equal(rules.signatureValid(key.jwk, message, signature), true);
  assert.equal(rules.signatureValid(key.jwk, message.replace("7,", "8,"), signature), false, "a changed field breaks it");
  assert.equal(rules.signatureValid(phoneKey().jwk, message, signature), false, "another phone's key");
  assert.equal(rules.signatureValid(key.jwk, message, "short"), false);
  assert.ok("problem" in rules.readAttestation(JSON.stringify({ ...attestation, counter: 0 })), "the counter starts at 1");
  assert.ok("problem" in rules.readAttestation(JSON.stringify({ ...attestation, photo_sha256: "xyz" })));

  // Two minutes of difference is allowed; more is a moved clock.
  assert.equal(rules.clockCheck(0, 120).clock_moved, false);
  assert.equal(rules.clockCheck(0, 121).clock_moved, true);
  assert.equal(rules.clockCheck(-60_000, -181).clock_moved, true);
  assert.equal(rules.clockCheck(3_600_000, 3_650).clock_moved, false, "a clock that was off all along is not a moved one");
});

test("the phone's key and its vouchers: students only, a public key only, vouchers for the scheduled days only", async (t) => {
  const supervisor = await supervisorSession();
  const key = phoneKey();
  assert.equal((await jsonRequest("/api/attendance/device-key", jsonBody(supervisor.token, "POST", { public_key_jwk: key.jwk }))).response.status, 403);
  assert.equal((await jsonRequest("/api/attendance/device-key", { method: "POST" })).response.status, 401);
  const bad = await jsonRequest("/api/attendance/device-key", jsonBody(studentToken, "POST", { public_key_jwk: { ...key.jwk, d: "x" } }));
  assert.equal(bad.response.status, 400);
  assert.equal(bad.body.code, "DEVICE_KEY_UNREADABLE");
  assert.equal((await jsonRequest("/api/attendance/offline-vouchers", jsonBody(supervisor.token, "POST", {}))).response.status, 403);
  const unknown = await jsonRequest("/api/attendance/offline-vouchers", jsonBody(studentToken, "POST", { key_id: "nobody", client_sent_at: new Date().toISOString() }));
  assert.equal(unknown.response.status, 400);
  assert.equal(unknown.body.code, "DEVICE_UNKNOWN");
  if (needsWrites(t)) return;

  require("tsx/cjs");
  const { keyThumbprint } = require("../src/services/offlineAttestation.ts");
  const bcrypt = require("bcryptjs");
  const pool = localTestPool();
  const sid = `KEY-${Date.now()}`;
  try {
    await pool.query(`INSERT INTO students (student_id, email, password, name, is_active) VALUES ($1, $2, $3, 'Key Check', TRUE)`, [sid, `${sid.toLowerCase()}@key.test`, await bcrypt.hash("KeyCheck123!", 4)]);
    const mine = (await login("student", `${sid.toLowerCase()}@key.test`, "KeyCheck123!")).token;
    const registered = await jsonRequest("/api/attendance/device-key", jsonBody(mine, "POST", { public_key_jwk: key.jwk }));
    assert.equal(registered.response.status, 200);
    assert.equal(registered.body.key_id, keyThumbprint(key.jwk));
    // Registering again is the same key.
    assert.equal((await jsonRequest("/api/attendance/device-key", jsonBody(mine, "POST", { public_key_jwk: key.jwk }))).body.key_id, registered.body.key_id);
    const ask = () => jsonRequest("/api/attendance/offline-vouchers", jsonBody(mine, "POST", { key_id: registered.body.key_id, client_sent_at: new Date().toISOString() }));
    assert.equal((await jsonRequest("/api/attendance/offline-vouchers", jsonBody(mine, "POST", { key_id: registered.body.key_id }))).response.status, 400, "the phone's clock is needed");
    // No schedule, no vouchers.
    assert.deepEqual((await ask()).body.vouchers, []);
    // Mondays and Wednesdays: the next two of those, each with head turns only on the standard level.
    await pool.query(`INSERT INTO ojt_schedule (student_id, day, start_time, end_time) VALUES ($1, 'Monday', '08:00', '17:00'), ($1, 'wednesday ', '08:00', '17:00')`, [sid]);
    const issued = await ask();
    assert.equal(issued.response.status, 200);
    assert.equal(issued.body.vouchers.length, 2);
    for (const voucher of issued.body.vouchers) {
      assert.ok([1, 3].includes(new Date(`${voucher.date}T12:00:00Z`).getUTCDay()), voucher.date);
      assert.equal(voucher.level, "standard");
      assert.ok(voucher.prompts.every((prompt) => prompt.startsWith("turn-")));
    }
    assert.equal(typeof issued.body.offset_ms, "number");
    // Asking again hands out the same unspent vouchers: a time-in waiting on the phone may carry one.
    const jtis = (body) => body.vouchers.map((voucher) => JSON.parse(Buffer.from(voucher.token.split(".")[1], "base64url").toString()).jti);
    assert.deepEqual(jtis((await ask()).body), jtis(issued.body));
    assert.equal((await pool.query(`SELECT COUNT(*)::int AS n FROM offline_vouchers WHERE student_id = $1`, [sid])).rows[0].n, 2);
    // A change of level since (strict after a rejection) gives new ones.
    await pool.query(`UPDATE students SET liveness_strict = TRUE WHERE student_id = $1`, [sid]);
    const strict = (await ask()).body;
    assert.equal(strict.vouchers[0].level, "strict");
    assert.notDeepEqual(jtis(strict), jtis(issued.body));
    assert.equal((await pool.query(`SELECT COUNT(*)::int AS n FROM offline_vouchers WHERE student_id = $1`, [sid])).rows[0].n, 2);
    // Past five keys, the oldest is retired.
    for (let index = 0; index < 5; index += 1) await jsonRequest("/api/attendance/device-key", jsonBody(mine, "POST", { public_key_jwk: phoneKey().jwk }));
    assert.equal((await pool.query(`SELECT COUNT(*)::int AS n FROM device_keys WHERE student_id = $1 AND revoked_at IS NULL`, [sid])).rows[0].n, 5);
    const retired = await jsonRequest("/api/attendance/device-key", jsonBody(mine, "POST", { public_key_jwk: key.jwk }));
    assert.equal(retired.response.status, 409);
    assert.equal(retired.body.code, "DEVICE_REVOKED");
  } finally {
    await pool.query(`DELETE FROM students WHERE student_id = $1`, [sid]);
    await pool.end();
  }
});

test("an offline time-in with a photo: every refusal, then accepted once, a replay, a spent voucher, a reused counter and a moved clock", async (t) => {
  if (needsWrites(t)) return;
  require("tsx/cjs");
  const { phToday } = require("../src/services/phTime.ts");
  const { attestationMessage } = require("../src/services/offlineAttestation.ts");
  const { createHash, randomUUID } = require("node:crypto");
  const jwt = require("jsonwebtoken");
  const bcrypt = require("bcryptjs");
  const pool = localTestPool();
  const supervisor = await supervisorSession();
  const sid = `ATTEST-${Date.now()}`;
  const email = `${sid.toLowerCase()}@attest.test`;
  try {
    await pool.query(`INSERT INTO students (student_id, email, password, name, is_active, supervisor_id) VALUES ($1, $2, $3, 'Attest Check', TRUE, $4)`, [sid, email, await bcrypt.hash("AttestCheck123!", 4), supervisor.supervisor.supervisor_id]);
    await pool.query(
      `INSERT INTO ojt_schedule (student_id, day, start_time, end_time)
       SELECT $1, day, '08:00', '17:00' FROM unnest(ARRAY['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday']) AS day`,
      [sid]
    );
    const mine = (await login("student", email, "AttestCheck123!")).token;
    const key = phoneKey();
    const keyId = (await jsonRequest("/api/attendance/device-key", jsonBody(mine, "POST", { public_key_jwk: key.jwk }))).body.key_id;
    const vouchers = async () =>
      (await jsonRequest("/api/attendance/offline-vouchers", jsonBody(mine, "POST", { key_id: keyId, client_sent_at: new Date().toISOString() }))).body.vouchers;
    const claims = (token) => JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString());
    let issued = await vouchers();
    const today = phToday();
    if (issued[0]?.date !== today) {
      t.skip("today is a holiday on this database, so no voucher is given for it");
      return;
    }
    const photo = Buffer.from(sampleFiles.jpg);
    let counter = 0;
    const occurredAt = () => new Date(Date.now() - 5_000).toISOString();

    /** A time-in as the phone sends it, with any part replaced. */
    const send = async (voucher, change = {}) => {
      const at = change.occurred_at ?? occurredAt();
      const vc = claims(voucher.token);
      const attestation = {
        voucher_jti: vc.jti,
        key_id: keyId,
        photo_sha256: createHash("sha256").update(photo).digest("hex"),
        local_time: at,
        counter: change.counter ?? (counter += 1),
        offset_at_issue_ms: vc.offset_ms,
        ...(change.attestation ?? {}),
      };
      const form = new FormData();
      const fields = {
        occurred_at: at,
        client_request_id: change.requestId ?? randomUUID(),
        client_sent_at: new Date(Date.now() + (change.clockAheadMs ?? 0)).toISOString(),
        voucher: change.voucher ?? voucher.token,
        attestation: change.rawAttestation ?? JSON.stringify(attestation),
        signature: change.signature ?? (change.signer ?? key).sign(attestationMessage(attestation)),
        liveness_report: JSON.stringify({ completed: change.completed ?? voucher.prompts, flash: "skipped", attempts: 1 }),
        ...(change.fields ?? {}),
      };
      for (const [name, value] of Object.entries(fields)) if (value !== null) form.set(name, value);
      if (change.photo !== null) form.set("image", new Blob([change.photo ?? photo], { type: "image/jpeg" }), "time-in.jpg");
      const response = await fetch(new URL("/api/attendance/offline-time-in", apiBaseUrl), { method: "POST", headers: authHeaders(mine), body: form });
      return { status: response.status, body: await response.json().catch(() => ({})), requestId: fields.client_request_id };
    };
    const refused = async (label, result, status, code) => {
      assert.equal(result.status, status, `${label}: ${JSON.stringify(result.body)}`);
      assert.equal(result.body.code, code, label);
      assert.equal(typeof result.body.message, "string");
    };
    const logs = async () => (await pool.query(`SELECT id FROM attendance WHERE student_id = $1`, [sid])).rows;
    const todays = () => issued.find((voucher) => voucher.date === today);
    const tomorrows = () => issued.find((voucher) => voucher.date !== today);

    // Every refusal, none of which adds a log or spends anything.
    await refused("no photo", await send(todays(), { photo: null }), 400, "PHOTO_MISSING");
    await refused("unreadable record", await send(todays(), { rawAttestation: "{not json" }), 400, "ATTESTATION_UNREADABLE");
    const { iat: _iat, exp: _exp, ...voucherClaims } = claims(todays().token);
    const forged = jwt.sign(voucherClaims, "not-the-server-secret");
    await refused("forged voucher", await send(todays(), { voucher: forged }), 400, "VOUCHER_INVALID");
    await refused("record for another voucher", await send(todays(), { attestation: { voucher_jti: claims(tomorrows().token).jti } }), 400, "VOUCHER_MISMATCH");
    await refused("tomorrow's voucher today", await send(tomorrows()), 400, "VOUCHER_WRONG_DAY");
    await pool.query(`UPDATE device_keys SET revoked_at = NOW() WHERE student_id = $1`, [sid]);
    await refused("retired key", await send(todays()), 400, "DEVICE_UNKNOWN");
    await pool.query(`UPDATE device_keys SET revoked_at = NULL WHERE student_id = $1`, [sid]);
    await refused("another phone's signature", await send(todays(), { signer: phoneKey() }), 400, "SIGNATURE_INVALID");
    const at = occurredAt();
    await refused("signed time is not the time sent", await send(todays(), { occurred_at: at, attestation: { local_time: new Date(Date.parse(at) - 60_000).toISOString() } }), 400, "ATTESTATION_MISMATCH");
    await refused("a clock gap that was not measured", await send(todays(), { attestation: { offset_at_issue_ms: claims(todays().token).offset_ms + 5_000 } }), 400, "ATTESTATION_MISMATCH");
    const tampered = Buffer.from(photo);
    tampered[tampered.length - 3] ^= 0xff;
    await refused("a tampered photo", await send(todays(), { photo: tampered }), 400, "PHOTO_ALTERED");
    await refused("the check not finished", await send(todays(), { completed: [] }), 400, "CHECK_INCOMPLETE");
    await refused("no clock at sending", await send(todays(), { fields: { client_sent_at: null } }), 400, "CLOCK_MISSING");
    assert.deepEqual(await logs(), [], "no refusal added a log");
    assert.equal((await pool.query(`SELECT COUNT(*)::int AS n FROM offline_vouchers WHERE student_id = $1 AND used_at IS NOT NULL`, [sid])).rows[0].n, 0, "nor spent a voucher");

    // Accepted, even though the phone asked for vouchers again meanwhile (it
    // does so the moment the connection is back, as the time-in is sent):
    // the photo, the check, the record, the voucher spent and the counter kept.
    await vouchers();
    const accepted = await send(todays());
    assert.equal(accepted.status, 201, JSON.stringify(accepted.body));
    assert.deepEqual([accepted.body.attested, accepted.body.clock_moved], [true, false]);
    const log = (await pool.query(`SELECT * FROM attendance WHERE student_id = $1`, [sid])).rows[0];
    assert.match(log.image_url, /^\/uploads\//);
    assert.equal(log.capture_method, "liveness");
    assert.equal(log.recorded_offline, true);
    assert.equal(log.liveness_checks.offline, true);
    assert.equal(log.offline_attestation.clock_moved, false);
    assert.equal(log.offline_attestation.counter, counter);
    const spent = (await pool.query(`SELECT used_at, attendance_id FROM offline_vouchers WHERE jti = $1`, [claims(todays().token).jti])).rows[0];
    assert.ok(spent.used_at);
    assert.equal(spent.attendance_id, log.id);
    assert.equal(Number((await pool.query(`SELECT counter FROM device_keys WHERE key_id = $1 AND student_id = $2`, [keyId, sid])).rows[0].counter), counter);

    // A replay: the same request again is the first answer; another request for the day is refused.
    const again = await send(todays(), { requestId: accepted.requestId, counter });
    assert.equal(again.status, 200);
    assert.equal(again.body.replayed, true);
    await refused("a second time-in for the day", await send(todays()), 409, "DAY_HAS_LOG");
    assert.equal((await logs()).length, 1);

    // The supervisor sees it attested, and it cannot be verified in a batch.
    const list = await jsonRequest(`/api/supervisor/attendance/${encodeURIComponent(supervisor.supervisor.supervisor_id)}`, { headers: authHeaders(supervisor.token) });
    const seen = list.body.attendance.find((entry) => entry.id === log.id);
    assert.equal(seen.offline_time_in, true);
    assert.equal(seen.offline_attestation.clock_moved, false);
    await pool.query(`UPDATE attendance SET time_out = time_in + INTERVAL '8 hours', hours = 8 WHERE id = $1`, [log.id]);
    const batch = await jsonRequest(`/api/attendance/${log.id}/status`, jsonBody(supervisor.token, "PATCH", { status: "Verified" }));
    assert.equal(batch.response.status, 409);
    assert.equal(batch.body.code, "CONFIRM_OFFLINE_TIME_IN");
    assert.match(batch.body.message, /its time comes from the phone/);

    // A spent voucher, once the day is free again: refused.
    await pool.query(`DELETE FROM attendance WHERE id = $1`, [log.id]);
    await refused("a spent voucher", await send(todays()), 409, "VOUCHER_USED");

    // A counter used before, on a fresh voucher: refused.
    issued = await vouchers();
    const lastAccepted = Number((await pool.query(`SELECT counter FROM device_keys WHERE key_id = $1 AND student_id = $2`, [keyId, sid])).rows[0].counter);
    await refused("a reused counter", await send(todays(), { counter: lastAccepted }), 409, "COUNTER_REPLAY");

    // A clock moved while offline: accepted, flagged, both gaps kept, the supervisor told.
    const moved = await send(todays(), { clockAheadMs: 10 * 60 * 1000 });
    assert.equal(moved.status, 201, JSON.stringify(moved.body));
    assert.equal(moved.body.clock_moved, true);
    const flagged = (await pool.query(`SELECT offline_attestation, clock_skew_seconds FROM attendance WHERE student_id = $1`, [sid])).rows[0];
    assert.equal(flagged.offline_attestation.clock_moved, true);
    assert.ok(flagged.offline_attestation.clock_gap_at_sync_seconds >= 590);
    assert.ok(Math.abs(flagged.offline_attestation.clock_gap_at_issue_seconds) <= 5);
    const told = await pool.query(`SELECT message FROM notifications WHERE supervisor_id = $1 AND message LIKE 'Attest Check%' ORDER BY id DESC LIMIT 1`, [supervisor.supervisor.supervisor_id]);
    assert.match(told.rows[0].message, /clock was changed while it was offline/);
  } finally {
    await pool.query(`DELETE FROM notifications WHERE message LIKE 'Attest Check%'`);
    await pool.query(`DELETE FROM offline_vouchers WHERE student_id = $1`, [sid]);
    await pool.query(`DELETE FROM attendance WHERE student_id = $1`, [sid]);
    await pool.query(`DELETE FROM students WHERE student_id = $1`, [sid]);
    await pool.end();
  }
});

/*
|--------------------------------------------------------------------------
| Iteration 5: rejection modes, the redo window, appeals
|--------------------------------------------------------------------------
*/

/** A throwaway student of the demo supervisor, signed in, with a log today and helpers. */
async function rejectionFixture(label) {
  require("tsx/cjs");
  const { phToday } = require("../src/services/phTime.ts");
  const bcrypt = require("bcryptjs");
  const pool = localTestPool();
  const supervisor = await supervisorSession();
  const sid = `${label}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  const email = `${sid.toLowerCase()}@rejection.test`;
  await pool.query(`INSERT INTO students (student_id, email, password, name, is_active, supervisor_id) VALUES ($1, $2, $3, $4, TRUE, $5)`, [sid, email, await bcrypt.hash("Rejection123!", 4), `Check ${label}`, supervisor.supervisor.supervisor_id]);
  const mine = await login("student", email, "Rejection123!");
  /** A log `daysAgo` days back (0: today), open or closed, with lunch as given. */
  const log = async ({ daysAgo = 0, open = true, lunch = "none", photo = true } = {}) =>
    (await pool.query(
      `INSERT INTO attendance (student_id, date, time_in, break_time, break_end_time, time_out, hours, status, image_url)
       VALUES ($1, $2::date, NOW() - INTERVAL '3 hours',
               CASE WHEN $3 IN ('open', 'ended') THEN NOW() - INTERVAL '2 hours' END,
               CASE WHEN $3 = 'ended' THEN NOW() - INTERVAL '90 minutes' END,
               CASE WHEN $4 THEN NULL ELSE NOW() - INTERVAL '1 minute' END,
               CASE WHEN $4 THEN NULL ELSE 2.5 END, 'Pending', CASE WHEN $5 THEN '/uploads/rejected-photo.jpg' END)
       RETURNING id`,
      [sid, shiftDay(phToday(), -daysAgo), lunch, open, photo]
    )).rows[0].id;
  const rejectPhoto = (id, reason = "The face is out of the frame.") =>
    jsonRequest(`/api/attendance/${id}/reject-time-in`, jsonBody(supervisor.token, "POST", { reason }));
  const row = async (id) => (await pool.query(`SELECT * FROM attendance WHERE id = $1`, [id])).rows[0];
  const cleanup = async () => {
    await pool.query(`DELETE FROM notifications WHERE student_id = $1 OR message LIKE $2`, [sid, `%Check ${label}%`]);
    await pool.query(`DELETE FROM absences WHERE student_id = $1`, [sid]);
    await pool.query(`DELETE FROM attendance WHERE student_id = $1`, [sid]);
    await pool.query(`DELETE FROM students WHERE student_id = $1`, [sid]);
    await pool.end();
  };
  return { pool, supervisor, sid, mine, log, rejectPhoto, row, cleanup, phToday };
}

test("the window to retake a rejected photo: at Back from lunch, or 60 minutes once lunch is over", () => {
  require("tsx/cjs");
  const { redoWindow, REDO_MINUTES_AFTER_LUNCH } = require("../src/services/photoRedo.ts");
  assert.equal(REDO_MINUTES_AFTER_LUNCH, 60);
  assert.deepEqual(redoWindow({ break_time: null, break_end_time: null }), { closes: "back-from-lunch" }, "before lunch");
  assert.deepEqual(redoWindow({ break_time: "x", break_end_time: null }), { closes: "back-from-lunch" }, "during lunch");
  assert.deepEqual(redoWindow({ break_time: "x", break_end_time: "y" }), { closes: "minutes", minutes: 60 }, "after lunch");
});

test("rejecting a time-in photo: today's open log only, a reason, the log stays open, and the student retakes it with the strict check", async (t) => {
  // Without a token, and for the wrong role.
  assert.equal((await jsonRequest("/api/attendance/1/reject-time-in", { method: "POST" })).response.status, 401);
  assert.equal((await jsonRequest("/api/attendance/1/reject-time-in", jsonBody(studentToken, "POST", { reason: "x" }))).response.status, 403);
  assert.equal((await jsonRequest("/api/attendance/1/photo-redo", { method: "POST", headers: authHeaders(coordinatorToken) })).response.status, 403);
  if (needsWrites(t)) return;
  const f = await rejectionFixture("REDO");
  try {
    const today = await f.log();
    // A reason is required; only today's open log with a photo.
    assert.equal((await f.rejectPhoto(today, "bad")).response.status, 400);
    const yesterday = await f.log({ daysAgo: 1 });
    assert.equal((await f.rejectPhoto(yesterday)).body.code, "NOT_OPEN_TODAY");
    const otherStudent = await f.log({ daysAgo: 2, open: false });
    assert.equal((await f.rejectPhoto(otherStudent)).body.code, "NOT_OPEN_TODAY");
    await f.pool.query(`UPDATE attendance SET image_url = NULL WHERE id = $1`, [today]);
    assert.equal((await f.rejectPhoto(today)).body.code, "NO_PHOTO");
    await f.pool.query(`UPDATE attendance SET image_url = '/uploads/rejected-photo.jpg' WHERE id = $1`, [today]);

    // Before lunch: it closes at Back from lunch. The log stays open and Pending.
    const rejected = await f.rejectPhoto(today);
    assert.equal(rejected.response.status, 200, JSON.stringify(rejected.body));
    assert.equal(rejected.body.closes, "back-from-lunch");
    let log = await f.row(today);
    assert.deepEqual([log.status, log.time_out, log.rejection_scope, log.photo_redo_status, log.photo_redo_due_at], ["Pending", null, "time_in", "required", null]);
    assert.equal((await f.rejectPhoto(today)).body.code, "REDO_ALREADY_REQUIRED");
    const told = await f.pool.query(`SELECT message FROM notifications WHERE student_id = $1 AND title = 'Time-in photo rejected'`, [f.sid]);
    assert.match(told.rows[0].message, /before you tap Back from lunch/);
    assert.match(told.rows[0].message, /your hours still count/);

    // The student's own list says so.
    const mine = (await jsonRequest(`/api/attendance/${f.sid}`, { headers: authHeaders(f.mine.token) })).body.attendance.find((entry) => entry.id === today);
    assert.deepEqual([mine.photo_redo_status, mine.photo_rejection_reason], ["required", "The face is out of the frame."]);

    // Retaking it: only on the log that needs it, and only with the strict check.
    const redo = (id, ticket, report) => {
      const form = new FormData();
      form.set("image", new Blob([sampleFiles.jpg], { type: "image/jpeg" }), "redo.jpg");
      form.set("liveness_ticket", ticket);
      form.set("liveness_report", JSON.stringify(report));
      return jsonRequest(`/api/attendance/${id}/photo-redo`, { method: "POST", headers: authHeaders(f.mine.token), body: form });
    };
    const challenge = async () => (await jsonRequest("/api/attendance/liveness-challenge", { method: "POST", headers: authHeaders(f.mine.token) })).body;
    assert.equal((await redo(yesterday, "x", {})).body.code, "REDO_NOT_REQUIRED");
    await f.pool.query(`UPDATE students SET liveness_strict = FALSE WHERE student_id = $1`, [f.sid]);
    const easy = await challenge();
    assert.equal((await redo(today, easy.ticket, { completed: easy.prompts, flash: "skipped" })).body.code, "STRICT_CHECK_REQUIRED");
    await f.pool.query(`UPDATE students SET liveness_strict = TRUE WHERE student_id = $1`, [f.sid]);
    const hard = await challenge();
    assert.equal(hard.level, "strict");
    assert.equal((await redo(today, hard.ticket, { completed: hard.prompts, flash: "inconclusive" })).response.status, 400, "the spare is due when the light test is unclear");
    const done = await redo(today, hard.ticket, { completed: hard.prompts, flash: "passed" });
    assert.equal(done.response.status, 200, JSON.stringify(done.body));
    log = await f.row(today);
    assert.equal(log.photo_redo_status, "submitted");
    assert.equal(log.rejected_photo_path, "/uploads/rejected-photo.jpg", "the rejected photo is kept for the record");
    assert.notEqual(log.image_url, "/uploads/rejected-photo.jpg");
    assert.equal(log.liveness_checks.level, "strict");
    assert.equal((await redo(today, hard.ticket, { completed: hard.prompts, flash: "passed" })).body.code, "REDO_NOT_REQUIRED");
    const supervisorTold = await f.pool.query(`SELECT 1 FROM notifications WHERE supervisor_id = $1 AND title = 'Time-in photo retaken' AND message LIKE $2`, [f.supervisor.supervisor.supervisor_id, `%Check REDO%`]);
    assert.equal(supervisorTold.rows.length, 1);
  } finally {
    await f.cleanup();
  }
});

test("a photo not retaken in time closes the day as absent; the supervisor may still verify it, which is audited", async (t) => {
  if (needsWrites(t)) return;
  require("tsx/cjs");
  const { closeMissedRedos, REDO_MISSED_REASON } = require("../src/services/photoRedo.ts");
  const told = [];
  const notify = async (notification) => told.push(notification);
  const f = await rejectionFixture("MISS");
  const g = await rejectionFixture("LATE");
  const h = await rejectionFixture("OUT");
  try {
    // 1. Back from lunch closes it.
    const lunch = await f.log({ lunch: "open" });
    assert.equal((await f.rejectPhoto(lunch)).body.closes, "back-from-lunch");
    const back = await jsonRequest(`/api/attendance/${lunch}/break-end`, jsonBody(f.mine.token, "PUT", {}));
    assert.equal(back.response.status, 200, JSON.stringify(back.body));
    assert.ok((await f.row(lunch)).photo_redo_due_at, "the window closed at Back from lunch");

    // 2. After lunch: 60 minutes from the rejection.
    const after = await g.log({ lunch: "ended" });
    const late = await g.rejectPhoto(after);
    assert.equal(late.body.closes, "minutes");
    const due = (await g.pool.query(`SELECT EXTRACT(EPOCH FROM photo_redo_due_at - NOW())::int AS seconds FROM attendance WHERE id = $1`, [after])).rows[0].seconds;
    assert.ok(due > 3500 && due <= 3600, `${due} seconds`);
    await g.pool.query(`UPDATE attendance SET photo_redo_due_at = NOW() - INTERVAL '1 minute' WHERE id = $1`, [after]);

    // 3. Never after time-out.
    const out = await h.log();
    await h.rejectPhoto(out);
    await h.pool.query(`UPDATE attendance SET time_out = NOW(), hours = 3 WHERE id = $1`, [out]);

    // The minute job closes all three, once.
    const pool = localTestPool();
    try {
      assert.ok((await closeMissedRedos(pool, notify)) >= 3);
      assert.equal((await closeMissedRedos(pool, notify)), 0, "nothing is closed twice");
    } finally {
      await pool.end();
    }
    for (const [fixture, id] of [[f, lunch], [g, after], [h, out]]) {
      const log = await fixture.row(id);
      assert.deepEqual([log.status, log.photo_redo_status, log.review_notes, log.verifier_role], ["Rejected", "missed", REDO_MISSED_REASON, "system"]);
      const absence = (await fixture.pool.query(`SELECT status FROM absences WHERE student_id = $1`, [fixture.sid])).rows;
      assert.deepEqual(absence.map((row) => row.status), ["Unexcused"]);
      assert.ok(told.some((n) => n.studentId === fixture.sid && n.title === "Day marked absent"));
      assert.ok(told.some((n) => n.supervisorId && n.message.includes(`Check ${fixture === f ? "MISS" : fixture === g ? "LATE" : "OUT"}`)));
    }

    // The supervisor verifies one after all: the absence goes, and the audit says it came after a missed redo.
    const verified = await jsonRequest(`/api/attendance/${out}/status`, jsonBody(h.supervisor.token, "PATCH", { status: "Verified" }));
    assert.equal(verified.response.status, 200, JSON.stringify(verified.body));
    assert.equal((await h.pool.query(`SELECT COUNT(*)::int AS n FROM absences WHERE student_id = $1`, [h.sid])).rows[0].n, 0);
    await new Promise((resolve) => setTimeout(resolve, 300));
    const audit = await h.pool.query(`SELECT action, details FROM audit_log WHERE entity_type = 'attendance' AND entity_id = $1 ORDER BY id DESC LIMIT 1`, [String(out)]);
    assert.equal(audit.rows[0].action, "attendance.approve");
    assert.equal(audit.rows[0].details.after_missed_photo_redo, true);
  } finally {
    await f.cleanup();
    await g.cleanup();
    await h.cleanup();
  }
});

test("a time correction tells the student the times before and after, and keeps them for an appeal", async (t) => {
  if (needsWrites(t)) return;
  const f = await rejectionFixture("TIMES");
  try {
    const id = await f.log({ daysAgo: 1, open: false });
    await f.pool.query(`UPDATE attendance SET time_in = date + TIME '08:00', break_time = NULL, break_end_time = NULL, time_out = date + TIME '17:00', hours = 9 WHERE id = $1`, [id]);
    const corrected = await jsonRequest(`/api/attendance/${id}/times`, jsonBody(f.supervisor.token, "PATCH", { time_in: "08:30", break_time: "12:00", break_end_time: "13:00", time_out: "17:00", reason: "Arrived late and took lunch." }));
    assert.equal(corrected.response.status, 200, JSON.stringify(corrected.body));
    const note = (await f.pool.query(`SELECT message FROM notifications WHERE student_id = $1 AND title = 'Attendance times corrected'`, [f.sid])).rows[0].message;
    assert.match(note, /time in 8:00 AM → 8:30 AM/);
    assert.match(note, /out for lunch none → 12:00 PM/);
    assert.doesNotMatch(note, /time out/, "an unchanged time is not listed");
    assert.match(note, /appeal to the OJT coordinator within 7 days/);
    assert.deepEqual((await f.row(id)).times_before_correction, { time_in: "08:00", break_time: null, break_end_time: null, time_out: "17:00", hours: 9 });
  } finally {
    await f.cleanup();
  }
});

test("appeals: within 7 days, one open per log, withdrawn by the student, upheld or overturned by the coordinator with a note, all audited", async (t) => {
  assert.equal((await jsonRequest("/api/appeals", jsonBody(coordinatorToken, "POST", {}))).response.status, 403);
  assert.equal((await jsonRequest("/api/coordinator/appeals", { headers: authHeaders(studentToken) })).response.status, 403);
  assert.equal((await jsonRequest("/api/coordinator/appeals?status=nonsense", { headers: authHeaders(coordinatorToken) })).response.status, 400);
  assert.equal((await jsonRequest("/api/coordinator/appeals/1", jsonBody(coordinatorToken, "PUT", { decision: "maybe", note: "Looks fine." }))).response.status, 400);
  assert.equal((await jsonRequest("/api/appeals/abc/withdraw", jsonBody(studentToken, "POST", {}))).response.status, 404);
  if (needsWrites(t)) return;
  const f = await rejectionFixture("APPEAL");
  const appeal = (id, kind, reason = "This was not what happened that day.") =>
    jsonRequest("/api/appeals", jsonBody(f.mine.token, "POST", { attendance_id: id, kind, reason }));
  const decide = (appealId, decision, note = "Checked with the company.") =>
    jsonRequest(`/api/coordinator/appeals/${appealId}`, jsonBody(coordinatorToken, "PUT", { decision, note }));
  try {
    // Validation.
    const plain = await f.log({ daysAgo: 1, open: false });
    assert.equal((await appeal(plain, "time_correction")).body.code, "NOTHING_TO_APPEAL");
    assert.equal((await appeal(plain, "attendance_rejection", "short")).response.status, 400);
    assert.equal((await appeal(plain, "something_else")).response.status, 400);

    // A rejected day: filed, refused twice, withdrawn, filed again, overturned: verified by the coordinator.
    await f.pool.query(`UPDATE attendance SET status = 'Rejected', rejection_scope = 'attendance', review_notes = 'Not at work.', verified_at = NOW() WHERE id = $1`, [plain]);
    const first = await appeal(plain, "attendance_rejection");
    assert.equal(first.response.status, 201, JSON.stringify(first.body));
    assert.equal((await appeal(plain, "attendance_rejection")).body.code, "APPEAL_OPEN");
    assert.equal((await jsonRequest(`/api/appeals/${first.body.appeal.id}/withdraw`, jsonBody(f.mine.token, "POST", {}))).response.status, 200);
    assert.equal((await jsonRequest(`/api/appeals/${first.body.appeal.id}/withdraw`, jsonBody(f.mine.token, "POST", {}))).response.status, 404);
    const second = await appeal(plain, "attendance_rejection");
    assert.equal(second.response.status, 201);
    const listed = await jsonRequest("/api/coordinator/appeals", { headers: authHeaders(coordinatorToken) });
    const seen = listed.body.appeals.find((entry) => entry.id === second.body.appeal.id);
    assert.deepEqual([seen.kind, seen.review_notes, seen.student_name], ["attendance_rejection", "Not at work.", "Check APPEAL"]);
    assert.equal((await decide(second.body.appeal.id, "overturned", "x")).response.status, 400, "a note is required");
    const overturned = await decide(second.body.appeal.id, "overturned");
    assert.equal(overturned.response.status, 200, JSON.stringify(overturned.body));
    let log = await f.row(plain);
    assert.deepEqual([log.status, log.verifier_role], ["Verified", "coordinator"]);
    assert.match(log.review_notes, /Rejection overturned by the OJT coordinator: Checked with the company\./);
    assert.equal((await decide(second.body.appeal.id, "upheld")).response.status, 404, "decided once");

    // Too late: a correction made eight days ago.
    const old = await f.log({ daysAgo: 8, open: false });
    await f.pool.query(`UPDATE attendance SET time_corrected_at = NOW() - INTERVAL '8 days', time_correction_reason = 'Old' WHERE id = $1`, [old]);
    assert.equal((await appeal(old, "time_correction")).body.code, "APPEAL_TOO_LATE");

    // A time correction overturned: the times before it come back, with the hours.
    const corrected = await f.log({ daysAgo: 2, open: false });
    await f.pool.query(
      `UPDATE attendance SET time_in = date + TIME '09:00', break_time = NULL, break_end_time = NULL, time_out = date + TIME '17:00', hours = 8,
              time_corrected_at = NOW(), time_correction_reason = 'Late',
              times_before_correction = '{"time_in":"08:00","break_time":null,"break_end_time":null,"time_out":"17:00"}'
       WHERE id = $1`,
      [corrected]
    );
    const correction = await appeal(corrected, "time_correction");
    assert.equal((await decide(correction.body.appeal.id, "overturned")).response.status, 200);
    log = (await f.pool.query(`SELECT TO_CHAR(time_in, 'HH24:MI') AS time_in, hours, times_before_correction, time_correction_reason FROM attendance WHERE id = $1`, [corrected])).rows[0];
    assert.deepEqual([log.time_in, Number(log.hours), log.times_before_correction], ["08:00", 9, null]);
    assert.match(log.time_correction_reason, /Original times restored by the OJT coordinator/);

    // A correction made before appeals kept no earlier times: it can only be upheld.
    const legacy = await f.log({ daysAgo: 3, open: false });
    await f.pool.query(`UPDATE attendance SET time_corrected_at = NOW(), time_correction_reason = 'Old style' WHERE id = $1`, [legacy]);
    const legacyAppeal = await appeal(legacy, "time_correction");
    assert.equal((await decide(legacyAppeal.body.appeal.id, "overturned")).body.code, "LOG_CHANGED");
    assert.equal((await decide(legacyAppeal.body.appeal.id, "upheld")).response.status, 200);

    // A missed photo redo overturned: the day is open for review again, the absence gone.
    const missed = await f.log({ daysAgo: 4, open: false });
    const missedDate = (await f.pool.query(`SELECT TO_CHAR(date, 'YYYY-MM-DD') AS d FROM attendance WHERE id = $1`, [missed])).rows[0].d;
    await f.pool.query(
      `UPDATE attendance SET status = 'Rejected', rejection_scope = 'time_in', photo_rejection_reason = 'Dark', photo_rejected_at = NOW(),
              photo_redo_status = 'missed', review_notes = 'Photo not retaken in time', verifier_role = 'system', verified_at = NOW()
       WHERE id = $1`,
      [missed]
    );
    require("tsx/cjs");
    const { REDO_MISSED_ABSENCE_REASON } = require("../src/services/photoRedo.ts");
    await f.pool.query(`INSERT INTO absences (student_id, date, reason, status) VALUES ($1, $2, $3, 'Unexcused')`, [f.sid, missedDate, REDO_MISSED_ABSENCE_REASON]);
    const redoAppeal = await appeal(missed, "time_in_rejection");
    assert.equal((await decide(redoAppeal.body.appeal.id, "overturned")).response.status, 200);
    log = await f.row(missed);
    assert.deepEqual([log.status, log.photo_redo_status, log.review_notes], ["Pending", null, null]);
    assert.equal((await f.pool.query(`SELECT COUNT(*)::int AS n FROM absences WHERE student_id = $1`, [f.sid])).rows[0].n, 0);

    // Both are told; every step is in the audit log.
    const studentTold = await f.pool.query(`SELECT title FROM notifications WHERE student_id = $1 AND title IN ('Appeal accepted', 'Appeal not accepted')`, [f.sid]);
    assert.ok(studentTold.rows.length >= 4);
    await new Promise((resolve) => setTimeout(resolve, 300));
    const actions = (await f.pool.query(
      `SELECT action FROM audit_log WHERE (entity_type = 'appeal' AND entity_id = ANY($1::text[])) OR (entity_type = 'attendance' AND entity_id = $2 AND action LIKE 'appeal.%')`,
      [[first.body.appeal.id, second.body.appeal.id, legacyAppeal.body.appeal.id].map(String), String(plain)]
    )).rows.map((row) => row.action);
    for (const action of ["appeal.file", "appeal.withdraw", "appeal.overturn", "appeal.uphold"]) assert.ok(actions.includes(action), `${action} in ${actions}`);
  } finally {
    await f.pool.query(`DELETE FROM attendance_appeals WHERE student_id = $1`, [f.sid]);
    await f.cleanup();
  }
});

test("the coordinator's student record shows a rejected time-in photo in the log's reviewer note, unhighlighted", async (t) => {
  if (needsWrites(t)) return;
  const f = await rejectionFixture("RECORD");
  try {
    const today = await f.log();
    assert.equal((await f.rejectPhoto(today, "The photo shows the ceiling.")).response.status, 200);
    const overview = await jsonRequest(`/api/coordinator/students/${f.sid}/overview`, { headers: authHeaders(coordinatorToken) });
    assert.equal(overview.response.status, 200);
    const entry = overview.body.attendance.find((row) => row.id === today);
    assert.equal(entry.status, "Pending");
    assert.equal(entry.review_notes, "Time-in photo rejected: The photo shows the ceiling. A new photo is due.");
  } finally {
    await f.cleanup();
  }
});

test("a photo rejection can be taken back by its supervisor for 15 minutes, while no new photo was taken", async (t) => {
  assert.equal((await jsonRequest("/api/attendance/1/reject-time-in/undo", jsonBody(studentToken, "POST", {}))).response.status, 403);
  if (needsWrites(t)) return;
  const f = await rejectionFixture("UNDO");
  try {
    const undo = (id) => jsonRequest(`/api/attendance/${id}/reject-time-in/undo`, jsonBody(f.supervisor.token, "POST", {}));
    const today = await f.log();
    assert.equal((await undo(today)).response.status, 409, "nothing to take back yet");
    assert.equal((await f.rejectPhoto(today)).response.status, 200);
    assert.equal((await f.pool.query(`SELECT liveness_strict FROM students WHERE student_id = $1`, [f.sid])).rows[0].liveness_strict, true);

    const undone = await undo(today);
    assert.equal(undone.response.status, 200, JSON.stringify(undone.body));
    const log = await f.row(today);
    assert.deepEqual(
      [log.rejection_scope, log.photo_rejection_reason, log.photo_redo_status, log.photo_rejected_at, log.status],
      [null, null, null, null, "Pending"]
    );
    assert.equal((await f.pool.query(`SELECT liveness_strict FROM students WHERE student_id = $1`, [f.sid])).rows[0].liveness_strict, false);
    assert.equal((await f.pool.query(`SELECT 1 FROM notifications WHERE student_id = $1 AND title = 'Time-in photo accepted after all'`, [f.sid])).rows.length, 1);
    assert.equal((await undo(today)).response.status, 409, "once");

    // After 15 minutes, or once a new photo was taken: an appeal remains instead.
    assert.equal((await f.rejectPhoto(today)).response.status, 200);
    await f.pool.query(`UPDATE attendance SET photo_rejected_at = NOW() - INTERVAL '16 minutes' WHERE id = $1`, [today]);
    assert.equal((await undo(today)).response.status, 409);
    await f.pool.query(`UPDATE attendance SET photo_rejected_at = NOW(), photo_redo_status = 'submitted' WHERE id = $1`, [today]);
    assert.equal((await undo(today)).response.status, 409);
    await new Promise((resolve) => setTimeout(resolve, 300));
    const audit = await f.pool.query(`SELECT 1 FROM audit_log WHERE action = 'attendance.reject_time_in_undo' AND entity_id = $1`, [String(today)]);
    assert.equal(audit.rows.length, 1);
  } finally {
    await f.cleanup();
  }
});

test("the student is reminded once, 15 minutes before a set redo deadline", async (t) => {
  if (needsWrites(t)) return;
  require("tsx/cjs");
  const { remindRedoDeadlines } = require("../src/services/photoRedo.ts");
  const told = [];
  const f = await rejectionFixture("REMIND");
  const g = await rejectionFixture("LATER");
  const h = await rejectionFixture("LUNCH");
  try {
    const soon = await f.log({ lunch: "ended" });
    const later = await g.log({ lunch: "ended" });
    const atLunch = await h.log({ lunch: "open" });
    for (const [fixture, id] of [[f, soon], [g, later], [h, atLunch]]) assert.equal((await fixture.rejectPhoto(id)).response.status, 200);
    await f.pool.query(`UPDATE attendance SET photo_redo_due_at = NOW() + INTERVAL '10 minutes' WHERE id = $1`, [soon]);
    await g.pool.query(`UPDATE attendance SET photo_redo_due_at = NOW() + INTERVAL '30 minutes' WHERE id = $1`, [later]);
    const pool = localTestPool();
    try {
      await remindRedoDeadlines(pool, async (notification) => told.push(notification));
      await remindRedoDeadlines(pool, async (notification) => told.push(notification));
    } finally {
      await pool.end();
    }
    const mine = (sid) => told.filter((notification) => notification.studentId === sid);
    assert.equal(mine(f.sid).length, 1, "reminded once");
    assert.match(mine(f.sid)[0].message, /due by \d{1,2}:\d{2} (AM|PM)/);
    assert.equal(mine(g.sid).length, 0, "not yet");
    assert.equal(mine(h.sid).length, 0, "a window that closes at Back from lunch has no set end");
  } finally {
    await f.cleanup();
    await g.cleanup();
    await h.cleanup();
  }
});
