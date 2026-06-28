export interface PresenceState {
  userId: string;
  displayName: string;
  color: string;
  action: "idle" | "dragging" | "resizing";
  targetTicketId: string | null;
  cursor?: { x: number; y: number };
}
