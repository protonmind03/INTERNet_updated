import { expect, test } from "@playwright/test";
import { ACCOUNTS, SECOND_STUDENT, api, apiSession, signIn, today, type Role } from "./helpers";

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

  test("on a phone: five tabs, two things under More, and the Resolution Center under the avatar", async ({ page }) => {
    await signIn(page, "student");
    const bar = page.getByRole("navigation", { name: "Main" }).last();
    for (const name of ["Today", "Attendance", "Tasks", "Documents"]) {
      await expect(bar.getByRole("link", { name })).toBeVisible();
    }

    await bar.getByRole("button", { name: "More" }).click();
    const more = page.getByRole("dialog", { name: "More" });
    await expect(more.getByRole("link")).toHaveText(["Schedule", "Weekly report"]);
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
    await expect(page.getByRole("rowheader", { name: blockName })).toBeVisible();
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
    await expect(sheet.getByText("Shift", { exact: true })).toBeVisible();
    await expect(sheet.getByText(/^Today$|· Today$|Today/).first()).toBeVisible();
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

    // My progress: the figures, and the rule for "late" behind the "?".
    await page.getByRole("tab", { name: "My progress" }).click();
    await expect(page).toHaveURL(/view=progress$/);
    for (const name of ["Verified hours each week", "Projected finish"]) {
      await expect(page.getByRole("heading", { name })).toBeVisible();
    }
    await expect(page.getByText("Attendance on scheduled days", { exact: true })).toBeVisible();
    await expect(page.getByText("Hours still needed", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: 'How "Average time-in" is counted' }).click();
    await expect(page.getByText(/more than 15 minutes after the shift starts counts as late/)).toBeVisible();

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
    await page.getByRole("button", { name: "More" }).click();
    await page.getByRole("dialog", { name: "More" }).getByRole("link", { name: "Weekly report" }).click();
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
    await page.getByRole("button", { name: /^Actions for BSIT 4/ }).first().click();
    await expect(page.getByRole("menuitem", { name: "Set schedule" })).toBeVisible();
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
      await expect(page.getByText("Deliverable settings saved.")).toBeVisible();
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
