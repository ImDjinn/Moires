# Stratégie de test — Moirai

Objectif : garantir en continu que **toutes les pages, toutes les routes et toutes
les fonctionnalités** marchent, et détecter toute régression. Pyramide à 4 couches,
exécutables hors-ligne (ADO, Azure AD, Postgres, Redis, BullMQ sont **mockés à la frontière**).

> Rappel d'architecture : l'app n'a **pas de routeur**. Les « pages » sont des états
> de vue pilotés par les stores (`LoginButton` → `SessionLobby` → `Board`). Les
> « routes » sont les endpoints REST NestJS + les events Socket.io.

## Commandes

```bash
pnpm test            # couches 1→3 (web + api unit + api e2e) — pour la CI
pnpm test:web        # front : Vitest (smoke + unit + composants)
pnpm test:api        # back : Jest unit
pnpm test:api:e2e    # back : routes REST via supertest
pnpm test:e2e        # navigateur : Playwright (lance Vite automatiquement)
```

Pré-requis Playwright (une fois) : `pnpm exec playwright install chromium`.

## Matrice de couverture

### Pages (vues front) — chacune a un test de rendu + comportement
| Vue / composant | Fichier de test |
|---|---|
| App (les 3 états : connexion / lobby / board) | `apps/web/src/App.test.tsx` |
| AuthGuard (loading / login / enfants) | `apps/web/src/components/auth/AuthGuard.test.tsx` |
| SessionLobby (chargement, erreur, bouton) | `apps/web/src/components/session/SessionLobby.test.tsx` |
| GanttBoard (lignes, tickets assignés/orphelins) | `apps/web/src/components/gantt/GanttBoard.test.tsx` |
| TicketBar (position, clavier, resize, erreur, pair) | `apps/web/src/components/gantt/TicketBar.test.tsx` |
| TimelineHeader (cellules, libellés) | `apps/web/src/components/gantt/TimelineHeader.test.tsx` |
| LoadHistogram (colonnes, cas vide) | `apps/web/src/components/load/LoadHistogram.test.tsx` |
| PresenceLayer (curseurs) | `apps/web/src/components/presence/PresenceLayer.test.tsx` |
| SyncStatusIndicator (3 statuts + retry) | `apps/web/src/components/session/SyncStatusIndicator.test.tsx` |

### Fonctionnalités front (logique pure, stores, hooks, services)
`utils/dates`, `utils/load`, `stores/{tickets,session,presence}`, `hooks/{useGanttDrag,useResize}`,
`services/{rest.client,operations.client,presence.client}` — un `*.test.ts` à côté de chaque fichier.

### Routes REST (back) — `apps/api/test/rest-routes.e2e-spec.ts`
`GET /auth/me`, `POST /auth/refresh`, `GET /ado/projects`, `…/iterations`, `…/areas`,
`…/team-members`, `POST /sessions`, `GET /sessions/:id`, `POST /sessions/:id/sync`,
`GET /sessions/:id/audit-log` + garde d'auth (401 sans cookie).

### Services & realtime (back, unit)
`ado.service` (fetch mocké, 7 endpoints + erreur), `ado.mapper`, `auth.service` (MSAL mocké),
`auth.guard`, `sessions.service`, `sync.service`, `writeback.service` + `writeback.processor`
(succès / échec final / retry), `realtime.gateway`, `operations.handler`, `presence.handler`,
`redis.service` (ioredis mocké), `config/env`.

## Principes

- **Mocks à la frontière** : aucun test ne touche un vrai ADO/Azure AD/Postgres/Redis/BullMQ.
- **Déterminisme** : fuseau figé (`Europe/Paris`) dans `vitest.config.ts`.
- **Ajouter une page** → un cas dans `App.test.tsx` + un test composant + le parcours Playwright.
- **Ajouter une route REST** → un cas dans `rest-routes.e2e-spec.ts`.
- **Ajouter un service / event** → un `*.spec.ts` à côté du fichier.

## Non couvert volontairement
- `prisma.service.ts`, modules NestJS de wiring, `main.ts` : plomberie sans logique
  métier, exercée indirectement par les e2e.
- **Pas de test de socket réel** (handlers testés en unitaire avec `Server`/`Socket` mockés) ;
  un e2e socket.io bout-en-bout reste possible si besoin.

## Anomalies relevées pendant la mise en place
1. **`GET /auth/me` manquait** (appelée par `useAuth`) → l'app restait bloquée sur l'écran de
   connexion. **Corrigé** dans `apps/api/src/auth/auth.controller.ts`, verrouillé par la couche 3.
2. **`GET /health` absente** : le plan d'implémentation (T2.1) la mentionne mais aucune route
   n'existe. À ajouter si un health-check est attendu (non fait — hors périmètre test).
