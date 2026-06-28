import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { Ticket, TeamMember } from "@moires/shared";
import { GanttBoard } from "./GanttBoard";
import { usePresenceStore } from "../../stores/presence.store";

const members: TeamMember[] = [
  { id: "m1", displayName: "Alice", capacityHoursPerDay: 8 },
  { id: "m2", displayName: "Bob", capacityHoursPerDay: 6 },
];

function ticket(partial: Partial<Ticket>): Ticket {
  return {
    id: "t1",
    title: "Ticket 1",
    assigneeId: "m1",
    areaPath: "",
    iterationId: "it1",
    startDate: "2026-06-10",
    endDate: "2026-06-11",
    estimateHours: 8,
    adoRev: 1,
    syncStatus: "synced",
    ...partial,
  };
}

beforeEach(() => {
  usePresenceStore.setState({ peers: [] });
});

describe("GanttBoard", () => {
  it("rend la ligne 'Non assigné' + une ligne par membre", () => {
    render(
      <GanttBoard
        tickets={[]}
        teamMembers={members}
        rangeStart="2026-06-10"
        rangeEnd="2026-06-12"
        dayWidthPx={40}
        onOperation={vi.fn()}
        userId="u1"
      />,
    );
    expect(screen.getByText("Membres")).toBeInTheDocument();
    expect(screen.getByText("Non assigné")).toBeInTheDocument();
    expect(screen.getByText("Alice")).toBeInTheDocument();
    expect(screen.getByText("Bob")).toBeInTheDocument();
  });

  it("affiche les tickets assignés et non assignés", () => {
    render(
      <GanttBoard
        tickets={[ticket({ id: "t1", title: "Assigné" }), ticket({ id: "t2", title: "Orphelin", assigneeId: null })]}
        teamMembers={members}
        rangeStart="2026-06-10"
        rangeEnd="2026-06-12"
        dayWidthPx={40}
        onOperation={vi.fn()}
        userId="u1"
      />,
    );
    expect(screen.getByText("Assigné")).toBeInTheDocument();
    expect(screen.getByText("Orphelin")).toBeInTheDocument();
  });
});
