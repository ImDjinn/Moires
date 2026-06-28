import { useState, useCallback } from "react";
import type { Operation, Ticket, TeamMember } from "@moires/shared";

interface DragState {
  ticketId: string;
  startY: number;
  originalAssigneeId: string | null;
}

export function useGanttDrag(
  teamMembers: TeamMember[],
  rowHeight: number,
  onOperation: (op: Operation) => void,
  userId: string,
) {
  const [dragging, setDragging] = useState<DragState | null>(null);

  const onDragStart = useCallback(
    (ticket: Ticket, e: React.MouseEvent) => {
      setDragging({
        ticketId: ticket.id,
        startY: e.clientY,
        originalAssigneeId: ticket.assigneeId,
      });
    },
    [],
  );

  const onDragMove = useCallback(
    (e: React.MouseEvent) => {
      // visual feedback handled by CSS transform
    },
    [],
  );

  const onDragEnd = useCallback(
    (e: React.MouseEvent, rowIndex: number) => {
      if (!dragging) return;
      const member = teamMembers[rowIndex];
      if (member && member.id !== dragging.originalAssigneeId) {
        onOperation({
          ticketId: dragging.ticketId,
          field: "assigneeId",
          value: member.id,
          userId,
          clientTimestamp: Date.now(),
        });
      }
      setDragging(null);
    },
    [dragging, teamMembers, onOperation, userId],
  );

  return { dragging, onDragStart, onDragMove, onDragEnd };
}
