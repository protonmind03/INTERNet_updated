import { expect, test } from "@playwright/test";
import { ACCOUNTS, API, SECOND_STUDENT, api, apiSession, signIn, timeInClosed, today, type Role, openProfileGroup } from "./helpers";

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
    test.skip(await timeInClosed(student.token, student.id), "Today's time-in window is closed at this hour (the day's rules).");
    const privacy = await api<{ current: boolean }>(
      student.token,
      "GET",
      `/api/students/${encodeURIComponent(student.id)}/privacy`
    );

    await signIn(page, "student");
    await page.goto("/daily-log");
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
    test.skip(await timeInClosed(student.token, student.id), "Today's time-in window is closed at this hour (the day's rules).");
    const privacy = await api<{ current: boolean }>(
      student.token,
      "GET",
      `/api/students/${encodeURIComponent(student.id)}/privacy`
    );

    await signIn(page, "student");
    const main = page.getByRole("navigation", { name: "Main" });
    const button = page.locator("button.float-fab");
    await expect(button).toBeVisible();
    await expect(button).toHaveAccessibleName(/^Time in, opens the camera check/);
    // 56 px tall, in the bottom right corner, above the dock (Iteration 21).
    const box = (await button.boundingBox())!;
    const screen = page.viewportSize()!;
    expect(box.height).toBe(56);
    expect(box.x + box.width).toBeGreaterThan(390 - 24);
    expect(box.y + box.height).toBeLessThanOrEqual(screen.height - 16);

    await main.getByRole("link", { name: "Tasks" }).click();
    await expect(page).toHaveURL(/\/task$/);
    await expect(button).toBeVisible();

    // Attendance has the full card, so the button stays away.
    await main.getByRole("link", { name: "Attendance" }).click();
    await expect(page).toHaveURL(/\/daily-log$/);
    await expect(page.getByRole("button", { name: "Time in", exact: true })).toBeVisible();
    await expect(button).toHaveCount(0);

    await main.getByRole("link", { name: "Today" }).click();
    // Iteration 21: the first tap opens it into "Time in · Tap again"; the second acts.
    await button.click();
    await expect(button).toHaveAttribute("aria-expanded", "true");
    await expect(button).toContainText("Tap again");
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

