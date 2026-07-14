import { useEffect, useState } from "react";
import { useSessionStore, loadSessionId, applySnapshot } from "./stores/session.store";
import { api } from "./services/rest.client";
import { AuthGuard } from "./components/auth/AuthGuard";
import { SessionLobby } from "./components/session/SessionLobby";
import { GanttBoard } from "./components/design/GanttBoard";
import { Brand } from "./components/Brand";

// Session chargée mais projet ADO sans aucun work item : on l'affiche
// explicitement au lieu de retomber sur les données de démonstration du board.
function EmptyProject() {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", background: "var(--canvas)", padding: "0 24px" }}>
      <div style={{ width: "100%", maxWidth: 440, background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 16, boxShadow: "var(--shadow)", padding: 32, display: "flex", flexDirection: "column", alignItems: "center", gap: 18, textAlign: "center" }}>
        <Brand size={30} />
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <h2 style={{ fontSize: 20, fontWeight: 600, color: "var(--ink)" }}>Aucun work item</h2>
          <p style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.5 }}>
            Ce projet Azure DevOps ne contient aucun work item à planifier. Ajoutez-en dans ADO, ou choisissez un autre projet.
          </p>
        </div>
        <button
          onClick={() => useSessionStore.getState().clear()}
          style={{ height: 40, padding: "0 20px", background: "var(--accent)", color: "#fff", border: "none", borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: "pointer" }}
        >
          Choisir un autre projet
        </button>
      </div>
    </div>
  );
}

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
      .then(async (snap) => {
        // Snapshot vide = cache Redis expiré (TTL 24h) ou session rejointe via
        // lien d'invitation : un sync ré-hydrate le cache serveur avant de
        // conclure (à tort) que le projet n'a aucun work item.
        if (snap.tickets.length === 0) {
          await api.syncSession(id);
          snap = await api.getSnapshot(id);
        }
        if (!cancelled) applySnapshot(snap);
      })
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
  if (!snapshot) return <SessionLobby />;
  if (snapshot.tickets.length === 0) return <EmptyProject />;
  return <GanttBoard key={snapshot.sessionId} />;
}

export function App() {
  return (
    <AuthGuard>
      <SessionRoot />
    </AuthGuard>
  );
}
