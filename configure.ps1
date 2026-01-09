# ============================================
# Esports Tracker - Configuration (Windows)
# A lancer dans PowerShell ou VS Code terminal
# ============================================

$ErrorActionPreference = "Stop"

# Fonctions d'affichage
function Write-Info($Text) { Write-Host "[INFO] $Text" -ForegroundColor Blue }
function Write-Success($Text) { Write-Host "[OK] $Text" -ForegroundColor Green }
function Write-Warn($Text) { Write-Host "[!] $Text" -ForegroundColor Yellow }
function Write-Err($Text) { Write-Host "[X] $Text" -ForegroundColor Red }

function Show-Banner {
    Clear-Host
    Write-Host ""
    Write-Host "============================================" -ForegroundColor Cyan
    Write-Host "   ESPORTS TRACKER - CONFIGURATION" -ForegroundColor Cyan
    Write-Host "============================================" -ForegroundColor Cyan
    Write-Host ""
}

function Show-Step($Step, $Total, $Title) {
    Write-Host ""
    Write-Host "------------------------------------------------------------" -ForegroundColor Magenta
    Write-Host "  ETAPE $Step/$Total : $Title" -ForegroundColor Cyan
    Write-Host "------------------------------------------------------------" -ForegroundColor Magenta
    Write-Host ""
}

function Ask-YesNo($Question, $Default = "Y") {
    if ($Default -eq "Y") {
        $prompt = "[O/n]"
    } else {
        $prompt = "[o/N]"
    }
    
    $answer = Read-Host "? $Question $prompt"
    if ([string]::IsNullOrEmpty($answer)) { $answer = $Default }
    
    return $answer -match "^[OoYy]"
}

function Ask-Input($Question, $Default = "", $IsPassword = $false) {
    if ($Default) {
        $prompt = "? $Question [$Default]"
    } else {
        $prompt = "? $Question"
    }
    
    if ($IsPassword) {
        $secure = Read-Host $prompt -AsSecureString
        $answer = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure))
    } else {
        $answer = Read-Host $prompt
    }
    
    if ([string]::IsNullOrEmpty($answer)) { $answer = $Default }
    return $answer
}

function Generate-Password($Length = 24) {
    $chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
    $password = ""
    for ($i = 0; $i -lt $Length; $i++) {
        $password += $chars[(Get-Random -Maximum $chars.Length)]
    }
    return $password
}

function Generate-Hex($Length = 64) {
    $chars = "abcdef0123456789"
    $hex = ""
    for ($i = 0; $i -lt $Length; $i++) {
        $hex += $chars[(Get-Random -Maximum $chars.Length)]
    }
    return $hex
}

# ==========================================
# DEBUT DU SCRIPT
# ==========================================

Show-Banner

Write-Host "Bienvenue dans l'assistant de configuration !" -ForegroundColor White
Write-Host ""
Write-Host "Ce wizard va generer tous les fichiers necessaires"
Write-Host "pour deployer sur ton VPS Hostinger."
Write-Host ""

if (-not (Ask-YesNo "Pret a commencer ?")) {
    Write-Info "Configuration annulee."
    exit
}

# ==========================================
# Etape 1 : Serveur
# ==========================================
Show-Step 1 5 "Informations du serveur Hostinger"

Write-Info "Ces infos sont dans ton panel Hostinger > VPS > Acces SSH"
Write-Host ""

do {
    $VPS_HOST = Ask-Input "Adresse IP de ton VPS Hostinger"
    if ([string]::IsNullOrEmpty($VPS_HOST)) {
        Write-Err "L'IP est obligatoire"
        continue
    }
    if ($VPS_HOST -match "^\d+\.\d+\.\d+\.\d+$") {
        Write-Success "IP valide : $VPS_HOST"
        break
    }
    Write-Err "Format d'IP invalide (ex: 123.45.67.89)"
} while ($true)

$VPS_USER = Ask-Input "Utilisateur SSH" "root"
Write-Success "Utilisateur : $VPS_USER"

$VPS_PORT = Ask-Input "Port SSH" "22"

Read-Host "`nAppuie sur Entree pour continuer..."

# ==========================================
# Etape 2 : Domaine
# ==========================================
Show-Step 2 5 "Configuration du domaine"

