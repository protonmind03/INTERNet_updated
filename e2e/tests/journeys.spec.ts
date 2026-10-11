import { expect, test } from "@playwright/test";
import { ACCOUNTS, api, apiSession, signIn, today, type Role } from "./helpers";

/*
| The journeys a real person takes, start to finish, in a real browser.
| Each test sets up what it needs through the API and clears it afterwards.
*/

test.describe("signing in and out", () => {
  for (const role of Object.keys(ACCOUNTS) as Role[]) {
    test(`a ${role} signs in and lands on their portal`, async ({ page }) => {
      await signIn(page, role);
      // The portal has loaded: its content is there and no error screen is.
      await expect(page.locator("main").first()).toBeVisible();
      await expect(page.getByText("Something went wrong")).toHaveCount(0);
    });
  }

  test("a wrong password is refused, and says so", async ({ page }) => {
    await page.goto("/");
    await page.locator("#inb-login-id").fill(ACCOUNTS.student.email);
    await page.locator("#inb-login-pw").fill("not-the-password");
    await page.locator('button[type="submit"]').click();
    await expect(page.getByRole("alert").first()).toBeVisible();
    await expect(page).toHaveURL(/\/$/);
  });

  test("a signed-out visitor cannot open a portal page", async ({ page }) => {
    await page.goto("/coordinator/students");
    await expect(page).toHaveURL(/\/$/);
  });
});

test.describe("time-in", () => {
  test("a student is asked to agree to the privacy notice, then the camera check starts", async ({ page }) => {
    const student = await apiSession("student");
    const log = await api<{ attendance: { date: string; time_out: string | null }[] }>(
      student.token,
      "GET",
      `/api/attendance/${encodeURIComponent(student.id)}`
    );
    test.skip(
      log.body.attendance.some((entry) => String(entry.date).slice(0, 10) === today()),
      "The demo student already has a log for today, so Time in is not offered."
    );
    const privacy = await api<{ current: boolean }>(
      student.token,
      "GET",
      `/api/students/${encodeURIComponent(student.id)}/privacy`
    );

    await signIn(page, "student");
    await page.getByRole("button", { name: "Time in", exact: true }).click();
    if (!privacy.body.current) {
      const notice = page.getByRole("dialog", { name: "Privacy notice" });
      await expect(notice).toBeVisible();
      await notice.getByRole("button", { name: "I agree" }).click();
    }
    const camera = page.getByRole("dialog", { name: "Time in" });
    await expect(camera).toBeVisible();
    // The fake camera is live in the dialog.
    await expect
      .poll(async () => camera.locator("video").evaluate((video: HTMLVideoElement) => !video.paused && video.readyState >= 2), {
        timeout: 30_000,
      })
      .toBe(true);
  });
});

test.describe("the floating next-step button", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("on a phone it is on Today and Tasks, not on Attendance, and opens the time-in dialog", async ({ page }) => {
    const student = await apiSession("student");
    const log = await api<{ attendance: { date: string }[] }>(
      student.token,
      "GET",
      `/api/attendance/${encodeURIComponent(student.id)}`
    );
    test.skip(
      log.body.attendance.some((entry) => String(entry.date).slice(0, 10) === today()),
      "The demo student already has a log for today, so the next step is not Time in."
    );
    const privacy = await api<{ current: boolean }>(
      student.token,
      "GET",
      `/api/students/${encodeURIComponent(student.id)}/privacy`
    );

    await signIn(page, "student");
    const main = page.getByRole("navigation", { name: "Main" });
    const button = page.locator("button.float-fab");
    await expect(button).toBeVisible();
    await expect(button).toHaveAccessibleName("Time in");
    // 56 px tall, in the bottom right corner, clear of the tab bar.
    const box = (await button.boundingBox())!;
    const bar = (await main.last().boundingBox())!;
    expect(box.height).toBe(56);
    expect(box.x + box.width).toBeGreaterThan(390 - 24);
    expect(box.y + box.height).toBeLessThanOrEqual(bar.y);

    await main.getByRole("link", { name: "Tasks" }).click();
    await expect(page).toHaveURL(/\/task$/);
    await expect(button).toBeVisible();

    // Attendance has the full card, so the button stays away.
    await main.getByRole("link", { name: "Attendance" }).click();
    await expect(page).toHaveURL(/\/daily-log$/);
    await expect(page.getByRole("button", { name: "Time in", exact: true })).toBeVisible();
    await expect(button).toHaveCount(0);

    await main.getByRole("link", { name: "Today" }).click();
    await button.click();
    if (!privacy.body.current) {
      const notice = page.getByRole("dialog", { name: "Privacy notice" });
      await expect(notice).toBeVisible();
      await notice.getByRole("button", { name: "I agree" }).click();
    }
    await expect(page.getByRole("dialog", { name: "Time in" })).toBeVisible();
    // A dialog is open: the button is out of its way.
    await expect(button).toHaveCount(0);
  });
});

