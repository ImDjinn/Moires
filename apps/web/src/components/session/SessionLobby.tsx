import { useState, useEffect } from "react";
import { api } from "../../services/rest.client";
import { useSessionStore } from "../../stores/session.store";
import { useTicketsStore } from "../../stores/tickets.store";
import { usePresenceStore } from "../../stores/presence.store";

export function SessionLobby() {
  const setSnapshot = useSessionStore((s) => s.setSnapshot);
  const setTickets = useTicketsStore((s) => s.setTickets);
  const setPeers = usePresenceStore((s) => s.setPeers);

  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const [iterations, setIterations] = useState<{ id: string; name: string }[]>([]);
  const [areas, setAreas] = useState<{ path: string }[]>([]);

  const [selectedProject, setSelectedProject] = useState("");
  const [selectedIterations, setSelectedIterations] = useState<string[]>([]);
  const [selectedAreas, setSelectedAreas] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api.getProjects().then(setProjects).catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    if (!selectedProject) return;
    setIterations([]);
    setAreas([]);
    setSelectedIterations([]);
    setSelectedAreas([]);
    Promise.all([
      api.getIterations(selectedProject),
      api.getAreas(selectedProject),
    ]).then(([iters, areas]) => {
      setIterations(iters);
      setAreas(areas);
    }).catch((e) => setError(e.message));
  }, [selectedProject]);

  const handleEnter = async () => {
    if (!selectedProject || !selectedIterations.length) return;
    setLoading(true);
    setError("");
    try {
      const snapshot = await api.createSession({
        adoProjectId: selectedProject,
        adoIterationIds: selectedIterations,
        areaPaths: selectedAreas.length ? selectedAreas : undefined,
      });
      setTickets(snapshot.tickets);
      setPeers(snapshot.participants);
      setSnapshot(snapshot);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const selectStyle: React.CSSProperties = {
    width: "100%",
    padding: "10px 12px",
    background: "var(--surface)",
    border: "1px solid var(--border)",
    borderRadius: "6px",
    color: "var(--text)",
    fontSize: "14px",
  };

  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      height: "100vh",
    }}>
      <div style={{ maxWidth: 560, width: "100%", padding: "0 24px", display: "flex", flexDirection: "column", gap: 20 }}>
        <h2 style={{ fontSize: 24, fontWeight: 600 }}>Nouvelle session</h2>

        {error && (
          <div style={{ padding: "8px 12px", background: "var(--color-error)", borderRadius: 6, fontSize: 13 }}>
            {error}
          </div>
        )}

        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ color: "var(--text-muted)", fontSize: 13 }}>Projet ADO</span>
          <select
            style={selectStyle}
            value={selectedProject}
            onChange={(e) => setSelectedProject(e.target.value)}
          >
            <option value="">Sélectionner...</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </label>

        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ color: "var(--text-muted)", fontSize: 13 }}>Itération(s)</span>
          <select
            style={selectStyle}
            multiple
            size={4}
            value={selectedIterations}
            onChange={(e) =>
              setSelectedIterations(Array.from(e.target.selectedOptions, (o) => o.value))
            }
          >
            {iterations.map((i) => (
              <option key={i.id} value={i.id}>{i.name}</option>
            ))}
          </select>
        </label>

        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ color: "var(--text-muted)", fontSize: 13 }}>Areas (optionnel)</span>
          <select
            style={selectStyle}
            multiple
            size={3}
            value={selectedAreas}
            onChange={(e) =>
              setSelectedAreas(Array.from(e.target.selectedOptions, (o) => o.value))
            }
          >
            {areas.map((a) => (
              <option key={a.path} value={a.path}>{a.path}</option>
            ))}
          </select>
        </label>

        <button
          onClick={handleEnter}
          disabled={loading || !selectedProject || !selectedIterations.length}
          style={{
            padding: "12px 0",
            background: "var(--accent)",
            color: "#fff",
            border: "none",
            borderRadius: 8,
            fontSize: 16,
            fontWeight: 500,
            cursor: "pointer",
            opacity: loading ? 0.6 : 1,
          }}
        >
          {loading ? "Chargement..." : "Entrer dans la session"}
        </button>
      </div>
    </div>
  );
}