test.describe("weekly report", () => {
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
    await supervisorPage.getByRole("tab", { name: /^Weekly reports/ }).click();
    await expect(supervisorPage.getByText(did)).toBeVisible();
    await supervisorPage.locator("#decision-note").fill("Name the tasks that were yours.");
    await supervisorPage.getByRole("button", { name: "Return", exact: true }).click();
    await expect(supervisorPage.getByText(/Weekly report returned to/)).toBeVisible();

    await studentPage.reload();
    await expect(studentPage.getByText("Returned to you").first()).toBeVisible();
    await expect(studentPage.getByText("Name the tasks that were yours.").first()).toBeVisible();
    await studentPage.getByRole("button", { name: "Edit and send again" }).first().click();
    await studentPage.locator('button[form="journal-form"]').click();
    await expect(studentPage.getByText("Waiting for your supervisor").first()).toBeVisible();

    await supervisorPage.reload();
    await supervisorPage.getByRole("tab", { name: /^Weekly reports/ }).click();
    await supervisorPage.getByRole("button", { name: "Mark reviewed" }).click();
    await expect(supervisorPage.getByText(/weekly report marked reviewed/)).toBeVisible();

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

  test("on a phone: the dock of four and More, and the Resolution Center as the icon beside the bell", async ({ page }) => {
    await signIn(page, "student");
    // Iteration 21: the dock (components/StudentDock.tsx): Today, Attendance, Schedule, Tasks, More.
    const tabs = page.getByRole("navigation", { name: "Main" });
    await expect(tabs.getByRole("link")).toHaveCount(4);
    await expect(tabs.getByRole("link", { name: /^Today/ })).toHaveAttribute("aria-current", "page");
    await expect(tabs.getByRole("button", { name: /^More/ })).toBeVisible();
    await tabs.getByRole("link", { name: "Schedule" }).click();
    await expect(page).toHaveURL(/\/schedule$/);
    await expect(page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Schedule" })).toHaveAttribute("aria-current", "page");

    await page.getByRole("button", { name: /Account menu/ }).click();
    await expect(page.getByRole("button", { name: "Profile", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign out", exact: true })).toBeVisible();
    await page.getByRole("link", { name: /^Resolution Center/ }).click();
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
    await openProfileGroup(page, "Completion");
    await expect(page.getByRole("heading", { name: "Completion checklist" })).toBeVisible();
    await page.keyboard.press("Escape");
    await openProfileGroup(page, "Placement");
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
    // Six places, in this order. Evaluations is a tab of each intern's page (Round 2, Phase 4).
    await expect(bar.getByRole("link")).toHaveText(
      [/^Review/, /^Interns/, /^Attendance/, /^Tasks/, /^Documents/, /^Weekly reports/]
    );
    await expect(bar.getByRole("link", { name: "Evaluations" })).toHaveCount(0);
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

  test("the coordinator's page says Concerns, as the Resolution Center's first tab", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await signIn(page, "coordinator");
    // Iteration 8: concerns moved from the sidebar to the Resolution Center, the icon left of the bell.
    await page.getByRole("link", { name: /^Resolution Center/ }).click();
    await expect(page).toHaveURL(/\/coordinator\/resolution$/);
    await expect(
      page.getByRole("navigation", { name: "Resolution Center sections" }).getByRole("link", { name: "Concerns" })
    ).toHaveAttribute("aria-current", "page");
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
    // The audit log is a section of Profile settings now (Iteration 8): clearing keeps only that.
    await expect(page).toHaveURL(/\/coordinator\/profile\?section=audit$/);
    await page.getByLabel("When").selectOption({ label: "Custom dates" });
    await expect(page.getByLabel("From")).toBeVisible();

    // Signing in is not logged, so there may be nothing to export on an empty database.
    const exportButton = page.getByRole("button", { name: "Export CSV" });
    await page.getByRole("button", { name: "Clear filters" }).click();
    // With few entries the count is said twice (above the list and under it): the first is enough.
    await expect(page.getByText(/^\d+ entr(y|ies)/).first()).toBeVisible();
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
    await expect(page.getByRole("heading", { name: "Schedule", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Save schedule" })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Add a day" })).toBeVisible();

    await page.goto(`/coordinator/requirements?student=${encodeURIComponent(student.id)}`);
    // The editor left this page in Round 2, Phase 5; an old link that names a student still leads to them.
    await expect(page.getByText(/on their own record, under the Schedule tab/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Save schedule" })).toHaveCount(0);
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
    // Exactly the block's own row in "By block": the Student performance table under it names the block too.
    await expect(page.getByRole("rowheader", { name: blockName, exact: true })).toBeVisible();
    await page.getByRole("region", { name: "Which students" }).getByRole("button", { name: "Clear filters" }).click();
    await expect(page).toHaveURL(/\/coordinator\/analytics$/);
  });

  test("a supervisor with interns of one program and block is not asked to choose between them", async ({ page }) => {
    // The demo supervisor has two interns. The journey above moves the first
    // into a new block each run, so the second is put beside them first.
    const coordinator = await apiSession("coordinator");
    const first = await apiSession("student");
    const found = await api<{ students: { student_id: string; block_id: number | null }[] }>(
      coordinator.token,
      "GET",
      `/api/coordinator/students?limit=5&q=${encodeURIComponent(first.id)}`
    );
    const blockId = found.body.students.find((item) => item.student_id === first.id)?.block_id;
    if (blockId) {
      const placed = await api(coordinator.token, "POST", `/api/coordinator/blocks/${blockId}/students`, {
        student_ids: ["DEMO-STU-0002"],
      });
      expect(placed.status).toBe(200);
    }
    await signIn(page, "supervisor");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByRole("combobox", { name: /^Program and block/ })).toHaveCount(0);
    await page.goto("/supervisor/attendance");
    await expect(page.getByRole("combobox", { name: /^Intern/ })).toBeVisible();
    await expect(page.getByRole("combobox", { name: /^Program and block/ })).toHaveCount(0);
  });
});

test.describe("what a student reads about their days", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("the schedule has a month to tap through and a progress tab, and the time record prints AM and PM columns", async ({ page }) => {
    await signIn(page, "student");
    await page.goto("/schedule");
    await expect(page.getByRole("tab", { name: "Week" })).toHaveAttribute("aria-selected", "true");
    await expect(page.getByRole("heading", { name: "Weekly schedule" })).toBeVisible();

    // The month: a grid of days, one of them today, and a tap opens the day.
    await page.getByRole("tab", { name: "Month" }).click();
    await expect(page).toHaveURL(/\/schedule\?view=month$/);
    const grid = page.getByRole("grid");
    await expect(grid).toBeVisible();
    const todayCell = grid.locator('[aria-current="date"]');
    await expect(todayCell).toHaveCount(1);
    await todayCell.click();
    const sheet = page.getByRole("dialog");
    await expect(sheet).toBeVisible();
    // Iteration 21: the day's sheet, its heading and status, and its schedule.
    await expect(sheet.getByRole("heading")).toBeVisible();
    await expect(sheet.getByRole("region", { name: "Schedule" }).or(sheet.getByLabel("Schedule"))).toBeVisible();
    await expect(sheet.getByRole("button", { name: "Day after" })).toBeVisible();
    await expect(page.getByText("Tap a day for its details.")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(sheet).toBeHidden();
    // The arrow keys move between days, and Enter opens the one they land on.
    await todayCell.focus();
    await page.keyboard.press("ArrowRight");
    await expect(todayCell).not.toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Next month" }).click();
    await page.getByRole("button", { name: "This month" }).click();
    await expect(todayCell).toHaveCount(1);

    // My progress (Iteration 21): the burn-up chart, milestones, the change since last week, the rhythm.
    await page.getByRole("tab", { name: "My progress" }).click();
    await expect(page).toHaveURL(/view=progress$/);
    for (const name of ["Hours over time", "Milestones", "Change since last week", "Rhythm"]) {
      await expect(page.getByRole("heading", { name })).toBeVisible();
    }
    await expect(page.getByRole("img", { name: /^Burn-up chart/ })).toBeVisible();
    await expect(page.getByText("If you keep to your schedule.")).toBeVisible();

    // The time record: the Civil Service columns.
    await page.goto("/time-record");
    const table = page.getByRole("region", { name: "Time record table" });
    await expect(table.getByRole("columnheader")).toHaveText(["Day", "AM In", "AM Out", "PM In", "PM Out", "Hours", "Status"]);
  });

  test("the weekly report asks for four things and shows the week's daily accomplishments", async ({ page }) => {
    const student = await apiSession("student");
    const journals = await api<{ current_week_start: string; journals: { week_start: string; status: string }[] }>(
      student.token,
      "GET",
      `/api/journals/student/${encodeURIComponent(student.id)}`
    );
    const existing = journals.body.journals.find((item) => item.week_start === journals.body.current_week_start);
    test.skip(existing?.status === "Reviewed", "This week's report is already reviewed and closed.");

    await signIn(page, "student");
    // Iteration 21: on a phone the weekly report is under the dock's More.
    await page.getByRole("navigation", { name: "Main" }).getByRole("button", { name: /^More/ }).click();
    await page.getByRole("dialog", { name: "More" }).getByRole("button", { name: /^Weekly report/ }).click();
    await expect(page).toHaveURL(/\/journal$/);
    await page.getByRole("button", { name: existing ? /^Edit/ : "Write", exact: !existing }).first().click();
    const form = page.getByRole("dialog");
    await expect(form.getByRole("region", { name: "Daily accomplishments this week" })).toBeVisible();
    for (const id of ["#journal-activities", "#journal-learnings", "#journal-challenges", "#journal-solutions"]) {
      await expect(form.locator(id)).toBeVisible();
    }
    await expect(form.getByText("Problems encountered (optional)")).toBeVisible();
    await expect(form.getByText("Solutions tried or identified (optional)")).toBeVisible();
  });
});

test.describe("the supervisor's day", () => {
  test("an intern's page has every section, and the old Evaluations address leads to its Evaluate tab", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    const student = await apiSession("student");
    await signIn(page, "supervisor");
    // Today, on the Review page: a chip for each intern.
    const todayList = page.getByRole("list", { name: "Your interns today" });
    await expect(todayList.getByRole("link", { name: /Demo Student Two/ })).toBeVisible();

    // Interns: the dialog is a short preview with a way in.
    await page.getByRole("navigation", { name: "Main" }).first().getByRole("link", { name: /^Interns/ }).click();
    await page.getByRole("button", { name: /Demo Student(?! Two)/ }).first().click();
    const preview = page.getByRole("dialog");
    await expect(preview.getByText("Hours verified")).toBeVisible();
    await preview.getByRole("button", { name: "Open", exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/supervisor/interns/${student.id}$`));
    await expect(page.getByRole("heading", { level: 1, name: "Demo Student" })).toBeVisible();

    const sections = page.getByRole("tablist", { name: "Section" });
    await expect(sections.getByRole("tab")).toHaveText([
      "Overview", "Attendance", "Tasks", "Documents", "Weekly reports", "Evaluate", "Time record", "Notes",
    ]);
    await expect(page.getByRole("heading", { name: "Contact" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Waiting for you" })).toBeVisible();

    await sections.getByRole("tab", { name: "Attendance" }).click();
    await expect(page).toHaveURL(/tab=attendance/);
    await expect(page.getByRole("grid")).toBeVisible();
    await expect(page.getByRole("heading", { name: /^Late time-ins/ })).toBeVisible();
    await expect(page.getByRole("heading", { name: /^Logs recorded offline/ })).toBeVisible();

    await sections.getByRole("tab", { name: "Time record" }).click();
    await expect(page.getByText(/Daily Time Record/i).first()).toBeVisible();

    // The address Evaluations used to have.
    await page.goto(`/supervisor/evaluation?intern=${student.id}`);
    await expect(page).toHaveURL(new RegExp(`/supervisor/interns/${student.id}\\?tab=evaluate$`));
    await expect(page.getByRole("heading", { name: "New evaluation" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Final evaluation" })).toBeVisible();
    await page.goto("/supervisor/evaluation");
    await expect(page).toHaveURL(/\/supervisor\/interns$/);
  });

  test("a team task goes to two interns, both see it, one submits, and the supervisor sees 1 of 2", async ({ browser }) => {
    const supervisor = await apiSession("supervisor");
    const stamp = Date.now();
    const teamName = `E2E team ${stamp}`;
    const title = `E2E count the stock room ${stamp}`;
    type Task = { id: number; title: string; status: string; group_task_id: number | null };
    type Team = { id: number; name: string };
    const clear = async () => {
      const tasks = await api<{ tasks: Task[] }>(supervisor.token, "GET", `/api/tasks/supervisor/${supervisor.id}`);
      for (const task of tasks.body.tasks.filter((item) => item.title.startsWith("E2E count the stock room"))) {
        // What was submitted is reviewed, so it does not sit in the queue; the rest is cancelled.
        if (task.status === "Submitted") await api(supervisor.token, "PATCH", `/api/tasks/${task.id}/review`, { status: "Reviewed", review_notes: "E2E." });
        else if (task.status !== "Reviewed") await api(supervisor.token, "DELETE", `/api/tasks/${task.id}`);
      }
      const teams = await api<{ teams: Team[] }>(supervisor.token, "GET", "/api/supervisor/teams");
      for (const team of teams.body.teams.filter((item) => item.name.startsWith("E2E team"))) {
        await api(supervisor.token, "DELETE", `/api/supervisor/teams/${team.id}`);
      }
    };
    await clear();

    const wide = { viewport: { width: 1280, height: 900 }, isMobile: false };
    const supervisorPage = await (await browser.newContext(wide)).newPage();
    try {
      // The supervisor makes a team of the two demo interns.
      await signIn(supervisorPage, "supervisor");
      await supervisorPage.goto("/supervisor/tasks");
      await supervisorPage.getByRole("tab", { name: /^Teams/ }).click();
      await expect(supervisorPage).toHaveURL(/view=teams/);
      await supervisorPage.getByRole("button", { name: "New team" }).click();
      const teamDialog = supervisorPage.getByRole("dialog", { name: "New team" });
      await teamDialog.locator("#team-name").fill(teamName);
      await teamDialog.getByRole("checkbox", { name: /^Demo Student(?! Two)/ }).check();
      await teamDialog.getByRole("checkbox", { name: /^Demo Student Two/ }).check();
      await teamDialog.getByRole("button", { name: "Create team" }).click();
      const teamRow = supervisorPage.getByRole("listitem").filter({ hasText: teamName });
      await expect(teamRow).toContainText("Demo Student, Demo Student Two");

      // And gives it one task.
      await teamRow.getByRole("button", { name: "Assign a task" }).click();
      const taskDialog = supervisorPage.getByRole("dialog", { name: "Assign a task" });
      await expect(taskDialog.locator("#task-intern")).toHaveValue(/^team:\d+$/);
      await expect(taskDialog.getByText(/Each member gets their own copy/)).toBeVisible();
      await taskDialog.locator("#task-title").fill(title);
      const due = new Date(Date.now() + 5 * 86_400_000);
      await taskDialog.locator("#task-due").fill(new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(due));
      await taskDialog.getByRole("button", { name: "Assign task" }).click();
      await expect(supervisorPage.getByText(new RegExp(`Task assigned to 2 members of ${teamName}`))).toBeVisible();

      // One line for the team, nobody in yet.
      await supervisorPage.getByRole("tab", { name: /^Tasks/ }).click();
      const line = supervisorPage.getByRole("listitem").filter({ hasText: title }).first();
      await expect(line).toContainText("Team task");
      await expect(line).toContainText("0 of 2 submitted");

      // Both interns see it as their own.
      const onePage = await (await browser.newContext(wide)).newPage();
      await signIn(onePage, "student");
      await onePage.goto("/task");
      const mine = onePage.getByRole("listitem").filter({ hasText: title }).first();
      await expect(mine).toContainText(`Team task: ${teamName}`);

      const twoPage = await (await browser.newContext(wide)).newPage();
      await signIn(twoPage, "student", SECOND_STUDENT);
      await twoPage.goto("/task");
      await expect(twoPage.getByRole("listitem").filter({ hasText: title }).first()).toContainText("You submit your own work");
      await twoPage.context().close();

      // One submits.
      await mine.getByRole("button", { name: "Submit work" }).click();
      const submit = onePage.getByRole("dialog", { name: "Submit work" });
      await submit.locator("#submission-notes").fill("Counted aisles 1 to 4; sheet on your desk.");
      await submit.getByRole("button", { name: "Submit", exact: true }).click();
      await expect(submit).toBeHidden({ timeout: 15_000 });
      await onePage.context().close();

      // The supervisor sees one of two, and who.
      await supervisorPage.reload();
      const after = supervisorPage.getByRole("listitem").filter({ hasText: title }).first();
      await expect(after).toContainText("1 of 2 submitted");
      const members = after.getByRole("list");
      await expect(members.getByRole("listitem").filter({ hasText: "Demo Student Two" })).toContainText("Not started");
      await expect(members.getByRole("listitem").filter({ hasText: /Demo Student(?! Two)/ })).toContainText("To review");

      // Cancelling says who was left alone.
      await after.getByRole("button", { name: "Cancel task" }).click();
      const confirm = supervisorPage.getByRole("alertdialog").or(supervisorPage.getByRole("dialog", { name: "Cancel this task?" }));
      await expect(confirm).toContainText("1 member has already submitted");
      await confirm.getByRole("button", { name: "Cancel task" }).click();
      await expect(supervisorPage.getByText(/Task cancelled for 1 member\. 1 member has already submitted/)).toBeVisible();
    } finally {
      await supervisorPage.context().close();
      await clear();
    }
  });

  test("a task with a later release day reads Scheduled for the supervisor and is not on the intern's list", async ({ page, browser }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    const supervisor = await apiSession("supervisor");
    const student = await apiSession("student");
    const title = `E2E release later ${Date.now()}`;
    const day = (offset: number) =>
      new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(new Date(Date.now() + offset * 86_400_000));
    let id: number | undefined;
    try {
      await signIn(page, "supervisor");
      await page.goto(`/supervisor/tasks?intern=${student.id}`);
      await page.getByRole("button", { name: "Assign a task" }).first().click();
      const dialog = page.getByRole("dialog", { name: "Assign a task" });
      await expect(dialog.locator("#task-intern")).toHaveValue(student.id);
      await dialog.locator("#task-title").fill(title);
      await dialog.locator("#task-due").fill(day(6));
      await dialog.locator("#task-release").fill(day(2));
      await dialog.getByRole("button", { name: "Assign task" }).click();
      await expect(page.getByText(/Task scheduled\. Demo Student will see it on/)).toBeVisible();
      const row = page.getByRole("listitem").filter({ hasText: title }).first();
      await expect(row).toContainText("Scheduled");
      await expect(row).toContainText("They will see it on");

      const tasks = await api<{ tasks: { id: number; title: string }[] }>(supervisor.token, "GET", `/api/tasks/supervisor/${supervisor.id}`);
      id = tasks.body.tasks.find((task) => task.title === title)?.id;
      expect(id).toBeTruthy();

      const studentPage = await (await browser.newContext()).newPage();
      await signIn(studentPage, "student");
      await studentPage.goto("/task");
      await expect(studentPage.getByRole("tab", { name: /^Submitted/ })).toBeVisible();
      await expect(studentPage.getByText(title)).toHaveCount(0);
      await studentPage.context().close();
    } finally {
      if (id) await api(supervisor.token, "DELETE", `/api/tasks/${id}`);
    }
  });

  test("a supervisor and a coordinator write notes about a student that the student cannot open", async ({ browser }) => {
    const student = await apiSession("student");
    const wide = { viewport: { width: 1280, height: 900 }, isMobile: false };
    const stamp = Date.now();
    const first = `Late twice this week. ${stamp}`;
    const second = `I will call the company. ${stamp}`;

    const supervisorPage = await (await browser.newContext(wide)).newPage();
    await signIn(supervisorPage, "supervisor");
    await supervisorPage.goto(`/supervisor/interns/${student.id}?tab=notes`);
    await expect(supervisorPage.getByRole("heading", { name: "Notes with the coordinator" })).toBeVisible();
    await expect(supervisorPage.getByText(/cannot\s+see these notes/)).toBeVisible();
    await supervisorPage.getByLabel("Your note").fill(first);
    await supervisorPage.getByRole("button", { name: "Send", exact: true }).click();
    await expect(supervisorPage.getByText(first)).toBeVisible();

    const coordinatorPage = await (await browser.newContext(wide)).newPage();
    await signIn(coordinatorPage, "coordinator");
    await coordinatorPage.goto(`/coordinator/students/${student.id}?tab=notes`);
    await expect(coordinatorPage.getByRole("heading", { name: "Notes with the supervisor" })).toBeVisible();
    await expect(coordinatorPage.getByText(first)).toBeVisible();
    await coordinatorPage.getByLabel("Your note").fill(second);
    await coordinatorPage.getByRole("button", { name: "Send", exact: true }).click();
    await expect(coordinatorPage.getByText(second)).toBeVisible();
    await coordinatorPage.context().close();

    await supervisorPage.reload();
    await expect(supervisorPage.getByText(second)).toBeVisible();
    await supervisorPage.context().close();

    // The student's own session is refused the thread.
    const refused = await api(student.token, "GET", `/api/student-notes/${student.id}`);
    expect(refused.status).toBe(403);
  });
});

test.describe("the programme, for the coordinator", () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test("Analytics has a student performance table with its rules, any date range, and a chart that zooms", async ({ page }) => {
    await signIn(page, "coordinator");
    await page.goto("/coordinator/analytics");

    // Student performance: a status from the rules, a sentence, and the rules behind the "?".
    const table = page.getByRole("group", { name: "Student performance" });
    await expect(table.getByRole("link", { name: "Demo Student", exact: true })).toBeVisible();
    await expect(table.getByText(/^(On track|Behind|At risk|Completed): \d/).first()).toBeVisible();
    await page.getByRole("button", { name: "What the status words mean" }).click();
    await expect(page.getByRole("note")).toContainText("It is not a score.");
    await expect(page.getByRole("note")).toContainText("The same rule as Monitoring.");
    // Sorted by a column: the header says which way.
    const hours = table.getByRole("columnheader", { name: /^Hours/ });
    await hours.getByRole("button").click();
    await expect(hours).toHaveAttribute("aria-sort", "ascending");
    await hours.getByRole("button").click();
    await expect(hours).toHaveAttribute("aria-sort", "descending");
    // Its own CSV.
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "CSV of student performance" }).click();
    expect((await download).suggestedFilename()).toMatch(/^internet-student-performance-\d{4}-\d{2}-\d{2}\.csv$/);

    // Any range, grouped by month.
    await expect(page.getByText(/^The last 14 days, active students only\.$/)).toBeVisible();
    await page.getByLabel("From", { exact: true }).fill("2026-01-01");
    await expect(page.getByRole("alert").filter({ hasText: "Choose both a first and a last day." })).toBeVisible();
    await page.getByLabel("To", { exact: true }).fill("2026-06-30");
    await expect(page.getByText(/Jan 1, 2026 to Jun 30, 2026 \(181 days\), active students only\./)).toBeVisible();
    await page.getByLabel("Group by").selectOption("month");
    await expect(page.getByRole("heading", { name: "Verified hours per month" })).toBeVisible();
    // A quick period puts it back.
    await page.getByRole("tab", { name: "90 days" }).click();
    await expect(page.getByText(/^The last 90 days, active students only\.$/)).toBeVisible();
    await page.getByLabel("Group by").selectOption("day");
    await expect(page.getByRole("heading", { name: "Verified hours per day" })).toBeVisible();

    // The chart: + and - change the columns' width, the card keeps its size, the arrows still read values, and the table is kept.
    // The chart is drawn only when the period has attendance. A database with none (a fresh one, as in CI)
    // says so in its place, and then there are no columns to zoom.
    const chart = page.getByRole("img", { name: /^Verified hours per day/ });
    const nothing = page.getByText(/^No attendance was logged in the last 90 days\.$/);
    await expect(chart.or(nothing)).toBeVisible();
    await expect(page.getByText("View as a table").first()).toBeVisible();
    if (await nothing.isVisible()) return;
    const plot = chart.locator("> div").first();
    const size = await chart.boundingBox();
    const narrow = (await plot.boundingBox())!.width;
    await page.getByRole("button", { name: "Zoom in: wider columns" }).click();
    await page.getByRole("button", { name: "Zoom in: wider columns" }).click();
    expect((await plot.boundingBox())!.width).toBeGreaterThan(narrow);
    expect((await chart.boundingBox())!.width).toBeCloseTo(size!.width, 0);
    expect((await chart.boundingBox())!.height).toBeCloseTo(size!.height, 0);
    await page.getByRole("button", { name: "Zoom out: narrower columns" }).click();
    await chart.focus();
    await page.keyboard.press("ArrowLeft");
    await expect(chart).toHaveAccessibleDescription(/: \d/);
    await expect(page.getByText("View as a table").first()).toBeVisible();
  });

  test("the key figures' targets are changed from the dashboard and put back", async ({ page }) => {
    const coordinator = await apiSession("coordinator");
    await api(coordinator.token, "PUT", "/api/coordinator/kpi-targets", { targets: { on_track: null } });
    try {
      await signIn(page, "coordinator");
      await expect(page.getByText("Target: 90% or more")).toBeVisible();
      await page.getByRole("button", { name: "Targets", exact: true }).click();
      const dialog = page.getByRole("dialog", { name: "Targets for the key figures" });
      const field = dialog.getByLabel("Students on track to finish within the term");
      await expect(field).toHaveValue("90");
      await field.fill("85");
      await expect(dialog.getByRole("button", { name: /Use the default for Students on track/ })).toBeVisible();
      await dialog.getByRole("button", { name: "Save targets" }).click();
      await expect(page.getByText("Targets saved.")).toBeVisible();
      await expect(page.getByText("Target: 85% or more")).toBeVisible();
      await expect(page.getByText("Target: 90% or more")).toHaveCount(0);
      // On Analytics the same cards show the same target, and offer no way to change it.
      await page.goto("/coordinator/analytics");
      await expect(page.getByText("Target: 85% or more")).toBeVisible();
      await expect(page.getByRole("button", { name: "Targets", exact: true })).toHaveCount(0);
    } finally {
      await api(coordinator.token, "PUT", "/api/coordinator/kpi-targets", { targets: { on_track: null } });
    }
  });

  test("a set of filters is saved as a view, chosen again, and removed", async ({ page }) => {
    const coordinator = await apiSession("coordinator");
    const name = `E2E no supervisor ${Date.now()}`;
    const clear = async () => {
      const views = await api<{ views: { id: number; name: string }[] }>(coordinator.token, "GET", "/api/coordinator/filter-views");
      for (const view of views.body.views.filter((item) => item.name.startsWith("E2E no supervisor"))) {
        await api(coordinator.token, "DELETE", `/api/coordinator/filter-views/${view.id}`, {});
      }
    };
    await clear();
    try {
      await signIn(page, "coordinator");
      await page.goto("/coordinator/students");
      const bar = page.getByRole("region", { name: "Which students" });
      await bar.getByLabel("Supervisor", { exact: true }).selectOption("none");
      await expect(page).toHaveURL(/supervisor=none/);
      await bar.getByRole("button", { name: "Save these filters as a view" }).click();
      await bar.getByLabel("Name for this view").fill(name);
      await bar.getByRole("button", { name: "Save view" }).click();
      await expect(page.getByText(`View "${name}" saved.`)).toBeVisible();

      // Cleared, then chosen again on another page: the bar's choice comes back.
      await bar.getByRole("button", { name: "Clear filters" }).click();
      await expect(page).not.toHaveURL(/supervisor=/);
      await page.goto("/coordinator/monitoring");
      const other = page.getByRole("region", { name: "Which students" });
      await other.getByLabel("Saved views").selectOption({ label: name });
      await expect(page).toHaveURL(/supervisor=none/);
      await expect(other.getByLabel("Supervisor", { exact: true })).toHaveValue("none");
      await other.getByRole("button", { name: /^Remove this view/ }).click();
      await expect(page.getByText(`View "${name}" removed.`)).toBeVisible();
      await other.getByRole("button", { name: "Clear filters" }).click();
    } finally {
      await clear();
    }
  });

  test("a block's schedule is previewed before it is set, and Requirements no longer edits schedules", async ({ page }) => {
    const coordinator = await apiSession("coordinator");
    const first = await apiSession("student");
    const found = await api<{ students: { student_id: string; block_id: number | null; block_name?: string | null }[] }>(
      coordinator.token, "GET", `/api/coordinator/students?limit=5&q=${encodeURIComponent(first.id)}`
    );
    const blockId = found.body.students.find((item) => item.student_id === first.id)?.block_id;
    test.skip(!blockId, "The demo student is not in a block (the programs journey places them).");

    await signIn(page, "coordinator");
    await page.goto(`/coordinator/students?block=${blockId}`);
    await page.getByRole("button", { name: "Set schedule for this block" }).click();
    const dialog = page.getByRole("dialog", { name: /^Set schedule for / });
    await expect(dialog.getByLabel("Monday start time")).toHaveValue("08:00");
    // A day that ends before it starts is caught before the server is asked.
    await dialog.getByLabel("Monday end time").fill("07:00");
    await dialog.getByRole("button", { name: "Check the block" }).click();
    await expect(dialog.getByRole("alert")).toContainText("Monday: the end time must be after the start time.");
    await dialog.getByLabel("Monday end time").fill("12:00");
    await dialog.getByRole("button", { name: "Check the block" }).click();
    // The preview: nothing changed yet; whoever has a different schedule is named and a choice is asked for.
    await expect(dialog.getByText("Nothing has been changed yet.")).toBeVisible();
    await expect(dialog.getByText("Have a different one")).toBeVisible();
    await expect(dialog.getByRole("radio", { name: /Skip them/ })).toBeChecked();
    await expect(dialog.getByRole("radio", { name: /Overwrite them/ })).toBeVisible();
    await dialog.getByRole("button", { name: "Back to the week" }).click();
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).toBeHidden();

    // The same on a block's menu on Programs.
    await page.goto("/coordinator/programs");
    // A row menu closes when the page scrolls, and this page is still filling in as it opens: a menu
    // opened too early is closed again by the lists arriving under it. Opened again, it stays.
    const menuItem = page.getByRole("menuitem", { name: "Set schedule" });
    await expect(async () => {
      if (!(await menuItem.isVisible())) await page.getByRole("button", { name: /^Actions for BSIT 4/ }).first().click();
      await expect(menuItem).toBeVisible({ timeout: 1500 });
    }).toPass({ timeout: 20_000 });
    await page.keyboard.press("Escape");

    await page.goto("/coordinator/requirements");
    await expect(page.getByRole("heading", { name: "Schedules" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Add a day" })).toHaveCount(0);
  });

  test("a requirement is given a due date and the coordinator as reviewer, and the student sees the date", async ({ page, browser }) => {
    const coordinator = await apiSession("coordinator");
    const name = `E2E clearance ${Date.now()}`;
    const made = await api<{ requirement: { id: number } }>(coordinator.token, "POST", "/api/coordinator/requirements", { name, sort_order: 990 });
    expect(made.status).toBe(201);
    const id = made.body.requirement.id;
    try {
      await signIn(page, "coordinator");
      await page.goto("/coordinator/requirements");
      await page.getByRole("button", { name: `Due date and reviewer for ${name}` }).click();
      const dialog = page.getByRole("dialog", { name: `Due date and reviewer: ${name}` });
      // Every week is offered, with the warning that it is not for the weekly report.
      await expect(dialog.getByRole("radio", { name: /^Every week/ })).toBeVisible();
      await expect(dialog.getByText(/Not for the weekly report/)).toBeVisible();
      await dialog.getByRole("radio", { name: /^On a date/ }).check();
      await dialog.getByLabel("The day it is due").fill("2031-03-14");
      await dialog.getByRole("radio", { name: /^The OJT coordinator/ }).check();
      await dialog.getByRole("button", { name: "Save", exact: true }).click();
      await expect(page.getByText("Due date and reviewer saved.")).toBeVisible();
      await expect(page.getByRole("listitem").filter({ hasText: name })).toContainText("Due Mar 14, 2031 · Reviewed by the coordinator");

      const studentPage = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
      await signIn(studentPage, "student");
      await studentPage.goto("/documents");
      await expect(studentPage.getByRole("listitem").filter({ hasText: name })).toContainText("Due Mar 14, 2031 · Reviewed by the coordinator");
      await studentPage.context().close();
    } finally {
      // Back to how a requirement is by default, then retired: there is no route that deletes one.
      await api(coordinator.token, "PUT", `/api/coordinator/requirements/${id}/deliverable`, {});
      await api(coordinator.token, "PUT", `/api/coordinator/requirements/${id}`, { name, sort_order: 990, is_active: false });
    }
  });
});

test.describe("attendance steps recorded offline and not sent yet", () => {
  // Puts one step in the phone's queue the way the app keeps it. The log it
  // names does not exist, so when it is sent the server refuses it for good
  // and the app says so: that message is the proof that it was sent.
  const queueStep = (page: import("@playwright/test").Page) =>
    page.evaluate(
      () =>
        new Promise<void>((resolve, reject) => {
          const opening = indexedDB.open("internet-offline");
          opening.onerror = () => reject(opening.error);
          opening.onsuccess = () => {
            const owner = `student|${localStorage.getItem("student_id")}`;
            const adding = opening.result
              .transaction("queue", "readwrite")
              .objectStore("queue")
              .add({
                owner,
                savedAt: new Date().toISOString(),
                data: { logId: 987654321, path: "break", occurredAt: new Date().toISOString(), requestId: crypto.randomUUID() },
              });
            adding.onsuccess = () => resolve();
            adding.onerror = () => reject(adding.error);
          };
        })
    );
  const waiting = (page: import("@playwright/test").Page) =>
    page.evaluate(
      () =>
        new Promise<number>((resolve, reject) => {
          const opening = indexedDB.open("internet-offline");
          opening.onerror = () => reject(opening.error);
          opening.onsuccess = () => {
            const counting = opening.result.transaction("queue").objectStore("queue").count();
            counting.onsuccess = () => resolve(counting.result);
            counting.onerror = () => reject(counting.error);
          };
        })
    );

  test("a session that ends by itself keeps them, and they are sent at the next sign-in", async ({ page }) => {
    await signIn(page, "student");
    await queueStep(page);
    // The session ends without the student choosing it: the token is refused from now on.
    const token = await page.evaluate(() => localStorage.getItem("student_token"));
    const ended = await api(String(token), "POST", "/api/logout", {});
    expect(ended.status).toBe(200);
    // The app sends the student to the sign-in page as soon as a request is
    // refused, which can cut this reload short.
    await page.reload({ waitUntil: "commit" }).catch(() => undefined);
    await expect(page).toHaveURL(/\/$/, { timeout: 20_000 });
    await expect(page.locator("#inb-login-id")).toBeVisible();
    expect(await waiting(page)).toBe(1);

    await signIn(page, "student");
    await expect(page.getByText(/recorded offline was not added/)).toBeVisible({ timeout: 20_000 });
    await expect.poll(() => waiting(page)).toBe(0);
  });

  test("signing out says how many would be erased, and erases them only then", async ({ page }) => {
    await signIn(page, "student");
    await queueStep(page);
    const askToSignOut = async () => {
      await page.getByRole("button", { name: /Account menu/ }).click();
      await page.getByRole("button", { name: "Sign out", exact: true }).click();
    };
    await askToSignOut();
    const dialog = page.getByRole("alertdialog").or(page.getByRole("dialog"));
    await expect(dialog).toContainText("1 attendance step you recorded offline has not been sent yet");
    // Staying keeps it.
    await dialog.getByRole("button", { name: "Stay signed in" }).click();
    expect(await waiting(page)).toBe(1);

    await askToSignOut();
    await dialog.getByRole("button", { name: "Sign out and erase" }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect.poll(() => waiting(page)).toBe(0);
  });
});

test.describe("time-in with no connection", () => {
  test("a student times in without a photo, it is sent when the connection is back, and the supervisor sees what it lacks", async ({ page, context, browser }) => {
    const sessionOf = async (role: Role, account: { email: string; password: string }) => {
      const response = await fetch(`${API}/api/login/${role}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: account.email, password: account.password }),
      });
      const data = await response.json();
      return { token: String(data.token), id: String(data[role][`${role}_id`]) };
    };
    const student = await sessionOf("student", SECOND_STUDENT);
    const logsNow = async () =>
      (await api<{ attendance: { id: number; date: string; offline_time_in?: boolean; image_url: string | null; note: string | null }[] }>(
        student.token, "GET", `/api/attendance/${student.id}`
      )).body.attendance;
    test.skip(
      (await logsNow()).some((log) => log.date === today()),
      "The second demo student already has a log today (an earlier run of this journey)."
    );
    test.skip(await timeInClosed(student.token, student.id), "Today's time-in window is closed at this hour (the day's rules).");

    // This phone is never made ready for an offline camera check: with a one-use pass
    // collected in the background before the connection goes, the app would rightly
    // offer that instead, and whether it got there first was down to timing.
    await page.route(/\/api\/attendance\/offline-vouchers/, (route) => route.abort());
    await signIn(page, "student", SECOND_STUDENT);
    await page.goto("/daily-log");
    await expect(page.getByRole("button", { name: /^Time in/ }).first()).toBeVisible();

    // No connection: the camera check cannot run, and the app says so and offers the other way.
    await context.setOffline(true);
    await page.getByRole("button", { name: /^Time in/ }).first().click();
    const dialog = page.getByRole("dialog", { name: "Time in" });
    await expect(dialog).toContainText("There is no connection, so the camera check cannot run.");
    await expect(dialog).toContainText("Your supervisor is told there was no photo or camera check");
    await dialog.getByLabel(/^Note/).fill("No signal at the site this morning.");
    await dialog.getByRole("button", { name: "Time in without a photo" }).click();
    await expect(page.getByText(/Time-in saved on this phone at/)).toBeVisible();
    // The day goes on from what the phone holds: the next step is offered, a second time-in is not.
    await expect(page.getByRole("button", { name: /^Lunch break/ }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /^Time in/ })).toHaveCount(0);
    expect((await logsNow()).some((log) => log.date === today())).toBe(false);

    // Back online: it is sent by itself.
    await context.setOffline(false);
    await expect.poll(async () => (await logsNow()).find((log) => log.date === today())?.offline_time_in, { timeout: 30_000 }).toBe(true);
    const log = (await logsNow()).find((entry) => entry.date === today())!;
    expect(log.image_url).toBeNull();
    expect(log.note).toBe("No signal at the site this morning.");

    // The supervisor's list marks it, and it cannot be verified without saying so.
    const supervisor = await apiSession("supervisor");
    const blind = await api<{ code?: string }>(supervisor.token, "PATCH", `/api/attendance/${log.id}/status`, { status: "Verified", expected_status: "Pending" });
    expect(blind.status).toBe(409);
    const supervisorPage = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
    await signIn(supervisorPage, "supervisor");
    await supervisorPage.goto("/supervisor/attendance");
    // The list is drawn twice, as a table and as cards; the one for this width is the visible one.
    await expect(supervisorPage.getByText("Offline time-in, no photo").locator("visible=true").first()).toBeVisible();
    await supervisorPage.context().close();
  });
});

test.describe("pictures on an entry", () => {
  test("a student attaches a picture to a weekly report: it is made smaller, loses what the camera wrote into it, and the supervisor can open it", async ({ page, browser }) => {
    const login = await fetch(`${API}/api/login/student`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: SECOND_STUDENT.email, password: SECOND_STUDENT.password }),
    });
    const account = await login.json();
    const student = { token: String(account.token), id: String(account.student.student_id) };
    const journalsNow = async () =>
      (await api<{ current_week_start: string; journals: { id: number; week_start: string; status: string; pictures?: number }[] }>(
        student.token, "GET", `/api/journals/student/${encodeURIComponent(student.id)}`
      )).body;
    const before = await journalsNow();
    const existing = before.journals.find((item) => item.week_start === before.current_week_start);
    test.skip(existing?.status === "Reviewed", "The second demo student's report for this week is already reviewed and closed.");

    await signIn(page, "student", SECOND_STUDENT);
    await page.goto("/journal");
    // A real JPEG, larger than the app keeps, with the kind of block a camera writes into a photo
    // (where it was taken) put in after the first two bytes.
    const drawn = await page.evaluate(() => {
      const canvas = document.createElement("canvas");
      canvas.width = 2400;
      canvas.height = 1800;
      const context = canvas.getContext("2d")!;
      context.fillStyle = "#1a237e";
      context.fillRect(0, 0, 2400, 1800);
      context.fillStyle = "#ffc107";
      context.fillRect(300, 300, 900, 600);
      return canvas.toDataURL("image/jpeg", 0.9).split(",")[1];
    });
    const jpeg = Buffer.from(drawn, "base64");
    const written = Buffer.from("Exif\0\0GPSLatitude=16.0212;GPSLongitude=120.2311;SECRET-PLACE", "latin1");
    const block = Buffer.concat([Buffer.from([0xff, 0xe1, (written.length + 2) >> 8, (written.length + 2) & 0xff]), written]);
    const photo = Buffer.concat([jpeg.subarray(0, 2), block, jpeg.subarray(2)]);
    expect(photo.includes("SECRET-PLACE")).toBe(true);

    await page.getByRole("button", { name: existing ? /^Edit/ : "Write", exact: !existing }).first().click();
    const dialog = page.getByRole("dialog");
    await dialog.locator("#journal-activities").fill(`Photographed the filing shelf after sorting it (${Date.now()}).`);
    await dialog.locator("#journal-learnings").fill("How the shelf is ordered, and where a misplaced folder usually ends up.");
    await dialog.locator('input[type="file"]').setInputFiles({ name: "IMG_0001.jpg", mimeType: "image/jpeg", buffer: photo });
    await dialog.getByLabel("Caption for picture 1").fill("The filing shelf");
    await expect(dialog.getByRole("button", { name: "Remove picture 1" })).toBeVisible();
    await page.locator('button[form="journal-form"]').click();
    await expect(page.getByText("Waiting for your supervisor").first()).toBeVisible();

    // What the server now holds: one picture, a JPEG no wider than 1600, with the camera's block gone.
    const after = await journalsNow();
    const journal = after.journals.find((item) => item.week_start === after.current_week_start)!;
    expect(journal.pictures).toBeGreaterThanOrEqual(1);
    const listed = await api<{ attachments: { id: number; caption: string | null; width: number; height: number; mime_type: string }[] }>(
      student.token, "GET", `/api/attachments?owner_type=journal&owner_id=${journal.id}`
    );
    const picture = listed.body.attachments.at(-1)!;
    expect([picture.caption, picture.mime_type, picture.width, picture.height]).toEqual(["The filing shelf", "image/jpeg", 1600, 1200]);
    const file = await fetch(`${API}/api/attachments/${picture.id}/file`, { headers: { Authorization: `Bearer ${student.token}` } });
    const kept = Buffer.from(await file.arrayBuffer());
    expect(kept.subarray(0, 3)).toEqual(Buffer.from([0xff, 0xd8, 0xff]));
    expect(kept.includes("SECRET-PLACE")).toBe(false);
    expect(kept.includes("GPSLatitude")).toBe(false);
    expect(kept.includes("Exif")).toBe(false);
    expect(kept.length).toBeLessThan(photo.length);

    // The student sees it on the report and can open it.
    await page.getByRole("button", { name: "Open The filing shelf" }).first().click();
    const viewer = page.getByRole("dialog", { name: /^Picture \d of \d$/ });
    await expect(viewer.getByRole("img", { name: "The filing shelf" })).toBeVisible();
    await page.keyboard.press("Escape");

    // The supervisor sees it with the report.
    const supervisor = await apiSession("supervisor");
    const theirs = await api<{ attachments: { id: number }[]; can_add: boolean }>(
      supervisor.token, "GET", `/api/attachments?owner_type=journal&owner_id=${journal.id}`
    );
    expect(theirs.body.attachments.map((item) => item.id)).toContain(picture.id);
    expect(theirs.body.can_add).toBe(false);
    const supervisorPage = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
    await signIn(supervisorPage, "supervisor");
    await supervisorPage.goto("/supervisor/journals");
    await expect(supervisorPage.getByRole("button", { name: "Open The filing shelf" }).first()).toBeVisible();
    await supervisorPage.context().close();

    // Closed, so the other weekly-report journey finds only its own report waiting on a later run.
    const closed = await api(supervisor.token, "PATCH", `/api/journals/${journal.id}/review`, { status: "Reviewed" });
    expect(closed.status).toBe(200);
    // And a reviewed report takes no more pictures.
    const late = new FormData();
    late.append("owner_type", "journal");
    late.append("owner_id", String(journal.id));
    late.append("file", new Blob([kept], { type: "image/jpeg" }), "late.jpg");
    const refused = await fetch(`${API}/api/attachments`, { method: "POST", headers: { Authorization: `Bearer ${student.token}` }, body: late });
    expect(refused.status).toBe(409);
  });
});

