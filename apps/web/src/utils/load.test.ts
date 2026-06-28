import { describe, it, expect } from "vitest";
import type { Ticket, TeamMember } from "@moires/shared";
import { computeLoadPerDay, getLoadColor } from "./load";

const member: TeamMember = { id: "m1", displayName: "Alice", capacityHoursPerDay: 8 };

function ticket(partial: Partial<Ticket>): Ticket {
  return {
    id: "t1",
    title: "T",
    assigneeId: "m1",
    areaPath: "",
    iterationId: "it1",
    startDate: "2026-06-10",
    endDate: "2026-06-11",
    estimateHours: 16,
    adoRev: 1,
    syncStatus: "synced",
    ...partial,
  };
}

describe("computeLoadPerDay", () => {
  it("répartit l'estimation sur la durée du ticket", () => {
    const load = computeLoadPerDay([ticket({})], member, "2026-06-10", "2026-06-11");
    // 16h sur 2 jours => 8h/jour
    expect(load).toHaveLength(2);
    expect(load[0]).toMatchObject({ date: "2026-06-10", hours: 8, capacity: 8, ratio: 1 });
    expect(load[1]).toMatchObject({ date: "2026-06-11", hours: 8, ratio: 1 });
  });

  it("ignore les tickets d'un autre assigné", () => {
    const load = computeLoadPerDay(
      [ticket({ assigneeId: "other" })],
      member,
      "2026-06-10",
      "2026-06-11",
    );
    expect(load.every((d) => d.hours === 0)).toBe(true);
  });

  it("met 0h hors de la plage du ticket", () => {
    const load = computeLoadPerDay([ticket({})], member, "2026-06-10", "2026-06-13");
    expect(load[2]).toMatchObject({ date: "2026-06-12", hours: 0 });
    expect(load[3]).toMatchObject({ date: "2026-06-13", hours: 0 });
  });

  it("ratio = 0 quand la capacité est nulle", () => {
    const zero: TeamMember = { ...member, capacityHoursPerDay: 0 };
    const load = computeLoadPerDay([ticket({})], zero, "2026-06-10", "2026-06-10");
    expect(load[0].ratio).toBe(0);
  });
});

describe("getLoadColor", () => {
  it("surcharge (>1) => erreur", () => {
    expect(getLoadColor(1.2)).toBe("var(--color-error)");
  });
  it("tension (>0.8) => pending", () => {
    expect(getLoadColor(0.9)).toBe("var(--color-pending)");
  });
  it("ok => synced", () => {
    expect(getLoadColor(0.5)).toBe("var(--color-synced)");
  });
});
