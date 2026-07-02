import type { CSSProperties } from "react";

/**
 * Convertit une chaîne CSS inline ("a:b;c:d") en objet style React.
 * Le prototype Claude Design construit ses styles sous forme de chaînes ;
 * ce helper permet de les réutiliser tels quels au lieu de tout réécrire.
 * Les clés sont camelCase-ifiées (border-radius → borderRadius,
 * -webkit-line-clamp → WebkitLineClamp) ; les variables CSS (--x) gardées.
 */
export function css(s: string): CSSProperties {
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
  return out as CSSProperties;
}
