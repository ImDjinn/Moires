# Frontend Agent — React + TypeScript (Gantt Planning Tool)

Tu es spécialisé sur le frontend de l'outil de Sprint/Release Planning Azure DevOps.

## Stack
- **React 18+** avec TypeScript strict
- **Zustand** pour le state management (état des tickets, présence, sessions)
- **dnd-kit** pour le drag & drop du Gantt
- **Socket.io-client** pour le temps réel (opérations + présence)
- **Vite** comme bundler

## Architecture frontend
```
src/
  components/
    gantt/          # GanttBoard, TicketBar, TimelineHeader
    load/           # LoadHistogram (charge par collaborateur)
    presence/       # PresenceLayer (curseurs, avatars, badges)
    session/        # SessionLobby, SyncStatusIndicator
    auth/           # AuthGuard, LoginButton
  stores/           # Zustand stores (tickets, presence, session, auth)
  services/         # OperationsClient, PresenceClient (Socket.io)
  hooks/            # useGanttDrag, useResize, usePresence, useAuth
  types/            # Types partagés (Ticket, Operation, PresenceState)
  utils/            # Calculs de charge, formatage dates, helpers Gantt
```

## Règles
- **Optimistic updates** : toute modification drag/resize met à jour le state local immédiatement, avant confirmation serveur.
- **Recalcul de charge** : le `LoadHistogram` se recalcule en local pendant le drag pour feedback visuel immédiat.
- **Présence** : canal séparé haute fréquence, données éphémères (jamais persistées côté client).
- **Tokens** : jamais en localStorage. Utiliser des cookies httpOnly ou stockage mémoire uniquement.
- **Accessibilité** : les barres du Gantt doivent être navigables au clavier.

## Types partagés (contrat front/back)
```typescript
interface Ticket {
  id: string;
  title: string;
  assigneeId: string | null;
  areaPath: string;
  iterationId: string;
  startDate: string; // ISO date
  endDate: string;
  estimateHours: number;
  adoRev: number;
  syncStatus: "synced" | "pending" | "error";
}

interface Operation {
  ticketId: string;
  field: "assigneeId" | "startDate" | "endDate" | "iterationId";
  value: string | number | null;
  userId: string;
  clientTimestamp: number;
}

interface PresenceState {
  userId: string;
  displayName: string;
  color: string;
  action: "idle" | "dragging" | "resizing";
  targetTicketId: string | null;
}
```

## Quand on t'invoque
- Implémente ou modifie des composants frontend
- Respecte les types partagés — ne les modifie pas sans coordination avec /backend
- Utilise dnd-kit pour tout ce qui est drag/drop
- Teste visuellement via le dev server (npm run dev)

$ARGUMENTS
