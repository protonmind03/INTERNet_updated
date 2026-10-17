import { expect, test } from "@playwright/test";
import { API, api, apiSession, signIn, ACCOUNTS } from "./helpers";

/*
|--------------------------------------------------------------------------
| A SCHEDULE THAT REPEATS EVERY TWO WEEKS
|--------------------------------------------------------------------------
|
| Iteration 11. The coordinator turns a student's schedule into a two-week
| pattern on the record's Schedule tab; the student's Schedule page shows
| this week and next week as the pattern's two weeks; the supervisor's
| intern page says it repeats every two weeks; and the expected end date the
| server keeps says how it was worked out.
|
*/

test("a two-week pattern from the record's Schedule tab, read by the student, the supervisor and the projection", async ({ browser }) => {
  const coordinator = await apiSession("coordinator");
  const supervisor = await apiSession("supervisor");
  const id = `PAT-${Date.now()}`;
  const email = `${id.toLowerCase()}@pattern.test`;
  const name = `Pat Pattern ${id.slice(-5)}`;
  expect((await api(coordinator.token, "POST", "/api/coordinator/students", {
    student_id: id, email, password: "PatternStart123!", name, supervisor_id: supervisor.id, required_hours: 160,
  })).status).toBe(201);
  const login = async (password: string) =>
    (await (await fetch(`${API}/api/login/student`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }),
    })).json()).token as string;
  expect((await api(await login("PatternStart123!"), "PUT", `/api/students/${id}/password`, { current_password: "PatternStart123!", new_password: "PatternCheck456!" })).status).toBe(200);
  const token = await login("PatternCheck456!");
  const privacy = await api<{ notice: { version: string } }>(token, "GET", `/api/students/${id}/privacy`);
  await api(token, "POST", `/api/students/${id}/privacy/consent`, { version: privacy.body.notice.version });
  // A one-week schedule to start from: Monday to Friday.
  expect((await api(coordinator.token, "PUT", `/api/coordinator/students/${id}/schedule`, {
    schedule: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"].map((day) => ({ day, start_time: "08:00", end_time: "16:00" })),
  })).status).toBe(200);

  try {
    // The coordinator makes it two weeks, week 2 a copy of week 1, and saves.
    const coordinatorContext = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const cp = await coordinatorContext.newPage();
    await signIn(cp, "coordinator");
    await cp.goto(`/coordinator/students/${encodeURIComponent(id)}?tab=schedule`);
    await cp.getByRole("radio", { name: "Every two weeks" }).check();
    await expect(cp.getByLabel("Week 1 starts on")).not.toHaveValue("");
    await expect(cp.getByText(/this week is week [12]/)).toBeVisible();
    await cp.getByRole("button", { name: "Copy week 1" }).click();
    await expect(cp.getByRole("heading", { name: "Week 2" })).toBeVisible();
    await cp.getByRole("button", { name: "Save schedule" }).click();
    await expect(cp.getByText(/Schedule saved/)).toBeVisible();
    await coordinatorContext.close();
    const saved = await api<{ pattern: { weeks: number; anchor: string } ; schedule: { week: number }[] }>(coordinator.token, "GET", `/api/coordinator/students/${id}/schedule`);
    expect(saved.body.pattern.weeks).toBe(2);
    expect(saved.body.schedule.filter((row) => row.week === 2)).toHaveLength(5);

    // The student: this week and next week, each its week of the pattern.
    const studentContext = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const sp = await studentContext.newPage();
    await signIn(sp, "student", { ...ACCOUNTS.student, email, password: "PatternCheck456!" });
    await sp.goto("/schedule");
    await expect(sp.getByText(/Repeats every two weeks/)).toBeVisible();
    await expect(sp.getByRole("heading", { name: /^This week, week [12] of 2$/ })).toBeVisible();
    await expect(sp.getByRole("heading", { name: /^Next week, week [12] of 2$/ })).toBeVisible();
    // The finish date says how it was worked out.
    await sp.goto("/schedule?view=progress");
    await sp.getByText("How this was worked out").click();
    await expect(sp.getByText(/The schedule repeats every two weeks/)).toBeVisible();
    await studentContext.close();

    // The coordinator's record reads the pattern too: its overview and its Schedule tab.
    const recordContext = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const rp = await recordContext.newPage();
    await signIn(rp, "coordinator");
    await rp.goto(`/coordinator/students/${encodeURIComponent(id)}`);
    await expect(rp.getByRole("heading", { level: 1, name })).toBeVisible({ timeout: 20_000 });
    await rp.goto(`/coordinator/students/${encodeURIComponent(id)}?tab=schedule`);
    await expect(rp.getByRole("heading", { name: "Schedule", exact: true })).toBeVisible();
    await expect(rp.getByRole("radio", { name: "Every two weeks" })).toBeChecked();
    await recordContext.close();

    // The supervisor's intern page says how it repeats.
    const supervisorContext = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const vp = await supervisorContext.newPage();
    await signIn(vp, "supervisor");
    await vp.goto(`/supervisor/interns/${encodeURIComponent(id)}`);
    await expect(vp.getByText(/Repeats every two weeks/).first()).toBeVisible({ timeout: 20_000 });
    await supervisorContext.close();

    // The kept expected end, and how it was worked out.
    const projection = await api<{ projection: { projected_end_date: string; how: { pattern_weeks: number; steps: string[] } } }>(
      token, "GET", `/api/students/${encodeURIComponent(id)}/projection`
    );
    expect(projection.status).toBe(200);
    expect(projection.body.projection.how.pattern_weeks).toBe(2);
    expect(projection.body.projection.projected_end_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  } finally {
    await api(coordinator.token, "PATCH", `/api/coordinator/students/${id}/status`, { is_active: false });
  }
});
