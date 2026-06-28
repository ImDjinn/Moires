import { useMemo, useEffect } from "react";
import { useSessionStore } from "../stores/session.store";
import { useTicketsStore } from "../stores/tickets.store";
import { usePresenceStore } from "../stores/presence.store";
import { useAuthStore } from "../stores/auth.store";
import { GanttBoard } from "./gantt/GanttBoard";
import { LoadHistogram } from "./load/LoadHistogram";
import { PresenceLayer } from "./presence/PresenceLayer";
import { submitOperation, connectSocket } from "../services/operations.client";
import { initPresenceListeners } from "../services/presence.client";

export function Board() {
  const snapshot = useSessionStore((s) => s.snapshot)!;
  const tickets = useTicketsStore((s) => s.tickets);
  const peers = usePresenceStore((s) => s.peers);
  const user = useAuthStore((s) => s.user)!;

  useEffect(() => {
    connectSocket(snapshot.sessionId, user.id, user.displayName);
    initPresenceListeners();
  }, [snapshot.sessionId, user.id, user.displayName]);

  const { rangeStart, rangeEnd } = useMemo(() => {
    if (!tickets.length) {
      const today = new Date().toISOString().split("T")[0];
      return { rangeStart: today, rangeEnd: today };
    }
    const starts = tickets.map((t) => t.startDate);
    const ends = tickets.map((t) => t.endDate);
    return {
      rangeStart: starts.sort()[0].split("T")[0],
      rangeEnd: ends.sort().reverse()[0].split("T")[0],
    };
  }, [tickets]);

  const dayWidthPx = 40;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh" }}>
      {/* Toolbar */}
      <div style={{
        height: 56,
        display: "flex",
        alignItems: "center",
        padding: "0 16px",
        borderBottom: "1px solid var(--border)",
        background: "var(--surface)",
        gap: 12,
      }}>
        <h1 style={{ fontSize: 18, fontWeight: 600 }}>Moires</h1>
        <span style={{ color: "var(--text-muted)", fontSize: 13 }}>
          {tickets.length} tickets
        </span>
        <div style={{ flex: 1 }} />
        {/* Participant avatars */}
        <div style={{ display: "flex", gap: 4 }}>
          {peers.slice(0, 5).map((p) => (
            <div
              key={p.userId}
              title={p.displayName}
              style={{
                width: 28,
                height: 28,
                borderRadius: "50%",
                background: p.color,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 12,
                fontWeight: 600,
                color: "#fff",
              }}
            >
              {p.displayName[0]}
            </div>
          ))}
          {peers.length > 5 && (
            <div style={{
              width: 28,
              height: 28,
              borderRadius: "50%",
              background: "var(--border)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 11,
              color: "var(--text-muted)",
            }}>
              +{peers.length - 5}
            </div>
          )}
        </div>
      </div>

      {/* Gantt */}
      <GanttBoard
        tickets={tickets}
        teamMembers={snapshot.teamMembers}
        rangeStart={rangeStart}
        rangeEnd={rangeEnd}
        dayWidthPx={dayWidthPx}
        onOperation={submitOperation}
        userId={user.id}
      />

      {/* Load histogram */}
      <LoadHistogram
        tickets={tickets}
        teamMembers={snapshot.teamMembers}
        rangeStart={rangeStart}
        rangeEnd={rangeEnd}
        dayWidthPx={dayWidthPx}
      />

      {/* Presence overlay */}
      <PresenceLayer peers={peers} />
    </div>
  );
}
