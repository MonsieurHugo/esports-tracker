# Connexion à la Base de Données de Production

Ce guide explique comment se connecter à la base de données PostgreSQL hébergée sur le VPS Hostinger depuis ton PC local.

---

## Prérequis

- **SSH configuré** : Tu dois pouvoir te connecter au VPS via SSH sans mot de passe (clé SSH)
- **DBeaver** (ou autre client PostgreSQL) installé sur ton PC
- **Docker** doit tourner sur le VPS

---

## Architecture

```
┌─────────────────┐      SSH Tunnel       ┌─────────────────────────────────┐
│   Ton PC        │ ──────────────────►   │   VPS (monsieuryordle.com)      │
│                 │     Port 5433         │                                 │
│  DBeaver        │                       │  ┌─────────────────────────┐    │
│  localhost:5433 │ ◄──────────────────── │  │ Docker: esports-postgres│    │
│                 │                       │  │ PostgreSQL sur 5432     │    │
└─────────────────┘                       │  └─────────────────────────┘    │
                                          └─────────────────────────────────┘
```

---

## Étape 1 : Vérifier que PostgreSQL tourne sur le VPS

### Option A : Vérification rapide (une seule commande)

```bash
ssh root@monsieuryordle.com "docker ps | grep postgres"
```

**Résultat attendu :**
```
08c8c96d87fb   postgres:16-alpine   "docker-entrypoint.s…"   Up X minutes (healthy)   127.0.0.1:5432->5432/tcp   esports-postgres
```

Si tu vois cette ligne avec `Up` et `(healthy)`, PostgreSQL tourne. Passe à l'**Étape 2**.

Si rien ne s'affiche ou si le status est différent, passe à l'**Option B**.

### Option B : Démarrer PostgreSQL (si arrêté)

```bash
ssh root@monsieuryordle.com "cd /root/esports-tracker && docker compose -f docker-compose.db.yml up -d"
```

**Résultat attendu :**
```
 Container esports-postgres Starting
 Container esports-redis Starting
 Container esports-postgres Started
 Container esports-redis Started
```

Vérifie ensuite que tout est bien lancé :
```bash
ssh root@monsieuryordle.com "docker ps"
```

Tu devrais voir `esports-postgres` et `esports-redis` avec le status `Up`.

---

## Étape 2 : Ouvrir le tunnel SSH

Le tunnel SSH crée un "pont sécurisé" entre ton PC et le VPS. Il redirige le port 5433 de ton PC vers le port 5432 de PostgreSQL sur le VPS.

### Commande à exécuter

```bash
ssh -L 5433:127.0.0.1:5432 root@monsieuryordle.com
```

**Explication des paramètres :**
- `-L 5433:127.0.0.1:5432` : Redirige le port local 5433 vers 127.0.0.1:5432 sur le VPS
- `root` : Utilisateur SSH
- `monsieuryordle.com` : Adresse du VPS

**Résultat attendu :**
Tu te retrouves connecté au VPS (prompt `root@srv948831:~#`).

**IMPORTANT : Garde ce terminal ouvert !** Le tunnel reste actif tant que cette connexion SSH est ouverte.

### Vérifier que le tunnel fonctionne

Dans un **nouveau terminal** sur ton PC :
```bash
nc -zv localhost 5433
```

Ou sous PowerShell :
```powershell
Test-NetConnection -ComputerName localhost -Port 5433
```

---

## Étape 3 : Configurer DBeaver

### Créer une nouvelle connexion

1. Ouvre **DBeaver**
2. Clique sur **Nouvelle connexion** (icône prise + en haut à gauche)
3. Sélectionne **PostgreSQL** → **Suivant**

### Onglet "Main" (Connexion principale)

| Champ | Valeur |
|-------|--------|
| **Host** | `localhost` |
| **Port** | `5433` |
| **Database** | `esports` |
| **Authentication** | Database Native |
| **Username** | `monsieuryordle` |
| **Password** | `WpvN27rH1dSYYUdpxWM2hHtz` |

**Coche "Save password"** pour ne pas avoir à le retaper.

### Onglet "SSH"

**NE PAS ACTIVER** - Le tunnel SSH est géré manuellement via le terminal.

Assure-toi que la case "Use SSH Tunnel" est **décochée**.

### Tester la connexion

