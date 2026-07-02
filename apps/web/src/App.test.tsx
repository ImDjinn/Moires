import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { App } from "./App";
import { useAuthStore } from "./stores/auth.store";
import { useSessionStore } from "./stores/session.store";
import { useTicketsStore } from "./stores/tickets.store";
import type { SessionSnapshot } from "@moires/shared";

// --- Mocks à la frontière : aucune dépendance réseau/socket réelle ---
vi.mock("./services/rest.client", () => ({
  api: {
    getOrganizations: vi.fn().mockResolvedValue({ organizations: [], selected: null }),
    selectOrganization: vi.fn(),
    getProjects: vi.fn().mockResolvedValue([]),
    getIterations: vi.fn().mockResolvedValue([]),
    getAreas: vi.fn().mockResolvedValue([]),
    createSession: vi.fn(),
    getAnnotations: vi.fn().mockResolvedValue({ milestones: [], rowPins: [] }),
    syncSession: vi.fn().mockResolvedValue({ tickets: [] }),
  },
}));
vi.mock("./services/operations.client", () => ({
  connectSocket: vi.fn(),
  submitOperation: vi.fn(),
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
    expect(await screen.findByText("Se connecter avec Azure AD")).toBeInTheDocument();
  });

  it("authentifié sans session => lobby de session", async () => {
    mockAuthMe({ ok: true, body: { id: "u1", displayName: "Alice" } });
    render(<App />);
    expect(await screen.findByText("Nouvelle session")).toBeInTheDocument();
  });

  it("authentifié avec session active => board Gantt", async () => {
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
    // Le board Gantt (design Claude Design) expose ses 3 modes en onglets.
    expect(await screen.findByText("Sprint Planning")).toBeInTheDocument();
    expect(screen.getByText("Release Planning")).toBeInTheDocument();
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
});
