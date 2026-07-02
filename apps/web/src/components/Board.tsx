import { useEffect } from "react";
import { useSessionStore } from "../stores/session.store";
import { useTicketsStore } from "../stores/tickets.store";
import { usePresenceStore } from "../stores/presence.store";
import { useCapacitiesStore } from "../stores/capacities.store";
import { useAuthStore } from "../stores/auth.store";
import { useThemeStore } from "../stores/theme.store";
import { formatSprintRange } from "../utils/dates";
import { UserBoard } from "./gantt/UserBoard";
import { EpicBoard } from "./gantt/EpicBoard";
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
  const capacities = useCapacitiesStore((s) => s.capacities);
  const setCapacity = useCapacitiesStore((s) => s.setCapacity);
  const user = useAuthStore((s) => s.user)!;
  const theme = useThemeStore((s) => s.theme);
  const toggleTheme = useThemeStore((s) => s.toggle);

  // L'utilisateur courant est affiché à part : on l'exclut des pairs.
  const peers = allPeers.filter((p) => p.userId !== user.id);

  // Itération courante : celle qui contient aujourd'hui, sinon la première.
  const today = new Date().toISOString().slice(0, 10);
  const currentIter =
    snapshot.iterations.find(
      (it) => it.startDate.slice(0, 10) <= today && today <= it.finishDate.slice(0, 10),
    ) ?? snapshot.iterations[0];

  // État de sync global, dérivé des tickets.
  const syncing = tickets.some((t) => t.syncStatus !== "synced");

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
          height: 54,
          flex: "0 0 auto",
          display: "flex",
          alignItems: "center",
          padding: "0 18px",
          borderBottom: "1px solid var(--line)",
          background: "var(--panel)",
          gap: 14,
        }}
      >
        {/* Logo */}
        <div
          style={{
            width: 26,
            height: 26,
            borderRadius: 7,
            background: "linear-gradient(135deg,#0078d4,#3b8df0)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flex: "0 0 auto",
            boxShadow: "0 1px 3px rgba(0,90,200,.35)",
          }}
        >
          <div style={{ width: 11, height: 11, border: "2px solid #fff", borderRadius: 3 }} />
        </div>
        <h1 style={{ fontSize: 16, fontWeight: 600, color: "var(--ink)" }}>Moires</h1>
        <span style={{ color: "var(--muted)", fontSize: 12.5 }}>{tickets.length} tickets</span>

        {/* Group-by segmented control */}
        <div
          style={{
            display: "flex",
            background: "var(--panel2)",
            border: "1px solid var(--line)",
            borderRadius: 8,
            padding: 2,
            gap: 2,
          }}
        >
          {groupOptions.map((opt) => {
            const active = groupBy === opt.value;
            return (
              <button
                key={opt.value}
                onClick={() => setGroupBy(opt.value)}
                style={{
                  padding: "5px 13px",
                  borderRadius: 6,
                  border: "none",
                  fontSize: 12,
                  fontWeight: active ? 600 : 500,
                  cursor: "pointer",
                  background: active ? "var(--panel)" : "transparent",
                  color: active ? "var(--ink)" : "var(--muted)",
                  boxShadow: active ? "0 1px 2px rgba(20,20,40,.12)" : "none",
                }}
              >
                {opt.label}
              </button>
            );
          })}
        </div>

        {/* Itération courante */}
        {currentIter && (
          <>
            <div style={{ width: 1, height: 22, background: "var(--line)" }} />
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: "50%",
                  background: "var(--accent)",
                  boxShadow: "0 0 0 3px var(--accentsoft)",
                }}
              />
              <div style={{ lineHeight: 1.2 }}>
                <div
                  style={{
                    fontSize: 9.5,
                    fontWeight: 600,
                    letterSpacing: ".06em",
                    textTransform: "uppercase",
                    color: "var(--faint)",
                  }}
                >
                  Itération courante
                </div>
                <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--ink)" }}>
                  {currentIter.name}{" "}
                  <span style={{ fontWeight: 400, color: "var(--muted)", fontFamily: "'IBM Plex Mono',monospace", fontSize: 11 }}>
                    · {formatSprintRange(currentIter.startDate, currentIter.finishDate)}
                  </span>
                </div>
              </div>
            </div>
          </>
        )}

        <div style={{ flex: 1 }} />

        {/* État de synchronisation ADO */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 7,
            fontSize: 11.5,
            fontWeight: 500,
            color: syncing ? "var(--accent)" : "#2b9d68",
          }}
        >
          <div
            style={
              syncing
                ? {
                    width: 11,
                    height: 11,
                    borderRadius: "50%",
                    border: "2px solid var(--accent)",
                    borderTopColor: "transparent",
                    animation: "ggspin .7s linear infinite",
                  }
                : { width: 8, height: 8, borderRadius: "50%", background: "#2bbf73" }
            }
          />
          <span>{syncing ? "Synchronisation…" : "Azure DevOps synchronisé"}</span>
        </div>

        <div style={{ width: 1, height: 22, background: "var(--line)" }} />

        {/* Présence temps réel */}
        <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
          <div style={{ display: "flex" }}>
            {peers.slice(0, 5).map((p) => (
              <div
                key={p.userId}
                title={p.displayName}
                style={{
                  width: 26,
                  height: 26,
                  marginLeft: -7,
                  borderRadius: "50%",
                  border: "2px solid var(--panel)",
                  background: p.color,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 10,
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
                width: 26,
                height: 26,
                marginLeft: peers.length ? -7 : 0,
                borderRadius: "50%",
                border: "2px solid var(--accent)",
                background: "var(--panel2)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 10,
                fontWeight: 600,
                color: "var(--ink)",
              }}
            >
              {user.displayName[0]?.toUpperCase()}
            </div>
          </div>
          <span style={{ color: "var(--muted)", fontSize: 11.5 }}>{peers.length + 1} en ligne</span>
        </div>

        <div style={{ width: 1, height: 22, background: "var(--line)" }} />

        {/* Bascule de thème */}
        <button
          onClick={toggleTheme}
          style={{
            height: 30,
            padding: "0 12px",
            borderRadius: 7,
            border: "1px solid var(--line)",
            background: "var(--panel2)",
            color: "var(--ink)",
            fontSize: 12,
            fontWeight: 500,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          {theme === "dark" ? "☀ Clair" : "☾ Sombre"}
        </button>
      </div>

      {/* Gantt par sprints — deux canvas isolés */}
      {groupBy === "user" ? (
        <UserBoard
          tickets={tickets}
          teamMembers={snapshot.teamMembers}
          iterations={snapshot.iterations}
          capacities={capacities}
          onOperation={submitOperation}
          onSetCapacity={(memberId, iterationPath, sp) =>
            setCapacity(snapshot.sessionId, memberId, iterationPath, sp)
          }
          userId={user.id}
        />
      ) : (
        <EpicBoard
          tickets={tickets}
          iterations={snapshot.iterations}
          onOperation={submitOperation}
          userId={user.id}
        />
      )}

      {/* Curseurs temps réel */}
      <PresenceLayer peers={peers} />
    </div>
  );
}
