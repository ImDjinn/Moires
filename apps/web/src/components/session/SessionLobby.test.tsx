import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { SessionLobby } from "./SessionLobby";

const getProjects = vi.fn();
const getIterations = vi.fn();
const getAreas = vi.fn();

vi.mock("../../services/rest.client", () => ({
  api: {
    getProjects: (...a: unknown[]) => getProjects(...a),
    getIterations: (...a: unknown[]) => getIterations(...a),
    getAreas: (...a: unknown[]) => getAreas(...a),
    createSession: vi.fn(),
  },
}));

beforeEach(() => {
  getProjects.mockReset().mockResolvedValue([]);
  getIterations.mockReset().mockResolvedValue([]);
  getAreas.mockReset().mockResolvedValue([]);
});

describe("SessionLobby", () => {
  it("charge et affiche les projets ADO", async () => {
    getProjects.mockResolvedValue([{ id: "p1", name: "Projet Alpha" }]);
    render(<SessionLobby />);
    expect(await screen.findByText("Projet Alpha")).toBeInTheDocument();
  });

  it("affiche l'erreur si le chargement des projets échoue", async () => {
    getProjects.mockRejectedValue(new Error("401 Unauthorized"));
    render(<SessionLobby />);
    expect(await screen.findByText("401 Unauthorized")).toBeInTheDocument();
  });

  it("le bouton Entrer est désactivé tant qu'aucune itération n'est choisie", async () => {
    render(<SessionLobby />);
    const btn = await screen.findByRole("button", { name: /Entrer dans la session/i });
    expect(btn).toBeDisabled();
  });
});