test.describe("pictures on a time-out note and on a concern", () => {
  // A small real picture, drawn in the page.
  const drawPicture = async (page: import("@playwright/test").Page) =>
    Buffer.from(
      await page.evaluate(() => {
        const canvas = document.createElement("canvas");
        canvas.width = 800;
        canvas.height = 600;
        const context = canvas.getContext("2d")!;
        context.fillStyle = "#0d47a1";
        context.fillRect(0, 0, 800, 600);
        return canvas.toDataURL("image/png").split(",")[1];
      }),
      "base64"
    );
  const secondStudent = async () => {
    const response = await fetch(`${API}/api/login/student`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: SECOND_STUDENT.email, password: SECOND_STUDENT.password }),
    });
    const data = await response.json();
    return { token: String(data.token), id: String(data.student.student_id) };
  };

  test("a student adds a picture when timing out, and the supervisor sees it on the log", async ({ page }) => {
    const student = await secondStudent();
    type Log = { id: number; date: string; time_out: string | null; pictures?: number };
    const todays = async () =>
      (await api<{ attendance: Log[] }>(student.token, "GET", `/api/attendance/${student.id}`)).body.attendance.find((log) => log.date === today());
    let log = await todays();
    test.skip(Boolean(log?.time_out), "The second demo student has already timed out today.");
    if (!log) {
      // No log yet today: start one the way a phone with no connection would have.
      const started = await api(student.token, "POST", "/api/attendance/offline-time-in", {
        occurred_at: new Date(Date.now() - 60_000).toISOString(),
        client_request_id: `journey-${Date.now()}`,
      });
      expect(started.status).toBe(201);
      log = await todays();
    }

    await signIn(page, "student", SECOND_STUDENT);
    const picture = await drawPicture(page);
    // The Attendance page offers Time out at any point in the day; the floating button offers only the next step.
    await page.goto("/daily-log");
    await page.getByRole("button", { name: /^Time out/ }).locator("visible=true").first().click();
    const dialog = page.getByRole("alertdialog").or(page.getByRole("dialog"));
    await dialog.locator("#accomplishment").fill("Sorted the supply cabinet and labelled each shelf.");
    await dialog.locator('input[type="file"]').setInputFiles({ name: "cabinet.png", mimeType: "image/png", buffer: picture });
    await dialog.getByLabel("Caption for picture 1").fill("The cabinet, labelled");
    await dialog.getByRole("button", { name: "Time out", exact: true }).click();
    await expect(page.getByText(/Time-out recorded/)).toBeVisible({ timeout: 20_000 });

    await expect.poll(async () => (await todays())?.pictures, { timeout: 15_000 }).toBe(1);
    const supervisor = await apiSession("supervisor");
    const seen = await api<{ attachments: { caption: string | null; mime_type: string }[] }>(
      supervisor.token, "GET", `/api/attachments?owner_type=attendance&owner_id=${log!.id}`
    );
    // Sent as a PNG, kept as the JPEG the app made of it.
    expect(seen.body.attachments.map((item) => [item.caption, item.mime_type])).toEqual([["The cabinet, labelled", "image/jpeg"]]);
    // The student sees it on the day's log.
    await page.goto("/daily-log");
    await expect(page.getByRole("button", { name: "Open The cabinet, labelled" }).locator("visible=true").first()).toBeVisible();
  });

  test("a student adds a picture to a concern: the coordinator sees it, the student's supervisor does not", async ({ page, browser }) => {
    const student = await secondStudent();
    await signIn(page, "student", SECOND_STUDENT);
    await page.goto("/student/resolution");
    const picture = await drawPicture(page);
    const words = `The storeroom door does not lock (${Date.now()}).`;
    await page.locator("textarea").first().fill(words);
    // The form has two file choosers: one for a document as evidence, one for pictures.
    await page.locator('input[type="file"][accept="image/*"]').setInputFiles({ name: "door.png", mimeType: "image/png", buffer: picture });
    await page.getByLabel("Caption for picture 1").fill("The door");
    await page.getByRole("button", { name: /^(Send|Submit)/ }).first().click();
    await expect(page.getByText(/Concern sent/)).toBeVisible({ timeout: 20_000 });

    const mine = await api<{ complaints?: { id: number; description: string }[]; reports?: { id: number; description: string }[] }>(
      student.token, "GET", `/api/complaints/student/${student.id}`
    );
    const concern = (mine.body.complaints ?? mine.body.reports ?? (mine.body as unknown as { id: number; description: string }[])).find((item) => item.description === words)!;
    expect(concern).toBeTruthy();
    const path = `/api/attachments?owner_type=complaint&owner_id=${concern.id}`;
    const coordinator = await apiSession("coordinator");
    const supervisor = await apiSession("supervisor");
    expect((await api<{ attachments: unknown[] }>(coordinator.token, "GET", path)).body.attachments).toHaveLength(1);
    expect((await api<{ attachments: unknown[] }>(supervisor.token, "GET", path)).body.attachments).toHaveLength(0);

    // The coordinator opens the concern and the picture is there.
    const coordinatorPage = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
    await signIn(coordinatorPage, "coordinator");
    await coordinatorPage.goto("/coordinator/complaints");
    await coordinatorPage.getByText(words).first().click();
    await expect(coordinatorPage.getByRole("button", { name: "Open The door" }).first()).toBeVisible();
    await coordinatorPage.context().close();
  });
});

