import type { Ticket, TeamMember } from "@moires/shared";

export type GroupBy = "user" | "epic";

export const UNASSIGNED_ROW = "__unassigned__";
export const NO_EPIC_ROW = "__no_epic__";

export interface GroupRow {
  id: string;
  label: string;
}

/**
 * Lignes de l'axe des ordonnées selon le mode de groupage.
 * - user : "Non assigné" puis un membre par ligne.
 * - epic : un Epic par ligne (ordre d'apparition), puis "Sans Epic" si besoin.
 */
export function buildRows(
  tickets: Ticket[],
  teamMembers: TeamMember[],
  mode: GroupBy,
): GroupRow[] {
  if (mode === "user") {
    return [
      { id: UNASSIGNED_ROW, label: "Non assigné" },
      ...teamMembers.map((m) => ({ id: m.id, label: m.displayName })),
    ];
  }

  const seen = new Map<string, string>();
  let hasOrphan = false;
  for (const t of tickets) {
    if (t.epicId) {
      if (!seen.has(t.epicId)) seen.set(t.epicId, t.epicTitle ?? t.epicId);
    } else {
      hasOrphan = true;
    }
  }
  const rows: GroupRow[] = [...seen].map(([id, label]) => ({ id, label }));
  if (hasOrphan) rows.push({ id: NO_EPIC_ROW, label: "Sans Epic" });
  return rows;
}

/** Ligne d'appartenance d'un ticket. `validIds` = ids de lignes existants (membres). */
export function rowIdOf(ticket: Ticket, mode: GroupBy, validIds: Set<string>): string {
  if (mode === "user") {
    return ticket.assigneeId && validIds.has(ticket.assigneeId)
      ? ticket.assigneeId
      : UNASSIGNED_ROW;
  }
  return ticket.epicId ?? NO_EPIC_ROW;
}

/** Tickets d'une cellule (ligne × colonne de sprint). */
export function cellTickets(
  tickets: Ticket[],
  rowId: string,
  iterationPath: string,
  mode: GroupBy,
  validIds: Set<string>,
): Ticket[] {
  return tickets.filter(
    (t) => t.iterationId === iterationPath && rowIdOf(t, mode, validIds) === rowId,
  );
}

/**
 * Étendue (indices de colonnes) couverte par les tickets d'un Epic — pour la
 * barre récap. Renvoie null si aucun ticket de l'epic n'est dans une colonne.
 */
export function epicSpan(
  tickets: Ticket[],
  epicRowId: string,
  iterations: { path: string }[],
): { start: number; end: number } | null {
  const pathIndex = new Map(iterations.map((it, i) => [it.path, i]));
  let start = Infinity;
  let end = -Infinity;
  for (const t of tickets) {
    const belongs = epicRowId === NO_EPIC_ROW ? !t.epicId : t.epicId === epicRowId;
    if (!belongs) continue;
    const idx = pathIndex.get(t.iterationId);
    if (idx == null) continue;
    start = Math.min(start, idx);
    end = Math.max(end, idx);
  }
  return end >= 0 ? { start, end } : null;
}
