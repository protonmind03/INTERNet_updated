import { expect, test } from "@playwright/test";
import { api, apiSession, signIn, today } from "./helpers";

/*
|--------------------------------------------------------------------------
| TODAY: NEEDS YOUR ATTENTION, UP NEXT (revisions, November 2026)
|--------------------------------------------------------------------------
|
| Every item that needs the trainee stays on Today until done or hidden,
| drawn as a priority stack (change1108): the most urgent on top with a
| rubber-stamp mark, the rest peeking out under it, arrows to step through,
| and "See all" to fan them out into a list. The x hides one for the session; the first time it
| asks, saying how soon and why it matters, with "Don't ask me again during
| this session"; after that, items hide at once and "Clear all" appears.
| Hidden items fold into one line and can be shown again, stay hidden on a
| reload, and are back in a new session. Up next is a row of cards.
|
*/

test.use({ viewport: { width: 1280, height: 900 } });

test("attention items hide for the session, asking first once, with Clear all after", async ({ page, browser }) => {
  const supervisor = await apiSession("supervisor");
  const student = await apiSession("student");
  const stamp = Date.now();
  const titles = [`Shelve the returned books (${stamp})`, `Label the new folders (${stamp})`];
  const made: number[] = [];
  for (const title of titles) {
    const created = await api<{ task?: { id: number } }>(supervisor.token, "POST", "/api/tasks", {
      student_id: student.id,
      title,
      description: "Made by the Today journey.",
      due_date: today(),
      priority: "Medium",
    });
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    if (created.body.task?.id) made.push(created.body.task.id);
  }

  try {
    await signIn(page, "student");
    const card = page.locator("section.attention-card");
    await expect(card.getByRole("heading", { name: /Needs your attention/ })).toBeVisible();
    // The stack: one card on top, with its stamp, and the arrows through the rest.
    await expect(card.locator("article.attention-top")).toHaveCount(1);
    await expect(card.locator(".attention-top .inb-stamp")).toBeVisible();
    await expect(card.getByText(/^1 of \d+$/)).toBeVisible();
    await card.getByRole("button", { name: "The next item" }).click();
    await expect(card.getByText(/^2 of \d+$/)).toBeVisible();
    // See all fans the stack out into a list.
    await card.getByRole("button", { name: /^See all \d+$/ }).click();
    for (const title of titles) await expect(card.getByText(title)).toBeVisible();
    await expect(card.getByText("Due today").first()).toBeVisible();
    // No Clear all until the trainee asks not to be asked.
    await expect(card.getByRole("button", { name: "Clear all" })).toHaveCount(0);

    // The first hide asks, and says why it matters.
    await card.getByRole("button", { name: `Hide “${titles[0]}” for now` }).click();
    const ask = page.getByRole("dialog", { name: "Hide this for now?" });
    await expect(ask).toBeVisible();
    await expect(ask.getByText(/Your supervisor is waiting for this work/)).toBeVisible();
    await ask.getByRole("checkbox", { name: "Don't ask me again during this session" }).check();
    await ask.getByRole("button", { name: "Hide for now" }).click();
    await expect(card.getByText(titles[0])).toHaveCount(0);
    await expect(card.getByText(/hidden for now/)).toBeVisible();

    // Not asked again; Clear all is there now and hides the rest at once.
    await expect(card.getByRole("button", { name: "Clear all" })).toBeVisible();
    await card.getByRole("button", { name: "Clear all" }).click();
    await expect(page.getByRole("dialog", { name: /Hide/ })).toHaveCount(0);
    await expect(card.getByText(titles[1])).toHaveCount(0);

    // Still hidden on a reload of the same session…
    await page.reload();
    await expect(card.getByText(/hidden for now/)).toBeVisible();
    await expect(card.getByText(titles[1])).toHaveCount(0);
    // …and shown again on asking.
    await card.getByRole("button", { name: /^Show (it|them)$/ }).click();
    await card.getByRole("button", { name: /^See all \d+$/ }).click();
    for (const title of titles) await expect(card.getByText(title)).toBeVisible();

    // A new session starts with everything showing.
    await card.getByRole("button", { name: `Hide “${titles[0]}” for now` }).click();
    const fresh = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
    await signIn(fresh, "student");
    await fresh.locator("section.attention-card").getByRole("button", { name: /^See all \d+$/ }).click();
    await expect(fresh.locator("section.attention-card").getByText(titles[0])).toBeVisible();
    await fresh.context().close();

    // Up next is a row of cards to move through.
    await expect(page.getByRole("heading", { name: "Up next" })).toBeVisible();
  } finally {
    for (const id of made) await api(supervisor.token, "DELETE", `/api/tasks/${id}`);
  }
});
