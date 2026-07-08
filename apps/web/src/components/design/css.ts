import type { CSSProperties } from "react";

/**
 * Convertit une chaîne CSS inline ("a:b;c:d") en objet style React.
 * Le prototype Claude Design construit ses styles sous forme de chaînes ;
 * ce helper permet de les réutiliser tels quels au lieu de tout réécrire.
 * Les clés sont camelCase-ifiées (border-radius → borderRadius,
 * -webkit-line-clamp → WebkitLineClamp) ; les variables CSS (--x) gardées.
 */
// Mémoïse le parsing : les chaînes statiques (headers, labels, badges…) sont
// re-passées à chaque render sans changer. L'objet renvoyé est lu seul par
// React (jamais muté), donc partageable.
const cache = new Map<string, CSSProperties>();

export function css(s: string): CSSProperties {
  const hit = cache.get(s);
  if (hit) return hit;
  const out: Record<string, string> = {};
  for (const part of s.split(";")) {
    const i = part.indexOf(":");
    if (i < 0) continue;
    const key = part.slice(0, i).trim();
    const val = part.slice(i + 1).trim();
    if (!key || !val) continue;
    if (key.startsWith("--")) out[key] = val;
    else out[key.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase())] = val;
  }
  const result = out as CSSProperties;
  // ponytail: cap borné — les styles à px variables (drag/scroll) gonfleraient
  // le cache sans fin ; au-delà on repart de zéro (les statiques se recréent).
  if (cache.size > 4000) cache.clear();
  cache.set(s, result);
  return result;
}
