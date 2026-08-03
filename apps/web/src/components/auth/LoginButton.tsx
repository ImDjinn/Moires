import { useState } from "react";
import { MoiresMark } from "../Brand";
import { t, useLang, LangToggle } from "../../i18n";

export function LoginButton() {
  useLang();
  const [org, setOrg] = useState("");
  const [pat, setPat] = useState("");
  const [showPat, setShowPat] = useState(false);
  const [remember, setRemember] = useState(false);
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
        body: JSON.stringify({ org: org.trim(), pat: pat.trim(), remember }),
      });
      if (res.status === 204) {
        window.location.reload();
        return;
      }
      setError(
        res.status === 401
          ? t("PAT ou organisation invalide. Vérifiez le nom de l'organisation, le jeton et ses autorisations.")
          // 429 : verrou anti-brute-force (10 échecs / 15 min). « Réessayez »
          // serait contre-productif — chaque tentative prolonge l'attente.
          : res.status === 429
            ? t("Trop de tentatives échouées. Attendez 15 minutes avant de réessayer.")
            : t("La connexion a échoué. Réessayez."),
      );
    } catch {
      setError(t("La connexion a échoué. Réessayez."));
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
  const labelStyle: React.CSSProperties = {
    color: "var(--muted)",
    fontSize: 10,
    fontWeight: 600,
    letterSpacing: ".06em",
    textTransform: "uppercase",
  };
  const missing = !org.trim() || !pat.trim();

  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      height: "100dvh",
      background: "var(--canvas)",
      padding: "0 24px",
    }}>
      <div style={{ position: "fixed", top: 16, right: 16 }}><LangToggle /></div>
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
        {/* Même couleur de marque que partout ailleurs (Brand force l'accent). */}
        <div style={{ color: "var(--accent)", display: "flex" }}>
          <MoiresMark size={48} />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <h1 style={{ fontSize: 28, fontWeight: 700, letterSpacing: "-0.01em", color: "var(--ink)" }}>Moires</h1>
          <p style={{ color: "var(--muted)", fontSize: 14, lineHeight: 1.5 }}>
            {t("Planification collaborative de sprint sur Azure DevOps")}
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
        <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: 7, textAlign: "left" }}>
          <span style={labelStyle}>{t("Organisation ADO")}</span>
          <input
            type="text"
            value={org}
            onChange={(e) => setOrg(e.target.value)}
            placeholder={t("ex. monorganisation")}
            aria-label={t("Organisation Azure DevOps")}
            autoComplete="off"
            style={inputStyle}
          />
        </div>
        <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: 7, textAlign: "left" }}>
          <span style={labelStyle}>Personal Access Token</span>
          <div style={{ position: "relative", width: "100%" }}>
          <input
            type={showPat ? "text" : "password"}
            value={pat}
            onChange={(e) => setPat(e.target.value)}
            placeholder={t("Collez votre jeton")}
            aria-label={t("Personal Access Token Azure DevOps")}
            autoComplete="off"
            style={{ ...inputStyle, paddingRight: 78 }}
          />
          <button
            type="button"
            onClick={() => setShowPat((s) => !s)}
            aria-label={showPat ? t("Masquer le jeton") : t("Afficher le jeton")}
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
            {showPat ? t("Masquer") : t("Afficher")}
          </button>
          </div>
        </div>
        <label
          style={{
            width: "100%",
            display: "flex",
            alignItems: "center",
            gap: 8,
            color: "var(--muted)",
            fontSize: 13,
            cursor: "pointer",
          }}
        >
          <input
            type="checkbox"
            checked={remember}
            onChange={(e) => setRemember(e.target.checked)}
            style={{ accentColor: "var(--accent)" }}
          />
          {t("Se souvenir de moi (30 jours)")}
        </label>
        <button
          type="submit"
          disabled={loading || missing}
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
            cursor: loading || missing ? "default" : "pointer",
            opacity: loading || missing ? 0.55 : 1,
          }}
        >
          {loading ? t("Connexion…") : t("Se connecter")}
        </button>
        {!loading && missing && (
          <p style={{ color: "var(--faint)", fontSize: 12, marginTop: -14 }}>
            {t("Renseignez l'organisation et le jeton pour activer la connexion.")}
          </p>
        )}
        {/* ponytail: <details> natif — pas d'état, la notice reste repliée par défaut. */}
        <details style={{ width: "100%", textAlign: "left", color: "var(--muted)", fontSize: 12 }}>
          <summary style={{ cursor: "pointer", textDecoration: "underline" }}>
            {t("Comment créer un PAT ?")}
          </summary>
          <ol style={{ margin: "10px 0 0", paddingLeft: 18, lineHeight: 1.7 }}>
            <li>
              {t("Dans Azure DevOps : avatar en haut à droite →")} <em>User settings</em> →{" "}
              <em>Personal access tokens</em>.
            </li>
            <li><strong>+ New Token</strong>{t(": un nom (ex. « Moires »), l'organisation ci-dessus, une expiration.")}</li>
            <li>
              <strong>Scopes</strong> → <em>Custom defined</em>{t(", puis cocher exactement :")}
              <ul style={{ margin: "4px 0 0", paddingLeft: 16 }}>
                <li><strong>Work Items</strong> → <em>Read &amp; write</em> {t("(lecture des sprints/boards, écriture des tickets)")}</li>
                <li><strong>Project and Team</strong> → <em>Read</em> {t("(liste des projets et des membres d'équipe)")}</li>
              </ul>
            </li>
            <li><strong>Create</strong>{t(", puis copier le jeton — il n'est affiché qu'une fois — et le coller ci-dessus.")}</li>
          </ol>
        </details>
      </form>
    </div>
  );
}
