import { describe, it, expect, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LoginButton } from "./components/auth/LoginButton";
import { useLangStore } from "./i18n";

// Garde-fou d'intégration : `t()` lit la langue via getState(), donc un composant
// qui oublie `useLang()` reste figé en français après la bascule. Ce test échoue
// dans ce cas — l'erreur que le test unitaire de `t()` ne peut pas voir.
afterEach(() => {
  // Démonter avant de remettre la langue : sinon le store notifie un arbre
  // encore monté hors de act() (avertissement React).
  cleanup();
  if (useLangStore.getState().lang !== "fr") useLangStore.getState().toggle();
});

describe("bascule de langue", () => {
  it("réaffiche l'écran de connexion en anglais après un clic sur EN", async () => {
    render(<LoginButton />);
    expect(screen.getByText("Se connecter")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Switch to English" }));

    expect(screen.getByText("Sign in")).toBeInTheDocument();
    expect(screen.queryByText("Se connecter")).toBeNull();
    expect(document.documentElement.lang).toBe("en");
  });

  it("revient au français par le même bouton", async () => {
    render(<LoginButton />);
    await userEvent.click(screen.getByRole("button", { name: "Switch to English" }));
    await userEvent.click(screen.getByRole("button", { name: "Passer en français" }));

    expect(screen.getByText("Se connecter")).toBeInTheDocument();
    expect(document.documentElement.lang).toBe("fr");
  });
});
