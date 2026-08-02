export interface PresenceState {
  userId: string;
  displayName: string;
  color: string;
  action: "idle" | "dragging" | "resizing" | "away";
  targetTicketId: string | null;
  cursor?: { x: number; y: number };
}
