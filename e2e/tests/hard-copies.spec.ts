import { expect, test } from "@playwright/test";
import { API, api, apiSession, signIn, expectAccessible } from "./helpers";

/*
|--------------------------------------------------------------------------
| HARD COPIES RECEIVED, AND THE TRANSMITTAL LETTER (Phase 2.4)
|--------------------------------------------------------------------------
|
| A made-up trainee of the demo supervisor uploads a made-up requirement,
| which the supervisor approves. On the trainee's
| Documents tab the coordinator records its hard copy, sees "Hard copy
| received" there and on the Documents list, and prints the transmittal
| letter. The requirement and the trainee are deactivated at the end.
|
*/

const stamp = Date.now().toString(36);
const requirementName = `Made Up Endorsement ${stamp}`;
const studentId = `HCE-${stamp}`.toUpperCase();
const email = `${studentId.toLowerCase()}@demo.invalid`;
let requirementId = 0;

test.beforeAll(async () => {
  const coordinator = await apiSession("coordinator");
  const supervisor = await apiSession("supervisor");
  const requirement = await api<{ requirement: { id: number } }>(coordinator.token, "POST", "/api/coordinator/requirements", { name: requirementName, description: "Made up for a test." });
  expect(requirement.status, JSON.stringify(requirement.body)).toBe(201);
  requirementId = requirement.body.requirement.id;
  const made = await api(coordinator.token, "POST", "/api/coordinator/students", { student_id: studentId, email, password: "PaperStart123!", name: "Made Up Paper Trainee", supervisor_id: supervisor.id });
  expect(made.status, JSON.stringify(made.body)).toBe(201);
  const first = await (await fetch(`${API}/api/login/student`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password: "PaperStart123!" }) })).json();
  expect((await api(first.token, "PUT", `/api/students/${studentId}/password`, { current_password: "PaperStart123!", new_password: "PaperCheck4567!" })).status).toBe(200);
  const student = await (await fetch(`${API}/api/login/student`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password: "PaperCheck4567!" }) })).json();
  const privacy = await api<{ notice: { version: string } }>(student.token, "GET", `/api/students/${studentId}/privacy`);
  expect((await api(student.token, "POST", `/api/students/${studentId}/privacy/consent`, { version: privacy.body.notice.version })).status).toBe(200);

  const form = new FormData();
  form.append("doc_type", requirementName);
  form.append("file", new Blob(["%PDF-1.4\n% made up endorsement\n%%EOF\n"], { type: "application/pdf" }), "endorsement.pdf");
  const uploaded = await fetch(`${API}/api/documents`, { method: "POST", headers: { Authorization: `Bearer ${student.token}` }, body: form });
  const body = await uploaded.json();
  expect(uploaded.status, JSON.stringify(body)).toBe(201);
  const approved = await api(supervisor.token, "PATCH", `/api/documents/${body.document.id}/review`, { status: "Approved" });
  expect(approved.status, JSON.stringify(approved.body)).toBe(200);
});

test.afterAll(async () => {
  const coordinator = await apiSession("coordinator");
  await api(coordinator.token, "PATCH", `/api/coordinator/students/${studentId}/status`, { is_active: false });
  if (requirementId) await api(coordinator.token, "PUT", `/api/coordinator/requirements/${requirementId}`, { name: requirementName, is_active: false });
});

test("the coordinator records a hard copy and prints the transmittal letter", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page, "coordinator");
  await page.goto(`/coordinator/students/${studentId}?tab=documents`);
  const card = page.getByRole("main").locator("section").filter({ has: page.getByRole("heading", { name: "Hard copies" }) }).first();
  await expect(card).toBeVisible({ timeout: 20_000 });
  await expect(card.getByText("0 of 1 received.")).toBeVisible();

  await card.getByRole("button", { name: new RegExp(`^Record the hard copy\\s*: ${requirementName}$`) }).click();
  const dialog = page.getByRole("dialog", { name: `Hard copy: ${requirementName}` });
  await dialog.getByLabel("Received by").fill("Made Up Office Clerk");
  await dialog.getByLabel(/Transmittal letter scan/).setInputFiles({ name: "transmittal.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4\n% made up transmittal\n%%EOF\n") });
  await dialog.getByRole("button", { name: "Record it" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText("Hard copy recorded.")).toBeVisible();
  await expect(card.getByText("Hard copy received")).toBeVisible();
  await expect(card.getByText("1 of 1 received.")).toBeVisible();
  await expect(card.getByRole("button", { name: /^Transmittal scan/ })).toBeVisible();

  const wide = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(wide, "the student's Documents tab scrolls sideways at 390 px").toBeLessThanOrEqual(1);
  await expectAccessible(page, "Hard copies");

  const download = page.waitForEvent("download");
  await card.getByRole("button", { name: "Print the transmittal letter" }).click();
  expect((await download).suggestedFilename()).toBe(`transmittal-${studentId}.pdf`);

  await page.goto("/coordinator/documents");
  await page.getByRole("searchbox").first().fill(studentId);
  await expect(page.getByText("Hard copy received").first()).toBeVisible({ timeout: 20_000 });
});
