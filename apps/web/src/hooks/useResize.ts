import { useState, useCallback, useEffect } from "react";
import type { Operation } from "@moires/shared";
import { addDays } from "../utils/dates";

interface ResizeState {
  ticketId: string;
  edge: "left" | "right";
  startX: number;
  originalDate: string;
}

export function useResize(
  dayWidthPx: number,
  onOperation: (op: Operation) => void,
  userId: string,
) {
  const [resizing, setResizing] = useState<ResizeState | null>(null);

  const onResizeStart = useCallback(
    (ticketId: string, edge: "left" | "right", startX: number, originalDate: string) => {
      setResizing({ ticketId, edge, startX, originalDate });
    },
    [],
  );

  const onResizeEnd = useCallback(
    (endX: number) => {
      if (!resizing) return;
      const daysDelta = Math.round((endX - resizing.startX) / dayWidthPx);
      if (daysDelta === 0) {
        setResizing(null);
        return;
      }
      const newDate = addDays(resizing.originalDate, daysDelta);
      onOperation({
        ticketId: resizing.ticketId,
        field: resizing.edge === "left" ? "startDate" : "endDate",
        value: newDate,
        userId,
        clientTimestamp: Date.now(),
      });
      setResizing(null);
    },
    [resizing, dayWidthPx, onOperation, userId],
  );

  return { resizing, onResizeStart, onResizeEnd };
}