do {
    $DOMAIN = Ask-Input "Ton nom de domaine (ex: esports-tracker.com)"
    if ([string]::IsNullOrEmpty($DOMAIN)) {
        Write-Err "Le domaine est obligatoire"
        continue
    }
    if ($DOMAIN -match "^[a-zA-Z0-9][a-zA-Z0-9-]*\.[a-zA-Z]{2,}") {
        Write-Success "Domaine valide : $DOMAIN"
        break
    }
    Write-Err "Format invalide"
} while ($true)

do {
    $ACME_EMAIL = Ask-Input "Ton email (pour SSL)"
    if ([string]::IsNullOrEmpty($ACME_EMAIL)) {
        Write-Err "L'email est obligatoire"
        continue
    }
    if ($ACME_EMAIL -match "^[\w\.\-]+@[\w\.\-]+\.\w+$") {
        Write-Success "Email valide : $ACME_EMAIL"
        break
    }
    Write-Err "Format invalide"
} while ($true)

Read-Host "`nAppuie sur Entree pour continuer..."

# ==========================================
# Etape 3 : Base de donnees
# ==========================================
Show-Step 3 5 "Configuration de la base de donnees"

$DB_USER = Ask-Input "Nom d'utilisateur PostgreSQL" "esports"

if (Ask-YesNo "Generer un mot de passe PostgreSQL automatiquement ?") {
    $DB_PASSWORD = Generate-Password
    Write-Success "Mot de passe genere"
} else {
    do {
        $DB_PASSWORD = Ask-Input "Mot de passe PostgreSQL" "" $true
        if ($DB_PASSWORD.Length -ge 8) {
            Write-Success "Mot de passe defini"
            break
        }
        Write-Err "Minimum 8 caracteres"
    } while ($true)
}

$DB_DATABASE = Ask-Input "Nom de la base de donnees" "esports_tracker"

if (Ask-YesNo "Generer un mot de passe Redis automatiquement ?") {
    $REDIS_PASSWORD = Generate-Password
    Write-Success "Mot de passe Redis genere"
} else {
    $REDIS_PASSWORD = Ask-Input "Mot de passe Redis" "" $true
}

$APP_KEY = Generate-Hex

Read-Host "`nAppuie sur Entree pour continuer..."

# ==========================================
# Etape 4 : Riot API
# ==========================================
Show-Step 4 5 "Configuration de l'API Riot Games"

Write-Host "Pour obtenir une cle API :"
Write-Host "  1. Va sur https://developer.riotgames.com"
Write-Host "  2. Connecte-toi avec ton compte Riot"
Write-Host "  3. Copie ta Development API Key"
Write-Host ""

if (Ask-YesNo "As-tu deja une cle API Riot ?") {
    $RIOT_API_KEY = Ask-Input "Ta cle API Riot (RGAPI-xxx...)"
    if ($RIOT_API_KEY -match "^RGAPI-") {
        Write-Success "Format de cle valide"
    } else {
        Write-Warn "Format non reconnu, mais on continue"
    }
} else {
    $RIOT_API_KEY = "CHANGE_ME_LATER"
    Write-Warn "Tu devras configurer la cle plus tard"
}

Read-Host "`nAppuie sur Entree pour continuer..."

# ==========================================
# Etape 5 : Generation
# ==========================================
Show-Step 5 5 "Generation de la configuration"

$configDir = ".\deploy\generated"
if (-not (Test-Path $configDir)) {
    New-Item -ItemType Directory -Force -Path $configDir | Out-Null
}

# Fichier .env
Write-Info "Generation de .env..."

$envContent = @"
# ============================================
# Esports Tracker - Configuration Production
# Genere le $(Get-Date)
# ============================================

# DOMAINE
DOMAIN=$DOMAIN
ACME_EMAIL=$ACME_EMAIL

# BASE DE DONNEES
DB_HOST=esports-postgres
DB_PORT=5432
DB_USER=$DB_USER
DB_PASSWORD=$DB_PASSWORD
DB_DATABASE=$DB_DATABASE
DATABASE_URL=postgresql://${DB_USER}:${DB_PASSWORD}@esports-postgres:5432/$DB_DATABASE

