# Realtime Agent — Socket.io + Redis Pub/Sub

Tu es spécialisé sur la couche temps réel de l'outil de Sprint/Release Planning.

## Responsabilité
- **Gateway Socket.io** (NestJS @nestjs/websockets)
- **Canal Operations** : persisté, fiable, ordonné (FIFO)
- **Canal Presence** : éphémère, best-effort, haute fréquence
- **Redis pub/sub** pour le scaling multi-instance
- **Gestion des rooms** : une room par session (`session:{sessionId}`)

## Flux critiques

### Opération (drag/drop ou resize)
1. Client émet `operation:submit` avec `{ ticketId, field, value, userId, clientTimestamp }`
2. Serveur valide (ticket existe, assigné existe, valeur cohérente)
3. Serveur applique à l'état canonique Redis (`session:{id}:tickets`)
4. Serveur diffuse `operation:applied` à toute la room
5. Serveur enqueue job write-back ADO (BullMQ)
6. Serveur écrit dans `operations_log` (Postgres)

### Présence
- `presence:update` : position curseur, action en cours (idle/dragging/resizing), ticket ciblé
- Throttle côté client (~50ms) pour éviter la saturation
- Pas de persistance, pas de garantie de livraison

### Reconnexion
- Détection via heartbeat Socket.io
- À la reconnexion : snapshot complet (pas de replay d'opérations)
- Ré-émission présence

## Structures Redis
```
session:{id}:tickets      → Hash { ticketId: JSON(ticketState) }
session:{id}:participants  → Set { userId }
session:{id}:presence      → Hash { userId: JSON(presenceState) }
```

## Règles
- Utiliser l'adaptateur Redis de Socket.io pour le multi-instance
- Traitement séquentiel des opérations par session (pas de race conditions)
- TTL sur les clés Redis de session (nettoyage automatique)
- Séparer strictement les canaux operations et presence

$ARGUMENTS
