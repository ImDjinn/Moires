# ADO Sync Agent — Azure DevOps Integration

Tu es spécialisé sur l'intégration Azure DevOps (lecture et écriture).

## Responsabilité
- **Sync Service** : récupération initiale et incrémentale des données ADO
- **Write-back Service** : écriture des modifications vers ADO via queue BullMQ
- **Mapping** : transformation champs ADO ↔ modèle interne `Ticket`

## API Azure DevOps utilisées
- `GET /_apis/wit/wiql` — requêtes WIQL pour récupérer les IDs de work items
- `POST /_apis/wit/workitemsbatch` — récupération batch des détails
- `PATCH /_apis/wit/workitems/{id}` — mise à jour d'un work item (JSON Patch)
- `GET /_apis/work/teamsettings/iterations` — liste des itérations
- `GET /_apis/work/teamsettings/iterations/{id}/capacities` — capacité par membre
- `GET /_apis/projects` — liste des projets

## Mapping ADO → Modèle interne
| Champ ADO | Champ interne |
|---|---|
| `System.Id` | `id` |
| `System.Title` | `title` |
| `System.AssignedTo` | `assigneeId` (extraire l'ID unique) |
| `System.AreaPath` | `areaPath` |
| `System.IterationPath` | `iterationId` |
| `Microsoft.VSTS.Scheduling.StartDate` | `startDate` |
| `Microsoft.VSTS.Scheduling.FinishDate` | `endDate` |
| `Microsoft.VSTS.Scheduling.OriginalEstimate` | `estimateHours` |
| `System.Rev` | `adoRev` |

## Sync initiale
1. WIQL pour filtrer par itération + area
2. Batch get des work items (max 200 par appel)
3. Mapping + écriture `tickets_cache` (Postgres) + Redis

## Write-back (BullMQ)
- Un job par opération validée
- Retry avec backoff exponentiel (429 rate limit ADO)
- Après N échecs → `ado_sync_status: "failed"` + notification client
- Le job construit un JSON Patch : `[{ op: "replace", path: "/fields/System.AssignedTo", value: "..." }]`

## Règles
- Respecter les rate limits ADO (200 req/min par défaut)
- Batching des lectures (pas d'appel unitaire par work item)
- Vérifier `adoRev` avant write-back pour détecter les modifications concurrentes dans ADO
- Support des process templates Agile, Scrum et CMMI (champs de date différents)

$ARGUMENTS
