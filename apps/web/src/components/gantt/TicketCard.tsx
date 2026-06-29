import type { Ticket } from "@moires/shared";
import { SyncStatusIndicator } from "../session/SyncStatusIndicator";

interface Props {
  ticket: Ticket;
  /** Déplace le ticket d'une colonne de sprint (clavier). */
  onMove: (direction: -1 | 1) => void;
  peerEditing?: { color: string; displayName: string } | null;
}

export function TicketCard({ ticket, onMove, peerEditing }: Props) {
  return (
    <div
      draggable
      tabIndex={0}
      role="button"
      aria-label={`#${ticket.id} ${ticket.title}`}
      onDragStart={(e) => {
        e.dataTransfer.setData("text/ticket-id", ticket.id);
        e.dataTransfer.effectAllowed = "move";
      }}
      onKeyDown={(e) => {
        if (e.key === "ArrowRight") {
          e.preventDefault();
          onMove(1);
        } else if (e.key === "ArrowLeft") {
          e.preventDefault();
          onMove(-1);
        }
      }}
      style={{
        position: "relative",
        display: "flex",
        alignItems: "center",
        gap: 4,
        padding: "4px 6px",
        background: "var(--surface-alt)",
        borderTop: ticket.syncStatus === "error" ? "1px solid var(--color-error)" : "1px solid var(--border)",
        borderRight: ticket.syncStatus === "error" ? "1px solid var(--color-error)" : "1px solid var(--border)",
        borderBottom: ticket.syncStatus === "error" ? "1px solid var(--color-error)" : "1px solid var(--border)",
        borderLeft: "3px solid var(--accent)",
        borderRadius: "var(--radius-bar)",
        fontSize: 12,
        cursor: "grab",
        boxShadow: peerEditing ? `0 0 0 2px ${peerEditing.color}` : "none",
        overflow: "hidden",
        whiteSpace: "nowrap",
      }}
    >
      <SyncStatusIndicator status={ticket.syncStatus} />
      <span style={{ color: "var(--text-muted)", flexShrink: 0 }}>#{ticket.id}</span>
      <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{ticket.title}</span>
      {ticket.estimateHours > 0 && (
        <span style={{ marginLeft: "auto", flexShrink: 0, color: "var(--text-muted)", fontSize: 11 }}>
          {ticket.estimateHours}h
        </span>
      )}
      {peerEditing && (
        <span
          style={{
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
          }}
        >
          {peerEditing.displayName[0]}
        </span>
      )}
    </div>
  );
}