# REDIS
REDIS_HOST=esports-redis
REDIS_PORT=6379
REDIS_PASSWORD=$REDIS_PASSWORD
REDIS_URL=redis://:${REDIS_PASSWORD}@esports-redis:6379

# APPLICATION
NODE_ENV=production
APP_KEY=$APP_KEY

# RIOT API
RIOT_API_KEY=$RIOT_API_KEY

# FRONTEND
NEXT_PUBLIC_API_URL=https://api.$DOMAIN
NEXT_PUBLIC_WS_URL=wss://api.$DOMAIN
"@

$envContent | Out-File -FilePath "$configDir\.env" -Encoding UTF8 -NoNewline
Write-Success ".env genere"

# README
Write-Info "Generation du recapitulatif..."

$readmeContent = @"
============================================================
        ESPORTS TRACKER - CONFIGURATION GENEREE
============================================================

Genere le : $(Get-Date)

SERVEUR
   IP :          $VPS_HOST
   Utilisateur : $VPS_USER
   Port SSH :    $VPS_PORT

DOMAINE
   Domaine :     $DOMAIN
   Email SSL :   $ACME_EMAIL

BASE DE DONNEES
   Utilisateur : $DB_USER
   Base :        $DB_DATABASE
   Mot de passe : $DB_PASSWORD

REDIS
   Mot de passe : $REDIS_PASSWORD

APPLICATION
   APP_KEY :     $APP_KEY

RIOT API
   Cle API :     $RIOT_API_KEY

============================================================
ETAPES SUIVANTES
============================================================

1. UPLOAD SUR LE SERVEUR
   - Utilise FileZilla ou WinSCP
   - Connecte-toi a ${VPS_USER}@${VPS_HOST} port $VPS_PORT
   - Upload tout le dossier esports-tracker dans /root/

2. SUR LE SERVEUR (SSH)
   ssh ${VPS_USER}@${VPS_HOST} -p $VPS_PORT
   cd esports-tracker
   cp deploy/generated/.env .env
   chmod +x install.sh
   ./install.sh

3. CONFIGURER LES DNS (chez ton registrar)
   Type A | @   | $VPS_HOST
   Type A | api | $VPS_HOST
   Type A | www | $VPS_HOST

============================================================
IMPORTANT : SAUVEGARDE CE FICHIER !
Il contient tous tes mots de passe
============================================================
"@

$readmeContent | Out-File -FilePath "$configDir\README.txt" -Encoding UTF8
Write-Success "README.txt genere"

# Resume final
Write-Host ""
Write-Host "============================================================" -ForegroundColor Green
Write-Host "   CONFIGURATION GENEREE !" -ForegroundColor Green
Write-Host "============================================================" -ForegroundColor Green
Write-Host ""

Write-Host "Fichiers crees dans : deploy\generated\" -ForegroundColor White
Write-Host ""
Get-ChildItem $configDir | Format-Table Name, Length -AutoSize
Write-Host ""

Write-Host "PROCHAINES ETAPES :" -ForegroundColor Yellow
Write-Host ""
Write-Host "  1. Upload le projet sur ton serveur Hostinger" -ForegroundColor Cyan
Write-Host "     Utilise FileZilla ou WinSCP" -ForegroundColor Gray
Write-Host "     Hote: $VPS_HOST | User: $VPS_USER | Port: $VPS_PORT" -ForegroundColor Gray
Write-Host ""
Write-Host "  2. Sur le serveur, lance ces commandes :" -ForegroundColor Cyan
Write-Host "     cd esports-tracker" -ForegroundColor Gray
Write-Host "     cp deploy/generated/.env .env" -ForegroundColor Gray
Write-Host "     chmod +x install.sh" -ForegroundColor Gray
Write-Host "     ./install.sh" -ForegroundColor Gray
Write-Host ""
Write-Host "  3. Configure tes DNS chez Hostinger" -ForegroundColor Cyan
Write-Host "     A | @ | $VPS_HOST" -ForegroundColor Gray
Write-Host "     A | api | $VPS_HOST" -ForegroundColor Gray
Write-Host ""

Write-Warn "Sauvegarde deploy\generated\README.txt"
Write-Warn "Il contient tous tes mots de passe !"
Write-Host ""

Read-Host "Appuie sur Entree pour terminer..."
