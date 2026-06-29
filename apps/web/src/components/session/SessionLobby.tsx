import { useState, useEffect } from "react";
import { api } from "../../services/rest.client";
import { useSessionStore } from "../../stores/session.store";
import { useTicketsStore } from "../../stores/tickets.store";
import { usePresenceStore } from "../../stores/presence.store";

export function SessionLobby() {
  const setSnapshot = useSessionStore((s) => s.setSnapshot);
  const setTickets = useTicketsStore((s) => s.setTickets);
  const setPeers = usePresenceStore((s) => s.setPeers);

  const [organizations, setOrganizations] = useState<{ id: string; name: string }[]>([]);
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);

  const [selectedOrg, setSelectedOrg] = useState("");
  const [selectedProject, setSelectedProject] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api.getOrganizations()
      .then(({ organizations, selected }) => {
        setOrganizations(organizations);
        if (selected) setSelectedOrg(selected);
      })
      .catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    if (!selectedOrg) return;
    setProjects([]);
    setSelectedProject("");
    api.getProjects().then(setProjects).catch((e) => setError(e.message));
  }, [selectedOrg]);

  const handleOrgChange = async (org: string) => {
    setError("");
    try {
      await api.selectOrganization(org);
      setSelectedOrg(org);
    } catch (e: any) {
      setError(e.message);
    }
  };

  const handleEnter = async () => {
    if (!selectedProject) return;
    setLoading(true);
    setError("");
    try {
      const snapshot = await api.createSession({ adoProjectId: selectedProject });
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
          <span style={{ color: "var(--text-muted)", fontSize: 13 }}>Organisation ADO</span>
          <select
            style={selectStyle}
            value={selectedOrg}
            onChange={(e) => handleOrgChange(e.target.value)}
          >
            <option value="">Sélectionner...</option>
            {organizations.map((o) => (
              <option key={o.id} value={o.name}>{o.name}</option>
            ))}
          </select>
        </label>

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

        <button
          onClick={handleEnter}
          disabled={loading || !selectedProject}
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