1. Clique sur **Test Connection...**
2. Tu devrais voir : **"Connected"** en vert
3. Si OK, clique sur **Terminer**

---

## Étape 4 : Explorer la base de données

Une fois connecté dans DBeaver :

### Structure de la BDD

```
esports (database)
└── public (schema)
    ├── Tables
    │   ├── players
    │   ├── player_stats
    │   ├── matches
    │   ├── teams
    │   └── ...
    ├── Views
    └── Functions
```

### Requêtes utiles

**Voir toutes les tables :**
```sql
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public';
```

**Compter les joueurs :**
```sql
SELECT COUNT(*) FROM players;
```

**Voir les derniers stats enregistrés :**
```sql
SELECT * FROM player_stats
ORDER BY fetched_at DESC
LIMIT 10;
```

---

## Étape 5 : Fermer la connexion

Quand tu as terminé :

1. **Dans DBeaver** : Clic droit sur la connexion → **Déconnecter**
2. **Dans le terminal SSH** : Tape `exit` ou appuie sur `Ctrl+D`

---

## Dépannage

### Erreur : "Connection refused" ou "Connection timed out"

**Causes possibles :**
1. Le tunnel SSH n'est pas ouvert → Ouvre-le (Étape 2)
2. PostgreSQL ne tourne pas sur le VPS → Démarre-le (Étape 1, Option B)

**Vérification :**
```bash
# Vérifier que le tunnel est actif (dans un autre terminal)
netstat -an | findstr 5433
```

### Erreur : "Authentication failed"

**Causes possibles :**
- Mauvais mot de passe ou utilisateur
- La base de données n'existe pas

**Identifiants corrects :**
- Username : `monsieuryordle`
- Password : `WpvN27rH1dSYYUdpxWM2hHtz`
- Database : `esports`

### Erreur : "Channel open failed" ou "Name resolution failure"

**Cause :** Le tunnel utilise un mauvais host.

**Solution :** Utilise `127.0.0.1` et non `esports-postgres` :
```bash
ssh -L 5433:127.0.0.1:5432 root@monsieuryordle.com
```

### PostgreSQL ne démarre pas sur le VPS

**Vérifier les logs :**
```bash
ssh root@monsieuryordle.com "docker logs esports-postgres --tail 50"
```

**Redémarrer le container :**
```bash
ssh root@monsieuryordle.com "docker restart esports-postgres"
```

---

## Informations de connexion (Référence rapide)

### VPS (SSH)
| Paramètre | Valeur |
|-----------|--------|
| Host | `monsieuryordle.com` |
| IP | `148.230.71.240` |
| Port | `22` |
| User | `root` |
| Auth | Clé SSH (`~/.ssh/esports_vps` ou `~/.ssh/id_ed25519`) |

### PostgreSQL (Production)
| Paramètre | Valeur |
|-----------|--------|
| Host (via tunnel) | `localhost` |
| Port (via tunnel) | `5433` |
| Database | `esports` |
| Username | `monsieuryordle` |
| Password | `WpvN27rH1dSYYUdpxWM2hHtz` |

### Redis (Production)
| Paramètre | Valeur |
|-----------|--------|
| Host | `esports-redis` (interne Docker) |
| Port | `6379` |
| Password | `pZShdFTHAcI9CIG6iUFtbMOa` |

---

## Commandes utiles (Cheat Sheet)

```bash
# Vérifier si PostgreSQL tourne
ssh root@monsieuryordle.com "docker ps | grep postgres"

# Démarrer la BDD
ssh root@monsieuryordle.com "cd /root/esports-tracker && docker compose -f docker-compose.db.yml up -d"

# Arrêter la BDD
ssh root@monsieuryordle.com "cd /root/esports-tracker && docker compose -f docker-compose.db.yml down"

# Ouvrir le tunnel SSH
ssh -L 5433:127.0.0.1:5432 root@monsieuryordle.com

# Voir les logs PostgreSQL
ssh root@monsieuryordle.com "docker logs esports-postgres --tail 100"

# Voir les logs en temps réel
ssh root@monsieuryordle.com "docker logs -f esports-postgres"

# Redémarrer PostgreSQL
ssh root@monsieuryordle.com "docker restart esports-postgres"

# Accéder à psql directement sur le VPS
ssh root@monsieuryordle.com "docker exec -it esports-postgres psql -U monsieuryordle -d esports"
```
