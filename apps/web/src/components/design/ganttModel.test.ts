import { describe, it, expect } from "vitest";
import * as M from "./ganttModel";

// Ne pas appeler applyDataset ici : on veut les itérations mock (2026) intactes.
describe("capacité par défaut = jours ouvrés du sprint", () => {
  it("iterCap dérive les jours ouvrés (lun–ven) de la période", () => {
    // Sprints mock : 12 jours calendaires alignés lundi → 10 jours ouvrés.
    expect(M.iterCap(0)).toBe(10);
    expect(M.iterCap(5)).toBe(10);
  });

  it("capOf retombe sur les jours ouvrés quand la capacité n'est pas fixée", () => {
    const alice = M.people.find((x) => x.id === "alice")!;
    expect(alice.cap[5]).toBeUndefined(); // cap = [10,8,10]
    expect(M.capOf(alice, 5)).toBe(M.iterCap(5));
  });
});
