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

  it("la carte réserve la place du pied epic/area sous le titre", () => {
    // Chrome mesuré sur le rendu (GanttBoard `bars`) : bordures 4 + paddings
    // 7/9 (16) + entête ado/type/points (20) + pied epic/area (19). C'est ce
    // pied qui débordait de la carte dès que le titre passait à 2 lignes.
    const CHROME = 59, LH = 17, PAD = 46; // PAD = CARDTEXTPAD
    const perLine = Math.floor((M.MINCOL - PAD) / 6.6);
    ["Court", "Titre ".repeat(30).trim(), "Réécriture du module de facturation multi-devises"].forEach((t) => {
      expect(barOf(withTitle(t), t).height).toBeGreaterThanOrEqual(CHROME + M.wrappedLines(t, perLine) * LH);
    });
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

describe("Release : cartes et charge hors intervalle", () => {
  const withStoryTitle = (title: string) => {
    const s = M.createInitialState();
    const us = s.items.find((i) => i.level === "story" && i.iter < M.NITER)!;
    const st: M.State = {
      ...s, board: "release",
      expanded: { ["epic:" + M.epicOf(us)]: true, ...(us.parent ? { [us.parent]: true } : {}) },
      items: s.items.map((i) => (i.id === us.id ? { ...i, title } : i)),
    };
    return { id: us.id, layout: M.computeLayout(st, M.RELCOL) };
  };

  it("une carte US s'agrandit au lieu de couper le titre", () => {
    const long = "Titre ".repeat(30).trim();
    const a = withStoryTitle("Court"), b = withStoryTitle(long);
    const ha = a.layout.cards!.find((c) => c.item.id === a.id)!.height;
    const hb = b.layout.cards!.find((c) => c.item.id === b.id)!.height;
    expect(hb).toBeGreaterThan(ha);
    expect(b.layout.totalHeight).toBeGreaterThan(a.layout.totalHeight);
  });

  it("les cartes d'une même colonne ne se chevauchent pas après agrandissement", () => {
    const l = withStoryTitle("Titre ".repeat(30).trim()).layout;
    const byCol = new Map<number, typeof l.cards>();
    l.cards!.forEach((c) => byCol.set(c.ci, [...(byCol.get(c.ci) || []), c]));
    byCol.forEach((cards) => {
      [...cards!].sort((x, y) => x.top - y.top).reduce((prevEnd, c) => {
        expect(c.top).toBeGreaterThanOrEqual(prevEnd);
        return c.top + c.height;
      }, 0);
    });
  });

  it("une ligne epic s'agrandit quand son nom dépasse la colonne de gauche", () => {
    const s = M.createInitialState();
    const long = "Epic ".repeat(30).trim();
    const base = M.computeLayout({ ...s, board: "release" }, M.RELCOL);
    const grown = M.computeLayout(
      { ...s, board: "release", items: s.items.map((i) => (i.id === "EP-200" ? { ...i, title: long } : i)) },
      M.RELCOL,
    );
    const h = (l: ReturnType<typeof M.computeLayout>) => l.rows.find((r) => r.key === "epic:EP-200")!.height;
    expect(h(grown)).toBeGreaterThan(h(base));
  });

  it("outsideCharge ne retient que les colonnes chargées hors intervalle", () => {
    const per = { 0: 3, 2: 5, 4: 0, 7: 2 };
    expect(M.outsideCharge(per, [0, 1, 2, 3, 4, 7], [2, 4])).toEqual([
      { real: 0, vi: 0, val: 3 },
      { real: 7, vi: 5, val: 2 },
    ]);
    // Tout dans l'intervalle → rien à signaler.
    expect(M.outsideCharge(per, [2, 3, 4], [0, 11])).toEqual([]);
  });
});

describe("statusBucket : epic « semi-actif »", () => {
  const us = (iter: number): M.Item => ({ ...M.createInitialState().items[0], iter });

  it("un epic terminé gardant des US sur le sprint courant/à venir est semi-actif", () => {
    const past: [number, number] = [M.CURRENT - 3, M.CURRENT - 2];
    expect(M.statusBucket(past, [us(M.CURRENT - 2)])).toBe(3); // terminé
    expect(M.statusBucket(past, [us(M.CURRENT)])).toBe(1); // semi-actif
    expect(M.statusBucket(past, [us(M.CURRENT + 2)])).toBe(1);
    // Le backlog n'est pas un sprint : pas de quoi réactiver l'epic.
    expect(M.statusBucket(past, [us(M.NITER)])).toBe(3);
  });

  it("un epic à venir dont des US tombent dans le sprint courant est semi-actif", () => {
    const later: [number, number] = [M.CURRENT + 2, M.CURRENT + 3];
    expect(M.statusBucket(later, [us(M.CURRENT + 2)])).toBe(2); // à venir
    expect(M.statusBucket(later, [us(M.CURRENT)])).toBe(1);
  });

  it("l'ordre est en cours < semi-actif < à venir < terminé < sans date", () => {
    expect(M.statusBucket([M.CURRENT, M.CURRENT])).toBe(0);
    expect(M.statusBucket([M.CURRENT - 3, M.CURRENT - 2], [us(M.CURRENT)])).toBe(1);
    expect(M.statusBucket([M.CURRENT + 1, M.CURRENT + 2])).toBe(2);
    expect(M.statusBucket([M.CURRENT - 2, M.CURRENT - 1])).toBe(3);
    expect(M.statusBucket(null)).toBe(4);
  });

  it("buildTree trie le semi-actif juste après les epics en cours", () => {
    const s = M.createInitialState();
    // EP-200 daté sur des sprints passés, mais ses US restent au sprint courant.
    const items = s.items.map((i) =>
      i.id === "EP-200" ? { ...i, hasDateRange: true, startISO: M.iters[0].iso[0], endISO: M.iters[0].iso[1] } : i,
    );
    const late = items.find((i) => i.level === "story" && M.epicOf(i) === "EP-200")!;
    const st = { ...s, board: "release" as const, items: items.map((i) => (i.id === late.id ? { ...i, iter: M.CURRENT + 3 } : i)) };
    const node = M.buildTree(st).find((n) => n.epicId === "EP-200")!;
    expect(node.bucket).toBe(1);
    // Semi-actif : conservé par « epics actifs uniquement ».
    expect(M.buildTree({ ...st, epicFilter: "activeOnly" }).some((n) => n.epicId === "EP-200")).toBe(true);
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
