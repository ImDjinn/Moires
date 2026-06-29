import { useEffect } from "react";
import { useSessionStore } from "../stores/session.store";
import { useTicketsStore } from "../stores/tickets.store";
import { usePresenceStore } from "../stores/presence.store";
import { useAuthStore } from "../stores/auth.store";
import { SprintGanttBoard } from "./gantt/SprintGanttBoard";
import { PresenceLayer } from "./presence/PresenceLayer";
import { submitOperation, connectSocket } from "../services/operations.client";
import { initPresenceListeners } from "../services/presence.client";
import { api } from "../services/rest.client";
import type { GroupBy } from "../utils/grouping";

const POLL_INTERVAL_MS = 5000;

export function Board() {
  const snapshot = useSessionStore((s) => s.snapshot)!;
  const groupBy = useSessionStore((s) => s.groupBy);
  const setGroupBy = useSessionStore((s) => s.setGroupBy);
  const tickets = useTicketsStore((s) => s.tickets);
  const allPeers = usePresenceStore((s) => s.peers);
  const user = useAuthStore((s) => s.user)!;

  // L'utilisateur courant est affiché à part : on l'exclut des pairs.
  const peers = allPeers.filter((p) => p.userId !== user.id);

  useEffect(() => {
    connectSocket(snapshot.sessionId, user.id, user.displayName);
    initPresenceListeners();
  }, [snapshot.sessionId, user.id, user.displayName]);

  useEffect(() => {
    const id = setInterval(() => {
      api.syncSession(snapshot.sessionId).then((fresh: any) => {
        const store = useTicketsStore.getState();
        const pendingIds = new Set(
          store.tickets.filter((t) => t.syncStatus !== "synced").map((t) => t.id),
        );
        (fresh.tickets as any[])
          .filter((t) => !pendingIds.has(t.id))
          .forEach((t) => store.updateTicket(t));
      }).catch(() => {});
    }, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [snapshot.sessionId]);

  const groupOptions: { value: GroupBy; label: string }[] = [
    { value: "user", label: "Utilisateur" },
    { value: "epic", label: "Epic" },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh" }}>
      {/* Toolbar */}
      <div
        style={{
          height: 56,
          display: "flex",
          alignItems: "center",
          padding: "0 16px",
          borderBottom: "1px solid var(--border)",
          background: "var(--surface)",
          gap: 12,
        }}
      >
        <h1 style={{ fontSize: 18, fontWeight: 600 }}>Moires</h1>
        <span style={{ color: "var(--text-muted)", fontSize: 13 }}>{tickets.length} tickets</span>

        {/* Group-by toggle */}
        <div
          style={{
            display: "flex",
            marginLeft: 8,
            border: "1px solid var(--border)",
            borderRadius: 6,
            overflow: "hidden",
          }}
        >
          {groupOptions.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setGroupBy(opt.value)}
              style={{
                padding: "6px 12px",
                fontSize: 12,
                border: "none",
                cursor: "pointer",
                background: groupBy === opt.value ? "var(--accent)" : "transparent",
                color: groupBy === opt.value ? "#fff" : "var(--text-muted)",
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <div style={{ flex: 1 }} />

        {/* Présence temps réel (en haut à droite) */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ display: "flex" }}>
            {peers.slice(0, 5).map((p) => (
              <div
                key={p.userId}
                title={p.displayName}
                style={{
                  width: 28,
                  height: 28,
                  marginLeft: -6,
                  borderRadius: "50%",
                  border: "2px solid var(--surface)",
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
            {/* Soi-même */}
            <div
              title={`${user.displayName} (vous)`}
              style={{
                width: 28,
                height: 28,
                marginLeft: -6,
                borderRadius: "50%",
                border: "2px solid var(--accent)",
                background: "var(--surface-alt)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 12,
                fontWeight: 600,
                color: "var(--text)",
              }}
            >
              {user.displayName[0]?.toUpperCase()}
            </div>
          </div>
          <span style={{ color: "var(--text-muted)", fontSize: 12 }}>
            {peers.length + 1} en ligne
          </span>
        </div>
      </div>

      {/* Gantt par sprints */}
      <SprintGanttBoard
        tickets={tickets}
        teamMembers={snapshot.teamMembers}
        iterations={snapshot.iterations}
        groupBy={groupBy}
        onOperation={submitOperation}
        userId={user.id}
      />

      {/* Curseurs temps réel */}
      <PresenceLayer peers={peers} />
    </div>
  );
}
