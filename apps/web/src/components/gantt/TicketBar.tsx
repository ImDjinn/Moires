import { useRef, useCallback } from "react";
import type { Ticket, Operation } from "@moires/shared";
import { dateToX, daysBetween } from "../../utils/dates";
import { SyncStatusIndicator } from "../session/SyncStatusIndicator";

interface Props {
  ticket: Ticket;
  rowIndex: number;
  dayWidthPx: number;
  rangeStart: string;
  onOperation: (op: Operation) => void;
  userId: string;
  peerEditing?: { color: string; displayName: string } | null;
}

export function TicketBar({
  ticket,
  rowIndex,
  dayWidthPx,
  rangeStart,
  onOperation,
  userId,
  peerEditing,
}: Props) {
  const barRef = useRef<HTMLDivElement>(null);

  const left = dateToX(ticket.startDate, rangeStart, dayWidthPx);
  const width = Math.max(dayWidthPx, (daysBetween(ticket.startDate, ticket.endDate) + 1) * dayWidthPx);
  const top = rowIndex * 44 + 8;

  const borderStyle = ticket.syncStatus === "error" ? "2px dashed var(--color-error)" : "1px solid var(--border)";

  const handleResizeStart = useCallback(
    (edge: "left" | "right", e: React.MouseEvent) => {
      e.stopPropagation();
      const startX = e.clientX;
      const originalDate = edge === "left" ? ticket.startDate : ticket.endDate;

      const onMove = (me: MouseEvent) => {
        // visual only during drag
      };

      const onUp = (me: MouseEvent) => {
        const delta = Math.round((me.clientX - startX) / dayWidthPx);
        if (delta !== 0) {
          const d = new Date(originalDate);
          d.setDate(d.getDate() + delta);
          onOperation({
            ticketId: ticket.id,
            field: edge === "left" ? "startDate" : "endDate",
            value: d.toISOString().split("T")[0],
            userId,
            clientTimestamp: Date.now(),
          });
        }
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
      };

      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    },
    [ticket, dayWidthPx, onOperation, userId],
  );

  return (
    <div
      ref={barRef}
      tabIndex={0}
      role="button"
      aria-label={`${ticket.title} — ${ticket.startDate} à ${ticket.endDate}`}
      style={{
        position: "absolute",
        left,
        top,
        width,
        height: "var(--bar-height)",
        background: "var(--surface-alt)",
        border: borderStyle,
        borderRadius: "var(--radius-bar)",
        display: "flex",
        alignItems: "center",
        padding: "0 8px",
        fontSize: 12,
        cursor: "grab",
        transition: "transform 0.2s, box-shadow 0.2s",
        boxShadow: peerEditing ? `0 0 0 2px ${peerEditing.color}` : "none",
        overflow: "hidden",
        whiteSpace: "nowrap",
      }}
      onKeyDown={(e) => {
        const field = e.shiftKey
          ? e.key === "ArrowRight" ? "endDate" : e.key === "ArrowLeft" ? "startDate" : null
          : e.key === "ArrowRight" || e.key === "ArrowLeft" ? "startDate" : null;

        if (field && (e.key === "ArrowRight" || e.key === "ArrowLeft")) {
          e.preventDefault();
          const delta = e.key === "ArrowRight" ? 1 : -1;
          if (e.shiftKey) {
            const d = new Date(ticket.endDate);
            d.setDate(d.getDate() + delta);
            onOperation({ ticketId: ticket.id, field: "endDate", value: d.toISOString().split("T")[0], userId, clientTimestamp: Date.now() });
          } else {
            const ds = new Date(ticket.startDate);
            const de = new Date(ticket.endDate);
            ds.setDate(ds.getDate() + delta);
            de.setDate(de.getDate() + delta);
            onOperation({ ticketId: ticket.id, field: "startDate", value: ds.toISOString().split("T")[0], userId, clientTimestamp: Date.now() });
            onOperation({ ticketId: ticket.id, field: "endDate", value: de.toISOString().split("T")[0], userId, clientTimestamp: Date.now() });
          }
        }
      }}
    >
      {/* Left resize handle */}
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          width: 8,
          height: "100%",
          cursor: "ew-resize",
        }}
        onMouseDown={(e) => handleResizeStart("left", e)}
      />

      <SyncStatusIndicator status={ticket.syncStatus} />
      <span style={{ marginLeft: 4, overflow: "hidden", textOverflow: "ellipsis" }}>
        {ticket.title}
      </span>

      {peerEditing && (
        <span style={{
          position: "absolute",
          top: -8,
          right: -4,
          width: 16,
          height: 16,
          borderRadius: "50%",
          background: peerEditing.color,
          fontSize: 8,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#fff",
          fontWeight: 700,
        }}>
          {peerEditing.displayName[0]}
        </span>
      )}

      {/* Right resize handle */}
      <div
        style={{
          position: "absolute",
          right: 0,
          top: 0,
          width: 8,
          height: "100%",
          cursor: "ew-resize",
        }}
        onMouseDown={(e) => handleResizeStart("right", e)}
      />
    </div>
  );
}
