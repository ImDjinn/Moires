# Implementation Plan — Moirai (ADO Sprint/Release Planning)

> Plan technique d'implémentation. Découpé par couche pour permettre à plusieurs agents
> (`/database`, `/backend`, `/realtime`, `/ado-sync`, `/frontend`) de travailler en parallèle.
> Le plan UI/UX vit dans [`DESIGN_PLAN.md`](./DESIGN_PLAN.md).

---

## 1. Goal

Construire un outil web temps réel multi-utilisateur qui affiche la charge d'un sprint sous forme de Gantt collaboratif (drag/resize façon Figma), avec Azure DevOps comme source de vérité (lecture initiale + write-back par champ).

---

## 2. Constraints

Non-négociables (issus de `CLAUDE.md` et des définitions d'agents `.claude/commands/*`) :

- **Stack imposée** : back = NestJS + TypeScript strict, Prisma + PostgreSQL, ioredis, `@nestjs/websockets` (Socket.io), BullMQ, `@azure/msal-node`. Front = React 18 + TS strict, Zustand, dnd-kit, socket.io-client, Vite.
- **Monorepo** : un package `shared` contient les types front/back ; **ces types ne sont jamais dupliqués ni modifiés sans coordination**.
- **Sécurité** : les tokens ADO/Azure AD ne transitent jamais vers le client et ne sont jamais en `localStorage` (cookie httpOnly / session backend / mémoire). Toute opération est ré-autorisée côté serveur, jamais sur la seule foi du front.
- **Modèle d'opération atomique** : chaque modification visuelle = 1 `Operation` sur 1 champ précis. Conflits = FIFO + last-write-wins. Pas de verrou global de document.
- **Découplage write-back** : l'écriture ADO passe par une queue BullMQ (retry + backoff), jamais inline dans le flux WebSocket.
- **Snapshot, pas replay** : entrée en session et reconnexion renvoient un snapshot complet (sessions courtes), pas un replay d'opérations.
- **Surgical changes** (CLAUDE.md §3) : chaque ligne modifiée trace vers une TODO. Pas d'abstraction spéculative, pas de configurabilité non demandée.
- **Goal-driven** (CLAUDE.md §4) : chaque TODO a une commande de vérification.

---

## 3. Impacted files

Projet vierge : **tous les fichiers sont créés**. Arborescence cible du monorepo (pnpm workspaces) :

```
package.json                      # workspaces: packages/*, apps/*
pnpm-workspace.yaml
tsconfig.base.json
docker-compose.yml                # postgres + redis pour le dev local
.env.example

packages/shared/
  package.json
  src/
    index.ts
    ticket.ts                     # interface Ticket
    operation.ts                  # interface Operation
    presence.ts                   # interface PresenceState
    socket-events.ts             # noms d'événements + payloads typés
    dto.ts                        # DTOs REST partagés (CreateSession, Snapshot…)

apps/api/                         # NestJS
  package.json
  prisma/
    schema.prisma                 # users, planning_sessions, operations_log, tickets_cache
    migrations/
  src/
    main.ts
    app.module.ts
    config/                       # env validation (zod/joi)
    database/
      prisma.service.ts
      redis.service.ts            # ioredis + helpers clés session:{id}:*
    auth/
      auth.module.ts
      auth.controller.ts          # /auth/login, /auth/callback, /auth/refresh
      auth.service.ts             # MSAL
      auth.guard.ts
    ado/
      ado.module.ts
      ado.controller.ts           # /ado/projects, /iterations, /areas, /team-members
      ado.service.ts              # client REST ADO (WIQL, batch, capacities)
      ado.mapper.ts               # ADO field <-> Ticket
    sessions/
      sessions.module.ts
      sessions.controller.ts      # POST /sessions, GET /:id, /:id/sync, /:id/audit-log
      sessions.service.ts         # state manager Redis + Postgres
    sync/
      sync.module.ts
      sync.service.ts             # sync initiale + incrémentale (polling)
    writeback/
      writeback.module.ts
      writeback.processor.ts      # BullMQ worker -> PATCH ADO
      writeback.service.ts        # enqueue jobs
    realtime/
      realtime.module.ts
      realtime.gateway.ts         # operations + presence channels
      operations.handler.ts
      presence.handler.ts

apps/web/                         # React + Vite
  package.json
  index.html
  vite.config.ts
  src/
    main.tsx
    App.tsx
    types/                        # ré-exporte depuis @moirai/shared
    stores/
      auth.store.ts
      session.store.ts
      tickets.store.ts
      presence.store.ts
    services/
      rest.client.ts
      operations.client.ts        # socket.io operations channel
      presence.client.ts          # socket.io presence channel
    hooks/
      useAuth.ts
      useGanttDrag.ts
      useResize.ts
      usePresence.ts
    utils/
      load.ts                     # calcul de charge par collaborateur
      dates.ts                    # mapping date <-> position X
    components/
      auth/{AuthGuard.tsx,LoginButton.tsx}
      session/{SessionLobby.tsx,SyncStatusIndicator.tsx}
      gantt/{GanttBoard.tsx,TimelineHeader.tsx,TicketBar.tsx}
      load/LoadHistogram.tsx
      presence/PresenceLayer.tsx
```

---

## 4. Component contracts

### 4.1 Types partagés — `packages/shared` (source unique de vérité)

```typescript
// ticket.ts
export interface Ticket {
  id: string;                 // ADO work item ID
  title: string;
  assigneeId: string | null;
  areaPath: string;
  iterationId: string;
  startDate: string;          // ISO date
  endDate: string;            // ISO date
  estimateHours: number;
  adoRev: number;             // System.Rev — détection de modif concurrente
  syncStatus: "synced" | "pending" | "error";
}

// operation.ts
export type OperationField = "assigneeId" | "startDate" | "endDate" | "iterationId";
export interface Operation {
  ticketId: string;
  field: OperationField;
  value: string | number | null;
  userId: string;
  clientTimestamp: number;
}

// presence.ts
export interface PresenceState {
  userId: string;
  displayName: string;
  color: string;
  action: "idle" | "dragging" | "resizing";
  targetTicketId: string | null;
  cursor?: { x: number; y: number };
}
```

### 4.2 Contrats Socket.io — `socket-events.ts`

```typescript
export const ROOM = (sessionId: string) => `session:${sessionId}`;

export interface ClientToServer {
  "operation:submit": (op: Operation) => void;
  "presence:update": (p: PresenceState) => void;
}
export interface ServerToClient {
  "operation:applied":  (op: Operation & { serverTimestamp: number }) => void;
  "operation:rejected": (payload: { op: Operation; reason: string }) => void;
  "presence:broadcast": (p: PresenceState) => void;
  "presence:user-joined": (p: Pick<PresenceState,"userId"|"displayName"|"color">) => void;
  "presence:user-left":   (payload: { userId: string }) => void;
}
```

### 4.3 Contrats REST — `dto.ts`

```typescript
export interface CreateSessionDto { adoProjectId: string; adoIterationIds: string[]; areaPaths?: string[]; }
export interface SessionSnapshot  { sessionId: string; tickets: Ticket[]; participants: PresenceState[]; teamMembers: TeamMember[]; }
export interface TeamMember       { id: string; displayName: string; capacityHoursPerDay: number; }
export interface AuditEntry       { id: string; ticketId: string; field: OperationField; oldValue: unknown; newValue: unknown; performedBy: string; performedAt: string; adoSyncStatus: "pending"|"synced"|"failed"; }
```

REST surface (NestJS controllers) :

| Verbe + route | Body / Params | Réponse |
|---|---|---|
| `GET /auth/login` | — | 302 vers Azure AD |
| `GET /auth/callback` | `?code` | 302 vers front (cookie session) |
| `POST /auth/refresh` | — | `204` |
| `GET /ado/projects` | — | `{ id, name }[]` |
| `GET /ado/projects/:id/iterations` | — | `{ id, name, startDate, finishDate }[]` |
| `GET /ado/projects/:id/areas` | — | `{ path }[]` |
| `GET /ado/projects/:id/team-members` | — | `TeamMember[]` |
| `POST /sessions` | `CreateSessionDto` | `SessionSnapshot` |
| `GET /sessions/:id` | — | `SessionSnapshot` |
| `POST /sessions/:id/sync` | — | `SessionSnapshot` |
| `GET /sessions/:id/audit-log` | — | `AuditEntry[]` |

### 4.4 Contrats de services backend (signatures)

```typescript
// ado.service.ts
queryWorkItemIds(projectId: string, iterationIds: string[], areaPaths?: string[]): Promise<string[]>;
getWorkItemsBatch(ids: string[]): Promise<RawAdoWorkItem[]>;        // <=200/appel
getCapacities(projectId: string, iterationId: string): Promise<TeamMember[]>;
patchWorkItem(id: string, field: OperationField, value: unknown, expectedRev: number): Promise<number>; // -> new rev

// ado.mapper.ts
toTicket(raw: RawAdoWorkItem): Ticket;
toJsonPatch(field: OperationField, value: unknown): { op: "replace"; path: string; value: unknown }[];

// sessions.service.ts (Redis state manager)
createSession(dto: CreateSessionDto, userId: string): Promise<SessionSnapshot>;
getSnapshot(sessionId: string): Promise<SessionSnapshot>;
applyOperation(sessionId: string, op: Operation): Promise<Ticket>;  // valide + écrit Redis + log + enqueue
listParticipants(sessionId: string): Promise<string[]>;

// writeback.service.ts
enqueue(sessionId: string, op: Operation, logId: string): Promise<void>;
```

### 4.5 Contrats de composants frontend (props)

```typescript
GanttBoard:    { tickets: Ticket[]; teamMembers: TeamMember[]; rangeStart: string; rangeEnd: string }
TimelineHeader:{ rangeStart: string; rangeEnd: string; dayWidthPx: number }
TicketBar:     { ticket: Ticket; rowIndex: number; dayWidthPx: number; onOperation: (op: Operation) => void }
LoadHistogram: { tickets: Ticket[]; teamMembers: TeamMember[]; rangeStart: string; rangeEnd: string }
PresenceLayer: { peers: PresenceState[] }
SyncStatusIndicator: { status: Ticket["syncStatus"]; onRetry?: () => void }
SessionLobby:  { onEnter: (snapshot: SessionSnapshot) => void }
AuthGuard:     { children: React.ReactNode }
```

---

## 5. TODO list

Ordonné par dépendance. Chaque TODO est atomique (~30 min, un agent, un tour) avec une commande de vérification. `dep:` = TODO préalables obligatoires.

### Phase 0 — Scaffolding (`/backend` ou généraliste)

- [ ] **T0.1** Init monorepo pnpm : `package.json` racine (workspaces `packages/*`, `apps/*`), `pnpm-workspace.yaml`, `tsconfig.base.json` (strict), `.env.example`, `docker-compose.yml` (postgres:16 + redis:7).
  → *verify* : `pnpm install` réussit ; `docker compose config` valide.
- [ ] **T0.2** Package `@moirai/shared` : créer `ticket.ts`, `operation.ts`, `presence.ts`, `socket-events.ts`, `dto.ts` (§4.1–4.3), `index.ts` ré-exporte tout. `dep: T0.1`.
  → *verify* : `pnpm --filter @moirai/shared build` compile sans erreur TS.

### Phase 1 — Database (`/database`)

- [ ] **T1.1** `apps/api/prisma/schema.prisma` : modèles `users`, `planning_sessions`, `operations_log`, `tickets_cache` (cf. `.claude/commands/database.md`) + index `operations_log(session_id)`, `operations_log(ticket_id)`, `tickets_cache(iteration_id)`. Générer la migration initiale. `dep: T0.1`.
  → *verify* : `pnpm --filter api prisma migrate dev` crée les tables (vérifier via `prisma studio`).
- [ ] **T1.2** `database/redis.service.ts` : wrapper ioredis + helpers `ticketsKey/participantsKey/presenceKey(sessionId)`, TTL 24h, pipeline batch. `dep: T0.1`.
  → *verify* : test unitaire set/get sur `session:test:tickets` passe (`pnpm --filter api test redis`).

### Phase 2 — Backend core (`/backend`)

- [ ] **T2.1** Bootstrap NestJS : `main.ts`, `app.module.ts`, `config/` (validation env via zod), `PrismaService`. `dep: T1.1`.
  → *verify* : `pnpm --filter api start:dev` démarre ; `GET /health` répond 200.
- [ ] **T2.2** `auth/` : MSAL node, `/auth/login` (redirect), `/auth/callback` (échange code, upsert `users`, cookie httpOnly), `/auth/refresh`, `AuthGuard`. `dep: T2.1`.
  → *verify* : `/auth/login` renvoie 302 vers `login.microsoftonline.com` (test e2e mocké).
- [ ] **T2.3** `ado/ado.service.ts` + `ado.mapper.ts` : implémenter `queryWorkItemIds`, `getWorkItemsBatch`, `getCapacities`, `patchWorkItem`, `toTicket`, `toJsonPatch` (mapping cf. `ado-sync.md`). `ado.controller.ts` expose les 4 routes `/ado/*`. `dep: T2.2`.
  → *verify* : tests unitaires du mapper (raw ADO fixture → `Ticket`) passent.
- [ ] **T2.4** `sessions/` : `POST /sessions` (appelle sync initiale), `GET /:id` (snapshot Redis), `GET /:id/audit-log`, `applyOperation` (valide + Redis + log + enqueue). `dep: T2.3, T1.2`.
  → *verify* : test e2e `POST /sessions` (ADO mocké) retourne un `SessionSnapshot` non vide.

### Phase 3 — Sync & write-back (`/ado-sync`)

- [ ] **T3.1** `sync/sync.service.ts` : sync initiale (WIQL → batch → `toTicket` → `tickets_cache` + Redis) et `POST /sessions/:id/sync`. Polling incrémental (intervalle configurable) comparant `adoRev`. `dep: T2.3, T1.1, T1.2`.
  → *verify* : test : 3 work items mockés → 3 lignes `tickets_cache` + 3 entrées Redis.
- [ ] **T3.2** `writeback/` : queue BullMQ, `enqueue`, `writeback.processor.ts` (JSON Patch via `patchWorkItem`, vérifie `adoRev`, retry backoff exponentiel, `failed` après N essais → maj `operations_log`). `dep: T2.4, T2.3`.
  → *verify* : test : job réussi → `ado_sync_status='synced'` ; job en échec ×N → `'failed'`.

### Phase 4 — Realtime (`/realtime`)

- [ ] **T4.1** `realtime/realtime.gateway.ts` + `operations.handler.ts` : room `session:{id}`, `operation:submit` → `sessions.applyOperation` → broadcast `operation:applied` / `operation:rejected`. `dep: T2.4`.
  → *verify* : test e2e socket : 2 clients ; submit d'un client → l'autre reçoit `operation:applied`.
- [ ] **T4.2** `presence.handler.ts` + adaptateur Redis Socket.io : `presence:update` → `presence:broadcast` (sauf émetteur), `user-joined`/`user-left`, presence dans Redis (éphémère). `dep: T4.1, T1.2`.
  → *verify* : test e2e : `presence:update` reçu par les pairs, pas par l'émetteur.

### Phase 5 — Frontend (`/frontend`)

- [ ] **T5.1** Scaffold Vite+React+TS, `App.tsx`, les 4 stores Zustand (`auth`, `session`, `tickets`, `presence`) avec leurs sélecteurs. `dep: T0.2`.
  → *verify* : `pnpm --filter web dev` sert la page ; `pnpm --filter web build` compile.
- [ ] **T5.2** `services/rest.client.ts` (fetch credentials:include) + `components/auth/{AuthGuard,LoginButton}` + `hooks/useAuth.ts`. `dep: T5.1`.
  → *verify* : non authentifié → `AuthGuard` rend `LoginButton` ; mock 200 → rend children.
- [ ] **T5.3** `components/session/SessionLobby.tsx` : sélecteurs projet/itération/areas (REST `/ado/*`), `POST /sessions` → `onEnter(snapshot)`. `dep: T5.2`.
  → *verify* : flux mocké remplit `session.store` et déclenche `onEnter`.
- [ ] **T5.4** `gantt/GanttBoard.tsx` + `TimelineHeader.tsx` + `utils/dates.ts` : rendu lecture seule (lignes = membres, barres positionnées par date). `dep: T5.3`.
  → *verify* : fixture de N tickets → N barres aux bons X/row (test RTL).
- [ ] **T5.5** `gantt/TicketBar.tsx` + `hooks/useGanttDrag.ts` (dnd-kit) : drag vers une autre ligne → update optimiste store + `onOperation({field:"assigneeId"})`. `dep: T5.4`.
  → *verify* : test : drop sur ligne k → `assigneeId` du ticket = membre[k] dans le store.
- [ ] **T5.6** `hooks/useResize.ts` : poignées gauche/droite de `TicketBar` → `onOperation({field:"startDate"|"endDate"})`, update optimiste. `dep: T5.5`.
  → *verify* : test : drag bord droit +2 jours → `endDate` +2j dans le store.
- [ ] **T5.7** `load/LoadHistogram.tsx` + `utils/load.ts` : charge/jour par membre, recalcul local pendant drag. `dep: T5.4`.
  → *verify* : test `load.ts` : somme estimateHours/jour correcte vs fixture.
- [ ] **T5.8** `services/operations.client.ts` : connexion socket, `operation:submit`, réception `operation:applied`/`rejected` → réconcilie `tickets.store`. Brancher `onOperation` dessus. `dep: T5.5, T4.1`.
  → *verify* : `operation:applied` mocké met à jour le store ; `rejected` rollback l'optimiste.
- [ ] **T5.9** `services/presence.client.ts` (throttle 50ms) + `hooks/usePresence.ts` + `presence/PresenceLayer.tsx` (curseurs/avatars, badge "en cours d'édition"). `dep: T5.8, T4.2`.
  → *verify* : `presence:broadcast` mocké rend un curseur pour le pair.
- [ ] **T5.10** `session/SyncStatusIndicator.tsx` : pastille `pending/synced/error` par ticket + bouton "réessayer" (`POST /sessions/:id/sync`). `dep: T5.4, T3.2`.
  → *verify* : les 3 statuts rendent les 3 visuels ; clic error → appel sync.

### Dépendances inter-couches explicites

- `T0.2` (shared) bloque **toutes** les couches → à faire en premier après `T0.1`.
- `/frontend` ne consomme du réel qu'à partir de `T2.4` (REST) et `T4.1` (socket) ; jusque-là il travaille sur mocks → parallélisable.
- `/ado-sync` (T3.x) et `/realtime` (T4.x) dépendent de `sessions.service` (T2.4) mais sont indépendants entre eux → parallélisables.

---

## 6. Pre-handoff checklist

- ✓ Tous les fichiers à créer sont listés (§3) — projet vierge, création intégrale.
- ✓ Contrats (types, événements, signatures de services, props) définis (§4).
- ✓ Chaque TODO est atomique et testable avec une commande (§5).
- ✓ TODOs ordonnés par dépendance ; dépendances inter-couches explicitées.
- ✓ Aucune instruction « améliorer » : chaque étape nomme des fichiers/symboles précis.
- ✓ Questions ouvertes résolues : snapshot (pas replay), conflits = FIFO/LWW, sync incrémentale = polling (Service Hooks = Phase 2), package partagé = source unique des types.
