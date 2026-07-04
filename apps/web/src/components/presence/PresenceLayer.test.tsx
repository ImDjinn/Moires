import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import type { PresenceState } from "@moirai/shared";
import { PresenceLayer } from "./PresenceLayer";

function peer(partial: Partial<PresenceState>): PresenceState {
  return {
    userId: "u1",
    displayName: "Alice",
    color: "#FF6B6B",
    action: "idle",
    targetTicketId: null,
    ...partial,
  };
}

describe("PresenceLayer", () => {
  it("rend un curseur nommé pour un pair avec position", () => {
    render(<PresenceLayer peers={[peer({ cursor: { x: 10, y: 20 } })]} />);
    expect(screen.getByText("Alice")).toBeInTheDocument();
  });

  it("ne rend rien pour un pair sans curseur", () => {
    render(<PresenceLayer peers={[peer({ cursor: undefined })]} />);
    expect(screen.queryByText("Alice")).not.toBeInTheDocument();
  });
});
