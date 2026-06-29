import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { SessionLobby } from "./SessionLobby";

const getOrganizations = vi.fn();
const selectOrganization = vi.fn();
const getProjects = vi.fn();
const createSession = vi.fn();

vi.mock("../../services/rest.client", () => ({
  api: {
    getOrganizations: (...a: unknown[]) => getOrganizations(...a),
    selectOrganization: (...a: unknown[]) => selectOrganization(...a),
    getProjects: (...a: unknown[]) => getProjects(...a),
    createSession: (...a: unknown[]) => createSession(...a),
  },
}));

beforeEach(() => {
  getOrganizations
    .mockReset()
    .mockResolvedValue({ organizations: [{ id: "o1", name: "OrgA" }], selected: "OrgA" });
  selectOrganization.mockReset().mockResolvedValue({ selected: "OrgA" });
  getProjects.mockReset().mockResolvedValue([{ id: "p1", name: "Projet Alpha" }]);
  createSession.mockReset().mockResolvedValue({ tickets: [], participants: [], teamMembers: [], iterations: [] });
});

describe("SessionLobby", () => {
  it("charge et affiche les projets ADO", async () => {
    render(<SessionLobby />);
    expect(await screen.findByText("Projet Alpha")).toBeInTheDocument();
  });

  it("n'affiche ni sélecteur d'itérations ni d'areas", async () => {
    render(<SessionLobby />);
    await screen.findByText("Projet Alpha");
    expect(screen.queryByText(/Itération/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Areas/i)).not.toBeInTheDocument();
  });

  it("affiche l'erreur si le chargement des projets échoue", async () => {
    getProjects.mockRejectedValue(new Error("401 Unauthorized"));
    render(<SessionLobby />);
    expect(await screen.findByText("401 Unauthorized")).toBeInTheDocument();
  });

  it("le bouton Entrer est désactivé tant qu'aucun projet n'est choisi", async () => {
    render(<SessionLobby />);
    const btn = await screen.findByRole("button", { name: /Entrer dans la session/i });
    expect(btn).toBeDisabled();
  });

  it("crée la session avec le seul projet sélectionné", async () => {
    render(<SessionLobby />);
    // attendre que l'option projet soit chargée avant de sélectionner
    const option = (await screen.findByText("Projet Alpha")) as HTMLOptionElement;
    const projectSelect = option.closest("select")!;
    fireEvent.change(projectSelect, { target: { value: "p1" } });

    const btn = screen.getByRole("button", { name: /Entrer dans la session/i });
    expect(btn).not.toBeDisabled();
    fireEvent.click(btn);

    await waitFor(() =>
      expect(createSession).toHaveBeenCalledWith({ adoProjectId: "p1" }),
    );
  });
});
