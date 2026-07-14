import { describe, it, expect, beforeEach, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { App } from "./App";
import { useAuthStore } from "./stores/auth.store";
import { useSessionStore } from "./stores/session.store";
import { useTicketsStore } from "./stores/tickets.store";
import type { SessionSnapshot } from "@moirai/shared";

// --- Mocks à la frontière : aucune dépendance réseau/socket réelle ---
vi.mock("./services/rest.client", () => ({
  api: {
    getOrganizations: vi.fn().mockResolvedValue({ organizations: [], selected: null }),
    getProjects: vi.fn().mockResolvedValue([]),
    createSession: vi.fn(),
    getAnnotations: vi.fn().mockResolvedValue({ milestones: [], rowPins: [] }),
    syncSession: vi.fn().mockResolvedValue({ tickets: [] }),
    getTypeFields: vi.fn().mockResolvedValue([{ referenceName: "Custom.WorkType", name: "Work Type", defaultValue: "Implementation" }]),
  },
}));
vi.mock("./services/operations.client", () => ({
  connectSocket: vi.fn(),
  submitOperation: vi.fn(),
  setRejectionHandler: vi.fn(),
  getSocket: () => null,
  disconnectSocket: vi.fn(),
}));
vi.mock("./services/presence.client", () => ({
  initPresenceListeners: vi.fn(),
  emitPresence: vi.fn(),
}));

function mockAuthMe(response: { ok: boolean; body?: unknown }) {
  global.fetch = vi.fn().mockResolvedValue({
    ok: response.ok,
    json: () => Promise.resolve(response.body ?? null),
  }) as unknown as typeof fetch;
}

beforeEach(() => {
  useAuthStore.setState({ user: null, loading: true });
  useSessionStore.setState({ snapshot: null });
  useTicketsStore.setState({ tickets: [] });
});

describe("App — rendu des 3 vues (pages)", () => {
  it("non authentifié => écran de connexion", async () => {
    mockAuthMe({ ok: false });
    render(<App />);
    expect(await screen.findByText("Se connecter")).toBeInTheDocument();
  });

  it("authentifié sans session => lobby de session", async () => {
    mockAuthMe({ ok: true, body: { id: "u1", displayName: "Alice" } });
    render(<App />);
    expect(await screen.findByText("Nouvelle session")).toBeInTheDocument();
  });

  it("session active sans work item => état vide (pas de données de démo)", async () => {
    mockAuthMe({ ok: true, body: { id: "u1", displayName: "Alice" } });
    const snapshot: SessionSnapshot = {
      sessionId: "s1",
      tickets: [],
      participants: [],
      teamMembers: [{ id: "m1", displayName: "Alice", capacityHoursPerDay: 8 }],
      iterations: [],
      capacities: [],
    };
    useSessionStore.setState({ snapshot });
    render(<App />);
    // Projet ADO vide : on affiche l'état vide au lieu de retomber sur le board de démo.
    expect(await screen.findByText("Aucun work item")).toBeInTheDocument();
    expect(screen.getByText("Choisir un autre projet")).toBeInTheDocument();
  });

  it("session réelle avec 1 seule itération => board monté sans crash (régression range)", async () => {
    mockAuthMe({ ok: true, body: { id: "u1", displayName: "Alice" } });
    const snapshot: SessionSnapshot = {
      sessionId: "s1",
      tickets: [
        {
          id: "10", title: "US réelle", workItemType: "User Story", parentId: null, state: "Active", tags: [],
          assigneeId: "u1", areaPath: "P\\A", iterationId: "P\\S1", epicId: null, epicTitle: null,
          startDate: "2026-06-29", endDate: "2026-07-10", targetDate: null, estimateHours: 0, storyPoints: 5, adoRev: 1, syncStatus: "synced",
        },
      ],
      participants: [],
      teamMembers: [{ id: "u1", displayName: "Alice", capacityHoursPerDay: 8 }],
      iterations: [{ id: "1", name: "Sprint 1", path: "P\\S1", startDate: "2026-06-29", finishDate: "2026-07-10" }],
      capacities: [],
    };
    useSessionStore.setState({ snapshot });
    render(<App />);
    // Rendu réel (adapter + applyDataset) : le board se monte, le popover d'intervalle
    // ne référence plus M.iters[2] hors limites.
    expect(await screen.findByText("Sprint Planning")).toBeInTheDocument();
  });

  it("panneau ticket : virgule acceptée en Story Points, champs custom affichés, intervalle en selects", async () => {
    mockAuthMe({ ok: true, body: { id: "u1", displayName: "Alice" } });
    // Champs ADO supplémentaires ajoutés par l'utilisateur pour le type "User Story"
    // (Risque : requis ; Type de travail : picklist).
    localStorage.setItem("moirai.uiPrefs", JSON.stringify({ v: 2, types: { "User Story": { extra: [
      { ref: "Custom.Risque", label: "Risque", required: true },
      { ref: "Custom.Type", label: "Type de travail", allowed: ["Dev", "Design"] },
    ] } } }));
    const snapshot: SessionSnapshot = {
      sessionId: "s1",
      tickets: [
        {
          id: "10", title: "US réelle", workItemType: "User Story", parentId: null, state: "Active", tags: [],
          assigneeId: "u1", areaPath: "P\\A", iterationId: "P\\S1", epicId: null, epicTitle: null,
          startDate: "2026-06-29", endDate: "2026-07-10", targetDate: null, estimateHours: 0, storyPoints: 5, adoRev: 1, syncStatus: "synced",
          customFields: { "Custom.Risque": "Élevé", "Custom.Type": "Dev" },
        },
      ],
      participants: [],
      teamMembers: [{ id: "u1", displayName: "Alice", capacityHoursPerDay: 8 }],
      iterations: [{ id: "1", name: "Sprint 1", path: "P\\S1", startDate: "2026-06-29", finishDate: "2026-07-10" }],
      capacities: [],
    };
    useSessionStore.setState({ snapshot });
    render(<App />);

    // Sélection du ticket (pointerdown + pointerup sans déplacement) => panneau inspecteur.
    fireEvent.pointerDown(await screen.findByText("US réelle"), { clientX: 10, clientY: 10 });
    fireEvent.pointerUp(window, { clientX: 10, clientY: 10 });
    // ("Story Points" existe aussi en option du select Charge du header → libellé unique du panneau.)
    expect(await screen.findByText("Assigné à")).toBeInTheDocument();

    // Champs ADO custom (pref activée) : libellé (marqué * si requis) + valeur éditable.
    expect(screen.getByText("Risque *")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Élevé")).toBeInTheDocument();

    // Write-back custom : commit au blur → opération "custom:<referenceName>".
    fireEvent.blur(screen.getByDisplayValue("Élevé"), { target: { value: "Faible" } });
    const { submitOperation } = await import("./services/operations.client");
    expect(vi.mocked(submitOperation)).toHaveBeenCalledWith(
      expect.objectContaining({ ticketId: "10", field: "custom:Custom.Risque", value: "Faible" }),
    );

    // Champ requis : saisie vide refusée localement — aucune op émise, valeur conservée.
    const before = vi.mocked(submitOperation).mock.calls.length;
    fireEvent.blur(screen.getByDisplayValue("Faible"), { target: { value: "  " } });
    expect(vi.mocked(submitOperation).mock.calls.length).toBe(before);
    expect(screen.getByDisplayValue("Faible")).toBeInTheDocument();

    // Picklist : <select> des valeurs autorisées ; changement → op émise.
    fireEvent.change(screen.getByDisplayValue("Dev"), { target: { value: "Design" } });
    expect(vi.mocked(submitOperation)).toHaveBeenCalledWith(
      expect.objectContaining({ ticketId: "10", field: "custom:Custom.Type", value: "Design" }),
    );

    // Saisie décimale à la virgule, commit au blur => normalisée en 2.5.
    const pointsInput = screen.getByDisplayValue("5");
    fireEvent.blur(pointsInput, { target: { value: "2,5" } });
    expect(await screen.findByDisplayValue("2.5")).toBeInTheDocument();

    // Popover d'intervalle : De/À sont des <select> natifs listant les itérations.
    fireEvent.click(screen.getByRole("button", { name: /Backlog/ }));
    expect(await screen.findByText("Intervalle d'itérations affiché")).toBeInTheDocument();
    expect(screen.getAllByRole("option", { name: "Sprint 1 (courante)" })).toHaveLength(2);

    localStorage.removeItem("moirai.uiPrefs");
  });

  it("panneau ticket : ⚙ ouvre la personnalisation par type et ajoute un champ ADO", async () => {
    localStorage.removeItem("moirai.uiPrefs");
    mockAuthMe({ ok: true, body: { id: "u1", displayName: "Alice" } });
    const snapshot: SessionSnapshot = {
      sessionId: "s1",
      tickets: [
        {
          id: "10", title: "US réelle", workItemType: "User Story", parentId: null, state: "Active", tags: [],
          assigneeId: "u1", areaPath: "P\\A", iterationId: "P\\S1", epicId: null, epicTitle: null,
          startDate: "2026-06-29", endDate: "2026-07-10", targetDate: null, estimateHours: 0, storyPoints: 5, adoRev: 1, syncStatus: "synced",
        },
      ],
      participants: [],
      teamMembers: [{ id: "u1", displayName: "Alice", capacityHoursPerDay: 8 }],
      iterations: [{ id: "1", name: "Sprint 1", path: "P\\S1", startDate: "2026-06-29", finishDate: "2026-07-10" }],
      capacities: [],
    };
    useSessionStore.setState({ snapshot });
    render(<App />);

    fireEvent.pointerDown(await screen.findByText("US réelle"), { clientX: 10, clientY: 10 });
    fireEvent.pointerUp(window, { clientX: 10, clientY: 10 });
    expect(await screen.findByText("Assigné à")).toBeInTheDocument();

    // Roue crantée du panneau → popover de personnalisation, scopé au type du ticket.
    fireEvent.click(screen.getByTitle("Personnaliser les champs affichés"));
    expect(await screen.findByText("Champs affichés — User Story")).toBeInTheDocument();

    // Ajout d'un champ ADO : la liste vient de l'API (champs du type), clic = ajout.
    fireEvent.click(screen.getByText("+ Ajouter un champ supplémentaire"));
    fireEvent.click(await screen.findByText("Work Type"));

    // Le champ ajouté sort de la liste des champs disponibles (ajout unique).
    expect(await screen.findByText("Aucun champ disponible")).toBeInTheDocument();

    // Le champ apparaît (popover + panneau). Le ticket n'a pas de valeur stockée :
    // la valeur par défaut du process est affichée en placeholder (comme dans ADO).
    // La pref est persistée par type de work item, avec le défaut.
    expect(screen.getAllByText("Work Type").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByPlaceholderText("Implementation")).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem("moirai.uiPrefs")!).types["User Story"].extra)
      .toEqual([{ ref: "Custom.WorkType", label: "Work Type", def: "Implementation" }]);

    // Une maj du store tickets (poll sync / écho socket) repatche la valeur du champ custom.
    act(() => {
      useTicketsStore.getState().updateTicket({ ...snapshot.tickets[0], customFields: { "Custom.WorkType": "Dev" } });
    });
    expect(screen.getByDisplayValue("Dev")).toBeInTheDocument();
    expect(screen.queryByPlaceholderText("Implementation")).not.toBeInTheDocument();

    localStorage.removeItem("moirai.uiPrefs");
  });
});
