import { test, expect, type Page } from "@playwright/test";

const user = { id: "u1", displayName: "Alice" };

const snapshot = {
  sessionId: "s1",
  tickets: [
    {
      id: "10",
      title: "Tâche démo",
      workItemType: "User Story",
      parentId: null,
      state: "Active",
      tags: [],
      assigneeId: "m1",
      areaPath: "P\\A",
      iterationId: "P\\S1",
      epicId: null,
      epicTitle: null,
      startDate: "2026-06-29",
      endDate: "2026-07-10",
      targetDate: null,
      estimateHours: 0,
      storyPoints: 5,
      adoRev: 1,
      syncStatus: "synced",
    },
  ],
  participants: [],
  teamMembers: [{ id: "m1", displayName: "Alice", capacityHoursPerDay: 8 }],
  iterations: [{ id: "1", name: "Sprint 1", path: "P\\S1", startDate: "2026-06-29", finishDate: "2026-07-10" }],
  capacities: [],
};

function json(body: unknown) {
  return { status: 200, contentType: "application/json", body: JSON.stringify(body) };
}

/** Stub de tout le backend, avec un état d'auth paramétrable. */
async function stubBackend(page: Page, opts: { authenticated: boolean }) {
  await page.route("**/socket.io/**", (r) => r.abort());
  await page.route("**/auth/me", (r) =>
    opts.authenticated ? r.fulfill(json(user)) : r.fulfill({ status: 401, body: "" }),
  );
  await page.route("**/ado/organizations", (r) =>
    r.fulfill(json({ organizations: [{ id: "o1", name: "Org1" }], selected: null })),
  );
  await page.route("**/ado/organizations/select", (r) => r.fulfill(json({ selected: "Org1" })));
  await page.route("**/ado/projects", (r) =>
    r.fulfill(json([{ id: "p1", name: "Projet Alpha" }])),
  );
  await page.route("**/sessions", (r) =>
    r.request().method() === "POST" ? r.fulfill(json(snapshot)) : r.continue(),
  );
  // Appels du board une fois la session ouverte (sinon proxy → ECONNREFUSED).
  await page.route("**/sessions/*/annotations", (r) => r.fulfill(json({ milestones: [], rowPins: [] })));
  await page.route("**/sessions/*/sync", (r) => r.fulfill(json(snapshot)));
}

test("non authentifié → écran de connexion", async ({ page }) => {
  await stubBackend(page, { authenticated: false });
  await page.goto("/");
  await expect(page.getByText("Se connecter avec Azure AD")).toBeVisible();
});

test("parcours complet : lobby → sélection → board Gantt", async ({ page }) => {
  await stubBackend(page, { authenticated: true });
  await page.goto("/");

  // Lobby
  await expect(page.getByText("Nouvelle session")).toBeVisible();

  // Sélection de l'organisation (1er select) → déclenche le chargement des projets
  await page.locator("select").first().selectOption("Org1");
  await expect(page.locator('select option[value="p1"]')).toHaveCount(1);

  // Sélection du projet (2e select) puis entrée dans la session
  await page.locator("select").nth(1).selectOption("p1");
  await page.getByRole("button", { name: /Entrer dans la session/i }).click();

  // Board Gantt monté (onglets de mode) avec le ticket du snapshot
  await expect(page.getByText("Sprint Planning")).toBeVisible();
  await expect(page.getByText("Tâche démo")).toBeVisible();
});