test.describe("weekly journal", () => {
  test("a student writes it, the supervisor returns it, the student sends it again, and it is reviewed", async ({ browser }) => {
    const student = await apiSession("student");
    const supervisor = await apiSession("supervisor");
    const journals = await api<{ current_week_start: string; journals: { id: number; week_start: string; status: string }[] }>(
      student.token,
      "GET",
      `/api/journals/student/${encodeURIComponent(student.id)}`
    );
    const existing = journals.body.journals.find((item) => item.week_start === journals.body.current_week_start);
    test.skip(existing?.status === "Reviewed", "This week's journal is already reviewed and closed.");

    const did = `Sorted and encoded delivery receipts for the accounting desk (${Date.now()}).`;
    const studentPage = await (await browser.newContext()).newPage();
    await signIn(studentPage, "student");
    await studentPage.goto("/journal");
    await studentPage
      .getByRole("button", { name: existing ? /^Edit/ : "Write", exact: !existing })
      .first()
      .click();
    await studentPage.locator("#journal-activities").fill(did);
    await studentPage.locator("#journal-learnings").fill("How receipts are numbered here, and how to find one in the ledger.");
    await studentPage.locator('button[form="journal-form"]').click();
    await expect(studentPage.getByText("Waiting for your supervisor").first()).toBeVisible();

    const supervisorPage = await (await browser.newContext({ viewport: { width: 1280, height: 900 }, isMobile: false })).newPage();
    await signIn(supervisorPage, "supervisor");
    await supervisorPage.getByRole("tab", { name: /^Journals/ }).click();
    await expect(supervisorPage.getByText(did)).toBeVisible();
    await supervisorPage.locator("#decision-note").fill("Name the tasks that were yours.");
    await supervisorPage.getByRole("button", { name: "Return", exact: true }).click();
    await expect(supervisorPage.getByText(/Journal returned to/)).toBeVisible();

    await studentPage.reload();
    await expect(studentPage.getByText("Returned to you").first()).toBeVisible();
    await expect(studentPage.getByText("Name the tasks that were yours.").first()).toBeVisible();
    await studentPage.getByRole("button", { name: "Edit and send again" }).first().click();
    await studentPage.locator('button[form="journal-form"]').click();
    await expect(studentPage.getByText("Waiting for your supervisor").first()).toBeVisible();

    await supervisorPage.reload();
    await supervisorPage.getByRole("tab", { name: /^Journals/ }).click();
    await supervisorPage.getByRole("button", { name: "Mark reviewed" }).click();
    await expect(supervisorPage.getByText(/journal marked reviewed/)).toBeVisible();

    // Put it back to waiting, so the next run can do the same.
    const after = await api<{ journals: { id: number; week_start: string }[] }>(supervisor.token, "GET", "/api/journals/supervisor");
    const mine = after.body.journals.find((item) => item.week_start === journals.body.current_week_start);
    if (mine) await api(supervisor.token, "PATCH", `/api/journals/${mine.id}/review`, { status: "Submitted" });
  });
});

