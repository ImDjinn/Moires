// Métriques macro du Release Planning : bandeau Σ capa/effort/delta sur un
// intervalle d'itérations choisi, delta par sprint, ligne de flottaison.
import { test, expect, type Page } from "@playwright/test";

const user = { id: "u1", displayName: "Alice" };

const ticket = (t: Record<string, unknown>) => ({
  parentId: null, state: "Active", tags: [], assigneeId: null, areaPath: "P\\A",
  iterationId: "P\\S2", epicId: null, epicTitle: null, startDate: "", endDate: "",
  targetDate: null, estimateHours: 0, storyPoints: 0, adoRev: 1, syncStatus: "synced", priority: undefined,
  ...t,
});

// Sprints ancrés sur « aujourd'hui » : today tombe toujours dans le Sprint 2
// (lundi→2e vendredi = 10 jours ouvrés), donc CURRENT = 1 quelle que soit la
// date d'exécution en CI. Des dates fixes rendaient le test caduc dès que today
// dépassait le sprint codé en dur.
function sprints() {
  const now = new Date();
  const monday = new Date(now);
  monday.setUTCDate(now.getUTCDate() - ((now.getUTCDay() + 6) % 7)); // lundi de la semaine courante
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const shift = (base: Date, days: number) => {
    const d = new Date(base);
    d.setUTCDate(base.getUTCDate() + days);
    return d;
  };
  // S2 (k=1) commence ce lundi ; chaque sprint dure 2 semaines (10 jours ouvrés).
  return [0, 1, 2, 3].map((k) => {
    const start = shift(monday, (k - 1) * 14);
    return { startDate: iso(start), finishDate: iso(shift(start, 11)) };
  });
}
const sd = sprints();

const snapshot = {
  sessionId: "s1",
  tickets: [
    ticket({ id: "E1", title: "Epic Alpha", workItemType: "Epic", priority: 1 }),
    ticket({ id: "E2", title: "Epic Beta", workItemType: "Epic", priority: 2 }),
    ticket({ id: "F1", title: "Feature A", workItemType: "Feature", parentId: "E1", epicId: "E1", epicTitle: "Epic Alpha" }),
    ticket({ id: "F2", title: "Feature B", workItemType: "Feature", parentId: "E2", epicId: "E2", epicTitle: "Epic Beta" }),
    ticket({ id: "S1", title: "US A1", workItemType: "User Story", parentId: "F1", epicId: "E1", assigneeId: "m1", iterationId: "P\\S2", storyPoints: 15 }),
    ticket({ id: "S2", title: "US A2", workItemType: "User Story", parentId: "F1", epicId: "E1", assigneeId: "m2", iterationId: "P\\S3", storyPoints: 15 }),
    ticket({ id: "S3", title: "US A3", workItemType: "User Story", parentId: "F1", epicId: "E1", assigneeId: "m1", iterationId: "P\\S4", storyPoints: 10 }),
    ticket({ id: "S4", title: "US B1", workItemType: "User Story", parentId: "F2", epicId: "E2", assigneeId: "m2", iterationId: "P\\S2", storyPoints: 15 }),
    ticket({ id: "S5", title: "US B2", workItemType: "User Story", parentId: "F2", epicId: "E2", assigneeId: "m1", iterationId: "P\\S3", storyPoints: 15 }),
  ],
  participants: [],
  teamMembers: [
    { id: "m1", displayName: "Alice", capacityHoursPerDay: 8 },
    { id: "m2", displayName: "Bob", capacityHoursPerDay: 8 },
  ],
  iterations: [
    { id: "1", name: "Sprint 1", path: "P\\S1", ...sd[0] },
    { id: "2", name: "Sprint 2", path: "P\\S2", ...sd[1] },
    { id: "3", name: "Sprint 3", path: "P\\S3", ...sd[2] },
    { id: "4", name: "Sprint 4", path: "P\\S4", ...sd[3] },
  ],
  // La capacité vaut 0 par défaut depuis 53137a3 : on la renseigne explicitement (10/sprint/membre).
  capacities: ["m1", "m2"].flatMap((memberId) =>
    ["P\\S1", "P\\S2", "P\\S3", "P\\S4"].map((iterationPath) => ({ memberId, iterationPath, storyPoints: 10 })),
  ),
};

function json(body: unknown) {
  return { status: 200, contentType: "application/json", body: JSON.stringify(body) };
}

async function stubBackend(page: Page) {
  await page.route("**/socket.io/**", (r) => r.abort());
  await page.route("**/auth/me", (r) => r.fulfill(json(user)));
  await page.route("**/ado/organizations", (r) => r.fulfill(json({ organizations: [{ id: "o1", name: "Org1" }], selected: "Org1" })));
  await page.route("**/ado/projects", (r) => r.fulfill(json([{ id: "p1", name: "Projet Alpha" }])));
  await page.route("**/sessions", (r) => (r.request().method() === "POST" ? r.fulfill(json(snapshot)) : r.continue()));
  await page.route("**/sessions/*/annotations", (r) => r.fulfill(json({ milestones: [], rowPins: [] })));
  await page.route("**/sessions/*/sync", (r) => r.fulfill(json(snapshot)));
}

test("release planning : métriques macro + ligne de flottaison", async ({ page }) => {
  await stubBackend(page);
  await page.goto("/");
  await page.locator("select").selectOption("p1");
  await page.getByRole("button", { name: /Entrer dans la session/i }).click();
  await page.getByRole("button", { name: "Release Planning" }).click();

  // Bandeau de synthèse : capa 2 pers × 10 × 3 sprints (S2→S4) = 60, effort 70, delta −10.
  await expect(page.getByText("Métriques")).toBeVisible();
  await expect(page.getByText("60j", { exact: true })).toBeVisible();
  await expect(page.getByText("−10j", { exact: true })).toBeVisible();

  // Ligne de flottaison : le cumul (Alpha 40 + Beta 30) dépasse 60 sur Beta.
  await expect(page.getByText("⚠ capa", { exact: true })).toBeVisible();
  await expect(page.getByText(/Capacité épuisée · 60j/)).toBeVisible();

  // Réduire l'intervalle à S2 seul : capa 20, effort 30 (S1+S4 = 15+15) → −10.
  const selects = page.locator("select");
  await selects.nth(3).selectOption("1"); // metricsTo → Sprint 2 (index 1)
  await expect(page.getByText("20j", { exact: true })).toBeVisible();
  await expect(page.getByText(/Capacité épuisée · 20j/)).toBeVisible();
});
