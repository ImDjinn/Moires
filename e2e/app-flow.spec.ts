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
    r.fulfill(json({ organizations: [{ id: "o1", name: "Org1" }], selected: "Org1" })),
  );
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
  await expect(page.getByRole("button", { name: "Se connecter" })).toBeVisible();
});

test("parcours complet : lobby → sélection → board Gantt", async ({ page }) => {
  await stubBackend(page, { authenticated: true });
  await page.goto("/");

  // Lobby
  await expect(page.getByText("Nouvelle session")).toBeVisible();

  // L'org est choisie à la connexion : affichée en lecture seule dans le lobby
  await expect(page.getByText("Org1")).toBeVisible();

  // Sélection du projet (seul select) puis entrée dans la session
  await page.locator("select").selectOption("p1");
  await page.getByRole("button", { name: /Entrer dans la session/i }).click();

  // Board Gantt monté (onglets de mode) avec le ticket du snapshot
  await expect(page.getByText("Sprint Planning")).toBeVisible();
  await expect(page.getByText("Tâche démo")).toBeVisible();
});
