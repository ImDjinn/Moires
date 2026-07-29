import { describe, it, expect } from "vitest";
import * as M from "./ganttModel";

// Ne pas appeler applyDataset ici : on veut les itérations mock (2026) intactes.
describe("capacité par défaut = 0", () => {
  it("capOf retombe sur 0 quand la capacité n'est pas fixée", () => {
    const alice = M.people.find((x) => x.id === "alice")!;
    expect(alice.cap[5]).toBeUndefined(); // cap = [10,8,10]
    expect(M.capOf(alice, 5)).toBe(0);
  });
});

describe("activePersonIds (section « Inactifs » du filtre Personnes)", () => {
  it("exclut qui n'a rien depuis 3 sprints ni à venir, garde le reste", () => {
    const base = { ...M.createInitialState().items[0] };
    const ids = M.activePersonIds([
      { ...base, person: "vieux", iter: M.CURRENT - 4 },
      { ...base, person: "backlog", iter: M.NITER },
      { ...base, person: "recent", iter: M.CURRENT - 3 },
      { ...base, person: "futur", iter: M.CURRENT + 2 },
    ]);
    expect([...ids].sort()).toEqual(["futur", "recent"]);
  });
});

describe("computeLayout : hauteur de carte suivant le titre", () => {
  const withTitle = (title: string) => {
    const s = M.createInitialState();
    const it = s.items.find((i) => i.level === "story" && i.iter === M.CURRENT)!;
    return M.computeLayout({ ...s, board: "daily", items: s.items.map((i) => (i.id === it.id ? { ...i, title } : i)) }, M.MINCOL);
  };
  const barOf = (l: ReturnType<typeof withTitle>, title: string) => l.bars.find((b) => b.item.title === title)!;

  it("un titre long agrandit la carte et sa ligne", () => {
    const short = "Court", long = "Titre ".repeat(30).trim();
    const a = withTitle(short), b = withTitle(long);
    expect(barOf(b, long).height).toBeGreaterThan(barOf(a, short).height);
    expect(b.totalHeight).toBeGreaterThan(a.totalHeight);
  });

  it("les cartes d'une même ligne gardent la même hauteur et ne se chevauchent pas", () => {
    const long = "Titre ".repeat(30).trim();
    const l = withTitle(long);
    const h = barOf(l, long).height;
    const same = l.bars.filter((b) => b.top === barOf(l, long).top);
    same.forEach((b) => expect(b.height).toBe(h));
    const row = l.rows.find((r) => r.top <= barOf(l, long).top && barOf(l, long).top < r.top + r.height)!;
    l.bars
      .filter((b) => b.top >= row.top && b.top < row.top + row.height)
      .forEach((b) => expect(b.top + b.height).toBeLessThanOrEqual(row.top + row.height));
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
