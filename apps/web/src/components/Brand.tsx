// Logo Moires « Le Fuseau » (Claude Design) : trois anneaux de fil enroulé, le fil s'échappant en haut à droite.
export function MoiraiMark({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" aria-hidden>
      <g stroke="currentColor" strokeWidth={3.5} strokeLinecap="round" strokeDasharray="78 22" opacity={0.35}>
        <circle cx="32" cy="32" r="25" pathLength={100} transform="rotate(-30 32 32)" />
        <circle cx="32" cy="32" r="17" pathLength={100} transform="rotate(110 32 32)" />
        <circle cx="32" cy="32" r="9" pathLength={100} transform="rotate(250 32 32)" />
      </g>
      <circle cx="32" cy="32" r="3.5" fill="currentColor" />
      <path d="M 53.6 19.5 L 61 12" stroke="currentColor" strokeWidth={3.5} strokeLinecap="round" />
    </svg>
  );
}

export function Brand({ size = 26, wordmark = true }: { size?: number; wordmark?: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 9, color: "var(--accent,#5b5bd6)", flex: "0 0 auto" }}>
      <MoiraiMark size={size} />
      {wordmark && (
        <span style={{ fontSize: size * 0.72, fontWeight: 700, letterSpacing: "-0.01em", color: "var(--ink,#1a1a20)" }}>
          Moirai
        </span>
      )}
    </div>
  );
}
