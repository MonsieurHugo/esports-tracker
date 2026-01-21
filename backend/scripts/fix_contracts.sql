-- Script pour nettoyer les contrats dupliqués
-- Un joueur ne doit avoir qu'un seul contrat actif (end_date IS NULL)

-- 1. Voir les doublons
SELECT player_id, COUNT(*) as count
FROM player_contracts
WHERE end_date IS NULL
GROUP BY player_id
HAVING COUNT(*) > 1;

-- 2. Supprimer les doublons (garder le contrat avec le plus grand contract_id)
DELETE FROM player_contracts
WHERE contract_id IN (
  SELECT contract_id
  FROM (
    SELECT contract_id,
           ROW_NUMBER() OVER (PARTITION BY player_id ORDER BY contract_id DESC) as rn
    FROM player_contracts
    WHERE end_date IS NULL
  ) sub
  WHERE rn > 1
);

-- 3. Créer l'index unique partiel pour empêcher les futurs doublons
CREATE UNIQUE INDEX IF NOT EXISTS player_contracts_unique_active_contract
ON player_contracts (player_id)
WHERE end_date IS NULL;

-- 4. Vérifier que les doublons ont été supprimés
SELECT player_id, COUNT(*) as count
FROM player_contracts
WHERE end_date IS NULL
GROUP BY player_id
HAVING COUNT(*) > 1;
