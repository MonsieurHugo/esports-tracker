"""
Database Status Check Script
Vérifie l'état des joueurs et comptes importés
"""

import asyncio
import sys

# Fix Windows console encoding
if sys.platform == 'win32':
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    sys.stderr.reconfigure(encoding='utf-8', errors='replace')

import asyncpg

from src.config import settings


async def check_database():
    """Check database status."""
    print("=" * 60)
    print("DIAGNOSTIC DE LA BASE DE DONNÉES")
    print("=" * 60)

    try:
        conn = await asyncpg.connect(settings.database_url)
        print(f"✓ Connexion réussie à la base de données\n")
    except Exception as e:
        print(f"✗ Erreur de connexion: {e}")
        print("\nAssurez-vous que le tunnel SSH est actif:")
        print("  ssh -L 5433:127.0.0.1:5432 root@monsieuryordle.com")
        return

    try:
        # 1. Nombre de joueurs
        players_count = await conn.fetchval("SELECT COUNT(*) FROM players")
        active_players = await conn.fetchval("SELECT COUNT(*) FROM players WHERE is_active = true")
        print(f"JOUEURS:")
        print(f"  Total:  {players_count}")
        print(f"  Actifs: {active_players}")

        # 2. Nombre de comptes
        accounts_count = await conn.fetchval("SELECT COUNT(*) FROM lol_accounts")
        print(f"\nCOMPTES LOL:")
        print(f"  Total: {accounts_count}")

        # 3. Comptes par région
        regions = await conn.fetch("""
            SELECT region, COUNT(*) as count
            FROM lol_accounts
            GROUP BY region
            ORDER BY count DESC
        """)
        print(f"\n  Par région:")
        for r in regions:
            print(f"    {r['region']}: {r['count']}")

        # 4. Équipes
        teams_count = await conn.fetchval("SELECT COUNT(*) FROM teams")
        print(f"\nÉQUIPES: {teams_count}")

        # 5. Ligues
        leagues = await conn.fetch("SELECT short_name, name FROM leagues ORDER BY tier, short_name")
        print(f"\nLIGUES: {len(leagues)}")
        for l in leagues:
            print(f"  - {l['short_name']}: {l['name']}")

        # 6. Joueurs sans comptes
        players_no_accounts = await conn.fetch("""
            SELECT p.player_id, p.slug, p.current_pseudo
            FROM players p
            LEFT JOIN lol_accounts a ON p.player_id = a.player_id
            WHERE a.puuid IS NULL
            ORDER BY p.slug
        """)
        print(f"\nJOUEURS SANS COMPTES: {len(players_no_accounts)}")
        if players_no_accounts:
            print("  (premiers 20):")
            for p in players_no_accounts[:20]:
                print(f"    - {p['slug']} ({p['current_pseudo']})")
            if len(players_no_accounts) > 20:
                print(f"    ... et {len(players_no_accounts) - 20} autres")

        # 7. Joueurs avec plusieurs comptes
        multi_accounts = await conn.fetch("""
            SELECT p.slug, p.current_pseudo, COUNT(a.puuid) as account_count
            FROM players p
            JOIN lol_accounts a ON p.player_id = a.player_id
            GROUP BY p.player_id, p.slug, p.current_pseudo
            HAVING COUNT(a.puuid) > 1
            ORDER BY account_count DESC
            LIMIT 10
        """)
        print(f"\nJOUEURS AVEC PLUSIEURS COMPTES (top 10):")
        for p in multi_accounts:
            print(f"  - {p['slug']}: {p['account_count']} comptes")

        # 8. Contrats actifs
        contracts = await conn.fetchval("""
            SELECT COUNT(*) FROM player_contracts WHERE end_date IS NULL
        """)
        print(f"\nCONTRATS ACTIFS: {contracts}")

        # 9. Contrats par équipe/ligue
        contracts_by_league = await conn.fetch("""
            SELECT t.league, COUNT(pc.contract_id) as players
            FROM player_contracts pc
            JOIN teams t ON pc.team_id = t.team_id
            WHERE pc.end_date IS NULL
            GROUP BY t.league
            ORDER BY t.league
        """)
        print(f"\n  Par ligue:")
        for c in contracts_by_league:
            print(f"    {c['league']}: {c['players']} joueurs")

        # 10. Vérifier les slugs dupliqués potentiels
        print(f"\n" + "=" * 60)
        print("ANALYSE DES PROBLÈMES POTENTIELS")
        print("=" * 60)

        # Slugs vides ou "unknown"
        bad_slugs = await conn.fetch("""
            SELECT slug, current_pseudo FROM players
            WHERE slug = '' OR slug = 'unknown' OR slug IS NULL
        """)
        if bad_slugs:
            print(f"\n⚠ SLUGS INVALIDES: {len(bad_slugs)}")
            for p in bad_slugs:
                print(f"  - '{p['slug']}' ({p['current_pseudo']})")
        else:
            print(f"\n✓ Pas de slugs invalides")

        # Comptes sans player_id valide
        orphan_accounts = await conn.fetchval("""
            SELECT COUNT(*) FROM lol_accounts a
            LEFT JOIN players p ON a.player_id = p.player_id
            WHERE p.player_id IS NULL
        """)
        if orphan_accounts > 0:
            print(f"\n⚠ COMPTES ORPHELINS: {orphan_accounts}")
        else:
            print(f"✓ Pas de comptes orphelins")

        # Ratio comptes/joueurs
        if players_count > 0:
            ratio = accounts_count / players_count
            print(f"\n📊 RATIO COMPTES/JOUEUR: {ratio:.2f}")
            print(f"   (Attendu: ~2.16 basé sur 857 comptes / 396 joueurs)")

        print(f"\n" + "=" * 60)

    finally:
        await conn.close()


if __name__ == "__main__":
    asyncio.run(check_database())
