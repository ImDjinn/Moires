import type { PresenceState } from "@moires/shared";
import { getSocket } from "./operations.client";
import { usePresenceStore } from "../stores/presence.store";

let lastEmit = 0;
const THROTTLE_MS = 50;

export function initPresenceListeners() {
  const socket = getSocket();
  if (!socket) return;

  // Liste faisant autorité, reçue à chaque (re)connexion : resynchronise après
  // une coupure réseau ou un redéploiement de l'API.
  socket.on("presence:sync", (peers) => {
    usePresenceStore.getState().setPeers(peers);
  });

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

// ponytail: seuil fixe avant de passer inactif — à régler ici si trop court/long.
export const AWAY_MS = 2 * 60 * 1000;

/**
 * Marque l'utilisateur inactif chez les autres quand son onglet est masqué
 * depuis AWAY_MS (grisé, à la Google Docs), et actif dès qu'il y revient.
 * `visibilityState` suffit : pas de heartbeat, la fermeture de l'onglet reste
 * couverte par le disconnect socket. Renvoie la fonction de désinscription.
 */
export function trackAway(me: PresenceState): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  // Ces transitions sont rares et ne doivent jamais être avalées : on émet sans
  // passer par le throttle.
  const send = (action: PresenceState["action"]) =>
    getSocket()?.emit("presence:update", { ...me, action, targetTicketId: null, cursor: undefined });
  const onVisibility = () => {
    clearTimeout(timer);
    if (document.hidden) timer = setTimeout(() => send("away"), AWAY_MS);
    else send("idle");
  };
  // Un board ouvert dans un onglet d'arrière-plan démarre déjà masqué.
  onVisibility();
  document.addEventListener("visibilitychange", onVisibility);
  return () => {
    clearTimeout(timer);
    document.removeEventListener("visibilitychange", onVisibility);
  };
}
