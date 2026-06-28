import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import type { Ticket, TeamMember } from "@moires/shared";
import { useGanttDrag } from "./useGanttDrag";

const members: TeamMember[] = [
  { id: "m1", displayName: "Alice", capacityHoursPerDay: 8 },
  { id: "m2", displayName: "Bob", capacityHoursPerDay: 8 },
];

const ticket: Ticket = {
  id: "t1",
  title: "T",
  assigneeId: "m1",
  areaPath: "",
  iterationId: "it1",
  startDate: "2026-06-10",
  endDate: "2026-06-11",
  estimateHours: 8,
  adoRev: 1,
  syncStatus: "synced",
};

describe("useGanttDrag", () => {
  it("émet une opération assigneeId quand on dépose sur une autre ligne", () => {
    const onOperation = vi.fn();
    const { result } = renderHook(() =>
      useGanttDrag(members, 44, onOperation, "u1"),
    );

    act(() => result.current.onDragStart(ticket, { clientY: 0 } as React.MouseEvent));
    act(() => result.current.onDragEnd({} as React.MouseEvent, 1)); // ligne m2

    expect(onOperation).toHaveBeenCalledWith(
      expect.objectContaining({ ticketId: "t1", field: "assigneeId", value: "m2", userId: "u1" }),
    );
  });

  it("n'émet rien si on dépose sur la ligne d'origine", () => {
    const onOperation = vi.fn();
    const { result } = renderHook(() =>
      useGanttDrag(members, 44, onOperation, "u1"),
    );

    act(() => result.current.onDragStart(ticket, { clientY: 0 } as React.MouseEvent));
    act(() => result.current.onDragEnd({} as React.MouseEvent, 0)); // ligne m1 = origine

    expect(onOperation).not.toHaveBeenCalled();
  });

  it("n'émet rien sans drag en cours", () => {
    const onOperation = vi.fn();
    const { result } = renderHook(() =>
      useGanttDrag(members, 44, onOperation, "u1"),
    );
    act(() => result.current.onDragEnd({} as React.MouseEvent, 1));
    expect(onOperation).not.toHaveBeenCalled();
  });
});
