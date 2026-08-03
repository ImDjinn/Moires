import { describe, it, expect, afterEach } from "vitest";
import { t, locale, months, useLangStore } from "./i18n";

const setLang = (l: "fr" | "en") => {
  if (useLangStore.getState().lang !== l) useLangStore.getState().toggle();
};

afterEach(() => setLang("fr"));

describe("t", () => {
  it("rend le français par défaut (la chaîne source est la clé)", () => {
    expect(t("Assigné à")).toBe("Assigné à");
  });

  it("traduit en anglais quand la langue est en", () => {
    setLang("en");
    expect(t("Assigné à")).toBe("Assigned to");
  });

  it("retombe sur le français quand la clé n'est pas traduite", () => {
    setLang("en");
    expect(t("Chaîne jamais traduite")).toBe("Chaîne jamais traduite");
  });

  it("substitue les jetons {nom} dans les deux langues", () => {
    expect(t("{n} en ligne", { n: 3 })).toBe("3 en ligne");
    setLang("en");
    expect(t("{n} en ligne", { n: 3 })).toBe("3 online");
  });

  it("substitue plusieurs jetons, y compris répétés dans la traduction", () => {
    setLang("en");
    expect(t("{ado} → {who} · {what}", { ado: "#12", who: "Ana", what: "Done" }))
      .toBe("#12 → Ana · Done");
  });

  it("laisse le jeton tel quel quand la variable manque", () => {
    expect(t("{n} en ligne", {})).toBe("{n} en ligne");
  });

  it("choisit la forme plurielle au site d'appel", () => {
    setLang("en");
    expect(t("{n} tickets", { n: 2 })).toBe("2 work items");
    expect(t("{n} ticket", { n: 1 })).toBe("1 work item");
  });
});

describe("locale / months", () => {
  it("suit la langue courante", () => {
    expect(locale()).toBe("fr-FR");
    expect(months()[0]).toBe("janv.");
    setLang("en");
    expect(locale()).toBe("en-US");
    expect(months()[0]).toBe("Jan");
  });

  it("expose 12 mois dans les deux langues", () => {
    expect(months()).toHaveLength(12);
    setLang("en");
    expect(months()).toHaveLength(12);
  });
});
