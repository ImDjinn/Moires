import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { Ticket } from "@moires/shared";
import { TicketBar } from "./TicketBar";

function ticket(partial: Partial<Ticket> = {}): Ticket {
  return {
    id: "t1",
    title: "Ticket 1",
    assigneeId: "m1",
    areaPath: "",
    iterationId: "it1",
    startDate: "2026-06-10",
    endDate: "2026-06-10",
    estimateHours: 8,
    adoRev: 1,
    syncStatus: "synced",
    ...partial,
  };
}

function renderBar(t: Ticket, onOperation = vi.fn()) {
  render(
    <TicketBar
      ticket={t}
      rowIndex={0}
      dayWidthPx={40}
      rangeStart="2026-06-10"
      onOperation={onOperation}
      userId="u1"
    />,
  );
  return onOperation;
}

describe("TicketBar", () => {
  it("affiche le titre et une étiquette accessible", () => {
    renderBar(ticket());
    expect(screen.getByText("Ticket 1")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Ticket 1/ })).toBeInTheDocument();
  });

  it("positionne et dimensionne la barre selon les dates", () => {
    renderBar(ticket({ startDate: "2026-06-10", endDate: "2026-06-10" }));
    const bar = screen.getByRole("button", { name: /Ticket 1/ });
    expect(bar.style.left).toBe("0px");
    expect(bar.style.width).toBe("40px");
  });

  it("flèche droite déplace le ticket (startDate + endDate)", () => {
    const onOperation = renderBar(ticket());
    const bar = screen.getByRole("button", { name: /Ticket 1/ });
    fireEvent.keyDown(bar, { key: "ArrowRight" });
    expect(onOperation).toHaveBeenCalledWith(
      expect.objectContaining({ field: "startDate", value: "2026-06-11" }),
    );
    expect(onOperation).toHaveBeenCalledWith(
      expect.objectContaining({ field: "endDate", value: "2026-06-11" }),
    );
  });

  it("Shift+flèche droite redimensionne (endDate seule)", () => {
    const onOperation = renderBar(ticket());
    const bar = screen.getByRole("button", { name: /Ticket 1/ });
    fireEvent.keyDown(bar, { key: "ArrowRight", shiftKey: true });
    expect(onOperation).toHaveBeenCalledTimes(1);
    expect(onOperation).toHaveBeenCalledWith(
      expect.objectContaining({ field: "endDate", value: "2026-06-11" }),
    );
  });

  it("statut error => indicateur d'erreur", () => {
    renderBar(ticket({ syncStatus: "error" }));
    expect(screen.getByTitle(/Erreur de sync/)).toBeInTheDocument();
  });

  it("badge d'édition d'un pair", () => {
    render(
      <TicketBar
        ticket={ticket()}
        rowIndex={0}
        dayWidthPx={40}
        rangeStart="2026-06-10"
        onOperation={vi.fn()}
        userId="u1"
        peerEditing={{ color: "#FF6B6B", displayName: "Bob" }}
      />,
    );
    expect(screen.getByText("B")).toBeInTheDocument();
  });
});
