import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SyncStatusIndicator } from "./SyncStatusIndicator";

describe("SyncStatusIndicator", () => {
  it("synced => pastille verte", () => {
    render(<SyncStatusIndicator status="synced" />);
    expect(screen.getByTitle("Synchronisé")).toHaveTextContent("●");
  });

  it("pending => pastille d'attente", () => {
    render(<SyncStatusIndicator status="pending" />);
    expect(screen.getByTitle("En attente de sync")).toBeInTheDocument();
  });

  it("error => avertissement cliquable qui déclenche onRetry", () => {
    const onRetry = vi.fn();
    render(<SyncStatusIndicator status="error" onRetry={onRetry} />);
    const el = screen.getByTitle(/Erreur de sync/);
    fireEvent.click(el);
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
