import type { Ticket } from "@moires/shared";
import { SyncStatusIndicator } from "../session/SyncStatusIndicator";

interface Props {
  ticket: Ticket;
  /** Déplace le ticket d'une colonne de sprint (clavier). */
  onMove: (direction: -1 | 1) => void;
  peerEditing?: { color: string; displayName: string } | null;
}

const mono = "'IBM Plex Mono', monospace";

export function TicketCard({ ticket, onMove, peerEditing }: Props) {
  const isError = ticket.syncStatus === "error";
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
        flexDirection: "column",
        gap: 3,
        padding: "6px 10px 6px 12px",
        background: "var(--panel)",
        border: isError ? "1px solid var(--color-error)" : "1px solid var(--line)",
        borderLeft: `3px solid ${isError ? "var(--color-error)" : "var(--accent)"}`,
        borderRadius: "var(--radius-bar)",
        boxShadow: peerEditing ? `0 0 0 2px ${peerEditing.color}` : "var(--shadow)",
        cursor: "grab",
        overflow: "hidden",
        userSelect: "none",
      }}
    >
      {/* Ligne 1 : id · points */}
      <div style={{ display: "flex", alignItems: "center", gap: 5, minWidth: 0 }}>
        <span style={{ fontSize: 9.5, fontWeight: 600, fontFamily: mono, color: "var(--accent)", flexShrink: 0 }}>
          #{ticket.id}
        </span>
        <div style={{ flex: 1, minWidth: 4 }} />
        {ticket.storyPoints > 0 && (
          <span
            style={{
              flexShrink: 0,
              fontSize: 9.5,
              fontWeight: 600,
              fontFamily: mono,
              color: "var(--muted)",
              background: "var(--line2)",
              padding: "1px 6px",
              borderRadius: 5,
            }}
          >
            {ticket.storyPoints}p
          </span>
        )}
      </div>

      {/* Ligne 2 : état sync · titre */}
      <div style={{ display: "flex", alignItems: "center", gap: 5, minWidth: 0 }}>
        <SyncStatusIndicator status={ticket.syncStatus} />
        <span
          style={{
            fontSize: 11.5,
            fontWeight: 500,
            color: "var(--ink)",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {ticket.title}
        </span>
      </div>

      {peerEditing && (
        <span
          style={{
            position: "absolute",
            top: -8,
            right: -4,
            width: 18,
            height: 18,
            borderRadius: "50%",
            background: peerEditing.color,
            fontSize: 9,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#fff",
            fontWeight: 700,
            border: "2px solid var(--panel)",
            animation: "ggpulse 1.1s ease-in-out infinite",
          }}
        >
          {peerEditing.displayName[0]}
        </span>
      )}
    </div>
  );
}
