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

describe("releaseMetrics (métriques macro Release)", () => {
  it("delta = Σ capacité − Σ effort sur l'intervalle choisi", () => {
    const s = { ...M.createInitialState(), metricsFrom: 0, metricsTo: 1 };
    const m = M.releaseMetrics(s);
    expect(m.cap).toBe(M.people.reduce((t, p) => t + M.capOf(p, 0) + M.capOf(p, 1), 0));
    const eff = s.items.filter((i) => i.level === "story" && i.iter <= 1).reduce((t, i) => t + i.points, 0);
    expect(m.effort).toBe(eff);
    expect(m.delta).toBe(m.cap - m.effort);
  });

  it("l'effort hors intervalle n'est pas compté", () => {
    const s = M.createInitialState();
    const one = M.releaseMetrics({ ...s, metricsFrom: 0, metricsTo: 0 });
    const all = M.releaseMetrics({ ...s, metricsFrom: 0, metricsTo: M.NITER - 1 });
    expect(one.effort).toBeLessThan(all.effort);
  });

  it("exclut les lignes masquées (hiddenRows) de l'effort", () => {
    const s = { ...M.createInitialState(), metricsFrom: 0, metricsTo: M.NITER - 1 };
    const all = M.releaseMetrics(s).effort;
    const masked = M.releaseMetrics({ ...s, hiddenRows: { "epic:EP-200": true } }).effort;
    const ep200 = s.items
      .filter((i) => i.level === "story" && i.iter < M.NITER && M.epicOf(i) === "EP-200")
      .reduce((t, i) => t + i.points, 0);
    expect(masked).toBe(all - ep200);
  });

  it("exclut les personnes masquées de la capacité et de l'effort", () => {
    const s = { ...M.createInitialState(), metricsFrom: 0, metricsTo: 0, hidden: { alice: true } };
    const m = M.releaseMetrics(s);
    expect(m.cap).toBe(M.people.filter((p) => p.id !== "alice").reduce((t, p) => t + M.capOf(p, 0), 0));
    const eff = s.items
      .filter((i) => i.level === "story" && i.iter === 0 && i.person !== "alice")
      .reduce((t, i) => t + i.points, 0);
    expect(m.effort).toBe(eff);
  });
});
