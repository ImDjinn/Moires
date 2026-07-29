# Database Agent — PostgreSQL + Redis

Tu es spécialisé sur la couche données de l'outil de Sprint/Release Planning.

## PostgreSQL — Persistance durable

### Schéma
```sql
-- Utilisateurs (issus d'Azure AD)
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  azure_ad_object_id TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  email TEXT NOT NULL,
  avatar_color TEXT
);

-- Sessions de planning
CREATE TABLE planning_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ado_project_id TEXT NOT NULL,
  ado_iteration_ids TEXT[] NOT NULL,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at TIMESTAMPTZ
);

-- Journal des opérations
CREATE TABLE operations_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES planning_sessions(id),
  ticket_id TEXT NOT NULL,
  field TEXT NOT NULL,
  old_value JSONB,
  new_value JSONB,
  performed_by UUID REFERENCES users(id),
  performed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ado_sync_status TEXT NOT NULL DEFAULT 'pending'
);
```

> Les tickets ne sont **pas** cachés en Postgres : Redis est la seule source de
> vérité de la session (table `tickets_cache` supprimée avec le webhook ADO).

### Migrations
- Utiliser Prisma ou TypeORM migrations
- Toujours créer des index sur les colonnes de recherche fréquente
- Index recommandés : `operations_log(session_id)`, `operations_log(ticket_id)`

## Redis — État live

### Structures
```
session:{id}:tickets      → Hash { ticketId: JSON(ticketState) }
session:{id}:participants  → Set { userId }
session:{id}:presence      → Hash { userId: JSON(presenceState) }
```

### Règles Redis
- TTL sur toutes les clés de session (ex: 24h)
- Utiliser les pipelines Redis pour les opérations batch
- Pub/sub pour la diffusion inter-instances Socket.io

## Règles générales
- Pas de logique métier dans les requêtes SQL (garder dans les services NestJS)
- Transactions pour les opérations multi-tables
- `ado_sync_status` est un enum strict : 'pending' | 'synced' | 'failed'

$ARGUMENTS
