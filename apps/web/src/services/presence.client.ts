import type { PresenceState } from "@moirai/shared";
import { getSocket } from "./operations.client";
import { usePresenceStore } from "../stores/presence.store";

let lastEmit = 0;
const THROTTLE_MS = 50;

export function initPresenceListeners() {
  const socket = getSocket();
  if (!socket) return;

  socket.on("presence:broadcast", (p) => {
    usePresenceStore.getState().updatePeer(p);
  });

  socket.on("presence:user-joined", (p) => {
    usePresenceStore.getState().addPeer(p);
  });

  socket.on("presence:user-left", ({ userId }) => {
    usePresenceStore.getState().removePeer(userId);
  });
}

export function emitPresence(p: PresenceState) {
  const now = Date.now();
  if (now - lastEmit < THROTTLE_MS) return;
  lastEmit = now;
  getSocket()?.emit("presence:update", p);
}
