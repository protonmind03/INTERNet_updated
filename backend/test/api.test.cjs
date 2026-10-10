const assert = require("node:assert/strict");
const { before, test } = require("node:test");

const apiBaseUrl = new URL(
  process.env.API_BASE_URL || "http://127.0.0.1:5001"
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