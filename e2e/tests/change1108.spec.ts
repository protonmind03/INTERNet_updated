import { expect, test } from "@playwright/test";
import { api, apiSession, signIn, today } from "./helpers";

/*
|--------------------------------------------------------------------------
| CHANGE1108: WHAT THE TRAINEE MAKES REACHES EVERYONE WHO NEEDS IT
|--------------------------------------------------------------------------
|
| The second round of trainee revisions (change1108.txt), checked end to
| end in the built app:
|
|   the Narrative report's guided parts: the Title Page from a layout, the
|   Organizational Chart from boxes, the Dedication's guiding questions
|   the four pre-OJT forms, filled in from the record, in the university's
|   formats, ready to print
|   a day's report reaches the supervisor (the intern's Reports tab) and
|   the coordinator (the student record), and the coordinator reads the
|   trainee's FM-AA-INT-20
|   My progress says where the trainee stands in words before drawings
|
*/

test.use({ viewport: { width: 1280, height: 900 } });

test("the narrative's guided parts: a title page from a layout, an org chart from boxes, a dedication from a question", async ({ page }) => {
  const student = await apiSession("student");
  await signIn(page, "student");
  await page.goto("/student/narrative?part=title_page");
  await expect(page.getByRole("heading", { name: "I. Title Page" })).toBeVisible();

  // Three layouts; the preview follows the choice and the record fills the lines.
  await expect(page.getByRole("radio")).toHaveCount(3);
  await page.getByRole("radio", { name: /Seal band/ }).check();
  await expect(page.getByRole("img", { name: "Preview of the title page" })).toContainText("NARRATIVE REPORT ON INTERNSHIP TRAINING");
  await page.getByLabel("Submitted to (optional)").fill("The OJT coordinator");
  await expect(page.getByText("All changes saved")).toBeVisible({ timeout: 10_000 });
  const saved = await api<{ parts: Record<string, { text: string; data?: Record<string, unknown> }> }>(student.token, "GET", `/api/students/${encodeURIComponent(student.id)}/narrative`);
  expect(saved.body.parts.title_page?.data?.layout).toBe("seal");
  expect(saved.body.parts.title_page?.text).toContain("Submitted to: The OJT coordinator");

  // The organizational chart: boxes joined into a chart.
  await page.getByRole("navigation", { name: "Parts of the narrative report" }).getByRole("button", { name: /Organizational Chart/ }).click();
  await expect(page.getByRole("heading", { name: /Organizational Chart/ })).toBeVisible();
  await page.getByRole("radio", { name: "Build the chart" }).click();
  const stamp = Date.now();
  await page.getByRole("button", { name: "Add a box" }).click();
  const positions = page.getByLabel(/^Position \d+$/);
  await positions.last().fill(`Records Officer ${stamp}`);
  await expect(page.locator(".org-tree .org-box").filter({ hasText: `Records Officer ${stamp}` })).toBeVisible();
  await expect(page.getByText("All changes saved")).toBeVisible({ timeout: 10_000 });

  // The dedication: a question starts the sentence.
  await page.getByRole("navigation", { name: "Parts of the narrative report" }).getByRole("button", { name: /Dedication/ }).click();
  await page.getByRole("button", { name: "Who kept you going?" }).click();
  await expect(page.getByLabel("III. Dedication")).toHaveValue(/This work is dedicated to my family, who $/);
});

test("the four pre-OJT forms are filled in from the record, in the university's formats", async ({ page }) => {
  await signIn(page, "student");
  await page.goto("/documents");
  await page.getByRole("link", { name: /Fill and print the pre-OJT forms/ }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Fill and print" })).toBeVisible();
  const forms: [RegExp, string, string | null][] = [
    [/^Application for Internship/, "Application for Internship", "FM-AA-INT-01"],
    [/^Consent Form/, "Consent Form", "FM-AA-INT-03"],
    [/^Internship Release Form/, "Internship Release Form", null],
    [/^Training Agreement and Liability Waiver Form/, "Training Agreement and Liability Waiver Form", "FM-AA-INT-18"],
  ];
  for (const [tab, title, code] of forms) {
    await page.getByRole("tab", { name: tab }).click();
    const sheet = page.getByRole("article", { name: title });
    await expect(sheet).toBeVisible();
    if (code) await expect(sheet.locator(".psu-form-code")).toContainText(code);
    // Filled from the record: the trainee's name is on it.
    await expect(sheet).toContainText(/Demo/i);
  }
  // A line typed in is on the sheet at once.
  await page.getByRole("tab", { name: /^Consent Form/ }).click();
  await page.getByLabel("Home address").fill("12 Rizal St., Lingayen");
  await expect(page.getByRole("article", { name: "Consent Form" })).toContainText("12 Rizal St., Lingayen");
  await expect(page.getByRole("button", { name: "Print or save PDF" })).toBeVisible();
});

test("a day's report reaches the supervisor and the coordinator; the coordinator reads FM-AA-INT-20", async ({ browser }) => {
  const student = await apiSession("student");
  const words = `Filed the incoming letters and greeted visitors (${Date.now()}).`;
  const wrote = await api(student.token, "PUT", `/api/students/${encodeURIComponent(student.id)}/daily-reports/${today()}`, { summary: words });
  expect(wrote.status, JSON.stringify(wrote.body)).toBe(200);
  const ratings = Object.fromEntries(["aligned", "challenging", "learning", "policies", "relationship", "hazards", "safety"].map((key) => [key, 4]));
  const sent = await api(student.token, "PUT", `/api/students/${encodeURIComponent(student.id)}/feedback-form`, { ratings, problems_met: "", other_concerns: "", submit: true });
  expect(sent.status, JSON.stringify(sent.body)).toBe(200);

  // The supervisor: the intern's Reports tab.
  const supervisor = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
  await signIn(supervisor, "supervisor");
  await supervisor.goto(`/supervisor/interns/${encodeURIComponent(student.id)}?tab=reports`);
  await expect(supervisor.getByRole("heading", { name: "Daily reports" })).toBeVisible({ timeout: 20_000 });
  await expect(supervisor.getByText(words)).toBeVisible();
  await expect(supervisor.getByText(/FM-AA-INT-20/)).toHaveCount(0);
  await supervisor.context().close();

  // The coordinator: the student record's Reports, with the feedback form.
  const coordinator = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
  await signIn(coordinator, "coordinator");
  await coordinator.goto(`/coordinator/students/${encodeURIComponent(student.id)}?tab=journals`);
  await expect(coordinator.getByText(words)).toBeVisible({ timeout: 20_000 });
  await expect(coordinator.getByRole("heading", { name: /FM-AA-INT-20/ })).toBeVisible();
  await expect(coordinator.getByText(/^Sent /).first()).toBeVisible();
  // And how far the narrative report is, and the report photos.
  await expect(coordinator.getByRole("heading", { name: "Narrative report", exact: true })).toBeVisible();
  await expect(coordinator.getByText(/^\d+ of \d+$/).first()).toBeVisible();
  await expect(coordinator.getByRole("heading", { name: "Report photos", exact: true })).toBeVisible();
  await coordinator.context().close();
});
