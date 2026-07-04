# Déploiement — Moirai (VPS + Docker + Caddy)

Stack de prod : 4 conteneurs sur une seule machine.

| Service    | Rôle                                                        |
|------------|-------------------------------------------------------------|
| `caddy`    | Sert le front statique + reverse-proxy API + **HTTPS auto** |
| `api`      | NestJS (migrations Prisma au démarrage)                     |
| `postgres` | Base de données (volume persistant)                         |
| `redis`    | Cache / pub-sub temps réel                                  |

Domaine cible : **themoirai.net**

---

## Prérequis (à faire une fois)

### 1. VPS
- **OVHcloud VPS** (≥ 2 vCPU / **4 Go RAM** min, datacenter France) **ou** **Hetzner Cloud CX22**.
- Image **Ubuntu 24.04**, clé SSH ajoutée. Noter l'**IP publique**.
- ⚠️ Ne pas descendre sous 4 Go : l'image est buildée sur le serveur (risque d'OOM sinon).

### 2. Domaine → VPS (Cloudflare DNS)
Enregistrement **A** : `themoirai.net` → `IP_DU_VPS`, **proxy « DNS only » (nuage gris)**.
> Le proxy orange casse la génération du certificat Caddy et les WebSockets. À laisser gris.

### 3. Azure AD
Portail Azure → App registrations → (ton app) → Authentication → Redirect URIs :
- Ajouter : `https://themoirai.net/auth/callback`

### 4. Serveur : Docker + pare-feu
```bash
ssh root@IP_DU_VPS
curl -fsSL https://get.docker.com | sh
ufw allow OpenSSH && ufw allow 80 && ufw allow 443 && ufw --force enable
```

---

## Déploiement

```bash
# 1. Récupérer le code
git clone <URL_DU_REPO> moirai && cd moirai

# 2. Créer le fichier d'environnement de prod
cp .env.production.example .env.production
nano .env.production        # remplir les secrets (voir ci-dessous)

# 3. Lancer
docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build
```

### Remplir `.env.production`
- `AZURE_AD_CLIENT_ID` / `_SECRET` / `_TENANT_ID` : depuis le portail Azure.
- `POSTGRES_PASSWORD` **et** le mot de passe dans `DATABASE_URL` : identiques, forts.
- `SESSION_SECRET` : générer avec `openssl rand -hex 32`.
- Laisser les hôtes `postgres` / `redis` (noms de service Docker), **pas** `localhost`.

---

## Vérifier

```bash
docker compose -f docker-compose.prod.yml ps          # tous "Up"
docker compose -f docker-compose.prod.yml logs -f caddy   # certificat obtenu
docker compose -f docker-compose.prod.yml logs -f api     # "migrate deploy" OK + listen
```
Puis ouvrir **https://themoirai.net**.

---

## Mettre à jour (nouvelle version)

```bash
git pull
docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build
```
Les migrations Prisma s'appliquent automatiquement au redémarrage de l'`api`.

---

## Sauvegarde base de données

```bash
docker compose -f docker-compose.prod.yml exec postgres \
  pg_dump -U moirai moirai > backup_$(date +%F).sql
```

---

## Dépannage

- **Pas de HTTPS / erreur certificat** : le DNS ne pointe pas encore (attendre la propagation) ou proxy Cloudflare en orange. Logs : `docker compose ... logs caddy`.
- **Login Azure échoue** : la Redirect URI dans Azure AD ne correspond pas exactement à `https://themoirai.net/auth/callback`.
- **API redémarre en boucle** : souvent `DATABASE_URL` faux (doit viser l'hôte `postgres`). Voir `logs api`.
