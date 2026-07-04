// Maps known auth failure codes to actionable French messages. Keys are either
// AAD sub-codes (AADSTS…) forwarded by the backend or OAuth error codes.
const AUTH_ERROR_MESSAGES: Record<string, string> = {
  AADSTS650052:
    "Azure DevOps n'est pas activé pour votre organisation Azure AD. Un administrateur doit autoriser l'application Azure DevOps dans le tenant (consentement administrateur), ou connectez-vous une première fois sur dev.azure.com avec ce compte pour la provisionner.",
  AADSTS65001:
    "L'accès à Azure DevOps n'a pas été autorisé pour cette application. Un administrateur doit accorder le consentement.",
  access_denied: "Connexion annulée : l'autorisation a été refusée.",
  auth_failed: "La connexion a échoué. Réessayez ou contactez votre administrateur.",
};

function getAuthError(): string | null {
  const code = new URLSearchParams(window.location.search).get("auth_error");
  if (!code) return null;
  return (
    AUTH_ERROR_MESSAGES[code] ??
    `Échec de la connexion (code : ${code}). Réessayez ou contactez votre administrateur.`
  );
}

export function LoginButton() {
  const error = getAuthError();

  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      height: "100vh",
      flexDirection: "column",
      gap: "24px",
    }}>
      <h1 style={{ fontSize: "32px", fontWeight: 600 }}>Moirai</h1>
      <p style={{ color: "var(--text-muted)" }}>Planification collaborative de sprint</p>
      {error && (
        <div
          role="alert"
          style={{
            maxWidth: "480px",
            padding: "12px 16px",
            background: "rgba(248, 81, 73, 0.1)",
            border: "1px solid var(--color-error)",
            borderRadius: "8px",
            color: "var(--color-error)",
            fontSize: "14px",
            lineHeight: 1.5,
            textAlign: "center",
          }}
        >
          {error}
        </div>
      )}
      <a
        href="/auth/login"
        style={{
          padding: "12px 32px",
          background: "var(--accent)",
          color: "#fff",
          borderRadius: "8px",
          textDecoration: "none",
          fontSize: "16px",
          fontWeight: 500,
        }}
      >
        Se connecter avec Azure AD
      </a>
    </div>
  );
}
