============================================================
        ESPORTS TRACKER - CONFIGURATION GENEREE
============================================================

Genere le : 01/09/2026 20:12:13

SERVEUR
   IP :          148.230.71.240
   Utilisateur : root
   Port SSH :    22

DOMAINE
   Domaine :     monsieuryordle.com
   Email SSL :   hugothierry17@gmail.com

BASE DE DONNEES
   Utilisateur : monsieuryordle
   Base :        esports
   Mot de passe : WpvN27rH1dSYYUdpxWM2hHtz

REDIS
   Mot de passe : pZShdFTHAcI9CIG6iUFtbMOa

APPLICATION
   APP_KEY :     7cd6607a803b34e77f83fa035469f50a65e4ca2a4cfa7a34d6214971bf88cbea

RIOT API
   Cle API :     RGAPI-f4c54bdd-48ba-4dec-8f5a-094511c21921

============================================================
ETAPES SUIVANTES
============================================================

1. UPLOAD SUR LE SERVEUR
   - Utilise FileZilla ou WinSCP
   - Connecte-toi a root@148.230.71.240 port 22
   - Upload tout le dossier esports-tracker dans /root/

2. SUR LE SERVEUR (SSH)
   ssh root@148.230.71.240 -p 22
   cd esports-tracker
   cp deploy/generated/.env .env
   chmod +x install.sh
   ./install.sh

3. CONFIGURER LES DNS (chez ton registrar)
   Type A | @   | 148.230.71.240
   Type A | api | 148.230.71.240
   Type A | www | 148.230.71.240

============================================================
IMPORTANT : SAUVEGARDE CE FICHIER !
Il contient tous tes mots de passe
============================================================
