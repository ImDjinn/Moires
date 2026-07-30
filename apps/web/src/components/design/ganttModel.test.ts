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

  it("compte les lignes au mot près (pas title.length / perLine)", () => {
    expect(M.wrappedLines("abc def", 10)).toBe(1);
    // 3 mots de 7 : un seul par ligne, alors que 21/10 en donnerait 3 arrondi à 3
    expect(M.wrappedLines("aaaaaaa bbbbbbb ccccccc", 10)).toBe(3);
    // mot plus long que la ligne : coupé par overflow-wrap
    expect(M.wrappedLines("a".repeat(25), 10)).toBe(3);
  });

  it("un titre à mots longs agrandit plus qu'un titre dense de même longueur", () => {
    const dense = "ab ".repeat(20).trim(); // 59 car.
    const words = "abcdefghijkl ".repeat(5).trim(); // 64 car., mots longs
    expect(barOf(withTitle(words), words).height).toBeGreaterThanOrEqual(barOf(withTitle(dense), dense).height);
  });
});

describe("Release : rien n'est masqué par l'intervalle de l'Epic", () => {
  // Epic EP-200 daté sur la seule itération 0, sa feature ADO-1200 et ses US
  // s'étalant bien au-delà (jusqu'à it.8).
  const withNarrowEpic = (featOverride?: Partial<M.Item>) => {
    const s = M.createInitialState();
    return {
      ...s,
      board: "release" as const,
      expanded: { "epic:EP-200": true, "ADO-1200": true },
      items: s.items.map((i) =>
        i.id === "EP-200" ? { ...i, hasDateRange: true, startISO: M.iters[0].iso[0], endISO: M.iters[0].iso[1] }
        : i.id === "ADO-1200" && featOverride ? { ...i, ...featOverride }
        : i,
      ),
    };
  };
  const rowOf = (l: ReturnType<typeof M.computeLayout>, key: string) => l.rows.find((r) => r.key === key)!;

  it("la feature garde son propre intervalle (barre non vide) hors dates de l'Epic", () => {
    // Feature datée it.5 → it.6, entièrement après l'Epic : le clamp donnait
    // l'intervalle inversé [5,0], donc aucune barre affichée.
    const l = M.computeLayout(withNarrowEpic({ hasDateRange: true, startISO: M.iters[5].iso[0], endISO: M.iters[6].iso[1] }), M.RELCOL);
    expect(rowOf(l, "ADO-1200").range).toEqual([5, 6]);
  });

  it("les US hors intervalle de l'Epic restent sur leur vraie itération", () => {
    const l = M.computeLayout(withNarrowEpic(), M.RELCOL);
    const late = l.cards!.find((c) => c.item.id === "ADO-1253")!; // US it.8
    expect(late.ci).toBe(8);
    expect(rowOf(l, "ADO-1200").range).toEqual([0, 8]); // dérivé des US, non borné
  });

  it("les US sans itération sont comptées à part au lieu d'être posées sur une colonne", () => {
    const s = withNarrowEpic();
    const l = M.computeLayout(s, M.RELCOL);
    expect(l.cards!.some((c) => c.item.id === "ADO-1240")).toBe(false); // US en backlog
    expect(M.parentCharge(s, rowOf(l, "ADO-1200").us!).unplanned).toBe(1);
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
