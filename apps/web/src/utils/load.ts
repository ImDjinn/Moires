import type { Ticket, Capacity } from "@moires/shared";

/** Charge (Story Points) d'un membre sur une itération. */
export function loadOf(tickets: Ticket[], memberId: string, iterationPath: string): number {
  return tickets
    .filter((t) => t.assigneeId === memberId && t.iterationId === iterationPath)
    .reduce((sum, t) => sum + t.storyPoints, 0);
}

/** Capacité (Story Points) saisie pour un membre sur une itération, 0 si absente. */
export function capacityOf(
  capacities: Capacity[],
  memberId: string,
  iterationPath: string,
): number {
  return (
    capacities.find((c) => c.memberId === memberId && c.iterationPath === iterationPath)
      ?.storyPoints ?? 0
  );
}
