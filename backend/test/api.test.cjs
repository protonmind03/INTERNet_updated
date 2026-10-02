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

  const review = await jsonRequest(
    "/api/documents/1/review",
    jsonBody(coordinatorToken, "PATCH", { status: "Approved" })
  );
  assert.equal(review.response.status, 403);

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
