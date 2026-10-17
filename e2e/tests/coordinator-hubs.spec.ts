import { expect, test } from "@playwright/test";
import { api, apiSession, signIn } from "./helpers";

/*
|--------------------------------------------------------------------------
| THE COORDINATOR'S HUBS
|--------------------------------------------------------------------------
|
| Roadmap 5.1–5.7. The side navigation holds the daily jobs; pages about one
| subject are tabs of a hub; every old address lands on its tab; the
| Resolution Center is an icon left of the bell; announcements are written
| from the bell; Profile settings has its sections down the left. A
| company has its own page with Log visit, a supervisor has a view page
| where the coordinator can correct their contact details.
|
*/

test.use({ viewport: { width: 1280, height: 900 } });

test("coordinator hubs: the navigation, every old address, the Resolution Center, the bell and Profile settings", async ({ page }) => {
  await signIn(page, "coordinator");
  const nav = page.getByRole("navigation", { name: "Main" });
  for (const kept of ["Dashboard", "Monitoring", "Analytics", "Students", "Companies", "Programs", "Holidays", "Documents"]) {
    await expect(nav.getByRole("link", { name: new RegExp(`^${kept}`) })).toBeVisible();
  }
  for (const moved of ["Supervisors", "Coordinators", "Terms", "Site visits", "Requirements", "Evaluations", "Concerns", "Appeals", "Announcements", "Audit log"]) {
    await expect(nav.getByRole("link", { name: new RegExp(`^${moved}`) })).toHaveCount(0);
  }

  // Old addresses land on their tab, keeping what they carried.
  await page.goto("/coordinator/supervisors");
  await expect(page).toHaveURL(/\/coordinator\/companies\?tab=supervisors$/);
  await expect(page.getByRole("navigation", { name: "Companies sections" }).getByRole("link", { name: "Supervisors" })).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("heading", { level: 1, name: "Supervisors" })).toBeVisible();
  await page.goto("/coordinator/complaints?focus=complaint-0");
  await expect(page).toHaveURL(/\/coordinator\/resolution\?focus=complaint-0&tab=concerns$/);
  await expect(page.getByRole("heading", { level: 1, name: "Concerns" })).toBeVisible();
  await page.goto("/coordinator/terms");
  await expect(page).toHaveURL(/\/coordinator\/students\?tab=terms$/);
  await expect(page.getByRole("heading", { level: 1, name: "Terms" })).toBeVisible();

  // The Resolution Center: an icon with a name and a 44-pixel target, left of the bell.
  const resolution = page.getByRole("link", { name: /^Resolution Center/ });
  const box = await resolution.boundingBox();
  expect(box && box.width >= 44 && box.height >= 44).toBe(true);
  await resolution.click();
  await expect(page).toHaveURL(/\/coordinator\/resolution$/);
  await page.getByRole("navigation", { name: "Resolution Center sections" }).getByRole("link", { name: "Appeals" }).click();
  await expect(page).toHaveURL(/\/coordinator\/resolution\?tab=appeals$/);

  // Announcements: from the bell.
  await page.getByRole("button", { name: /^Notifications/ }).click();
  await page.getByRole("tab", { name: "Announcements" }).click();
  await page.getByRole("link", { name: "New announcement" }).click();
  await expect(page).toHaveURL(/\/coordinator\/announcements$/);

  // Profile settings, from the avatar: its sections down the left.
  await page.getByRole("link", { name: /OJT Coordinator/ }).first().click();
  const sections = page.getByRole("navigation", { name: "Profile settings sections" });
  await expect(sections.getByRole("link", { name: "Account" })).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("heading", { name: "How to reach you" })).toBeVisible();
  await sections.getByRole("link", { name: "What is switched on" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "What is switched on" })).toBeVisible();
  await page.goto("/coordinator/audit");
  await expect(page).toHaveURL(/\/coordinator\/profile\?section=audit$/);
  await expect(page.getByRole("navigation", { name: "Profile settings sections" }).getByRole("link", { name: "Audit log" })).toHaveAttribute("aria-current", "page");

  // Documents: a requirement opens its submissions, filtered to it.
  await page.goto("/coordinator/documents?tab=requirements");
  const submissions = page.getByRole("link", { name: /^Submissions for / }).first();
  const requirement = ((await submissions.textContent()) ?? "").replace(/^Submissions for /, "").trim();
  await submissions.click();
  await expect(page).toHaveURL(/\/coordinator\/documents\?doc_type=/);
  await expect(page.getByLabel("Requirement")).toHaveValue(requirement);
});

test("a company's page and a supervisor's view page, with Log visit and the coordinator's audited edit", async ({ page }) => {
  const coordinator = await apiSession("coordinator");
  const supervisor = await apiSession("supervisor");
  const name = `Hub Check ${Date.now()}`;
  const made = await api<{ company: { id: number } }>(coordinator.token, "POST", "/api/coordinator/company-records", {
    name, industry: "Logistics", website: "https://example.com", hr_contact: "HR Desk",
  });
  expect(made.status).toBe(201);
  const companyId = made.body.company.id;
  const before = await api<{ details: { work_phone: string | null } }>(coordinator.token, "GET", `/api/coordinator/people/supervisor/${supervisor.id}/details`);
  try {
    await signIn(page, "coordinator");
    await page.goto("/coordinator/companies");
    await page.getByRole("link", { name }).first().click();
    await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
    await expect(page.getByText("Logistics").first()).toBeVisible();
    await expect(page.getByText("HR Desk")).toBeVisible();
    await page.getByRole("link", { name: "Log visit" }).click();
    await expect(page).toHaveURL(new RegExp(`tab=site-visits&company=${companyId}&log=1`));
    const dialog = page.getByRole("dialog", { name: "Log a visit" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByLabel("Company")).toHaveValue(String(companyId));
    await page.keyboard.press("Escape");

    // The supervisor's view page, and an edit of their contact details.
    await page.goto(`/coordinator/supervisors/${encodeURIComponent(supervisor.id)}`);
    await expect(page.getByRole("button", { name: /^Message / })).toBeVisible();
    await page.getByRole("button", { name: "Edit details" }).click();
    await page.getByLabel("Work phone").fill("(075) 522 1234");
    await page.getByRole("button", { name: "Save details" }).click();
    await expect(page.getByText("Details saved.")).toBeVisible();
    await expect(page.getByText("(075) 522 1234").first()).toBeVisible();
  } finally {
    await api(coordinator.token, "PUT", `/api/coordinator/people/supervisor/${supervisor.id}/details`, { work_phone: before.body.details.work_phone ?? null });
    await api(coordinator.token, "PATCH", `/api/coordinator/company-records/${companyId}/status`, { is_active: false });
  }
});
