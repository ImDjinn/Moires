import { test, expect, type Page } from "@playwright/test";

const user = { id: "u1", displayName: "Alice", uniqueName: "alice@corp.com" };

// Sprint courant ancré sur aujourd'hui (CURRENT = 0 quelle que soit la date).
const d = (offset: number) => {
  const t = new Date();
  t.setDate(t.getDate() + offset);
  return t.toISOString().slice(0, 10);
};

const ticket = (t: Record<string, unknown>) => ({
  workItemType: "User Story", parentId: null, state: "Active", tags: [], assigneeId: "alice@corp.com",
  areaPath: "P\\A", epicId: null, epicTitle: null, startDate: d(-3), endDate: d(6), targetDate: null,
  estimateHours: 0, storyPoints: 5, adoRev: 1, syncStatus: "synced", ...t,
});

const snapshot = {
  sessionId: "s1",
  participants: [],
  teamMembers: [{ id: "alice@corp.com", displayName: "Alice", capacityHoursPerDay: 8 }],
  iterations: [
    { id: "1", name: "Sprint 12", path: "P\\S1", startDate: d(-3), finishDate: d(6) },
    { id: "2", name: "Sprint 13", path: "P\\S2", startDate: d(7), finishDate: d(16) },
  ],
  capacities: [],
  memberMeta: [{ memberId: "alice@corp.com", poste: "Backend Lead", role: "Tech Lead" }],
  states: [
    { name: "New", category: "Proposed", color: "#8a8f98", type: "User Story" },
    { name: "Active", category: "InProgress", color: "#0072B2", type: "User Story" },
    { name: "Closed", category: "Completed", color: "#009E73", type: "User Story" },
  ],
  adoUrl: "https://dev.azure.com/org/proj",
  tickets: [
    ticket({
      id: "1042", title: "Export CSV des rapports de charge", iterationId: "P\\S1", priority: 1,
      description: "<p>Permettre l'export du tableau de charge au format CSV.</p><p>Le fichier reprend les colonnes visibles à l'écran.</p>",
      acceptanceCriteria: "<ul><li>Le bouton Export est visible pour tous les rôles</li><li>Les décimales suivent la locale FR</li></ul>",
    }),
    ticket({
      id: "1043", title: "Corriger le tri par priorité sur le Release planning", iterationId: "P\\S1",
      workItemType: "Bug", state: "New", storyPoints: 3,
      description: "<div>Le tri retombe sur le nom quand la priorité est absente.</div>",
    }),
    ticket({ id: "1044", title: "Purger le cache Redis expiré", iterationId: "P\\S1", workItemType: "Task", state: "Closed", storyPoints: 2 }),
    ticket({ id: "1050", title: "Notifications e-mail de fin de sprint", iterationId: "P\\S2", storyPoints: 8 }),
    ticket({ id: "1051", title: "Migration Prisma des jalons", iterationId: "P\\S2", workItemType: "Task", state: "New", storyPoints: 3 }),
    ticket({ id: "1060", title: "Ticket d'un autre membre", iterationId: "P\\S1", assigneeId: "bob@corp.com" }),
  ],
};

const json = (body: unknown) => ({ status: 200, contentType: "application/json", body: JSON.stringify(body) });

async function stubBackend(page: Page) {
  await page.route("**/socket.io/**", (r) => r.abort());
  await page.route("**/auth/me", (r) => r.fulfill(json(user)));
  await page.route("**/ado/organizations", (r) => r.fulfill(json({ organizations: [{ id: "o1", name: "Org1" }], selected: "Org1" })));
  await page.route("**/ado/projects", (r) => r.fulfill(json([{ id: "p1", name: "Projet Alpha" }])));
  await page.route("**/sessions", (r) => (r.request().method() === "POST" ? r.fulfill(json(snapshot)) : r.continue()));
  await page.route("**/sessions/*/annotations", (r) => r.fulfill(json({ milestones: [], rowPins: [] })));
  await page.route("**/sessions/*/sync", (r) => r.fulfill(json(snapshot)));
  await page.route("**/sessions/*", (r) => r.fulfill(json(snapshot)));
}

test("onglet @me : mes tickets du sprint et aperçu du suivant", async ({ page }) => {
  await stubBackend(page);
  await page.goto("/");
  await page.locator("select").selectOption("p1");
  await page.getByRole("button", { name: /Entrer dans la session/i }).click();
  await expect(page.getByText("Sprint Planning")).toBeVisible();

  await page.getByRole("button", { name: "@me" }).click();

  // Sprint courant : détail (description + critères d'acceptation)
  await expect(page.getByText("Export CSV des rapports de charge")).toBeVisible();
  await expect(page.getByText("Critères d'acceptation").first()).toBeVisible();
  await expect(page.getByText(/décimales suivent la locale FR/)).toBeVisible();
  // Sprint suivant : aperçu compact
  await expect(page.getByText("Notifications e-mail de fin de sprint")).toBeVisible();
  // Les tickets des autres membres n'apparaissent pas
  await expect(page.getByText("Ticket d'un autre membre")).toHaveCount(0);

  // Clic sur une carte → panneau d'inspection du board (édition/write-back)
  await page.getByText("Export CSV des rapports de charge").click();
  await expect(page.getByText("Story Points", { exact: true }).last()).toBeVisible();
});
