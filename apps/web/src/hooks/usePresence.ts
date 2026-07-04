import { useEffect } from "react";
import { usePresenceStore } from "../stores/presence.store";
import { initPresenceListeners, emitPresence } from "../services/presence.client";
import type { PresenceState } from "@moirai/shared";

export function usePresence(userId: string, displayName: string, color: string) {
  const peers = usePresenceStore((s) => s.peers);

  useEffect(() => {
    initPresenceListeners();
  }, []);

  const updatePresence = (partial: Partial<PresenceState>) => {
    emitPresence({
      userId,
      displayName,
      color,
      action: "idle",
      targetTicketId: null,
      ...partial,
    });
  };

  return { peers, updatePresence };
}
