import type { Ticket, TeamMember } from "@moires/shared";
import { generateDays } from "./dates";

export interface DayLoad {
  date: string;
  hours: number;
  capacity: number;
  ratio: number;
}

export function computeLoadPerDay(
  tickets: Ticket[],
  member: TeamMember,
  rangeStart: string,
  rangeEnd: string,
): DayLoad[] {
  const days = generateDays(rangeStart, rangeEnd);
  return days.map((date) => {
    const memberTickets = tickets.filter((t) => t.assigneeId === member.id);
    let hours = 0;
    for (const t of memberTickets) {
      const tStart = t.startDate.split("T")[0];
      const tEnd = t.endDate.split("T")[0];
      if (date >= tStart && date <= tEnd) {
        const ticketDays = Math.max(1, Math.round(
          (new Date(tEnd).getTime() - new Date(tStart).getTime()) / 86400000,
        ) + 1);
        hours += t.estimateHours / ticketDays;
      }
    }
    const capacity = member.capacityHoursPerDay;
    return { date, hours, capacity, ratio: capacity > 0 ? hours / capacity : 0 };
  });
}

export function getLoadColor(ratio: number): string {
  if (ratio > 1) return "var(--color-error)";
  if (ratio > 0.8) return "var(--color-pending)";
  return "var(--color-synced)";
}
