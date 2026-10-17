import { expect, test, type Page } from "@playwright/test";
import { ACCOUNTS, API, api, apiSession, signIn } from "./helpers";

/*
|--------------------------------------------------------------------------
| WRITING A MESSAGE
|--------------------------------------------------------------------------
|
| A new student writes to their supervisor from Profile: the composer covers
| the page (inert behind it), keeps the keyboard inside, closes on Esc and
| keeps the draft. The supervisor opens the thread from the "New message"
| notification's link and replies; the coordinator writes from a student's
| record and from the Supervisors page.
|
*/

type Notice = { title: string; link: string | null };

async function newMessageLink(token: string, role: "student" | "supervisor", id: string): Promise<string> {
  let link = "";
  await expect(async () => {
    const list = await api<{ notifications: Notice[] }>(token, "GET", `/api/notifications/${role}/${encodeURIComponent(id)}`);
    link = list.body.notifications.find((item) => item.title === "New message" && item.link?.includes("?thread="))?.link ?? "";
    expect(link).not.toBe("");
  }).toPass({ timeout: 10_000 });
  return link;
}

/** Tab many times: focus never leaves the dialog. */
async function focusStaysIn(page: Page) {
  for (let i = 0; i < 12; i += 1) {
    await page.keyboard.press("Tab");
    expect(await page.evaluate(() => Boolean(document.activeElement?.closest('[role="dialog"]')))).toBe(true);
  }
}

test("messages: from Profile to the supervisor, a reply from the notification, and the coordinator's entry points", async ({ browser }) => {
  const coordinator = await apiSession("coordinator");
  const supervisor = await apiSession("supervisor");
  const id = `MSG-${Date.now()}`;
  const email = `${id.toLowerCase()}@message.test`;
  const name = `Mira Check ${id.slice(-5)}`;
  expect((await api(coordinator.token, "POST", "/api/coordinator/students", {
    student_id: id, email, password: "MessageStart123!", name, supervisor_id: supervisor.id,
  })).status).toBe(201);
  const login = async (password: string) =>
    (await (await fetch(`${API}/api/login/student`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }),
    })).json()).token as string;
  expect((await api(await login("MessageStart123!"), "PUT", `/api/students/${id}/password`, { current_password: "MessageStart123!", new_password: "MessageCheck456!" })).status).toBe(200);
  const token = await login("MessageCheck456!");
  const privacy = await api<{ notice: { version: string } }>(token, "GET", `/api/students/${id}/privacy`);
  await api(token, "POST", `/api/students/${id}/privacy/consent`, { version: privacy.body.notice.version });

  // The student, from Profile.
  const studentContext = await browser.newContext();
  const page = await studentContext.newPage();
  await signIn(page, "student", { ...ACCOUNTS.student, email, password: "MessageCheck456!" });
  await page.goto("/profile");
  await expect(page.getByRole("heading", { name: "Your supervisor" })).toBeVisible({ timeout: 20_000 });
  // The supervisor card comes before the coordinator card.
  const toSupervisor = page.getByRole("button", { name: /^Message / }).first();
  await toSupervisor.click();
  const dialog = page.getByRole("dialog", { name: "New message" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("Supervisor", { exact: false }).first()).toBeVisible();
  await expect(dialog.getByLabel("Subject")).toHaveValue("A question about my OJT");
  expect(await page.evaluate(() => document.getElementById("root")?.hasAttribute("inert"))).toBe(true);
  const body = dialog.getByLabel("Message");
  await expect(body).toBeFocused();
  await body.fill("Can I start at nine tomorrow?");
  await expect(dialog.getByText("29 of 4,000 characters")).toBeVisible();
  await focusStaysIn(page);

  // Esc closes it; the draft is there when it opens again.
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  expect(await page.evaluate(() => document.getElementById("root")?.hasAttribute("inert"))).toBe(false);
  await page.waitForTimeout(600);
  await toSupervisor.click();
  await expect(dialog.getByLabel("Message")).toHaveValue("Can I start at nine tomorrow?");
  await dialog.getByRole("button", { name: "Send" }).click();
  await expect(page.getByText("Delivered in INTERNet. Email is not switched on.")).toBeVisible();
  await expect(dialog).toBeHidden();

  // The supervisor opens it from the notification, in reply mode.
  const link = await newMessageLink(supervisor.token, "supervisor", supervisor.id);
  expect(link).toMatch(/^\/supervisor\/dashboard\?thread=\d+$/);
  const supervisorContext = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const sp = await supervisorContext.newPage();
  await signIn(sp, "supervisor");
  await sp.goto(link);
  const reply = sp.getByRole("dialog", { name: "Reply" });
  await expect(reply.getByText("Can I start at nine tomorrow?")).toBeVisible({ timeout: 20_000 });
  await expect(reply.locator("dl").getByText(name)).toBeVisible();
  await reply.getByLabel("Your reply").fill("Yes, nine is fine.");
  await reply.getByRole("button", { name: "Send" }).click();
  await expect(sp.getByText("Delivered in INTERNet. Email is not switched on.")).toBeVisible();
  await expect(sp).not.toHaveURL(/thread=/);
  await supervisorContext.close();

  // Back to the student: the reply is in the thread.
  const back = await newMessageLink(token, "student", id);
  await page.goto(back);
  const thread = page.getByRole("dialog", { name: "Reply" });
  await expect(thread.getByText("Yes, nine is fine.")).toBeVisible({ timeout: 20_000 });
  await expect(thread.getByText("Can I start at nine tomorrow?")).toBeVisible();
  await thread.getByRole("button", { name: "Close" }).first().click();
  await studentContext.close();

  // The coordinator: the student's record and the Supervisors page.
  const coordinatorContext = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const cp = await coordinatorContext.newPage();
  await signIn(cp, "coordinator");
  await cp.goto(`/coordinator/students/${encodeURIComponent(id)}`);
  await cp.getByRole("button", { name: "Message Mira" }).click();
  const toStudent = cp.getByRole("dialog", { name: "New message" });
  await expect(toStudent.locator("dl").getByText(name)).toBeVisible();
  await expect(toStudent.getByText(`Student record, ${name}`)).toBeVisible();
  await cp.keyboard.press("Escape");
  await expect(toStudent).toBeHidden();

  await cp.goto("/coordinator/supervisors");
  await cp.getByRole("button", { name: /^Message / }).first().click();
  const writeSupervisor = cp.getByRole("dialog", { name: "New message" });
  await expect(writeSupervisor.getByLabel("Subject")).toHaveValue("About your interns");
  await writeSupervisor.getByLabel("Message").fill("Please send the mid-term ratings by Friday.");
  await writeSupervisor.getByRole("button", { name: "Send" }).click();
  await expect(cp.getByText("Delivered in INTERNet. Email is not switched on.")).toBeVisible();
  await coordinatorContext.close();
});
