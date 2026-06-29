import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { Ticket, TeamMember, Iteration } from "@moires/shared";
import { SprintGanttBoard } from "./SprintGanttBoard";
import { usePresenceStore } from "../../stores/presence.store";

const members: TeamMember[] = [
  { id: "m1", displayName: "Alice", capacityHoursPerDay: 8 },
  { id: "m2", displayName: "Bob", capacityHoursPerDay: 6 },
];

const iterations: Iteration[] = [
  { id: "1", name: "Sprint 1", path: "P\\S1", startDate: "2026-06-29", finishDate: "2026-07-12" },
  { id: "2", name: "Sprint 2", path: "P\\S2", startDate: "2026-07-13", finishDate: "2026-07-26" },
];

function ticket(p: Partial<Ticket>): Ticket {
  return {
    id: "t1",
    title: "Ticket 1",
    assigneeId: "m1",
    areaPath: "",
    iterationId: "P\\S1",
    epicId: null,
    epicTitle: null,
    startDate: "2026-06-29",
    endDate: "2026-06-30",
    estimateHours: 4,
    adoRev: 1,
    syncStatus: "synced",
    ...p,
  };
}

beforeEach(() => {
  usePresenceStore.setState({ peers: [] });
});

describe("SprintGanttBoard — mode utilisateur", () => {
  it("rend une ligne 'Non assigné' + une par membre, et affiche les tickets", () => {
    render(
      <SprintGanttBoard
        tickets={[ticket({ id: "t1", title: "Tâche Alice" })]}
        teamMembers={members}
        iterations={iterations}
        groupBy="user"
        onOperation={vi.fn()}
        userId="u1"
      />,
    );
    expect(screen.getByText("Non assigné")).toBeInTheDocument();
    expect(screen.getByText("Alice")).toBeInTheDocument();
    expect(screen.getByText("Bob")).toBeInTheDocument();
    expect(screen.getByText("Tâche Alice")).toBeInTheDocument();
  });

  it("déplace un ticket vers le sprint suivant au clavier (→) via iterationId", () => {
    const onOperation = vi.fn();
    render(
      <SprintGanttBoard
        tickets={[ticket({ id: "t1", iterationId: "P\\S1" })]}
        teamMembers={members}
        iterations={iterations}
        groupBy="user"
        onOperation={onOperation}
        userId="u1"
      />,
    );
    fireEvent.keyDown(screen.getByRole("button", { name: /#t1/ }), { key: "ArrowRight" });
    expect(onOperation).toHaveBeenCalledWith(
      expect.objectContaining({ ticketId: "t1", field: "iterationId", value: "P\\S2" }),
    );
  });
});

describe("SprintGanttBoard — mode epic", () => {
  it("rend une swimlane par Epic", () => {
    render(
      <SprintGanttBoard
        tickets={[
          ticket({ id: "a", epicId: "e1", epicTitle: "Epic Alpha", iterationId: "P\\S1" }),
          ticket({ id: "b", epicId: null, iterationId: "P\\S2" }),
        ]}
        teamMembers={members}
        iterations={iterations}
        groupBy="epic"
        onOperation={vi.fn()}
        userId="u1"
      />,
    );
    expect(screen.getByText("Epic Alpha")).toBeInTheDocument();
    expect(screen.getByText("Sans Epic")).toBeInTheDocument();
  });
});
