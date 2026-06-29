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
    };
    useSessionStore.setState({ snapshot });
    render(<App />);
    expect(await screen.findByText("Moires")).toBeInTheDocument();
    expect(screen.getByText("0 tickets")).toBeInTheDocument();
  });
});
