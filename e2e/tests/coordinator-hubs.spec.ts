import { expect, test } from "@playwright/test";
import { api, apiSession, signIn } from "./helpers";

/*
|--------------------------------------------------------------------------
| THE COORDINATOR'S MENU AND HUBS
|--------------------------------------------------------------------------
|
| Roadmap 5.1–5.7 and the PSU redesign's menu review. Each page is one
| entry of the side menu, named as the page is titled, in one group, and
| exactly one entry is marked. A hub only joins pages of one group (Decide:
| Concerns and Appeals; People: Companies and Supervisors; Term:
| Submissions and Deliverables); its tabs show when the side menu is not
| open to list them. Every old address lands on its page or tab. A company
| has its own page with Log visit, a supervisor has a view page where the
| coordinator can correct their contact details.
|
*/

test.use({ viewport: { width: 1280, height: 900 } });

const ENTRIES: [string, string, string][] = [
  // group, entry, heading of the page it opens
  ["Decide", "Concerns", "Concerns"],
  ["Decide", "Appeals", "Appeals"],
  ["Decide", "Needs attention", "Needs attention"],
  ["People", "Students", "Students"],
  ["People", "Companies", "Companies"],
  ["People", "Supervisors", "Supervisors"],
  ["People", "Coordinators", "Coordinators"],
  ["Term", "Terms", "Terms"],
  ["Term", "Programs", "Programs"],
  ["Term", "Holidays", "Holidays"],
  ["Term", "Deliverables", "Deliverables"],
  ["Term", "Submissions", "Submissions"],
  ["Term", "Evaluations", "Evaluations"],
  ["Term", "Site visits", "Site visits"],
  ["Talk", "Messages", "Messages"],
  ["Talk", "Announcements", "Announcements"],
  ["Reports", "Analytics", "Analytics"],
  ["Reports", "Monitoring", "Monitoring"],
  ["Reports", "Audit log", "Audit log"],
  ["Reports", "System status", "System status"],
];

test("coordinator menu: one entry per page, one marked, its group stays open, no repeated tabs, and every old address", async ({ page }) => {
  await signIn(page, "coordinator");
  const menu = page.locator("aside.role-side");
  for (const [group, entry, heading] of ENTRIES) {
    const head = menu.locator(".role-side-group").filter({ hasText: new RegExp(`^${group}`) }).first();
    const toggle = head.locator("button[aria-expanded]").first();
    if ((await toggle.getAttribute("aria-expanded")) !== "true") await toggle.click();
    await head.locator(".role-side-sub").getByRole("link", { name: new RegExp(`^${entry}`) }).click();
    await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
    const lit = menu.locator('[aria-current="page"]');
    await expect(lit).toHaveCount(1);
    await expect(lit).toContainText(entry);
    // The group clicked is the one open: a click never jumps the menu elsewhere.
    await expect(head.locator("button[aria-expanded]").first()).toHaveAttribute("aria-expanded", "true");
    // With the menu open, a hub's tabs are not drawn again in the page.
    await expect(page.getByRole("navigation", { name: / sections$/ })).toHaveCount(0);
  }

  // The address now: path and query.
  const address = () => {
    const url = new URL(page.url());
    return url.pathname + url.search;
  };

  // Old addresses land on their page or tab, keeping what they carried.
  await page.goto("/coordinator/supervisors");
  await expect.poll(address).toBe("/coordinator/companies?tab=supervisors");
  await expect(page.getByRole("heading", { level: 1, name: "Supervisors" })).toBeVisible();
  await page.goto("/coordinator/complaints?focus=complaint-0");
  await expect.poll(address).toBe("/coordinator/resolution?focus=complaint-0&tab=concerns");
  await expect(page.getByRole("heading", { level: 1, name: "Concerns" })).toBeVisible();
  await page.goto("/coordinator/students?tab=terms");
  await expect.poll(address).toBe("/coordinator/terms");
  await page.goto("/coordinator/resolution?tab=evaluations");
  await expect.poll(address).toBe("/coordinator/evaluations");
  await page.goto("/coordinator/profile?section=audit&kind=student");
  await expect.poll(address).toBe("/coordinator/audit?kind=student");
  await expect(page.getByRole("heading", { level: 1, name: "Audit log" })).toBeVisible();

  // With the menu closed to a rail, the hub's tabs are in the page.
  await page.setViewportSize({ width: 1024, height: 900 });
  await page.goto("/coordinator/resolution");
  const tabs = page.getByRole("navigation", { name: "Resolution Center sections" });
  await expect(tabs.getByRole("link", { name: "Concerns" })).toHaveAttribute("aria-current", "page");
  await tabs.getByRole("link", { name: "Appeals" }).click();
  await expect.poll(address).toBe("/coordinator/resolution?tab=appeals");
  await page.setViewportSize({ width: 1280, height: 900 });

  // Announcements: also from the bell.
  await page.getByRole("button", { name: /^Notifications/ }).click();
  await page.getByRole("tab", { name: "Announcements" }).click();
  await page.getByRole("link", { name: "New announcement" }).click();
  await expect.poll(address).toBe("/coordinator/announcements");

  // Account: from the account at the menu's foot, marked there.
  await menu.locator("a.role-side-account").click();
  await expect.poll(address).toBe("/coordinator/profile");
  await expect(page.getByRole("heading", { level: 1, name: "Account" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "How to reach you" })).toBeVisible();
  await expect(menu.locator("a.role-side-account")).toHaveAttribute("aria-current", "page");

  // Deliverables: a requirement opens its submissions, filtered to it.
  await page.goto("/coordinator/documents?tab=requirements");
  const submissions = page.getByRole("link", { name: /^Submissions for / }).first();
  const requirement = ((await submissions.textContent()) ?? "").replace(/^Submissions for /, "").trim();
  await submissions.click();
  await expect.poll(address).toContain("/coordinator/documents?doc_type=");
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
    await expect(page.locator("main").getByText("Logistics").first()).toBeVisible();
    await expect(page.getByText("HR Desk")).toBeVisible();
    await page.getByRole("link", { name: "Log visit" }).click();
    await expect.poll(() => new URL(page.url()).pathname + new URL(page.url()).search).toBe(`/coordinator/site-visits?company=${companyId}&log=1`);
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