test.describe("sounds and vibration", () => {
  test("sounds start off and vibration on; the choice is kept on the device; each cue can be heard", async ({ page }) => {
    await signIn(page, "student");
    await page.goto("/profile");
    await openProfileGroup(page, "Notifications");
    const card = page.locator("section, div").filter({ has: page.getByRole("heading", { name: "Sounds and vibration" }) }).last();
    const sound = card.getByRole("switch", { name: "Sounds" });
    await expect(sound).not.toBeChecked();
    await expect(card.getByRole("switch", { name: /^Vibration/ })).toBeChecked();
    // Supervisors' and coordinators' cue for new work is not offered to a student.
    await expect(card.getByRole("button", { name: "Something new to review" })).toHaveCount(0);

    // Each sample gives its own cue (the app announces every cue it gives).
    await page.evaluate(() => {
      (window as unknown as { heard: string[] }).heard = [];
      window.addEventListener("internet-cue", (event) => (window as unknown as { heard: string[] }).heard.push(String((event as CustomEvent).detail)));
    });
    for (const name of ["Recorded", "Saved on this phone", "Sent", "Not accepted"]) {
      await card.getByRole("button", { name, exact: true }).click();
    }
    expect(await page.evaluate(() => (window as unknown as { heard: string[] }).heard)).toEqual(["committed", "saved", "sent", "refused"]);

    await sound.check();
    await page.reload();
    await openProfileGroup(page, "Notifications");
    await expect(page.getByRole("switch", { name: "Sounds" })).toBeChecked();
    await page.getByRole("switch", { name: "Sounds" }).uncheck();
  });
});

