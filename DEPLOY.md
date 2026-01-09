# 🚀 Déploiement sur VPS Hostinger

Guide complet pour déployer Esports Tracker sur un VPS Hostinger.

## 📋 Table des matières

1. [Prérequis](#prérequis)
2. [Configuration initiale du VPS](#configuration-initiale-du-vps)
3. [Installation des dépendances](#installation-des-dépendances)
4. [Configuration du domaine](#configuration-du-domaine)
5. [Déploiement de l'application](#déploiement-de-lapplication)
6. [Configuration SSL](#configuration-ssl)
7. [Maintenance](#maintenance)
8. [Monitoring](#monitoring)
9. [Troubleshooting](#troubleshooting)

---

## 📦 Prérequis

### VPS Hostinger recommandé

| Plan | RAM | CPU | Stockage | Prix |
|------|-----|-----|----------|------|
| **KVM 2** (minimum) | 8 GB | 4 vCPU | 100 GB NVMe | ~€13/mois |
| **KVM 4** (recommandé) | 16 GB | 8 vCPU | 200 GB NVMe | ~€19/mois |

### Domaine

- Un domaine configuré (ex: `esports-tracker.com`)
- Accès aux DNS (Hostinger ou autre)

### Outils locaux

- Terminal SSH
- Clé SSH (recommandé)

---

## 🔧 Configuration initiale du VPS

### 1. Connexion SSH

```bash
# Première connexion avec mot de passe
ssh root@VOTRE_IP_VPS

# Ou avec clé SSH
ssh -i ~/.ssh/id_rsa root@VOTRE_IP_VPS
```

### 2. Mise à jour du système

```bash
apt update && apt upgrade -y
```

### 3. Créer un utilisateur dédié

```bash
# Créer l'utilisateur
adduser esports

# Ajouter aux groupes sudo et docker
usermod -aG sudo esports
usermod -aG docker esports

# Configurer SSH pour le nouvel utilisateur
mkdir -p /home/esports/.ssh
cp ~/.ssh/authorized_keys /home/esports/.ssh/
chown -R esports:esports /home/esports/.ssh
chmod 700 /home/esports/.ssh
chmod 600 /home/esports/.ssh/authorized_keys
```

### 4. Sécuriser SSH

```bash
# Éditer la config SSH
nano /etc/ssh/sshd_config
```

Modifier ces lignes :
```
PermitRootLogin no
PasswordAuthentication no
PubkeyAuthentication yes
```

```bash
# Redémarrer SSH
systemctl restart sshd
```

### 5. Configurer le firewall

```bash
# Installer UFW
apt install ufw -y

# Configuration de base
ufw default deny incoming
ufw default allow outgoing

# Autoriser SSH
ufw allow 22/tcp

# Autoriser HTTP/HTTPS
ufw allow 80/tcp
ufw allow 443/tcp

# Activer le firewall
ufw enable

# Vérifier le status
ufw status
```

### 6. Installer Fail2Ban

```bash
apt install fail2ban -y

# Créer la config locale
cat > /etc/fail2ban/jail.local << 'EOF'
[DEFAULT]
bantime = 1h
findtime = 10m
maxretry = 5

[sshd]
enabled = true
port = 22
filter = sshd
logpath = /var/log/auth.log
maxretry = 3
EOF

systemctl enable fail2ban
systemctl start fail2ban
```

---

## 📥 Installation des dépendances

### Script automatique

```bash
# Se connecter en tant qu'esports
su - esports

# Télécharger et exécuter le script
curl -fsSL https://raw.githubusercontent.com/VOTRE_USERNAME/esports-tracker/main/deploy/scripts/install-server.sh | bash
```

### Ou manuellement

#### Docker

```bash
# Installer Docker
curl -fsSL https://get.docker.com | sh

# Ajouter l'utilisateur au groupe docker
sudo usermod -aG docker $USER

# Installer Docker Compose plugin
sudo apt install docker-compose-plugin -y

# Vérifier l'installation
docker --version
docker compose version
```

#### Autres outils

```bash
# Git
sudo apt install git -y

# Certbot pour SSL
sudo apt install certbot python3-certbot-nginx -y

# Htop pour monitoring
sudo apt install htop -y
```

---

## 🌐 Configuration du domaine

### DNS Records

Configurez ces enregistrements DNS chez Hostinger ou votre registrar :

| Type | Nom | Valeur | TTL |
|------|-----|--------|-----|
| A | @ | `VOTRE_IP_VPS` | 3600 |
| A | www | `VOTRE_IP_VPS` | 3600 |
| A | api | `VOTRE_IP_VPS` | 3600 |
| CNAME | traefik | `@` | 3600 |

### Vérification

```bash
# Vérifier la propagation DNS
dig +short esports-tracker.com
dig +short api.esports-tracker.com
```

---

## 🚀 Déploiement de l'application

### 1. Cloner le projet

```bash
cd ~
git clone https://github.com/VOTRE_USERNAME/esports-tracker.git
cd esports-tracker
```

### 2. Configurer l'environnement

```bash
# Copier le template
cp .env.example .env

# Éditer avec vos valeurs
nano .env
```

Contenu du `.env` :
```bash
# Domain
DOMAIN=esports-tracker.com
ACME_EMAIL=votre@email.com

# Database
DB_USER=esports
DB_PASSWORD=VOTRE_MOT_DE_PASSE_FORT
DB_DATABASE=esports_tracker

# Redis
REDIS_PASSWORD=VOTRE_MOT_DE_PASSE_REDIS

# App
APP_KEY=$(openssl rand -hex 32)
NODE_ENV=production

# Riot API
RIOT_API_KEY=RGAPI-votre-cle

# GitHub (pour pull des images)
GITHUB_REPOSITORY=votre-username/esports-tracker

# Traefik (optionnel)
TRAEFIK_AUTH=$(htpasswd -nb admin VOTRE_MOT_DE_PASSE)
```

### 3. Générer les secrets

```bash
# Générer APP_KEY
echo "APP_KEY=$(openssl rand -hex 32)" >> .env

# Générer mot de passe DB
echo "DB_PASSWORD=$(openssl rand -base64 24)" >> .env

# Générer mot de passe Redis
echo "REDIS_PASSWORD=$(openssl rand -base64 24)" >> .env
```

### 4. Premier déploiement

```bash
# Se connecter à GitHub Container Registry
echo $GITHUB_TOKEN | docker login ghcr.io -u VOTRE_USERNAME --password-stdin

# Lancer les services
docker compose -f docker-compose.prod.yml up -d

# Vérifier les logs
docker compose -f docker-compose.prod.yml logs -f
```

### 5. Initialiser la base de données

```bash
# Exécuter les migrations
docker compose -f docker-compose.prod.yml exec backend node ace migration:run

# (Optionnel) Seed initial
docker compose -f docker-compose.prod.yml exec backend node ace db:seed
```

---

## 🔒 Configuration SSL

### Avec Traefik (recommandé)

Traefik gère automatiquement les certificats Let's Encrypt. Assurez-vous que :

1. Le domaine pointe vers votre IP
2. Les ports 80 et 443 sont ouverts
3. L'email ACME est configuré dans `.env`

### Vérification SSL

```bash
# Vérifier le certificat
curl -vI https://esports-tracker.com 2>&1 | grep -i "SSL certificate"

# Ou avec OpenSSL
openssl s_client -connect esports-tracker.com:443 -servername esports-tracker.com
```

---

## 🔄 Maintenance

### Mise à jour de l'application

```bash
cd ~/esports-tracker

# Pull les nouvelles images
docker compose -f docker-compose.prod.yml pull

# Redémarrer avec les nouvelles images
docker compose -f docker-compose.prod.yml up -d

# Exécuter les migrations si nécessaire
docker compose -f docker-compose.prod.yml exec backend node ace migration:run
```

### Backup de la base de données

```bash
# Backup manuel
./deploy/scripts/backup.sh

# Vérifier les backups
ls -la ~/backups/
```

### Backup automatique (cron)

```bash
# Éditer crontab
crontab -e

# Ajouter (backup quotidien à 3h du matin)
0 3 * * * /home/esports/esports-tracker/deploy/scripts/backup.sh
```

### Nettoyage Docker

```bash
# Supprimer les images non utilisées
docker image prune -af --filter "until=24h"

# Supprimer les volumes orphelins
docker volume prune -f

# Nettoyage complet (attention!)
docker system prune -af
```

---

## 📊 Monitoring

### Vérifier l'état des services

```bash
# Status des containers
docker compose -f docker-compose.prod.yml ps

# Utilisation des ressources
docker stats

# Logs en temps réel
docker compose -f docker-compose.prod.yml logs -f --tail=100
```

### Health checks

```bash
# API Health
curl -f http://localhost:3333/health

# Frontend
curl -f http://localhost:3000

# PostgreSQL
docker compose -f docker-compose.prod.yml exec postgres pg_isready

# Redis
docker compose -f docker-compose.prod.yml exec redis redis-cli ping
```

### Monitoring avec Htop

```bash
htop
```

### Logs système

```bash
# Logs Docker
journalctl -u docker -f

# Logs système
tail -f /var/log/syslog
```

---

## 🔧 Troubleshooting

### Container qui ne démarre pas

```bash
# Voir les logs du container
docker compose -f docker-compose.prod.yml logs backend

# Inspecter le container
docker inspect esports-backend
```

### Problème de connexion à la DB

```bash
# Vérifier que PostgreSQL est accessible
docker compose -f docker-compose.prod.yml exec postgres psql -U esports -d esports_tracker -c "SELECT 1"

# Vérifier les variables d'environnement
docker compose -f docker-compose.prod.yml exec backend env | grep DB
```

### Certificat SSL non généré

```bash
# Vérifier les logs Traefik
docker compose -f docker-compose.prod.yml logs traefik

# Vérifier que le port 80 est accessible (nécessaire pour ACME challenge)
curl http://esports-tracker.com/.well-known/acme-challenge/test
```

### Espace disque insuffisant

```bash
# Vérifier l'espace
df -h

# Nettoyer Docker
docker system prune -af

# Nettoyer les logs
sudo journalctl --vacuum-time=7d
```

### Redémarrer tous les services

```bash
cd ~/esports-tracker
docker compose -f docker-compose.prod.yml down
docker compose -f docker-compose.prod.yml up -d
```

### Reset complet (⚠️ ATTENTION: perte de données)

```bash
# Arrêter tout
docker compose -f docker-compose.prod.yml down -v

# Supprimer les données
sudo rm -rf ~/esports-tracker

# Recloner et redéployer
git clone https://github.com/VOTRE_USERNAME/esports-tracker.git
cd esports-tracker
# ... reconfigurer .env
docker compose -f docker-compose.prod.yml up -d
```

---

## 📞 Support Hostinger

- **Chat en direct** : Disponible 24/7 dans le panel Hostinger
- **Base de connaissances** : https://support.hostinger.com/
- **Email** : support@hostinger.com

---

## 📚 Ressources

- [Documentation Docker](https://docs.docker.com/)
- [Documentation Traefik](https://doc.traefik.io/traefik/)
- [Let's Encrypt](https://letsencrypt.org/docs/)
- [Riot Games API](https://developer.riotgames.com/)
