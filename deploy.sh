#!/bin/bash

# deploy.sh - Script complet de deployment pentru DigitalOcean
# Rulează cu: chmod +x deploy.sh && ./deploy.sh

set -e  # Oprește scriptul la prima eroare

# Culori pentru output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Funcții helper
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Configurații
DOMAIN="dariushreniuc.com"
EMAIL="your_email@gmail.com"  # Schimbă cu email-ul tău pentru Let's Encrypt
APP_DIR="/opt/barbershop"
BACKUP_DIR="/opt/backups"

log_info " Începe deployment-ul pentru $DOMAIN"

# 1. Verifică dacă rulează ca root
if [[ $EUID -ne 0 ]]; then
   log_error "Acest script trebuie rulat ca root (sudo ./deploy.sh)"
   exit 1
fi

# 2. Update sistem
log_info " Actualizează sistemul..."
apt update && apt upgrade -y

# 3. Instalează dependențele necesare
log_info " Instalează dependențele..."
apt install -y \
    curl \
    wget \
    git \
    ufw \
    htop \
    nano \
    unzip \
    software-properties-common \
    apt-transport-https \
    ca-certificates \
    gnupg \
    lsb-release

# 4. Instalează Docker
if ! command -v docker &> /dev/null; then
    log_info " Instalează Docker..."
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null
    apt update
    apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
    systemctl enable docker
    systemctl start docker
    log_success "Docker instalat cu succes"
else
    log_success "Docker este deja instalat"
fi

# 5. Configurează firewall
log_info " Configurează firewall..."
ufw --force reset
ufw default deny incoming
ufw default allow outgoing
ufw allow ssh
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable
log_success "Firewall configurat"

# 6. Creează directoarele necesare
log_info " Creează structura de directoare..."
mkdir -p $APP_DIR
mkdir -p $BACKUP_DIR
mkdir -p /etc/letsencrypt
mkdir -p /var/www/certbot

# 7. Clonează/actualizează codul
if [ -d "$APP_DIR/.git" ]; then
    log_info " Actualizează codul existent..."
    cd $APP_DIR
    git pull origin main
else
    log_info "📥 Clonează codul..."
    git clone https://github.com/parnau-patrick/Website/tree/main $APP_DIR
    cd $APP_DIR
fi

# 8. Verifică fișierele necesare
log_info " Verifică fișierele necesare..."
required_files=(
    "docker-compose.yml"
    "backend.Dockerfile"
    "frontend.Dockerfile"
    "nginx-production.conf"
    "backend/.env"
)

for file in "${required_files[@]}"; do
    if [ ! -f "$file" ]; then
        log_error "Fișierul $file nu există!"
        exit 1
    fi
done

# 9. Verifică configurația .env
if [ ! -f "backend/.env" ]; then
    log_error "Fișierul backend/.env nu există!"
    log_info "Copiază backend/.env.production la backend/.env și configurează-l"
    exit 1
fi

# 10. Oprește serviciile existente (dacă există)
log_info " Oprește serviciile existente..."
docker compose down --remove-orphans || true

# 11. Construiește și pornește serviciile
log_info " Construiește imaginile Docker..."
docker compose build --no-cache

log_info " Pornește serviciile..."
docker compose up -d

# 12. Așteaptă ca serviciile să fie gata
log_info " Așteaptă ca serviciile să pornească..."
sleep 30

# 13. Verifică starea serviciilor
log_info " Verifică starea serviciilor..."
docker compose ps

# 14. Testează conectivitatea
log_info " Testează serviciile..."
if curl -f http://localhost:80/health &> /dev/null; then
    log_success "Frontend este funcțional"
else
    log_warning "Frontend nu răspunde la health check"
fi

# 15. Configurează SSL cu Let's Encrypt
log_info " Configurează SSL cu Let's Encrypt..."
read -p "Vrei să configurezi SSL acum? (y/N): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    ./setup-ssl.sh $DOMAIN $EMAIL
fi

# 16. Configurează backup automat
log_info " Configurează backup-ul automat..."
cat > /etc/cron.d/barbershop-backup << EOF
# Backup zilnic la 2:00 AM
0 2 * * * root $APP_DIR/backup.sh >> /var/log/barbershop-backup.log 2>&1
EOF

# 17. Configurează actualizări automate de securitate
log_info " Configurează actualizările automate de securitate..."
apt install -y unattended-upgrades
echo 'Unattended-Upgrade::Automatic-Reboot "false";' >> /etc/apt/apt.conf.d/50unattended-upgrades

# 18. Configurează monitoring simplu
log_info " Configurează monitoring..."
cat > /usr/local/bin/barbershop-monitor.sh << 'EOF'
#!/bin/bash
cd /opt/barbershop
if ! docker compose ps | grep -q "Up"; then
    echo "$(date): Serviciile nu rulează, repornire..." >> /var/log/barbershop-monitor.log
    docker compose up -d
fi
EOF

chmod +x /usr/local/bin/barbershop-monitor.sh

# Adaugă job de monitoring la cron
cat > /etc/cron.d/barbershop-monitor << EOF
# Verifică serviciile la fiecare 5 minute
*/5 * * * * root /usr/local/bin/barbershop-monitor.sh
EOF

# 19. Afișează informații finale
log_success " Deployment finalizat cu succes!"
echo
log_info " Informații importante:"
echo "   • Directorul aplicației: $APP_DIR"
echo "   • Backup-uri: $BACKUP_DIR"
echo "   • Log-uri aplicație: docker compose logs -f"
echo "   • Restart servicii: docker compose restart"
echo "   • Stop servicii: docker compose down"
echo "   • Start servicii: docker compose up -d"
echo
log_info " Website-ul va fi disponibil la:"
echo "   • http://$DOMAIN (va fi redirectat către HTTPS)"
echo "   • https://$DOMAIN (după configurarea SSL)"
echo
log_warning "  NU uita să:"
echo "   1. Configurezi DNS-ul pentru $DOMAIN să pointeze la acest server"
echo "   2. Configurezi SSL cu ./setup-ssl.sh dacă nu ai făcut-o deja"
echo "   3. Verifici configurația backend/.env"
echo "   4. Testezi toate funcționalitățile site-ului"
echo
log_info " Pentru monitorizare:"
echo "   • docker compose ps  - status servicii"
echo "   • docker compose logs -f  - log-uri live"
echo "   • htop  - utilizare sistem"