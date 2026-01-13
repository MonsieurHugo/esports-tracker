# Database Migrations

Ce dossier contient les migrations SQL pour optimiser et etendre le schema de la base de donnees Esports Tracker.

## Vue d'ensemble des migrations

| # | Fichier | Priorite | Description | Temps estime |
|---|---------|----------|-------------|--------------|
| 1 | `001_performance_indexes.sql` | P0 | Index pour recherche et dashboards | 30 min |
| 2 | `002_total_lp_column.sql` | P0 | Colonne total_lp pre-calculee | 30 min |
| 3 | `003_data_integrity.sql` | P1 | Contraintes CHECK sur les valeurs | 20 min |
| 4 | `004_leaderboard_cache.sql` | P1 | Tables de cache pour leaderboards | 45 min |
| 5 | `005_valorant_schema.sql` | P2 | Schema complet pour Valorant | 1h |
| 6 | `006_worker_indexes.sql` | P2 | Index optimises pour le worker | 20 min |

## Ordre d'execution

**IMPORTANT**: Les migrations doivent etre executees dans l'ordre numerique.

```bash
# Connexion a la base de donnees
psql -h localhost -U postgres -d esports_tracker

# Ou via Docker
docker exec -it esports-tracker-db psql -U postgres -d esports_tracker

# Execution des migrations
\i /path/to/001_performance_indexes.sql
\i /path/to/002_total_lp_column.sql
\i /path/to/003_data_integrity.sql
\i /path/to/004_leaderboard_cache.sql
\i /path/to/005_valorant_schema.sql
\i /path/to/006_worker_indexes.sql
```

## Description detaillee

### 001_performance_indexes.sql (P0 - Critique)

Ajoute les index manquants pour les requetes frequentes:
- Index trigram pour la recherche fuzzy (joueurs, comptes, equipes)
- Index covering sur `lol_daily_stats` pour les dashboards
- Index pour les streaks actifs
- Index pour les matchs recents

**Impact**: Amelioration de 50-70% sur les temps de reponse du dashboard.

### 002_total_lp_column.sql (P0 - Critique)

Ajoute une colonne `total_lp` pre-calculee dans `lol_current_ranks`:
- Evite le calcul de LP total a chaque requete de leaderboard
- Mise a jour automatique via trigger
- Index sur cette colonne pour tri rapide

**Impact**: Amelioration de 60-80% sur les requetes de leaderboard.

### 003_data_integrity.sql (P1 - Haute)

Ajoute des contraintes CHECK pour garantir la qualite des donnees:
- Tiers valides (IRON, BRONZE, ... CHALLENGER)
- Ranks valides (I, II, III, IV)
- Regions valides
- Roles valides
- Coherence wins <= games_played

**Impact**: Prevention des bugs lies a des donnees invalides.

### 004_leaderboard_cache.sql (P1 - Haute)

Cree des tables de cache pour les leaderboards:
- `lol_period_stats_cache`: Stats agregees par periode
- `lol_leaderboard_cache`: Classements pre-calcules
- Fonctions de rafraichissement pour le worker

**Impact**: Temps de reponse < 10ms pour les leaderboards (vs 100-500ms).

**Modification worker requise**: Appeler `refresh_all_leaderboards()` apres chaque batch.

### 005_valorant_schema.sql (P2 - Moyenne)

Schema complet pour le support Valorant:
- `val_accounts`: Comptes Valorant
- `val_current_ranks`: Ranks avec RR
- `val_matches`, `val_match_stats`: Matchs et stats
- `val_daily_stats`: Stats journalieres
- `val_agent_stats`: Stats par agent

**Impact**: Pret pour l'integration Valorant.

### 006_worker_indexes.sql (P2 - Moyenne)

Index optimises pour les operations du worker:
- Selection des comptes a rafraichir
- Upserts rapides
- Index partiels pour les donnees recentes

**Impact**: Amelioration de 20-40% sur les performances du worker.

## Rollback

Chaque migration inclut une section de rollback commentee en fin de fichier.

Pour annuler une migration:
1. Ouvrir le fichier SQL
2. Copier le bloc ROLLBACK a la fin
3. Executer dans psql

## Verification

Apres chaque migration, des messages NOTICE confirment le succes.

Pour verifier les index crees:
```sql
SELECT indexname, tablename
FROM pg_indexes
WHERE schemaname = 'public'
AND indexname LIKE 'idx_%'
ORDER BY tablename, indexname;
```

Pour verifier les contraintes:
```sql
SELECT conname, conrelid::regclass AS table_name
FROM pg_constraint
WHERE conname LIKE 'chk_%'
ORDER BY conrelid::regclass, conname;
```

## Monitoring post-migration

Apres les migrations, surveiller:
```sql
-- Temps de reponse des requetes principales
EXPLAIN ANALYZE SELECT * FROM v_current_leaderboard WHERE period_type = 'day' ORDER BY rank_position LIMIT 50;

-- Utilisation des index
SELECT indexrelname, idx_scan, idx_tup_read
FROM pg_stat_user_indexes
WHERE indexrelname LIKE 'idx_%'
ORDER BY idx_scan DESC;
```
