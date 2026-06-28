import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { AuthGuard } from "./AuthGuard";

let mockState: { user: { id: string; displayName: string } | null; loading: boolean };

vi.mock("../../hooks/useAuth", () => ({
  useAuth: () => mockState,
}));

describe("AuthGuard", () => {
  it("affiche le chargement tant que loading est vrai", () => {
    mockState = { user: null, loading: true };
    render(
      <AuthGuard>
        <div>contenu protégé</div>
      </AuthGuard>,
    );
    expect(screen.getByText("Chargement...")).toBeInTheDocument();
    expect(screen.queryByText("contenu protégé")).not.toBeInTheDocument();
  });

  it("affiche le bouton de connexion si non authentifié", () => {
    mockState = { user: null, loading: false };
    render(
      <AuthGuard>
        <div>contenu protégé</div>
      </AuthGuard>,
    );
    expect(screen.getByText("Se connecter avec Azure AD")).toBeInTheDocument();
  });

  it("affiche les enfants si authentifié", () => {
    mockState = { user: { id: "u1", displayName: "Alice" }, loading: false };
    render(
      <AuthGuard>
        <div>contenu protégé</div>
      </AuthGuard>,
    );
    expect(screen.getByText("contenu protégé")).toBeInTheDocument();
  });
});
