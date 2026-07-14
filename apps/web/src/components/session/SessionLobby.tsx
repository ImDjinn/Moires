import { useState, useEffect } from "react";
import { api } from "../../services/rest.client";
import { applySnapshot } from "../../stores/session.store";
import { Brand } from "../Brand";

export function SessionLobby() {
  const [org, setOrg] = useState("");
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);

  const [selectedProject, setSelectedProject] = useState("");
  const [loading, setLoading] = useState(false);
  const [projectsLoading, setProjectsLoading] = useState(true);
  const [error, setError] = useState("");

  // L'org est choisie et validée à la connexion (cookie ado_org) : on ne la
  // redemande pas ici. On l'affiche pour contexte et on charge ses projets.
  useEffect(() => {
    api.getOrganizations()
      .then(({ selected }) => { if (selected) setOrg(selected); })
      .catch((e) => setError(e.message));
    api.getProjects()
      .then(setProjects)
      .catch((e) => setError(e.message))
      .finally(() => setProjectsLoading(false));
  }, []);

  const handleEnter = async () => {
    if (!selectedProject) return;
    setLoading(true);
    setError("");
    try {
      const snapshot = await api.createSession({ adoProjectId: selectedProject });
      applySnapshot(snapshot);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const labelStyle: React.CSSProperties = {
    color: "var(--muted)",
    fontSize: 10,
    fontWeight: 600,
    letterSpacing: ".06em",
    textTransform: "uppercase",
  };
  const selectStyle: React.CSSProperties = {
    width: "100%",
    height: 40,
    padding: "0 12px",
    background: "var(--panel2)",
    border: "1px solid var(--line)",
    borderRadius: 8,
    color: "var(--ink)",
    fontSize: 14,
    cursor: "pointer",
    outline: "none",
  };

  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      height: "100vh",
      background: "var(--canvas)",
      padding: "0 24px",
    }}>
      <div style={{
        width: "100%",
        maxWidth: 440,
        background: "var(--panel)",
        border: "1px solid var(--line)",
        borderRadius: 16,
        boxShadow: "var(--shadow)",
        padding: 32,
        display: "flex",
        flexDirection: "column",
        gap: 22,
      }}>
        <Brand size={30} />

        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={labelStyle}>Planification collaborative</span>
          <h2 style={{ fontSize: 22, fontWeight: 600, color: "var(--ink)" }}>Nouvelle session</h2>
          <p style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.5 }}>
            Sélectionnez l'organisation et le projet Azure DevOps à planifier.
          </p>
        </div>

        {error && (
          <div role="alert" style={{
            padding: "10px 12px",
            background: "rgba(239, 68, 68, 0.1)",
            border: "1px solid var(--color-error)",
            borderRadius: 8,
            color: "var(--color-error)",
            fontSize: 13,
            lineHeight: 1.4,
          }}>
            {error}
          </div>
        )}

        {/* Lecture seule (choisie à la connexion) : texte simple, pas un faux champ. */}
        <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
          <span style={labelStyle}>Organisation ADO</span>
          <div style={{ fontSize: 14, fontWeight: 500, padding: "2px 0", color: org ? "var(--ink)" : "var(--muted)" }}>
            {org || "Chargement…"}
          </div>
        </div>

        <label style={{ display: "flex", flexDirection: "column", gap: 7 }}>
          <span style={labelStyle}>Projet ADO</span>
          <select
            style={{ ...selectStyle, opacity: !projectsLoading ? 1 : 0.5 }}
            value={selectedProject}
            disabled={projectsLoading}
            onChange={(e) => setSelectedProject(e.target.value)}
          >
            <option value="">{projectsLoading ? "Chargement…" : "Sélectionner…"}</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </label>

        <button
          onClick={handleEnter}
          disabled={loading || !selectedProject}
          style={{
            height: 44,
            marginTop: 2,
            background: "var(--accent)",
            color: "#fff",
            border: "none",
            borderRadius: 10,
            fontSize: 15,
            fontWeight: 600,
            cursor: loading || !selectedProject ? "default" : "pointer",
            opacity: loading || !selectedProject ? 0.55 : 1,
            transition: "opacity .15s",
          }}
        >
          {loading ? "Chargement…" : "Entrer dans la session"}
        </button>
        {!loading && !projectsLoading && !selectedProject && (
          <p style={{ fontSize: 12, color: "var(--faint)", textAlign: "center", marginTop: -12 }}>
            Sélectionnez un projet pour entrer dans la session.
          </p>
        )}
      </div>
    </div>
  );
}
