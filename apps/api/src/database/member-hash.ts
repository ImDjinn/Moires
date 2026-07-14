import { createHash } from "node:crypto";

/**
 * Hash déterministe et non réversible d'un identifiant ADO de membre. Stocké en
 * base à la place de l'identifiant (aucune donnée personnelle) ; la personne est
 * retrouvée en session en re-hashant la liste d'équipe ADO, toujours chargée live.
 */
export function memberHash(memberId: string): string {
  return createHash("sha256").update(memberId).digest("hex");
}
