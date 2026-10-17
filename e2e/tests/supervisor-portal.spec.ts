import { expect, test } from "@playwright/test";
import { API, api, apiSession, signIn } from "./helpers";

/*
|--------------------------------------------------------------------------
| THE SUPERVISOR PORTAL: PANELS, NOTIFICATIONS, THE ATTENDANCE VIEW
|--------------------------------------------------------------------------
|
| A new intern uploads a requirement and times in. The supervisor sees the
| intern's documents panel first and open; the open log under "Needs
| review", marked as left out of Verify all; a Group by, Sort and filter
| choice that is still there after a reload; and a notification about a
| file already decided opening that file on the Documents page. The
| coordinator finds the file in the intern's panel inside their block.
|
*/

const PDF = new TextEncoder().encode("%PDF-1.4\n%%EOF\n");
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0xff, 0xd9]);

test("supervisor portal: a panel per intern, the attendance view bar, and notifications that open the record", async ({ browser }) => {
  const coordinator = await apiSession("coordinator");
  const supervisor = await apiSession("supervisor");
  const id = `SUP7-${Date.now()}`;
  const email = `${id.toLowerCase()}@portal.test`;
  const name = `Aaron Panel ${id.slice(-5)}`;
  expect((await api(coordinator.token, "POST", "/api/coordinator/students", {
    student_id: id, email, password: "PanelStart123!", name, supervisor_id: supervisor.id,
  })).status).toBe(201);
  const login = async (password: string) =>
    (await (await fetch(`${API}/api/login/student`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }),
    })).json()).token as string;
  expect((await api(await login("PanelStart123!"), "PUT", `/api/students/${id}/password`, { current_password: "PanelStart123!", new_password: "PanelCheck456!" })).status).toBe(200);
  const token = await login("PanelCheck456!");
  const privacy = await api<{ notice: { version: string } }>(token, "GET", `/api/students/${id}/privacy`);
  await api(token, "POST", `/api/students/${id}/privacy/consent`, { version: privacy.body.notice.version });

  // A requirement file, waiting for the supervisor.
  const requirements = (await api<{ requirements: string[] }>(coordinator.token, "GET", "/api/coordinator/documents")).body.requirements;
  const upload = new FormData();
  upload.append("doc_type", requirements[0]);
  upload.append("file", new Blob([PDF], { type: "application/pdf" }), "panel-check.pdf");
  const uploaded = await fetch(`${API}/api/documents`, { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: upload });
  const documentBody = await uploaded.json();
  expect(uploaded.status, JSON.stringify(documentBody)).toBe(201);
  const documentId = (documentBody.document?.id ?? documentBody.id) as number;

  // Today's time-in, still open: waiting, but not something Verify all can take.
  const challenge = (await api<{ ticket: string; prompts: string[] }>(token, "POST", "/api/attendance/liveness-challenge")).body;
  const form = new FormData();
  form.set("student_id", id);
  form.set("liveness_ticket", challenge.ticket);
  form.set("liveness_report", JSON.stringify({ completed: challenge.prompts, flash: "skipped", attempts: 1 }));
  form.set("image", new Blob([JPEG], { type: "image/jpeg" }), "time-in.jpg");
  expect((await fetch(`${API}/api/attendance`, { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: form })).status).toBe(201);

  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const sp = await context.newPage();
    await signIn(sp, "supervisor");

    // Documents: the intern's panel is first and open, with what waits and since when.
    await sp.goto("/supervisor/documents");
    const panel = sp.getByRole("button", { name: new RegExp(name) });
    await expect(panel).toHaveAttribute("aria-expanded", "true", { timeout: 20_000 });
    await expect(panel).toContainText("1 to review");
    await expect(panel).toContainText("since");
    await expect(sp.getByText("panel-check.pdf")).toBeVisible();
    await panel.click();
    await expect(panel).toHaveAttribute("aria-expanded", "false");
    await expect(sp.getByText("panel-check.pdf")).toBeHidden();

    // Attendance: "Needs review" first, and the open log says why Verify all leaves it out.
    await sp.goto("/supervisor/attendance");
    const firstGroup = sp.locator("tbody").first().locator("th");
    await expect(firstGroup).toContainText("Needs review", { timeout: 20_000 });
    const row = sp.locator("tbody tr").filter({ hasText: name });
    await expect(row).toContainText("Not in Verify all: still on the clock");

    // A view chosen here is still there after a reload.
    await sp.getByLabel("Group by").selectOption("intern");
    await sp.getByLabel("Sort").selectOption("intern");
    const chip = sp.getByRole("button", { name: /^Needs review/ });
    await chip.click();
    await expect(chip).toHaveAttribute("aria-pressed", "true");
    await expect(sp.locator("tbody th").filter({ hasText: name })).toContainText("need review");
    await sp.reload();
    await expect(sp.getByLabel("Group by")).toHaveValue("intern");
    await expect(sp.getByLabel("Sort")).toHaveValue("intern");
    await expect(sp.getByRole("button", { name: /^Needs review/ })).toHaveAttribute("aria-pressed", "true");
    await sp.getByRole("button", { name: "Clear filters" }).click();
    await sp.getByLabel("Group by").selectOption("status");
    await sp.getByLabel("Sort").selectOption("waiting");

    // The upload's notification, once the file is decided, opens the file on its own page.
    expect((await api(supervisor.token, "PATCH", `/api/documents/${documentId}/review`, { status: "Approved", review_notes: "" })).status).toBe(200);
    const list = await api<{ notifications: { link: string | null; entity_type: string | null; entity_id: string | null }[] }>(
      supervisor.token, "GET", `/api/notifications/supervisor/${encodeURIComponent(supervisor.id)}`
    );
    const about = list.body.notifications.find((item) => item.entity_type === "document" && item.entity_id === String(documentId));
    expect(about?.link).toBe(`/supervisor/dashboard?focus=document-${documentId}`);
    await sp.goto(about!.link!);
    await expect(sp).toHaveURL(new RegExp(`/supervisor/documents\\?focus=document-${documentId}$`), { timeout: 20_000 });
    await expect(sp.getByText("That one is already decided. Here it is with the rest.")).toBeVisible();
    await expect(sp.getByRole("button", { name: new RegExp(name) })).toHaveAttribute("aria-expanded", "true");
    await context.close();

    // The coordinator: the file in the intern's panel, inside their block.
    const coordinatorContext = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const cp = await coordinatorContext.newPage();
    await signIn(cp, "coordinator");
    await cp.goto("/coordinator/documents");
    await cp.getByRole("tab", { name: "By college, program and block" }).click();
    // College, program and block are folded; open them all to reach the intern.
    await cp.locator("details").first().waitFor();
    await cp.evaluate(() => document.querySelectorAll("details").forEach((item) => { (item as HTMLDetailsElement).open = true; }));
    const studentPanel = cp.getByRole("button", { name: new RegExp(name) });
    await expect(studentPanel).toHaveAttribute("aria-expanded", "false");
    await studentPanel.click();
    await expect(cp.getByText("panel-check.pdf").first()).toBeVisible();
    await coordinatorContext.close();
  } finally {
    await api(coordinator.token, "PATCH", `/api/coordinator/students/${id}/status`, { is_active: false });
  }
});
