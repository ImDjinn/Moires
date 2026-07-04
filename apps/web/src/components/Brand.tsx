// Logo Moires : triquetra — trois fils entrelacés, les trois Moires tissant le fil de la vie.
export function MoiresMark({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" aria-hidden>
      <g stroke="currentColor" strokeWidth={8} strokeLinejoin="round" strokeLinecap="round">
        <path d="M50 16 A34 34 0 0 1 79.44 67 A34 34 0 0 1 50 16 Z" />
        <path d="M79.44 67 A34 34 0 0 1 20.56 67 A34 34 0 0 1 79.44 67 Z" />
        <path d="M20.56 67 A34 34 0 0 1 50 16 A34 34 0 0 1 20.56 67 Z" />
        <circle cx="50" cy="50" r="4.5" fill="currentColor" stroke="none" />
      </g>
    </svg>
  );
}

export function Brand({ size = 26, wordmark = true }: { size?: number; wordmark?: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 9, color: "var(--accent,#5b5bd6)", flex: "0 0 auto" }}>
      <MoiresMark size={size} />
      {wordmark && (
        <span style={{ fontSize: size * 0.72, fontWeight: 700, letterSpacing: "-0.01em", color: "var(--ink,#1a1a20)" }}>
          Moires
        </span>
      )}
    </div>
  );
}
