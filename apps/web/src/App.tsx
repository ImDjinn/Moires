import { useEffect, useState } from "react";
import { useSessionStore, loadSessionId, applySnapshot } from "./stores/session.store";
import { api } from "./services/rest.client";
import { AuthGuard } from "./components/auth/AuthGuard";
import { SessionLobby } from "./components/session/SessionLobby";
import { GanttBoard } from "./components/design/GanttBoard";

// Reprend le board précédent au rafraîchissement si la session est toujours
// valide côté serveur ; sinon (session expirée / accès révoqué) retour au lobby.
function SessionRoot() {
  const snapshot = useSessionStore((s) => s.snapshot);
  const [restoring, setRestoring] = useState(() => !snapshot && !!loadSessionId());

  useEffect(() => {
    if (snapshot) return;
    const id = loadSessionId();
    if (!id) return;
    let cancelled = false;
    api.getSnapshot(id)
      .then((snap) => { if (!cancelled) applySnapshot(snap); })
      .catch(() => { if (!cancelled) useSessionStore.getState().clear(); })
      .finally(() => { if (!cancelled) setRestoring(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (restoring) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh" }}>
        <span style={{ color: "var(--text-muted)" }}>Reprise de la session…</span>
      </div>
    );
  }
  return snapshot ? <GanttBoard key={snapshot.sessionId} /> : <SessionLobby />;
}

export function App() {
  return (
    <AuthGuard>
      <SessionRoot />
    </AuthGuard>
  );
}
