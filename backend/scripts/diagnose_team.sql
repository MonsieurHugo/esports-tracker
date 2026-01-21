-- Script de diagnostic pour équipes manquantes dans le leaderboard
-- Usage: Remplacer 'Gen' par le nom de l'équipe recherchée

-- 1. Vérifier si l'équipe existe et son statut
SELECT
    '1. EQUIPE' as step,
    t.team_id,
    t.current_name,
    t.short_name,
    t.league,
    t.is_active,
    t.org_id,
    CASE
        WHEN t.is_active = false THEN 'PROBLEME: Equipe inactive'
        WHEN t.org_id IS NULL THEN 'PROBLEME: Pas d''organisation'
        ELSE 'OK'
    END as diagnostic
FROM teams t
WHERE t.current_name ILIKE '%Gen%' OR t.short_name ILIKE '%gen%';

-- 2. Vérifier l'organisation
SELECT
    '2. ORGANISATION' as step,
    t.team_id,
    t.current_name,
    o.org_id,
    o.name as org_name,
    CASE
        WHEN o.org_id IS NULL THEN 'PROBLEME: Organisation non trouvée'
        ELSE 'OK'
    END as diagnostic
FROM teams t
LEFT JOIN organizations o ON t.org_id = o.org_id
WHERE t.current_name ILIKE '%Gen%' OR t.short_name ILIKE '%gen%';

-- 3. Vérifier les contrats de joueurs actifs
SELECT
    '3. CONTRATS ACTIFS' as step,
    t.team_id,
    t.current_name,
    COUNT(pc.player_id) as nb_contrats_actifs,
    CASE
        WHEN COUNT(pc.player_id) = 0 THEN 'PROBLEME: Aucun contrat actif'
        ELSE 'OK - ' || COUNT(pc.player_id) || ' joueurs'
    END as diagnostic
FROM teams t
LEFT JOIN player_contracts pc ON pc.team_id = t.team_id AND pc.end_date IS NULL
WHERE t.current_name ILIKE '%Gen%' OR t.short_name ILIKE '%gen%'
GROUP BY t.team_id, t.current_name;

-- 4. Détail des contrats (actifs et inactifs)
SELECT
    '4. DETAIL CONTRATS' as step,
    t.current_name,
    p.summoner_name,
    pc.role,
    pc.start_date,
    pc.end_date,
    CASE
        WHEN pc.end_date IS NULL THEN 'ACTIF'
        ELSE 'TERMINE'
    END as statut
FROM teams t
LEFT JOIN player_contracts pc ON pc.team_id = t.team_id
LEFT JOIN players p ON pc.player_id = p.player_id
WHERE t.current_name ILIKE '%Gen%' OR t.short_name ILIKE '%gen%'
ORDER BY pc.end_date NULLS FIRST, pc.start_date DESC;

-- 5. Vérifier les comptes LoL des joueurs sous contrat actif
SELECT
    '5. COMPTES LOL' as step,
    t.current_name,
    p.summoner_name,
    COUNT(a.puuid) as nb_comptes,
    CASE
        WHEN COUNT(a.puuid) = 0 THEN 'PROBLEME: Pas de compte LoL'
        ELSE 'OK - ' || COUNT(a.puuid) || ' compte(s)'
    END as diagnostic
FROM teams t
JOIN player_contracts pc ON pc.team_id = t.team_id AND pc.end_date IS NULL
JOIN players p ON pc.player_id = p.player_id
LEFT JOIN lol_accounts a ON a.player_id = p.player_id
WHERE t.current_name ILIKE '%Gen%' OR t.short_name ILIKE '%gen%'
GROUP BY t.current_name, p.summoner_name;

-- 6. Vérifier les stats quotidiennes (dernier mois)
SELECT
    '6. STATS QUOTIDIENNES (30 derniers jours)' as step,
    t.current_name,
    p.summoner_name,
    a.game_name,
    COUNT(ds.date) as nb_jours_avec_stats,
    MAX(ds.date) as derniere_stat,
    COALESCE(SUM(ds.games_played), 0) as total_games,
    CASE
        WHEN COUNT(ds.date) = 0 THEN 'PROBLEME: Aucune stat récente'
        ELSE 'OK - ' || COUNT(ds.date) || ' jours de data'
    END as diagnostic
FROM teams t
JOIN player_contracts pc ON pc.team_id = t.team_id AND pc.end_date IS NULL
JOIN players p ON pc.player_id = p.player_id
JOIN lol_accounts a ON a.player_id = p.player_id
LEFT JOIN lol_daily_stats ds ON ds.puuid = a.puuid
    AND ds.date >= CURRENT_DATE - INTERVAL '30 days'
WHERE t.current_name ILIKE '%Gen%' OR t.short_name ILIKE '%gen%'
GROUP BY t.current_name, p.summoner_name, a.game_name;

-- 7. Résumé : Pourquoi l'équipe n'apparaît pas
SELECT
    '7. RESUME DIAGNOSTIC' as step,
    t.current_name,
    t.is_active,
    CASE WHEN o.org_id IS NOT NULL THEN 'OK' ELSE 'MANQUE' END as organisation,
    (SELECT COUNT(*) FROM player_contracts WHERE team_id = t.team_id AND end_date IS NULL) as contrats_actifs,
    (
        SELECT COUNT(DISTINCT a.puuid)
        FROM player_contracts pc2
        JOIN lol_accounts a ON a.player_id = pc2.player_id
        WHERE pc2.team_id = t.team_id AND pc2.end_date IS NULL
    ) as comptes_lol,
    (
        SELECT COUNT(DISTINCT ds.date)
        FROM player_contracts pc3
        JOIN lol_accounts a2 ON a2.player_id = pc3.player_id
        JOIN lol_daily_stats ds ON ds.puuid = a2.puuid AND ds.date >= CURRENT_DATE - INTERVAL '30 days'
        WHERE pc3.team_id = t.team_id AND pc3.end_date IS NULL
    ) as jours_avec_stats_30j
FROM teams t
LEFT JOIN organizations o ON t.org_id = o.org_id
WHERE t.current_name ILIKE '%Gen%' OR t.short_name ILIKE '%gen%';

-- 8. Test final : Simule la requête du leaderboard pour cette équipe
SELECT
    '8. TEST REQUETE LEADERBOARD' as step,
    t.team_id,
    t.current_name,
    COUNT(DISTINCT ds.date) as jours_avec_data,
    COALESCE(SUM(ds.games_played), 0) as total_games,
    'DEVRAIT APPARAITRE' as resultat
FROM teams t
JOIN organizations o ON t.org_id = o.org_id
JOIN player_contracts pc ON pc.team_id = t.team_id AND pc.end_date IS NULL
JOIN lol_accounts a ON pc.player_id = a.player_id
JOIN lol_daily_stats ds ON ds.puuid = a.puuid
    AND ds.date >= CURRENT_DATE - INTERVAL '30 days'
WHERE t.is_active = true
    AND (t.current_name ILIKE '%Gen%' OR t.short_name ILIKE '%gen%')
GROUP BY t.team_id, t.current_name;
