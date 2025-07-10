#!/bin/bash

# setup-ssl.sh - Configurare SSL cu Let's Encrypt pentru DigitalOcean
# Utilizare: ./setup-ssl.sh domain.com your-email@example.com

set -e

# Culori pentru output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

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

# Verifică parametrii
if [ $# -ne 2 ]; then
    log_error "Utilizare: $0 <domain> <email>"
    log_info "Exemplu: $0 dariushreniuc.com your-email@gmail.com"
    exit 1
fi

DOMAIN=$1
EMAIL=$2
APP_DIR="/opt/barbershop"

log_info " Configurare SSL pentru $DOMAIN cu email $EMAIL"

# Verifică dacă Docker rulează
if ! docker info &> /dev/null; then
    log_error "Docker nu rulează!"
    exit 1
fi

cd $APP_DIR

# 1. Verifică că site-ul răspunde pe HTTP
log_info " Verifică că site-ul răspunde pe HTTP..."
if ! curl -f http://$DOMAIN/health &> /dev/null; then
    log_error "Site-ul nu răspunde pe http://$DOMAIN"
    log_info "Verifică că:"
    log_info "  • DNS-ul pentru $DOMAIN pointează la acest server"
    log_info "  • Serviciile Docker rulează: docker compose ps"
    log_info "  • Firewall-ul permite traficul pe portul 80: ufw status"
    exit 1
fi

log_success "Site-ul răspunde pe HTTP"

# 2. Oprește serviciile temporar pentru a evita conflictele
log_info " Oprește serviciile temporar..."
docker compose down

# 3. Pornește doar nginx pentru validarea Let's Encrypt
log_info " Pornește nginx temporar pentru validare..."
docker compose up -d frontend

# Așteaptă ca nginx să pornească
sleep 10

# 4. Obține certificatul SSL
log_info " Obține certificatul SSL..."
docker compose run --rm certbot certonly \
    --webroot \
    --webroot-path=/var/www/certbot \
    --email $EMAIL \
    --agree-tos \
    --no-eff-email \
    --force-renewal \
    -d $DOMAIN \
    -d www.$DOMAIN

if [ $? -eq 0 ]; then
    log_success "Certificat SSL obținut cu succes!"
else
    log_error "Eșec la obținerea certificatului SSL"
    exit 1
fi

# 5. Verifică că certificatele există
if [ ! -f "/var/lib/docker/volumes/barbershop_letsencrypt_certs/_data/live/$DOMAIN/fullchain.pem" ]; then
    log_error "Certificatele nu au fost create!"
    exit 1
fi

# 6. Repornește toate serviciile cu SSL activat
log_info " Repornește serviciile cu SSL..."
docker compose down
docker compose up -d

# Așteaptă ca serviciile să pornească
sleep 30

# 7. Testează SSL
log_info " Testează HTTPS..."
if curl -f https://$DOMAIN/health &> /dev/null; then
    log_success "HTTPS funcționează!"
else
    log_warning "HTTPS nu răspunde încă, poate avea nevoie de câteva minute..."
fi

# 8. Configurează reînnoirea automată
log_info " Configurează reînnoirea automată..."
cat > /etc/cron.d/certbot-renew << EOF
# Reînnoire certificat SSL la fiecare 12 ore
0 */12 * * * root cd $APP_DIR && docker compose run --rm certbot renew --webroot --webroot-path=/var/www/certbot && docker compose exec frontend nginx -s reload >> /var/log/certbot-renew.log 2>&1
EOF

# 9. Testează reînnoirea (dry run)
log_info " Testează procesul de reînnoire..."
docker compose run --rm certbot renew --webroot --webroot-path=/var/www/certbot --dry-run

if [ $? -eq 0 ]; then
    log_success "Testul de reînnoire a trecut!"
else
    log_warning "Testul de reînnoire a eșuat, dar certificatul este instalat"
fi

# 10. Configurează HSTS preload (opțional)
log_info " Configurare HSTS..."
read -p "Vrei să adaugi domeniul la HSTS preload list? (y/N): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    log_info "Pentru a adăuga domeniul la HSTS preload:"
    log_info "  1. Vizitează: https://hstspreload.org/"
    log_info "  2. Introdu domeniul: $DOMAIN"
    log_info "  3. Verifică că site-ul respectă cerințele"
    log_info "  4. Trimite cererea"
fi

# 11. Afișează informații finale
log_success " SSL configurat cu succes!"
echo
log_info " Informații SSL:"
echo "   • Certificat: /etc/letsencrypt/live/$DOMAIN/fullchain.pem"
echo "   • Cheie privată: /etc/letsencrypt/live/$DOMAIN/privkey.pem"
echo "   • Reînnoire automată: configurată (la fiecare 12 ore)"
echo
log_info " Site-ul este acum disponibil la:"
echo "   • https://$DOMAIN"
echo "   • https://www.$DOMAIN"
echo
log_info "🔍 Pentru verificare SSL:"
echo "   • https://www.ssllabs.com/ssltest/analyze.html?d=$DOMAIN"
echo "   • https://securityheaders.com/?q=$DOMAIN"
echo
log_warning "  Verifică că:"
echo "   1. Site-ul se încarcă corect pe HTTPS"
echo "   2. Redirect-ul de la HTTP la HTTPS funcționează"
echo "   3. Toate resursele (CSS, JS, imagini) se încarcă prin HTTPS"
echo "   4. Nu există erori în console-ul browser-ului"

# 12. Testează scorurile de securitate
log_info " Testează configurația..."
echo "Testând redirect HTTP->HTTPS..."
if curl -sI http://$DOMAIN | grep -q "301\|302"; then
    log_success "Redirect HTTP->HTTPS funcționează"
else
    log_warning "Redirect HTTP->HTTPS nu funcționează corect"
fi

echo "Testând header-ele de securitate..."
if curl -sI https://$DOMAIN | grep -q "Strict-Transport-Security"; then
    log_success "HSTS header este prezent"
else
    log_warning "HSTS header lipsește"
fi

log_info " Configurarea SSL este completă!"