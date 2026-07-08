import { useState } from "react";
import { MoiraiMark } from "../Brand";

export function LoginButton() {
  const [org, setOrg] = useState("");
  const [pat, setPat] = useState("");
  const [showPat, setShowPat] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!org.trim() || !pat.trim() || loading) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/auth/login", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ org: org.trim(), pat: pat.trim() }),
      });
      if (res.status === 204) {
        window.location.reload();
        return;
      }
      setError(
        res.status === 401
          ? "PAT ou organisation invalide. Vérifiez le nom de l'organisation, le jeton et ses autorisations."
          : "La connexion a échoué. Réessayez.",
      );
    } catch {
      setError("La connexion a échoué. Réessayez.");
    } finally {
      setLoading(false);
    }
  };

  const inputStyle: React.CSSProperties = {
    width: "100%",
    height: 46,
    padding: "0 14px",
    background: "var(--panel2)",
    border: "1px solid var(--line)",
    borderRadius: 10,
    color: "var(--ink)",
    fontSize: 14,
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
      <form
        onSubmit={submit}
        style={{
          width: "100%",
          maxWidth: 420,
          background: "var(--panel)",
          border: "1px solid var(--line)",
          borderRadius: 16,
          boxShadow: "var(--shadow)",
          padding: 36,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 24,
          textAlign: "center",
        }}
      >
        <MoiraiMark size={48} />
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <h1 style={{ fontSize: 28, fontWeight: 700, letterSpacing: "-0.01em", color: "var(--ink)" }}>Moirai</h1>
          <p style={{ color: "var(--muted)", fontSize: 14, lineHeight: 1.5 }}>
            Planification collaborative de sprint sur Azure DevOps
          </p>
        </div>
        {error && (
          <div
            role="alert"
            style={{
              width: "100%",
              padding: "12px 16px",
              background: "rgba(239, 68, 68, 0.1)",
              border: "1px solid var(--color-error)",
              borderRadius: 8,
              color: "var(--color-error)",
              fontSize: 13,
              lineHeight: 1.5,
              textAlign: "left",
            }}
          >
            {error}
          </div>
        )}
        <input
          type="text"
          value={org}
          onChange={(e) => setOrg(e.target.value)}
          placeholder="Organisation Azure DevOps (ex. Les-Moires)"
          aria-label="Organisation Azure DevOps"
          autoComplete="off"
          style={inputStyle}
        />
        <div style={{ position: "relative", width: "100%" }}>
          <input
            type={showPat ? "text" : "password"}
            value={pat}
            onChange={(e) => setPat(e.target.value)}
            placeholder="Personal Access Token Azure DevOps"
            aria-label="Personal Access Token Azure DevOps"
            autoComplete="off"
            style={{ ...inputStyle, paddingRight: 78 }}
          />
          <button
            type="button"
            onClick={() => setShowPat((s) => !s)}
            aria-label={showPat ? "Masquer le jeton" : "Afficher le jeton"}
            style={{
              position: "absolute",
              top: 0,
              right: 0,
              height: "100%",
              padding: "0 14px",
              display: "flex",
              alignItems: "center",
              background: "none",
              border: "none",
              color: "var(--muted)",
              fontSize: 12,
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            {showPat ? "Masquer" : "Afficher"}
          </button>
        </div>
        <button
          type="submit"
          disabled={loading || !org.trim() || !pat.trim()}
          style={{
            width: "100%",
            height: 46,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "var(--accent)",
            color: "#fff",
            border: "none",
            borderRadius: 10,
            fontSize: 15,
            fontWeight: 600,
            cursor: loading || !org.trim() || !pat.trim() ? "default" : "pointer",
            opacity: loading || !org.trim() || !pat.trim() ? 0.55 : 1,
          }}
        >
          {loading ? "Connexion…" : "Se connecter"}
        </button>
        <a
          href="https://dev.azure.com"
          target="_blank"
          rel="noreferrer"
          style={{ color: "var(--muted)", fontSize: 12, textDecoration: "underline" }}
        >
          Créer un PAT (portée : Work Items lecture/écriture, Project & Team lecture)
        </a>
      </form>
    </div>
  );
}
