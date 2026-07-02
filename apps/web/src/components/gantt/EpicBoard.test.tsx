import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { Ticket, Iteration } from "@moires/shared";
import { EpicBoard } from "./EpicBoard";
import { usePresenceStore } from "../../stores/presence.store";

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

beforeEach(() => {
  usePresenceStore.setState({ peers: [] });
});

describe("EpicBoard", () => {
  it("rend une swimlane par Epic, plus 'Sans Epic'", () => {
    render(
      <EpicBoard
        tickets={[
          ticket({ id: "a", epicId: "e1", epicTitle: "Epic Alpha", iterationId: "P\\S1" }),
          ticket({ id: "b", epicId: null, iterationId: "P\\S2" }),
        ]}
        iterations={iterations}
        onOperation={vi.fn()}
        userId="u1"
      />,
    );
    expect(screen.getByText("Epic Alpha")).toBeInTheDocument();
    expect(screen.getByText("Sans Epic")).toBeInTheDocument();
  });
});
