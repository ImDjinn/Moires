import { BadRequestException } from "@nestjs/common";

/**
 * Validateurs des payloads REST. Les corps de requête arrivent non typés à
 * l'exécution (le type TypeScript du @Body() ne garantit rien) : sans ces
 * gardes, une valeur du mauvais type remonte jusqu'à Prisma en erreur 500, et
 * une chaîne non bornée est persistée telle quelle.
 */

/** Chaîne non vide, bornée. `max` évite de persister un payload arbitraire. */
export function str(v: unknown, field: string, max = 500): string {
  if (typeof v !== "string" || !v.trim()) throw new BadRequestException(`${field} requis`);
  if (v.length > max) throw new BadRequestException(`${field} trop long (max ${max})`);
  return v;
}

/** Chaîne éventuellement vide, bornée (poste/rôle : le vide efface la valeur). */
export function optStr(v: unknown, field: string, max = 200): string {
  if (typeof v !== "string") throw new BadRequestException(`${field} invalide`);
  if (v.length > max) throw new BadRequestException(`${field} trop long (max ${max})`);
  return v;
}

/** Entier positif ou nul. */
export function int(v: unknown, field: string): number {
  const n = Number(v);
  if (!Number.isInteger(n) || n < 0) throw new BadRequestException(`${field} invalide`);
  return n;
}

/**
 * Nombre fini borné. `min` peut être négatif : côté capacités, une valeur < 0
 * est la convention de suppression (retour au défaut).
 */
export function num(v: unknown, field: string, min: number, max: number): number {
  if (typeof v !== "number" || !Number.isFinite(v) || v < min || v > max) {
    throw new BadRequestException(`${field} invalide`);
  }
  return v;
}

/**
 * Couleur hexadécimale (#rgb ou #rrggbb). Les couleurs des jalons/flags sont
 * interpolées dans les styles inline du board de TOUS les participants : une
 * chaîne libre y injecterait des propriétés CSS arbitraires (le helper css()
 * découpe sur « ; »).
 */
export function color(v: unknown, field: string): string {
  if (typeof v !== "string" || !/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(v)) {
    throw new BadRequestException(`${field} invalide (format attendu : #rgb ou #rrggbb)`);
  }
  return v;
}

/** Tableau de chaînes bornées. */
export function strArray(v: unknown, field: string, max = 200): string[] {
  if (!Array.isArray(v) || v.some((x) => typeof x !== "string")) {
    throw new BadRequestException(`${field} invalide`);
  }
  if (v.length > max) throw new BadRequestException(`${field} trop long (max ${max})`);
  return v as string[];
}
