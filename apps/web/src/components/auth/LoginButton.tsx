import { MoiraiMark } from "../Brand";

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
      background: "var(--canvas)",
      padding: "0 24px",
    }}>
      <div style={{
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
      }}>
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
        <a
          href="/auth/login"
          style={{
            width: "100%",
            height: 46,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "var(--accent)",
            color: "#fff",
            borderRadius: 10,
            textDecoration: "none",
            fontSize: 15,
            fontWeight: 600,
          }}
        >
          Se connecter avec Azure AD
        </a>
      </div>
    </div>
  );
}
