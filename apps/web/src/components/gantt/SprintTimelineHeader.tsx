import type { Iteration } from "@moires/shared";
import { formatSprintRange } from "../../utils/dates";

interface Props {
  iterations: Iteration[];
  colWidthPx: number;
  rowHeaderWidth: number;
}

export function SprintTimelineHeader({ iterations, colWidthPx, rowHeaderWidth }: Props) {
  return (
    <div
      style={{
        display: "flex",
        position: "sticky",
        top: 0,
        zIndex: 10,
        background: "var(--surface)",
        borderBottom: "1px solid var(--border)",
      }}
    >
      {/* Corner cell */}
      <div
        style={{
          width: rowHeaderWidth,
          minWidth: rowHeaderWidth,
          position: "sticky",
          left: 0,
          zIndex: 11,
          background: "var(--surface)",
          borderRight: "1px solid var(--border)",
        }}
      />
      {iterations.map((it) => (
        <div
          key={it.path}
          style={{
            width: colWidthPx,
            minWidth: colWidthPx,
            padding: "6px 8px",
            textAlign: "center",
            borderRight: "1px solid var(--grid-line)",
          }}
        >
          <div
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: "var(--text)",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {it.name}
          </div>
          <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
            {formatSprintRange(it.startDate, it.finishDate)}
          </div>
        </div>
      ))}
    </div>
  );
}
