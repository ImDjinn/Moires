import { describe, it, expect } from "vitest";
import { workingDays } from "./dates";

describe("workingDays", () => {
  it("compte les jours ouvrés d'une semaine pleine", () => {
    // Lundi 15/06/2026 → dimanche 21/06/2026 : 5 jours ouvrés.
    expect(workingDays("2026-06-15", "2026-06-21")).toBe(5);
  });
  it("exclut samedi et dimanche", () => {
    expect(workingDays("2026-06-13", "2026-06-14")).toBe(0);
  });
  it("compte 1 pour un même jour ouvré", () => {
    expect(workingDays("2026-06-15", "2026-06-15")).toBe(1);
  });
});
