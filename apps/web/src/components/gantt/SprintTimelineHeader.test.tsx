import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import type { Iteration } from "@moires/shared";
import { SprintTimelineHeader } from "./SprintTimelineHeader";

const iterations: Iteration[] = [
  { id: "1", name: "Sprint 1", path: "P\\S1", startDate: "2026-06-29", finishDate: "2026-07-12" },
  { id: "2", name: "Sprint 2", path: "P\\S2", startDate: "2026-07-13", finishDate: "2026-07-26" },
];

describe("SprintTimelineHeader", () => {
  it("affiche le nom et la plage de dates de chaque sprint", () => {
    render(<SprintTimelineHeader iterations={iterations} colWidthPx={160} rowHeaderWidth={200} />);
    expect(screen.getByText("Sprint 1")).toBeInTheDocument();
    expect(screen.getByText("29/06 – 12/07")).toBeInTheDocument();
    expect(screen.getByText("Sprint 2")).toBeInTheDocument();
  });

  it("rend une colonne d'en-tête par itération (+ cellule d'angle)", () => {
    const { container } = render(
      <SprintTimelineHeader iterations={iterations} colWidthPx={160} rowHeaderWidth={200} />,
    );
    // 1 cellule d'angle + 2 colonnes de sprint
    expect((container.firstChild as HTMLElement).childElementCount).toBe(3);
  });
});
