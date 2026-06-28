import { describe, it, expect } from "vitest";
import {
  daysBetween,
  dateToX,
  xToDate,
  isWeekend,
  generateDays,
  addDays,
} from "./dates";

describe("daysBetween", () => {
  it("compte les jours entre deux dates", () => {
    expect(daysBetween("2026-06-10", "2026-06-13")).toBe(3);
  });
  it("renvoie 0 pour la même date", () => {
    expect(daysBetween("2026-06-10", "2026-06-10")).toBe(0);
  });
  it("renvoie un négatif si b est avant a", () => {
    expect(daysBetween("2026-06-13", "2026-06-10")).toBe(-3);
  });
});

describe("dateToX / xToDate", () => {
  it("dateToX positionne la date sur l'axe", () => {
    expect(dateToX("2026-06-12", "2026-06-10", 40)).toBe(80);
  });
  it("xToDate est l'inverse de dateToX", () => {
    expect(xToDate(80, "2026-06-10", 40)).toBe("2026-06-12");
  });
  it("xToDate arrondit au jour le plus proche", () => {
    expect(xToDate(95, "2026-06-10", 40)).toBe("2026-06-12");
  });
});

describe("isWeekend", () => {
  it("détecte le samedi", () => {
    expect(isWeekend("2026-06-13")).toBe(true);
  });
  it("détecte le dimanche", () => {
    expect(isWeekend("2026-06-14")).toBe(true);
  });
  it("renvoie false un lundi", () => {
    expect(isWeekend("2026-06-15")).toBe(false);
  });
});

describe("generateDays", () => {
  it("génère la plage inclusive", () => {
    expect(generateDays("2026-06-10", "2026-06-12")).toEqual([
      "2026-06-10",
      "2026-06-11",
      "2026-06-12",
    ]);
  });
  it("renvoie un seul jour si start == end", () => {
    expect(generateDays("2026-06-10", "2026-06-10")).toEqual(["2026-06-10"]);
  });
});

describe("addDays", () => {
  it("ajoute des jours", () => {
    expect(addDays("2026-06-10", 5)).toBe("2026-06-15");
  });
  it("soustrait des jours", () => {
    expect(addDays("2026-06-10", -3)).toBe("2026-06-07");
  });
  it("franchit une fin de mois", () => {
    expect(addDays("2026-06-30", 1)).toBe("2026-07-01");
  });
});
