import { useMemo } from "react";
import type { Ticket, TeamMember } from "@moires/shared";
import { generateDays } from "../../utils/dates";
import { computeLoadPerDay, getLoadColor } from "../../utils/load";

interface Props {
  tickets: Ticket[];
  teamMembers: TeamMember[];
  rangeStart: string;
  rangeEnd: string;
  dayWidthPx: number;
}

export function LoadHistogram({ tickets, teamMembers, rangeStart, rangeEnd, dayWidthPx }: Props) {
  const days = generateDays(rangeStart, rangeEnd);

  const loadData = useMemo(() => {
    return days.map((date) => {
      let totalHours = 0;
      let totalCapacity = 0;
      for (const member of teamMembers) {
        const dayLoad = computeLoadPerDay(tickets, member, date, date);
        if (dayLoad.length) {
          totalHours += dayLoad[0].hours;
          totalCapacity += dayLoad[0].capacity;
        }
      }
      const ratio = totalCapacity > 0 ? totalHours / totalCapacity : 0;
      return { date, totalHours, totalCapacity, ratio };
    });
  }, [tickets, teamMembers, days]);

  const maxHours = Math.max(...loadData.map((d) => d.totalHours), 1);

  return (
    <div style={{
      height: 120,
      position: "sticky",
      bottom: 0,
      background: "var(--surface)",
      borderTop: "1px solid var(--border)",
      display: "flex",
      alignItems: "flex-end",
      paddingLeft: 160,
    }}>
      {loadData.map((d, i) => {
        const barH = (d.totalHours / maxHours) * 100;
        const capLineY = d.totalCapacity > 0 ? (d.totalCapacity / maxHours) * 100 : 0;
        return (
          <div
            key={d.date}
            style={{
              width: dayWidthPx,
              minWidth: dayWidthPx,
              height: "100%",
              position: "relative",
              display: "flex",
              alignItems: "flex-end",
              justifyContent: "center",
              borderRight: "1px solid var(--grid-line)",
            }}
          >
            <div
              style={{
                width: dayWidthPx - 4,
                height: `${barH}%`,
                background: getLoadColor(d.ratio),
                borderRadius: "3px 3px 0 0",
                opacity: 0.8,
              }}
            />
            {capLineY > 0 && (
              <div
                style={{
                  position: "absolute",
                  bottom: `${capLineY}%`,
                  left: 0,
                  right: 0,
                  borderTop: "1px dashed var(--text-muted)",
                }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
