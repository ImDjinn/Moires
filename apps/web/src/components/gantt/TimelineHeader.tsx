import { generateDays, isWeekend } from "../../utils/dates";

interface Props {
  rangeStart: string;
  rangeEnd: string;
  dayWidthPx: number;
}

export function TimelineHeader({ rangeStart, rangeEnd, dayWidthPx }: Props) {
  const days = generateDays(rangeStart, rangeEnd);

  return (
    <div style={{
      display: "flex",
      height: 40,
      position: "sticky",
      top: 0,
      zIndex: 10,
      background: "var(--surface)",
      borderBottom: "1px solid var(--border)",
    }}>
      {days.map((day) => (
        <div
          key={day}
          style={{
            width: dayWidthPx,
            minWidth: dayWidthPx,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 11,
            color: isWeekend(day) ? "var(--text-muted)" : "var(--text)",
            background: isWeekend(day) ? "var(--grid-weekend)" : "transparent",
            borderRight: "1px solid var(--grid-line)",
          }}
        >
          {dayWidthPx >= 30 ? new Date(day).toLocaleDateString("fr", { day: "numeric", month: "short" }) : ""}
        </div>
      ))}
    </div>
  );
}