test.describe("holidays", () => {
  test("a holiday the coordinator adds shows on the student's schedule and time record", async ({ browser }) => {
    const coordinator = await apiSession("coordinator");
    const name = `Check Day ${Date.now() % 100000}`;
    const clear = async () => {
      const list = await api<{ holidays: { id: number; date: string; name: string }[] }>(coordinator.token, "GET", "/api/holidays");
      for (const holiday of list.body.holidays.filter((item) => item.date === today() || item.name.startsWith("Check Day"))) {
        await api(coordinator.token, "DELETE", `/api/coordinator/holidays/${holiday.id}`);
      }
    };
    await clear();
    try {
      const coordinatorPage = await (await browser.newContext({ viewport: { width: 1280, height: 900 }, isMobile: false })).newPage();
      await signIn(coordinatorPage, "coordinator");
      await coordinatorPage.goto("/coordinator/holidays");
      await coordinatorPage.getByRole("button", { name: "Add holiday" }).first().click();
      await coordinatorPage.locator("#holiday-date").fill(today());
      await coordinatorPage.locator("#holiday-name").fill(name);
      await coordinatorPage.locator('button[form="holiday-form"]').click();
      await expect(coordinatorPage.getByText(name)).toBeVisible();

      const studentPage = await (await browser.newContext()).newPage();
      await signIn(studentPage, "student");
      await studentPage.goto("/schedule");
      await expect(studentPage.getByText(`Holiday this week: ${name}`)).toBeVisible();
      await expect(studentPage.getByText(/Today is a holiday/)).toBeVisible();
      await studentPage.goto("/time-record");
      await expect(studentPage.getByText(`Holiday: ${name}`)).toBeVisible();
    } finally {
      await clear();
    }
  });
});

test.describe("completion", () => {
  test("the checklist lists six things, and asking for a review waits until they are done", async ({ page }) => {
    const student = await apiSession("student");
    const checklist = await api<{ ready: boolean; requested_at: string | null; items: { done: boolean }[] }>(
      student.token,
      "GET",
      `/api/students/${encodeURIComponent(student.id)}/completion`
    );
    await signIn(page, "student");
    await page.goto("/student/completion");
    const done = checklist.body.items.filter((item) => item.done).length;
    await expect(page.getByText(`${done} of 6 done`)).toBeVisible();
    if (!checklist.body.requested_at) {
      const request = page.getByRole("button", { name: "Request completion review" });
      if (checklist.body.ready) await expect(request).toBeEnabled();
      else await expect(request).toBeDisabled();
    }
  });
});

test.describe("the student's menu", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("on a phone: five tabs, two things under More, and the Resolution Center under the avatar", async ({ page }) => {
    await signIn(page, "student");
    const bar = page.getByRole("navigation", { name: "Main" }).last();
    for (const name of ["Today", "Attendance", "Tasks", "Documents"]) {
      await expect(bar.getByRole("link", { name })).toBeVisible();
    }

    await bar.getByRole("button", { name: "More" }).click();
    const more = page.getByRole("dialog", { name: "More" });
    await expect(more.getByRole("link")).toHaveText(["Schedule", "Weekly journal"]);
    await more.getByRole("link", { name: "Schedule" }).click();
    await expect(page).toHaveURL(/\/schedule$/);

    await page.getByRole("button", { name: /Account menu/ }).click();
    await expect(page.getByRole("button", { name: "Profile", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign out", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Resolution Center", exact: true }).click();
    await expect(page).toHaveURL(/\/student\/resolution/);
    await expect(page.getByRole("tab", { name: "Concerns" })).toHaveAttribute("aria-selected", "true");
    await page.getByRole("tab", { name: "Evaluations" }).click();
    await expect(page.getByRole("heading", { name: "Rate your company" })).toBeVisible();
  });

  test("the addresses of the pages that moved still open", async ({ page }) => {
    await signIn(page, "student");
    await page.goto("/report");
    await expect(page).toHaveURL(/\/student\/resolution\?tab=concerns$/);
    await expect(page.getByRole("heading", { name: "Report a concern" })).toBeVisible();
    await page.goto("/student/feedback");
    await expect(page).toHaveURL(/\/student\/resolution\?tab=evaluations$/);
    await expect(page.getByRole("tab", { name: "Evaluations" })).toHaveAttribute("aria-selected", "true");
    // Out of the menu, still pages.
    for (const [path, heading] of [
      ["/notifications", "Notifications"],
      ["/announcements", "Announcements"],
      ["/student/completion", "Completion"],
    ]) {
      await page.goto(path);
      await expect(page).toHaveURL(new RegExp(`${path}$`));
      await expect(page).toHaveTitle(new RegExp(`^${heading}`));
    }
    // The checklist itself is on Profile.
    await page.goto("/profile");
    await expect(page.getByRole("heading", { name: "Completion checklist" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Report a concern" })).toHaveAttribute(
      "href",
      "/student/resolution?tab=concerns"
    );
  });
});
