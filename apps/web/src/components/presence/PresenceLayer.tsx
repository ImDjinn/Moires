import type { PresenceState } from "@moirai/shared";

interface Props {
  peers: PresenceState[];
}

export function PresenceLayer({ peers }: Props) {
  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 20 }}>
      {peers.map((p) =>
        p.cursor ? (
          <div
            key={p.userId}
            style={{
              position: "absolute",
              left: p.cursor.x,
              top: p.cursor.y,
              transition: "left 0.1s, top 0.1s",
            }}
          >
            <svg width="16" height="20" viewBox="0 0 16 20" style={{ fill: p.color }}>
              <path d="M0 0L16 12L8 12L4 20L0 0Z" />
            </svg>
            <span style={{
              display: "block",
              background: p.color,
              color: "#fff",
              fontSize: 10,
              padding: "1px 4px",
              borderRadius: 3,
              marginTop: -2,
              marginLeft: 12,
              whiteSpace: "nowrap",
            }}>
              {p.displayName}
            </span>
          </div>
        ) : null,
      )}
    </div>
  );
}
