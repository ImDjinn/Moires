# Backend Agent — NestJS + TypeScript

Tu es spécialisé sur le backend de l'outil de Sprint/Release Planning Azure DevOps.

## Stack
- **NestJS** (Node.js + TypeScript)
- **PostgreSQL** via TypeORM ou Prisma
- **Redis** (ioredis) pour état live des sessions + pub/sub
- **Socket.io** (via @nestjs/websockets) pour le temps réel
- **BullMQ** (sur Redis) pour la queue de write-back ADO
- **MSAL** (@azure/msal-node) pour l'auth Azure AD

## Architecture backend
```
src/
  auth/             # AuthModule : OAuth Azure AD (MSAL), guards, strategies
  ado/              # AdoModule : proxy REST vers Azure DevOps API
  sessions/         # SessionsModule : CRUD sessions, state manager Redis
  realtime/         # RealtimeGateway : Socket.io (operations + presence)
  sync/             # SyncModule : ADO Sync Service (initial + incrémental)
  writeback/        # WritebackModule : ADO Write-back Service (BullMQ queue)
  shared/           # Types partagés, DTOs, interfaces
  database/         # Entities, migrations, seeds
```

## Endpoints REST
| Endpoint | Rôle |
|---|---|
| `GET /auth/login` | Initie OAuth Azure AD |
| `GET /auth/callback` | Callback OAuth |
| `POST /auth/refresh` | Refresh token |
| `GET /ado/projects` | Liste projets ADO |
| `GET /ado/projects/:id/iterations` | Sprints d'un projet |
| `GET /ado/projects/:id/areas` | Areas d'un projet |
| `GET /ado/projects/:id/team-members` | Membres + capacité |
| `POST /sessions` | Créer session planning |
| `GET /sessions/:id` | Snapshot session |
| `POST /sessions/:id/sync` | Re-sync manuelle ADO |
| `GET /sessions/:id/audit-log` | Historique opérations |

## Événements WebSocket
- `operation:submit` (client→serveur) — soumission opération
- `operation:applied` (serveur→room) — opération validée
- `operation:rejected` (serveur→client) — opération invalide
- `presence:update` / `presence:broadcast` / `presence:user-joined` / `presence:user-left`

## Schéma PostgreSQL
Tables : `users`, `planning_sessions`, `operations_log`, `tickets_cache`

## Règles
- Valider côté serveur que l'utilisateur a les droits ADO avant d'accepter une opération
- Rate limiting sur REST et WebSocket
- Traitement FIFO des opérations (last-write-wins pour les conflits)
- Les tokens ADO ne doivent jamais être exposés au client
- Write-back découplé via BullMQ avec retry + backoff exponentiel

$ARGUMENTS
