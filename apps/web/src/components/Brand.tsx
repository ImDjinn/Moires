// Logo Moires : le fuseau — trois fils convergeant au centre, les Moirai filant la vie.
export function MoiraiMark({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" aria-hidden>
      <g stroke="currentColor" strokeWidth={3.5} strokeLinecap="round" opacity={0.35}>
        <circle cx="32" cy="32" r="26" />
        <path d="M 32 6 C 30 16, 34 24, 32 32 M 9.5 45 C 18 42, 25 38, 32 32 M 54.5 45 C 46 42, 39 38, 32 32" />
      </g>
      <circle cx="32" cy="32" r="5" fill="currentColor" />
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
