import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { LoginButton } from "./LoginButton";

afterEach(() => vi.restoreAllMocks());

describe("LoginButton", () => {
  it("affiche le formulaire PAT sans alerte au départ", () => {
    render(<LoginButton />);
    expect(screen.getByLabelText("Personal Access Token Azure DevOps")).toBeInTheDocument();
    expect(screen.getByText("Se connecter")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("affiche une erreur quand le PAT est refusé (401)", async () => {
    global.fetch = vi.fn().mockResolvedValue({ status: 401 }) as unknown as typeof fetch;
    render(<LoginButton />);
    fireEvent.change(screen.getByLabelText("Personal Access Token Azure DevOps"), {
      target: { value: "bad-pat" },
    });
    fireEvent.click(screen.getByText("Se connecter"));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("PAT invalide"));
    expect(global.fetch).toHaveBeenCalledWith("/auth/login", expect.objectContaining({ method: "POST" }));
  });
});
