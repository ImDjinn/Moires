import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { TimelineHeader } from "./TimelineHeader";

describe("TimelineHeader", () => {
  it("rend une cellule par jour de la plage", () => {
    const { container } = render(
      <TimelineHeader rangeStart="2026-06-10" rangeEnd="2026-06-12" dayWidthPx={40} />,
    );
    const root = container.firstChild as HTMLElement;
    expect(root.childElementCount).toBe(3);
  });

  it("affiche les libellés de date quand la colonne est assez large", () => {
    const { container } = render(
      <TimelineHeader rangeStart="2026-06-10" rangeEnd="2026-06-10" dayWidthPx={40} />,
    );
    // dayWidth >= 30 => libellé non vide
    expect((container.firstChild as HTMLElement).textContent).not.toBe("");
  });

  it("colonnes vides quand trop étroites", () => {
    const { container } = render(
      <TimelineHeader rangeStart="2026-06-10" rangeEnd="2026-06-10" dayWidthPx={10} />,
    );
    expect((container.firstChild as HTMLElement).textContent).toBe("");
  });
});
