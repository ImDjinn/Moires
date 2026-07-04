import { useMemo } from "react";
import type { Ticket, Iteration, Operation } from "@moirai/shared";
import { buildRows, cellTickets, epicSpan } from "../../utils/grouping";
import { useBoardDnd } from "../../hooks/useBoardDnd";
import { SprintTimelineHeader } from "./SprintTimelineHeader";
import { TicketCard } from "./TicketCard";

const ROW_HEADER_W = 200;
const COL_W = 160;

interface Props {
  tickets: Ticket[];
  iterations: Iteration[];
  onOperation: (op: Operation) => void;
  userId: string;
}

export function EpicBoard({ tickets, iterations, onOperation, userId }: Props) {
  const { peerEditing, moveTicket, handleDrop } = useBoardDnd(tickets, iterations, onOperation, userId);

  const validIds = useMemo(() => new Set<string>(), []);
  const rows = useMemo(() => buildRows(tickets, [], "epic"), [tickets]);

  const labelCellStyle: React.CSSProperties = {
    width: ROW_HEADER_W,
    minWidth: ROW_HEADER_W,
    position: "sticky",
    left: 0,
    zIndex: 2,
    background: "var(--bg)",
    borderRight: "1px solid var(--border)",
    padding: "8px 12px",
    fontSize: 13,
  };

  const cardStack = (cellTks: Ticket[]) => (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      {cellTks.map((t) => (
        <TicketCard
          key={t.id}
          ticket={t}
          onMove={(dir) => moveTicket(t, dir)}
          peerEditing={peerEditing.get(t.id) || null}
        />
      ))}
    </div>
  );

  return (
    <div style={{ flex: 1, overflow: "auto" }}>
      <div style={{ minWidth: ROW_HEADER_W + iterations.length * COL_W }}>
        <SprintTimelineHeader
          iterations={iterations}
          colWidthPx={COL_W}
          rowHeaderWidth={ROW_HEADER_W}
        />

        {iterations.length === 0 && (
          <div style={{ padding: 24, color: "var(--text-muted)", fontSize: 13 }}>
            Aucune itération datée dans ce projet.
          </div>
        )}

        {rows.map((row) => {
          const span = epicSpan(tickets, row.id, iterations);
          return (
            <div key={row.id} style={{ borderBottom: "1px solid var(--border)" }}>
              {/* Barre récap de l'Epic */}
              <div style={{ display: "flex" }}>
                <div style={{ ...labelCellStyle, fontWeight: 600, padding: "6px 12px" }}>
                  {row.label}
                </div>
                <div style={{ position: "relative", width: iterations.length * COL_W, height: 26 }}>
                  {span && (
                    <div
                      style={{
                        position: "absolute",
                        top: 4,
                        left: span.start * COL_W + 4,
                        width: (span.end - span.start + 1) * COL_W - 8,
                        height: 18,
                        background: "var(--accent)",
                        opacity: 0.8,
                        borderRadius: "var(--radius-bar)",
                      }}
                    />
                  )}
                </div>
              </div>
              {/* Cartes par colonne de sprint */}
              <div style={{ display: "flex" }}>
                <div style={{ ...labelCellStyle, padding: 0 }} />
                {iterations.map((it) => (
                  <div
                    key={it.path}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => handleDrop(it.path, e)}
                    style={{
                      width: COL_W,
                      minWidth: COL_W,
                      padding: 6,
                      borderRight: "1px solid var(--grid-line)",
                    }}
                  >
                    {cardStack(cellTickets(tickets, row.id, it.path, "epic", validIds))}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
