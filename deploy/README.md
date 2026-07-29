# Déploiement — Moires (VPS + Docker + Caddy)

Stack de prod : 4 conteneurs sur une seule machine.

| Service    | Rôle                                                        |
|------------|-------------------------------------------------------------|
| `caddy`    | Sert le front statique + reverse-proxy API (HTTP interne)   |
| `api`      | NestJS (migrations Prisma au démarrage)                     |
| `postgres` | Base de données (volume persistant)                         |
| `redis`    | Cache / pub-sub temps réel                                  |

Domaine cible : **themoirai.net** (alias `moires.byimad.net`)

> **Architecture autonome.** Ce stack ne gère QUE l'app Moires. Le TLS et le
> routage des domaines sont assurés par l'**edge proxy dédié** (repo `byimad`,
> `proxy/`), seul service exposé sur `80/443`. Le `caddy` de Moires n'expose
> aucun port : il rejoint le réseau Docker partagé `web` sur lequel l'edge le
> route (`themoirai.net`, `moires.byimad.net`). Voir `byimad/DEPLOY.md`.

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
Aucune app Azure AD à configurer : la connexion se fait avec un **Personal Access
Token** saisi dans l'UI. Chaque utilisateur crée le sien :

1. `https://dev.azure.com/<ORG>/_usersSettings/tokens` (ou avatar en haut à droite →
   *User settings* → *Personal access tokens*).
2. **+ New Token** → nom (ex. « Moires »), organisation = celle saisie à la connexion,
   expiration au choix.
3. **Scopes** → *Custom defined*, cocher **exactement** :

   | Portée | Niveau | Sert à |
   |--------|--------|--------|
   | **Work Items** | *Read & write* | itérations, boards, colonnes, capacités, lecture **et** écriture des work items |
   | **Project and Team** | *Read* | liste des projets, équipes et membres |

4. **Create**, copier le jeton (affiché **une seule fois**), le coller dans l'écran de connexion.

> *Full access* fonctionne mais est inutilement large. Le PAT ne donne jamais plus de
> droits que le compte qui l'a créé : un utilisateur ne verra dans Moires que les
> projets/zones qu'il peut déjà lire dans ADO.

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
git clone <URL_DU_REPO> moires && cd moires

# 2. Créer le fichier d'environnement de prod
cp .env.production.example .env.production
nano .env.production        # remplir les secrets (voir ci-dessous)

# 3. Réseau partagé avec l'edge proxy (une fois, si pas déjà créé)
docker network create web 2>/dev/null || true

# 4. Lancer
docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build
```

### Remplir `.env.production`
- `POSTGRES_PASSWORD` **et** le mot de passe dans `DATABASE_URL` : identiques, forts.
- `REDIS_PASSWORD` **et** le mot de passe dans `REDIS_URL` : identiques, forts (`openssl rand -hex 32`).
- `SESSION_SECRET` : générer avec `openssl rand -hex 32` (signe les cookies de session).
- Laisser les hôtes `postgres` / `redis` (noms de service Docker), **pas** `localhost`.

---

## Vérifier

```bash
docker compose -f docker-compose.prod.yml ps          # tous "Up"
docker compose -f docker-compose.prod.yml logs -f caddy   # sert sur :80 (TLS géré par l'edge)
docker compose -f docker-compose.prod.yml logs -f api     # "migrate deploy" OK + listen
```
Puis ouvrir **https://themoirai.net** (le certificat est délivré par l'edge proxy).

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
| `DEPLOY_USER` | utilisateur SSH (ex. `deploy` ou `ubuntu`) |
| `DEPLOY_SSH_KEY` | clé **privée** SSH dédiée au déploiement (générer avec `ssh-keygen -t ed25519 -f deploy_key -N ""`) |
| `DEPLOY_PATH` | chemin du repo cloné (ex. `~/Moires` ou `/root/moires`) |

> Le port SSH est fixé à `22` dans le workflow ; pour un port custom, éditer
> `port:` dans `.github/workflows/deploy.yml`.

**Prérequis serveur :**
- La clé **publique** correspondante (`deploy_key.pub`) est ajoutée dans
  `~/.ssh/authorized_keys` de l'utilisateur de déploiement sur le VPS.
- L'utilisateur peut lancer Docker sans `sudo` : `sudo usermod -aG docker $USER` puis
  reconnexion (sinon `docker` renvoie *permission denied*).

> Clé dédiée = révocable indépendamment sans rejouabilité d'un mot de passe en
> clair. Ne pas réutiliser une clé personnelle ; en générer une par repo.

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
  pg_dump -U moires moires > backup_$(date +%F).sql
```

---

## Dépannage

- **Pas de HTTPS / erreur certificat** : le certificat est géré par l'**edge proxy** (repo `byimad`), pas par ce stack. Vérifier que le conteneur `moires-web` a bien rejoint le réseau `web` (`docker network inspect web`) et voir les logs de l'edge. Sinon : DNS pas encore propagé, ou proxy Cloudflare en orange.
- **Login échoue (PAT invalide)** : le PAT est expiré, révoqué, ou n'a pas les portées *Work Items* / *Project and Team*. En régénérer un sur dev.azure.com.
- **API redémarre en boucle** : souvent `DATABASE_URL` faux (doit viser l'hôte `postgres`). Voir `logs api`.
