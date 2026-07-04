import { test, expect, type Page } from "@playwright/test";

const user = { id: "u1", displayName: "Alice" };

const snapshot = {
  sessionId: "s1",
  tickets: [
    {
      id: "t1",
      title: "Tâche démo",
      assigneeId: "m1",
      areaPath: "Proj\\Team",
      iterationId: "it1",
      startDate: "2026-06-10",
      endDate: "2026-06-12",
      estimateHours: 8,
      adoRev: 1,
      syncStatus: "synced",
    },
  ],
  participants: [],
  teamMembers: [{ id: "m1", displayName: "Alice", capacityHoursPerDay: 8 }],
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
  await page.route("**/ado/projects", (r) =>
    r.fulfill(json([{ id: "p1", name: "Projet Alpha" }])),
  );
  await page.route("**/ado/projects/p1/iterations", (r) =>
    r.fulfill(json([{ id: "it1", name: "Sprint 1", startDate: "", finishDate: "" }])),
  );
  await page.route("**/ado/projects/p1/areas", (r) => r.fulfill(json([{ path: "Proj\\Team" }])));
  await page.route("**/sessions", (r) =>
    r.request().method() === "POST" ? r.fulfill(json(snapshot)) : r.continue(),
  );
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

  // Sélection projet → déclenche le chargement des itérations
  await page.locator("select").first().selectOption("p1");
  await expect(page.locator('select option[value="it1"]')).toHaveCount(1);

  // Sélection itération puis entrée dans la session
  await page.locator("select").nth(1).selectOption("it1");
  await page.getByRole("button", { name: /Entrer dans la session/i }).click();

  // Board Gantt rendu avec le ticket du snapshot
  await expect(page.getByText("Moirai")).toBeVisible();
  await expect(page.getByText("1 tickets")).toBeVisible();
  await expect(page.getByText("Tâche démo")).toBeVisible();
});
