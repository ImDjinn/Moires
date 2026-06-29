import { describe, it, expect, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { LoginButton } from "./LoginButton";

function setSearch(search: string) {
  window.history.replaceState({}, "", `/${search}`);
}

afterEach(() => setSearch(""));

describe("LoginButton", () => {
  it("affiche le bouton sans alerte quand il n'y a pas d'erreur", () => {
    render(<LoginButton />);
    expect(screen.getByText("Se connecter avec Azure AD")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("affiche un message actionnable pour un code AADSTS connu", () => {
    setSearch("?auth_error=AADSTS650052");
    render(<LoginButton />);
    expect(screen.getByRole("alert")).toHaveTextContent("Azure DevOps n'est pas activé");
  });

  it("affiche un message générique avec le code pour une erreur inconnue", () => {
    setSearch("?auth_error=boom");
    render(<LoginButton />);
    expect(screen.getByRole("alert")).toHaveTextContent("code : boom");
  });
});