test.describe("camera details stay on the phone", () => {
  test("a photo chosen as a document leaves the phone redrawn, without its place or camera details", async ({ page }) => {
    await signIn(page, "student", SECOND_STUDENT);
    await page.goto("/documents");
    // A real photo, larger than needed, with an Exif block naming a place put in after the first two bytes.
    const drawn = Buffer.from(
      await page.evaluate(() => {
        const canvas = document.createElement("canvas");
        canvas.width = 1200;
        canvas.height = 900;
        const context = canvas.getContext("2d")!;
        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, 1200, 900);
        context.fillStyle = "#1a237e";
        context.fillRect(100, 100, 600, 80);
        return canvas.toDataURL("image/jpeg", 0.92).split(",")[1];
      }),
      "base64"
    );
    const details = Buffer.from("Exif\0\0MM\0*GPSLatitude 16.0231N GPSLongitude 120.2311E Lingayen-PSU", "latin1");
    const block = Buffer.concat([Buffer.from([0xff, 0xe1, (details.length + 2) >> 8, (details.length + 2) & 0xff]), details]);
    const photo = Buffer.concat([drawn.subarray(0, 2), block, drawn.subarray(2)]);

    // What the phone actually sends.
    let sent: Buffer | null = null;
    await page.route("**/api/documents", async (route) => {
      if (route.request().method() === "POST") sent = route.request().postDataBuffer();
      await route.continue();
    });
    const chooser = page.waitForEvent("filechooser");
    await page.getByRole("button", { name: /^(Upload|Upload again)(: .+)?$/ }).first().click();
    await (await chooser).setFiles({ name: "IMG_2041.jpg", mimeType: "image/jpeg", buffer: photo });
    await expect.poll(() => sent !== null, { timeout: 15_000 }).toBe(true);
    const body = sent as unknown as Buffer;
    expect(body.includes(Buffer.from([0xff, 0xd8, 0xff]))).toBe(true);
    for (const secret of ["Exif", "GPSLatitude", "Lingayen-PSU"]) expect(body.includes(Buffer.from(secret, "latin1"))).toBe(false);
  });
});
