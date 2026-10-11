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

test.describe("the supervisor's menu, and one word for a concern", () => {
  test("Concerns is under the account menu with the coordinator's contact, and announcements are under the bell", async ({ page }) => {
    await signIn(page, "supervisor");
    const bar = page.getByRole("navigation", { name: "Main" }).first();
    await expect(bar.getByRole("link", { name: "Evaluations" })).toBeVisible();
    await expect(bar.getByRole("link", { name: /Incidents|Concerns/ })).toHaveCount(0);

    await page.getByRole("button", { name: /Account menu/ }).click();
    await expect(page.getByText("Your OJT coordinator")).toBeVisible();
    await expect(page.getByRole("link", { name: /@/ })).toHaveAttribute("href", /^mailto:/);
    await expect(page.getByRole("button", { name: "Announcements", exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: "Concerns", exact: true }).click();
    await expect(page).toHaveURL(/\/supervisor\/complaints$/);
    await expect(page.getByRole("heading", { level: 1, name: "Concerns" })).toBeVisible();
    await page.getByRole("button", { name: "Report a concern" }).click();
    await expect(page.getByRole("dialog", { name: "Report a concern" })).toBeVisible();
    await page.keyboard.press("Escape");

    await page.getByRole("button", { name: /^Notifications/ }).click();
    await page.getByRole("tab", { name: "Announcements" }).click();
    await expect(page.getByRole("tabpanel")).toBeVisible();
    // Out of the menu, still a page.
    await page.goto("/supervisor/announcements");
    await expect(page).toHaveTitle(/^Announcements/);
  });

  test("the coordinator's page and sidebar say Concerns, at the same address", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await signIn(page, "coordinator");
    await page.getByRole("link", { name: /^Concerns/ }).first().click();
    await expect(page).toHaveURL(/\/coordinator\/complaints$/);
    await expect(page.getByRole("heading", { level: 1, name: "Concerns" })).toBeVisible();
    await expect(page.getByText(/complaint/i)).toHaveCount(0);
  });
});

test.describe("the coordinator's console", () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test("the dashboard is today, one action list by who acts, and six figures with targets", async ({ page }) => {
    await signIn(page, "coordinator");
    await expect(page.getByRole("heading", { name: "Today's attendance" })).toBeVisible();
    await expect(page.getByText("Scheduled, not yet in")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Action list" })).toBeVisible();
    // The three lists it replaced are gone.
    for (const old of ["Needs attention", "Students to check on", "Alerts"]) {
      await expect(page.getByRole("heading", { name: old, exact: true })).toHaveCount(0);
    }

    const figures = page.getByRole("region", { name: "Key figures" });
    await expect(figures.getByRole("heading", { level: 3 })).toHaveCount(6);
    await expect(figures.getByText(/^Target: /)).toHaveCount(6);
    // "?" states what is counted.
    const first = "Students on track to finish within the term";
    await expect(figures.getByText(/Of the active students, the share whose remaining hours/)).toBeHidden();
    await figures.getByRole("button", { name: `What "${first}" counts` }).click();
    await expect(figures.getByText(/Of the active students, the share whose remaining hours/)).toBeVisible();
    // The card opens the list behind the figure.
    await figures.getByRole("link", { name: first }).click();
    await expect(page).toHaveURL(/\/coordinator\/monitoring\?risk=1$/);

    // The same six cards are on Analytics.
    await page.goto("/coordinator/analytics");
    await expect(page.getByRole("region", { name: "Key figures" }).getByRole("heading", { level: 3 })).toHaveCount(6);
  });

  test("audit filters live in the address, and an export downloads and is itself logged", async ({ page }) => {
    await signIn(page, "coordinator");
    await page.goto("/coordinator/audit");
    await page.getByLabel("Category").selectOption({ label: "Attendance" });
    await expect(page).toHaveURL(/category=attendance/);
    await page.getByLabel("Done by").selectOption({ label: "A supervisor" });
    await page.getByLabel("When").selectOption({ label: "This week" });
    await expect(page).toHaveURL(/role=supervisor/);
    await expect(page).toHaveURL(/when=week/);
    await expect(page.getByText(/\(Philippine time\)/)).toBeVisible();

    // The address alone brings the same view back.
    await page.reload();
    await expect(page.getByLabel("Category")).toHaveValue("attendance");
    await expect(page.getByLabel("Done by")).toHaveValue("supervisor");
    await expect(page.getByLabel("When")).toHaveValue("week");

    await page.getByRole("button", { name: "Clear filters" }).click();
    await expect(page).toHaveURL(/\/coordinator\/audit$/);
    await page.getByLabel("When").selectOption({ label: "Custom dates" });
    await expect(page.getByLabel("From")).toBeVisible();

    // Signing in is not logged, so there may be nothing to export on an empty database.
    const exportButton = page.getByRole("button", { name: "Export CSV" });
    await page.getByRole("button", { name: "Clear filters" }).click();
    await expect(page.getByText(/^\d+ entr(y|ies)/)).toBeVisible();
    if (await exportButton.isEnabled()) {
      const [download] = await Promise.all([page.waitForEvent("download"), exportButton.click()]);
      expect(download.suggestedFilename()).toMatch(/^internet-audit-log-\d{4}-\d{2}-\d{2}\.csv$/);
      await page.getByLabel("Category").selectOption({ label: "Exports of this log" });
      // In the table: the same entries are also laid out for a narrow screen, hidden at this width.
      await expect(page.getByRole("cell", { name: "Exported the audit log" }).first()).toBeVisible();
    }
  });

  test("a student's schedule is edited on their record, and Requirements points there", async ({ page }) => {
    const student = await apiSession("student");
    await signIn(page, "coordinator");
    await page.goto(`/coordinator/students/${encodeURIComponent(student.id)}?tab=schedule`);
    await expect(page.getByRole("tab", { name: "Schedule" })).toHaveAttribute("aria-selected", "true");
    await expect(page.getByRole("heading", { name: "Weekly schedule" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Save schedule" })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Add a day" })).toBeVisible();

    await page.goto(`/coordinator/requirements?student=${encodeURIComponent(student.id)}`);
    await expect(page.getByText(/also on their own record, under the Schedule tab/)).toBeVisible();
    await page.getByRole("link", { name: /Open .* record/ }).click();
    await expect(page).toHaveURL(/\/coordinator\/students\/.+\?tab=schedule$/);
  });
});

