export function LoginButton() {
  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      height: "100vh",
      flexDirection: "column",
      gap: "24px",
    }}>
      <h1 style={{ fontSize: "32px", fontWeight: 600 }}>Moires</h1>
      <p style={{ color: "var(--text-muted)" }}>Planification collaborative de sprint</p>
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
