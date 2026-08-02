// Écran d'attente plein page : un texte nu se lit comme un écran cassé.
// Indicateur animé + statut annoncé (l'animation est neutralisée par la règle
// prefers-reduced-motion globale d'index.css).
export function LoadingScreen({ label }: { label: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, height: "100dvh" }}
    >
      <span
        aria-hidden="true"
        style={{
          width: 15, height: 15, borderRadius: "50%",
          border: "2px solid var(--accent)", borderTopColor: "transparent",
          animation: "ggspin .7s linear infinite",
        }}
      />
      <span style={{ color: "var(--text-muted)" }}>{label}</span>
    </div>
  );
}