test.describe("programs, blocks and the filter bar", () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test("a block is made, a student is placed in it from their form, and the lists filter by it", async ({ page }) => {
    const stamp = String(Date.now()).slice(-5);
    const section = `T${stamp}`;
    await signIn(page, "coordinator");

    // The Programs page lists what the migration seeded.
    await page.getByRole("link", { name: "Programs", exact: true }).click();
    await expect(page).toHaveURL(/\/coordinator\/programs$/);
    await expect(page.getByRole("heading", { name: /College of Computing Sciences/ })).toBeVisible();
    await expect(page.getByText("BS Information Technology", { exact: true }).first()).toBeVisible();
    await expect(page.getByLabel("OJT applies to BS Information Technology")).toBeChecked();

    // A college is added from the page.
    await page.getByRole("button", { name: "Add college" }).click();
    const collegeDialog = page.getByRole("dialog", { name: "Add a college" });
    await collegeDialog.locator("#academic-name").fill(`College of Testing ${stamp}`);
    await collegeDialog.getByRole("button", { name: "Save" }).click();
    await expect(page.getByRole("heading", { name: new RegExp(`College of Testing ${stamp}`) })).toBeVisible();

    // A block, named from its program, year and section.
    await page.getByRole("button", { name: "Add block" }).click();
    const blockDialog = page.getByRole("dialog", { name: "Add a block" });
    await blockDialog.locator("#academic-program").selectOption({ label: "BSIT: BS Information Technology" });
    await blockDialog.locator("#academic-section").fill(section.toLowerCase());
    await expect(blockDialog.getByText(`BSIT 4${section}`)).toBeVisible();
    await blockDialog.getByRole("button", { name: "Save" }).click();
    const blockName = `BSIT 4${section}`;
    await expect(page.getByRole("rowheader", { name: new RegExp(blockName) })).toBeVisible();

    // The student form: each picker narrows the next.
    await page.goto(`/coordinator/students?q=${encodeURIComponent(ACCOUNTS.student.email)}`);
    await page.getByRole("button", { name: "Edit", exact: true }).click();
    const form = page.getByRole("dialog");
    // By id: a label that says "(optional)" is not exactly its field's name.
    await form.locator("#student-college").selectOption({ label: "College of Computing Sciences" });
    const programs = await form.locator("#student-program-id option").allTextContents();
    expect(programs.some((option) => option.startsWith("BSIT"))).toBe(true);
    expect(programs.some((option) => option.startsWith("BSHM"))).toBe(false);
    await form.locator("#student-program-id").selectOption({ label: "BSIT: BS Information Technology" });
    await form.locator("#student-block").selectOption({ label: blockName });
    await form.getByRole("button", { name: /Save/ }).click();
    await expect(form).toBeHidden();
    await expect(page.getByRole("cell", { name: new RegExp(blockName) })).toBeVisible();

    // The filter bar: the choice goes into the address and narrows the list.
    await page.goto("/coordinator/students");
    const bar = page.getByRole("region", { name: "Which students" });
    await bar.getByLabel("Program").selectOption({ label: "BSIT: BS Information Technology" });
    await expect(page).toHaveURL(/program=\d+/);
    await bar.getByLabel("Block").selectOption({ label: blockName });
    await expect(page).toHaveURL(/block=\d+/);
    await expect(page.getByRole("row")).toHaveCount(2);
    await expect(page.getByRole("cell", { name: new RegExp(blockName) })).toBeVisible();
    // It carries to another page from the menu, and Analytics sums by program and block.
    await page.getByRole("link", { name: "Analytics", exact: true }).click();
    await expect(page).toHaveURL(/\/coordinator\/analytics\?.*block=\d+/);
    await expect(page.getByRole("heading", { name: "By program" })).toBeVisible();
    await expect(page.getByRole("rowheader", { name: blockName })).toBeVisible();
    await page.getByRole("region", { name: "Which students" }).getByRole("button", { name: "Clear filters" }).click();
    await expect(page).toHaveURL(/\/coordinator\/analytics$/);
  });

  test("a supervisor with interns of one program and block is not asked to choose between them", async ({ page }) => {
    await signIn(page, "supervisor");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByRole("combobox", { name: /^Program and block/ })).toHaveCount(0);
    await page.goto("/supervisor/attendance");
    await expect(page.getByRole("combobox", { name: /^Intern/ })).toBeVisible();
    await expect(page.getByRole("combobox", { name: /^Program and block/ })).toHaveCount(0);
  });
});
