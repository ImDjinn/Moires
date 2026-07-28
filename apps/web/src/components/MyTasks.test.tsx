import { describe, it, expect } from "vitest";
import { resolveMyMemberId, currentIterIndex, htmlToText } from "./MyTasks";

const teamMembers = [
  { id: "alice@corp.com", displayName: "Alice Beaumont", capacityHoursPerDay: 8 },
  { id: "bob@corp.com", displayName: "Bob Martin", capacityHoursPerDay: 8 },
];

const iterations = [
  { id: "1", name: "Sprint 1", path: "P\\S1", startDate: "2026-06-15", finishDate: "2026-06-26" },
  { id: "2", name: "Sprint 2", path: "P\\S2", startDate: "2026-06-29", finishDate: "2026-07-10" },
];

describe("resolveMyMemberId", () => {
  it("relie l'utilisateur à son membre par uniqueName (id de cookie ≠ id ADO)", () => {
    const user = { id: "db-uuid", displayName: "Alice Beaumont", uniqueName: "alice@corp.com" };
    expect(resolveMyMemberId(user, teamMembers)).toBe("alice@corp.com");
  });

  it("retombe sur le nom affiché pour les cookies émis sans uniqueName", () => {
    expect(resolveMyMemberId({ id: "db-uuid", displayName: "Bob Martin" }, teamMembers)).toBe("bob@corp.com");
  });

  it("renvoie null si l'utilisateur n'est dans aucune source", () => {
    expect(resolveMyMemberId({ id: "db-uuid", displayName: "Inconnu" }, teamMembers)).toBeNull();
  });
});

describe("currentIterIndex", () => {
  it("prend l'itération contenant la date du jour", () => {
    expect(currentIterIndex(iterations, "2026-07-01")).toBe(1);
  });

  it("retombe sur la première hors de toute itération", () => {
    expect(currentIterIndex(iterations, "2026-12-01")).toBe(0);
  });
});

describe("htmlToText", () => {
  it("aplatit le HTML ADO sans l'injecter et garde les sauts de bloc", () => {
    expect(htmlToText("<p>Ligne 1</p><p>Ligne 2</p>")).toBe("Ligne 1\nLigne 2");
    expect(htmlToText("<ul><li>A</li><li>B</li></ul>")).toBe("• A\n• B");
    expect(htmlToText("<img src=x onerror=alert(1)>Texte")).toBe("Texte");
    expect(htmlToText(undefined)).toBe("");
  });
});
