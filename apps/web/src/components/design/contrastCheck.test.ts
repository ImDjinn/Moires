import { describe, expect, it } from "vitest";
import * as M from "./ganttModel";
import { CATEGORICAL, NEUTRAL_PERSON } from "./adapter";

// Contrôle non-régressif des contrastes WCAG AA (4,5:1, petit texte) sur les
// couleurs *dérivées de données* : elles sortent d'un calcul, pas d'un token,
// donc rien d'autre ne les vérifie. Cf. l'audit design : les initiales blanches
// échouaient sur 196/360 teintes et les badges tombaient à 2,2:1.
const AA = 4.5;

function rgb(c: string): [number, number, number] {
  const hsl = /hsl\(\s*([\d.]+)[\s,]+([\d.]+)%[\s,]+([\d.]+)%/.exec(c);
  if (hsl) {
    const h = +hsl[1], s = +hsl[2] / 100, l = +hsl[3] / 100;
    const a = s * Math.min(l, 1 - l);
    const f = (n: number) => {
      const k = (n + h / 30) % 12;
      return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))));
    };
    return [f(0), f(8), f(4)];
  }
  const m = /rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/.exec(c);
  if (m) return [+m[1], +m[2], +m[3]];
  const h = c.replace("#", "");
  const full = h.length === 3 ? h.replace(/(.)/g, "$1$1") : h;
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16)) as [number, number, number];
}
function lum(c: string): number {
  const v = rgb(c).map((x) => {
    const u = x / 255;
    return u <= 0.03928 ? u / 12.92 : ((u + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
}
// Simulations de daltonisme (matrices linéaires usuelles) + ΔE OKLab, pour
// rejouer localement le contrôle de séparation du validateur dataviz.
const MAT: Record<string, number[][]> = {
  protan: [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]],
  deutan: [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.011820, 0.042940, 0.968881]],
  tritan: [[1.255528, -0.076749, -0.178779], [-0.078411, 0.930809, 0.147602], [0.004733, 0.691367, 0.303900]],
};
const toLin = (x: number) => (x / 255 <= 0.04045 ? x / 255 / 12.92 : ((x / 255 + 0.055) / 1.055) ** 2.4);
const toSrgb = (v: number) => (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055);
const clamp = (v: number) => Math.round(255 * Math.min(1, Math.max(0, v)));
const CVD: Record<string, (c: string) => [number, number, number]> = {
  normal: (c) => rgb(c),
  ...Object.fromEntries(
    Object.entries(MAT).map(([k, m]) => [
      k,
      (c: string) => {
        const v = rgb(c).map(toLin);
        return m.map((row) => clamp(toSrgb(Math.min(1, Math.max(0, row[0] * v[0] + row[1] * v[1] + row[2] * v[2]))))) as [number, number, number];
      },
    ]),
  ),
};
function oklab([r, g, b]: [number, number, number]): [number, number, number] {
  const [R, G, B] = [r, g, b].map(toLin);
  const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B);
  const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B);
  const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}
const deltaE = (a: [number, number, number], b: [number, number, number]) => {
  const A = oklab(a), B = oklab(b);
  return 100 * Math.hypot(A[0] - B[0], A[1] - B[1], A[2] - B[2]);
};

const ratio = (a: string, b: string) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

// Palette d'entrée : tout le cercle des teintes. Les couleurs d'état viennent
// d'ADO et sont arbitraires — les vérifier une par une ne prouverait rien.
const wheel: string[] = [];
for (let h = 0; h < 360; h += 5)
  for (const s of [40, 58, 75, 100]) for (const l of [30, 45, 60, 75]) wheel.push(`hsl(${h} ${s}% ${l}%)`);

const PANEL = { light: "#ffffff", dark: "#161619" } as const;

describe("contraste des couleurs dérivées de données", () => {
  it("onColor donne un texte lisible sur la palette catégorielle", () => {
    // Les avatars posent les initiales directement sur la couleur, en aplat.
    const all = [...CATEGORICAL, NEUTRAL_PERSON, ...M.people.map((p) => p.color)];
    for (const c of all) expect(ratio(M.onColor(c), c), c).toBeGreaterThanOrEqual(AA);
  });

  it("la palette catégorielle reste séparable, y compris en daltonisme", () => {
    // Contrôle repris du validateur du skill dataviz : ΔE OKLab ×100 sur TOUTES
    // les paires, pas seulement les voisines — les 7 couleurs coexistent à
    // l'écran. Une palette à luminosité constante s'effondre en deutan ; c'est
    // pour ça que la base est Okabe-Ito et non des teintes équi-espacées.
    for (const [name, sim] of Object.entries(CVD))
      for (let i = 0; i < CATEGORICAL.length; i++)
        for (let j = i + 1; j < CATEGORICAL.length; j++) {
          const d = deltaE(sim(CATEGORICAL[i]), sim(CATEGORICAL[j]));
          const floor = name === "normal" ? 15 : 6;
          expect(d, `${CATEGORICAL[i]} vs ${CATEGORICAL[j]} (${name})`).toBeGreaterThanOrEqual(floor);
        }
  });

  it("loadMark distingue le palier d'alerte de la sous-charge", () => {
    // La couleur ambre seule ne se distingue pas du vert en deutéranopie :
    // le palier 85-100 % doit porter sa propre marque.
    expect(M.loadMark(0.5)).toBe(0);
    expect(M.loadMark(0.85)).toBe(1);
    expect(M.loadMark(0.99)).toBe(1);
    expect(M.loadMark(1.01)).toBe(2);
  });

  it("onColor reste au-dessus du seuil de bascule sur tout le cercle", () => {
    // Aucune des deux options n'atteint 4,5:1 pour les couleurs de luminance
    // moyenne : le contrat est de toujours prendre la meilleure des deux.
    for (const c of wheel) {
      const best = Math.max(ratio("#ffffff", c), ratio("#1a1a20", c));
      expect(ratio(M.onColor(c), c), c).toBeCloseTo(best, 5);
    }
  });

  it("tone().text passe l'AA sur tone().bg et sur --panel, dans les deux thèmes", () => {
    for (const theme of ["light", "dark"] as const)
      for (const c of wheel) {
        const t = M.tone(c, theme);
        expect(ratio(t.text, t.bg), `${c} ${theme} bg`).toBeGreaterThanOrEqual(AA);
        expect(ratio(t.text, PANEL[theme]), `${c} ${theme} panel`).toBeGreaterThanOrEqual(AA);
      }
  });

  it("hashColor laisse toujours une option de texte conforme", () => {
    for (const theme of ["light", "dark"] as const)
      for (let i = 0; i < 400; i++) {
        const c = M.hashColor("role-" + i, theme);
        expect(ratio(M.onColor(c), c), `${c} ${theme}`).toBeGreaterThanOrEqual(AA);
      }
  });

  it("capTextColor n'utilise que des tokens de texte", () => {
    for (const pct of [0.5, 0.9, 1.4]) expect(M.capTextColor(pct)).toMatch(/-text,/);
  });
});
