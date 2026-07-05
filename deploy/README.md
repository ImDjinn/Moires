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

### 3. Azure DevOps (auth par PAT)
Aucune app Azure AD à configurer. La connexion se fait avec un **Personal Access
Token** Azure DevOps saisi dans l'UI. Créer le PAT sur https://dev.azure.com →
User settings → Personal access tokens, portées : *Work Items (lecture/écriture)*
et *Project and Team (lecture)*.

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
- `POSTGRES_PASSWORD` **et** le mot de passe dans `DATABASE_URL` : identiques, forts.
- `REDIS_PASSWORD` **et** le mot de passe dans `REDIS_URL` : identiques, forts (`openssl rand -hex 32`).
- `SESSION_SECRET` : générer avec `openssl rand -hex 32` (signe les cookies de session).
- `ADO_WEBHOOK_SECRET` : requis si les webhooks ADO sont configurés — sans lui, l'endpoint est refusé.
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

Automatique via GitHub Actions : à chaque commit sur `main`, la CI (build +
tests) tourne ; **si elle réussit**, `.github/workflows/deploy.yml` se déclenche,
se connecte en SSH au VPS et rejoue le build + redémarrage ci-dessous. Un commit
qui casse les tests ne déploie donc pas. Déclenchable aussi à la main (onglet
**Actions → Deploy → Run workflow**).

### Secrets à configurer (Settings → Secrets and variables → Actions)
| Secret | Valeur |
|--------|--------|
| `DEPLOY_HOST` | IP publique du VPS ou `themoirai.net` — hostname nu, **sans** schéma ni port |
| `DEPLOY_USER` | utilisateur SSH (ex. `ubuntu` ou `root`) |
| `DEPLOY_PASSWORD` | mot de passe SSH de cet utilisateur (voir prérequis serveur ci-dessous) |
| `DEPLOY_PATH` | chemin du repo cloné (ex. `~/Moires` ou `/root/moirai`) |

> Le port SSH est fixé à `22` dans le workflow ; pour un port custom, éditer
> `port:` dans `.github/workflows/deploy.yml`.

**Prérequis serveur pour l'auth par mot de passe :**
- SSH par mot de passe activé : `PasswordAuthentication yes` dans `/etc/ssh/sshd_config`
  (souvent désactivé par défaut sur les images cloud → sinon la connexion échoue).
- L'utilisateur peut lancer Docker sans `sudo` : `sudo usermod -aG docker $USER` puis
  reconnexion (sinon `docker` renvoie *permission denied*).

> Plus sûr : une **clé SSH** dédiée (remplacer `password:` par `key:` dans le
> workflow et le secret par la clé privée). Le mot de passe reste un secret en
> clair rejouable — à réserver à un usage simple.

> Le workflow fait `git reset --hard origin/main` : tout changement local non
> commité sur le VPS est écrasé. `.env.production` est hors git → préservé.

### À la main (équivalent)
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
- **Login échoue (PAT invalide)** : le PAT est expiré, révoqué, ou n'a pas les portées *Work Items* / *Project and Team*. En régénérer un sur dev.azure.com.
- **API redémarre en boucle** : souvent `DATABASE_URL` faux (doit viser l'hôte `postgres`). Voir `logs api`.
