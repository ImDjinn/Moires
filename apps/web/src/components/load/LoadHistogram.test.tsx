import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import type { Ticket, TeamMember } from "@moires/shared";
import { LoadHistogram } from "./LoadHistogram";

const member: TeamMember = { id: "m1", displayName: "Alice", capacityHoursPerDay: 8 };
const ticket: Ticket = {
  id: "t1",
  title: "T",
  assigneeId: "m1",
  areaPath: "",
  iterationId: "it1",
  startDate: "2026-06-10",
  endDate: "2026-06-12",
  estimateHours: 24,
  adoRev: 1,
  syncStatus: "synced",
};

describe("LoadHistogram", () => {
  it("rend une colonne par jour", () => {
    const { container } = render(
      <LoadHistogram
        tickets={[ticket]}
        teamMembers={[member]}
        rangeStart="2026-06-10"
        rangeEnd="2026-06-12"
        dayWidthPx={40}
      />,
    );
    expect((container.firstChild as HTMLElement).childElementCount).toBe(3);
  });

  it("rend sans planter avec des données vides", () => {
    const { container } = render(
      <LoadHistogram
        tickets={[]}
        teamMembers={[]}
        rangeStart="2026-06-10"
        rangeEnd="2026-06-10"
        dayWidthPx={40}
      />,
    );
    expect((container.firstChild as HTMLElement).childElementCount).toBe(1);
  });
});
