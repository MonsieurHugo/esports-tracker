# 🗄️ Guide Base de Données - Hostinger

## 📋 Quick Start

### Étape 1 : Connexion au VPS

```bash
ssh root@TON_IP_VPS
cd ~/esports-tracker
```

### Étape 2 : Lancer le script de setup

```bash
chmod +x deploy/scripts/setup-database.sh
./deploy/scripts/setup-database.sh
```

C'est tout ! Le script va :
- ✅ Créer les dossiers de données
- ✅ Générer des mots de passe sécurisés
- ✅ Lancer PostgreSQL et Redis
- ✅ Créer toutes les tables

---

## 🔧 Configuration manuelle (si besoin)

### 1. Créer les dossiers

```bash
sudo mkdir -p /var/lib/esports-tracker/{postgres,redis,backups}
sudo chmod 700 /var/lib/esports-tracker/postgres
```

### 2. Créer le fichier .env.db

```bash
cat > .env.db << 'EOF'
DB_USER=esports
DB_PASSWORD=MOT_DE_PASSE_FORT
DB_DATABASE=esports_tracker
REDIS_PASSWORD=MOT_DE_PASSE_REDIS
EOF

chmod 600 .env.db
```

### 3. Lancer les services

```bash
# Charger les variables
export $(cat .env.db | grep -v '^#' | xargs)

# Démarrer PostgreSQL et Redis
docker compose -f docker-compose.db.yml up -d
```

### 4. Vérifier que ça marche

```bash
# Status des containers
docker compose -f docker-compose.db.yml ps

# Tester PostgreSQL
docker exec -it esports-postgres psql -U esports -d esports_tracker -c "SELECT * FROM games;"
```

---

## 📊 Commandes utiles

### Accéder à PostgreSQL

```bash
# Shell interactif
docker exec -it esports-postgres psql -U esports -d esports_tracker

# Exécuter une requête
docker exec esports-postgres psql -U esports -d esports_tracker -c "SELECT COUNT(*) FROM players;"
```

### Accéder à Redis

```bash
# Shell Redis (remplacer PASSWORD)
docker exec -it esports-redis redis-cli -a PASSWORD

# Commandes Redis
> PING
> KEYS *
> INFO
```

### Logs

```bash
# Logs PostgreSQL
docker logs esports-postgres -f

# Logs Redis
docker logs esports-redis -f
```

### Redémarrer

```bash
docker compose -f docker-compose.db.yml restart
```

---

## 💾 Backups

### Backup manuel

```bash
./deploy/scripts/backup-db.sh
```

### Backup automatique (cron)

```bash
# Éditer crontab
crontab -e

# Ajouter (backup tous les jours à 3h du matin)
0 3 * * * cd /root/esports-tracker && ./deploy/scripts/backup-db.sh >> /var/log/esports-backup.log 2>&1
```

### Lister les backups

```bash
./deploy/scripts/backup-db.sh list
```

### Restaurer un backup

```bash
./deploy/scripts/backup-db.sh restore postgres_20240115_030000.sql.gz
```

---

## 🔒 Sécurité

### Les bases de données sont protégées

1. **Ports locaux uniquement** : PostgreSQL et Redis ne sont accessibles que depuis le serveur (127.0.0.1)
2. **Mots de passe forts** : Générés automatiquement
3. **Fichier .env.db** : Permissions 600 (lecture seule pour le propriétaire)

### Accès externe (optionnel)

Si tu dois accéder à la DB depuis ton PC (pour debug), utilise un tunnel SSH :

```bash
# Sur ton PC local
ssh -L 5432:localhost:5432 root@TON_IP_VPS

# Puis tu peux te connecter avec pgAdmin ou DBeaver sur localhost:5432
```

---

## 📈 Monitoring

### Vérifier l'espace disque

```bash
# Espace utilisé par les données
du -sh /var/lib/esports-tracker/*

# Espace disque global
df -h
```

### Vérifier les connexions PostgreSQL

```bash
docker exec esports-postgres psql -U esports -d esports_tracker -c "SELECT count(*) FROM pg_stat_activity;"
```

### Performance PostgreSQL

```bash
docker exec esports-postgres psql -U esports -d esports_tracker -c "
SELECT 
    relname as table, 
    n_tup_ins as inserts,
    n_tup_upd as updates,
    n_tup_del as deletes
FROM pg_stat_user_tables 
ORDER BY n_tup_ins DESC 
LIMIT 10;"
```

---

## 🔄 Mise à jour PostgreSQL

```bash
# 1. Backup
./deploy/scripts/backup-db.sh

# 2. Stop
docker compose -f docker-compose.db.yml down

# 3. Pull nouvelle version
docker pull postgres:16-alpine

# 4. Restart
docker compose -f docker-compose.db.yml up -d
```

---

## ❓ Troubleshooting

### PostgreSQL ne démarre pas

```bash
# Vérifier les logs
docker logs esports-postgres

# Vérifier les permissions
ls -la /var/lib/esports-tracker/postgres
```

### Erreur "database does not exist"

```bash
# Recréer la base
docker exec esports-postgres psql -U postgres -c "CREATE DATABASE esports_tracker;"
docker exec esports-postgres psql -U postgres -c "GRANT ALL PRIVILEGES ON DATABASE esports_tracker TO esports;"
```

### Erreur de connexion

```bash
# Vérifier que le container tourne
docker ps | grep postgres

# Tester la connexion
docker exec esports-postgres pg_isready -U esports -d esports_tracker
```

### Réinitialiser complètement

```bash
# ⚠️ ATTENTION: Supprime toutes les données!
docker compose -f docker-compose.db.yml down -v
sudo rm -rf /var/lib/esports-tracker/postgres/*
docker compose -f docker-compose.db.yml up -d
```

---

## 📝 Schema de la base

Le fichier `scripts/schema.sql` contient toutes les tables :

| Table | Description |
|-------|-------------|
| `games` | Jeux (LoL, Valorant) |
| `organizations` | Organisations (KC, G2, T1...) |
| `teams` | Équipes par jeu |
| `players` | Joueurs |
| `player_contracts` | Liens joueur ↔ équipe |
| `lol_accounts` | Comptes Riot |
| `lol_current_ranks` | Rangs actuels |
| `lol_matches` | Matchs |
| `lol_match_stats` | Stats par match |
| `lol_daily_stats` | Stats journalières |
| `lol_streaks` | Séries de victoires/défaites |
| `lol_champion_stats` | Stats par champion |
| `worker_status` | État du worker |
| `worker_logs` | Logs du worker |

---

## 🔗 Connection strings

Pour ton `.env` principal :

```bash
# PostgreSQL
DATABASE_URL=postgresql://esports:MOT_DE_PASSE@localhost:5432/esports_tracker

# Redis  
REDIS_URL=redis://:MOT_DE_PASSE_REDIS@localhost:6379
```

Pour les services Docker (dans le même réseau) :

```bash
# PostgreSQL
DATABASE_URL=postgresql://esports:MOT_DE_PASSE@esports-postgres:5432/esports_tracker

# Redis
REDIS_URL=redis://:MOT_DE_PASSE_REDIS@esports-redis:6379
```
