import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { Ticket, TeamMember, Iteration, Capacity } from "@moirai/shared";
import { UserBoard } from "./UserBoard";
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
    workItemType: "User Story",
    parentId: null,
    state: "New",
    tags: [],
    targetDate: null,
    startDate: "2026-06-29",
    endDate: "2026-06-30",
    estimateHours: 4,
    storyPoints: 5,
    adoRev: 1,
    syncStatus: "synced",
    ...p,
  };
}

function renderBoard(props: Partial<React.ComponentProps<typeof UserBoard>> = {}) {
  return render(
    <UserBoard
      tickets={[ticket({ title: "Tâche Alice" })]}
      teamMembers={members}
      iterations={iterations}
      capacities={[]}
      onOperation={vi.fn()}
      onSetCapacity={vi.fn()}
      userId="u1"
      {...props}
    />,
  );
}

beforeEach(() => {
  usePresenceStore.setState({ peers: [] });
});

describe("UserBoard", () => {
  it("rend 'Non assigné' + une ligne par membre et affiche les tickets", () => {
    renderBoard();
    expect(screen.getByText("Non assigné")).toBeInTheDocument();
    expect(screen.getByText("Alice")).toBeInTheDocument();
    expect(screen.getByText("Bob")).toBeInTheDocument();
    expect(screen.getByText("Tâche Alice")).toBeInTheDocument();
  });

  it("déplace un ticket vers le sprint suivant au clavier (→)", () => {
    const onOperation = vi.fn();
    renderBoard({ tickets: [ticket({ iterationId: "P\\S1" })], onOperation });
    fireEvent.keyDown(screen.getByRole("button", { name: /#t1/ }), { key: "ArrowRight" });
    expect(onOperation).toHaveBeenCalledWith(
      expect.objectContaining({ ticketId: "t1", field: "iterationId", value: "P\\S2" }),
    );
  });

  it("saisir une capacité déclenche onSetCapacity", () => {
    const onSetCapacity = vi.fn();
    renderBoard({ onSetCapacity });
    const input = screen.getByLabelText("Capacité Alice Sprint 1");
    fireEvent.change(input, { target: { value: "13" } });
    expect(onSetCapacity).toHaveBeenCalledWith("m1", "P\\S1", 13);
  });

  it("affiche la charge en Story Points face à la capacité", () => {
    const capacities: Capacity[] = [{ memberId: "m1", iterationPath: "P\\S1", storyPoints: 8 }];
    renderBoard({ capacities });
    // ticket de 5 pts pour Alice sur Sprint 1, capacité 8
    expect(screen.getByText("5/8 pts")).toBeInTheDocument();
  });
});
