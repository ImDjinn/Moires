import { describe, expect, it } from "vitest";
import * as M from "./ganttModel";

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
  it("onColor donne un texte lisible sur les couleurs des membres", () => {
    // Les avatars posent les initiales sur p.color en aplat.
    const people = [...M.people.map((p) => p.color), "#5e61f1", "#0e8376", "#c35305", "#e0177a",
      "#0b7caf", "#8452f5", "#178640", "#e71414", "#916f05", "#047f94", "#627793"];
    for (const c of people) expect(ratio(M.onColor(c), c), c).toBeGreaterThanOrEqual(AA);
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
