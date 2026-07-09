import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { LoginButton } from "./LoginButton";

afterEach(() => vi.restoreAllMocks());

describe("LoginButton", () => {
  it("affiche le formulaire (org + PAT) sans alerte au départ", () => {
    render(<LoginButton />);
    expect(screen.getByLabelText("Organisation Azure DevOps")).toBeInTheDocument();
    expect(screen.getByLabelText("Personal Access Token Azure DevOps")).toBeInTheDocument();
    expect(screen.getByText("Se connecter")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("affiche une erreur quand le PAT/org est refusé (401)", async () => {
    global.fetch = vi.fn().mockResolvedValue({ status: 401 }) as unknown as typeof fetch;
    render(<LoginButton />);
    fireEvent.change(screen.getByLabelText("Organisation Azure DevOps"), {
      target: { value: "Les-Moires" },
    });
    fireEvent.change(screen.getByLabelText("Personal Access Token Azure DevOps"), {
      target: { value: "bad-pat" },
    });
    fireEvent.click(screen.getByText("Se connecter"));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("invalide"));
    expect(global.fetch).toHaveBeenCalledWith("/auth/login", expect.objectContaining({ method: "POST" }));
  });

  it("envoie remember=true quand « Se souvenir de moi » est cochée", async () => {
    global.fetch = vi.fn().mockResolvedValue({ status: 401 }) as unknown as typeof fetch;
    render(<LoginButton />);
    fireEvent.change(screen.getByLabelText("Organisation Azure DevOps"), {
      target: { value: "Les-Moires" },
    });
    fireEvent.change(screen.getByLabelText("Personal Access Token Azure DevOps"), {
      target: { value: "some-pat" },
    });
    fireEvent.click(screen.getByLabelText(/Se souvenir de moi/));
    fireEvent.click(screen.getByText("Se connecter"));
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    const body = JSON.parse((global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body);
    expect(body.remember).toBe(true);
  });
});
