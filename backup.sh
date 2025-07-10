#!/bin/bash

# backup.sh - Script pentru backup automat al aplicației
# Se rulează automat prin cron sau manual: ./backup.sh

set -e

# Configurații
APP_DIR="/opt/barbershop"
BACKUP_DIR="/opt/backups"
DATE=$(date +%Y%m%d_%H%M%S)
RETENTION_DAYS=30  # Păstrează backup-urile pentru 30 de zile

# Culori pentru output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() {
    echo -e "${BLUE}[$(date '+%Y-%m-%d %H:%M:%S')] [INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[$(date '+%Y-%m-%d %H:%M:%S')] [SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[$(date '+%Y-%m-%d %H:%M:%S')] [WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[$(date '+%Y-%m-%d %H:%M:%S')] [ERROR]${NC} $1"
}

log_info " Începe procesul de backup..."

# Creează directorul de backup dacă nu există
mkdir -p $BACKUP_DIR/database
mkdir -p $BACKUP_DIR/application
mkdir -p $BACKUP_DIR/logs
mkdir -p $BACKUP_DIR/ssl

cd $APP_DIR

# 1. Backup baza de date MongoDB
log_info " Backup baza de date..."
if docker compose ps | grep -q "mongo.*Up"; then
    # Backup MongoDB local
    docker compose exec -T mongo mongodump \
        --username admin \
        --password $(grep MONGO_ROOT_PASSWORD backend/.env | cut -d '=' -f2) \
        --authenticationDatabase admin \
        --db barbershop \
        --archive \
        --gzip > $BACKUP_DIR/database/mongodb_$DATE.archive.gz
    
    if [ $? -eq 0 ]; then
        log_success "Backup baza de date completat"
    else
        log_error "Backup baza de date a eșuat"
    fi
else
    log_warning "MongoDB nu rulează local, probabil folosești MongoDB Atlas"
    # Pentru MongoDB Atlas, poți folosi mongodump cu connection string
    # mongodump --uri="$MONGO_URL" --archive --gzip > $BACKUP_DIR/database/mongodb_atlas_$DATE.archive.gz
fi

# 2. Backup fișierele aplicației
log_info " Backup fișiere aplicație..."
tar -czf $BACKUP_DIR/application/app_$DATE.tar.gz \
    --exclude='node_modules' \
    --exclude='.git' \
    --exclude='logs' \
    --exclude='*.log' \
    -C $(dirname $APP_DIR) \
    $(basename $APP_DIR)

if [ $? -eq 0 ]; then
    log_success "Backup aplicație completat"
else
    log_error "Backup aplicație a eșuat"
fi

# 3. Backup log-uri
log_info " Backup log-uri..."
if [ -d "$APP_DIR/backend/logs" ]; then
    tar -czf $BACKUP_DIR/logs/logs_$DATE.tar.gz -C $APP_DIR/backend logs/
    log_success "Backup log-uri completat"
fi

# Backup log-uri Docker
docker compose logs > $BACKUP_DIR/logs/docker_logs_$DATE.log 2>&1

# 4. Backup certificatele SSL
log_info " Backup certificate SSL..."
if [ -d "/etc/letsencrypt" ]; then
    tar -czf $BACKUP_DIR/ssl/ssl_certs_$DATE.tar.gz -C /etc letsencrypt/
    log_success "Backup SSL completat"
fi

# 5. Backup configurații sistem
log_info " Backup configurații sistem..."
mkdir -p $BACKUP_DIR/system/$DATE
cp /etc/cron.d/barbershop-* $BACKUP_DIR/system/$DATE/ 2>/dev/null || true
cp /etc/nginx/sites-available/* $BACKUP_DIR/system/$DATE/ 2>/dev/null || true
ufw status verbose > $BACKUP_DIR/system/$DATE/ufw_status.txt 2>/dev/null || true
docker compose ps > $BACKUP_DIR/system/$DATE/docker_services.txt 2>/dev/null || true

# 6. Creează un backup complet comprimat
log_info " Creează arhiva completă..."
cd $BACKUP_DIR
tar -czf complete_backup_$DATE.tar.gz database/ application/ logs/ ssl/ system/

# 7. Calculează și salvează checksum-uri
log_info " Calculează checksum-uri..."
find . -name "*_$DATE.*" -type f -exec sha256sum {} \; > checksums_$DATE.txt

# 8. Curăță backup-urile vechi
log_info "🧹 Curăță backup-urile vechi (păstrează ultimele $RETENTION_DAYS zile)..."
find $BACKUP_DIR -name "*.tar.gz" -type f -mtime +$RETENTION_DAYS -delete
find $BACKUP_DIR -name "*.archive.gz" -type f -mtime +$RETENTION_DAYS -delete
find $BACKUP_DIR -name "*.log" -type f -mtime +$RETENTION_DAYS -delete
find $BACKUP_DIR -name "checksums_*.txt" -type f -mtime +$RETENTION_DAYS -delete

# Curăță directoarele vechi din system/
find $BACKUP_DIR/system -maxdepth 1 -type d -mtime +$RETENTION_DAYS -exec rm -rf {} \; 2>/dev/null || true

# 9. Afișează statistici backup
log_info " Statistici backup:"
echo "   • Data: $DATE"
echo "   • Locație: $BACKUP_DIR"
echo "   • Dimensiune totală: $(du -sh $BACKUP_DIR | cut -f1)"
echo "   • Fișiere create:"

# Listează fișierele create în această sesiune
find $BACKUP_DIR -name "*_$DATE.*" -type f -exec basename {} \; | sort

# 10. Verifică integritatea backup-urilor
log_info " Verifică integritatea backup-urilor..."
backup_files=$(find $BACKUP_DIR -name "*_$DATE.*" -type f)
corrupt_files=0

for file in $backup_files; do
    if [[ $file == *.tar.gz ]]; then
        if ! tar -tzf "$file" >/dev/null 2>&1; then
            log_error "Fișierul corupt: $file"
            ((corrupt_files++))
        fi
    elif [[ $file == *.archive.gz ]]; then
        if ! gzip -t "$file" >/dev/null 2>&1; then
            log_error "Fișierul corupt: $file"
            ((corrupt_files++))
        fi
    fi
done

if [ $corrupt_files -eq 0 ]; then
    log_success "Toate backup-urile sunt valide"
else
    log_error "$corrupt_files fișiere corupte detectate!"
fi

# 11. Opțional: Upload la cloud storage
if [ -n "$BACKUP_CLOUD_PROVIDER" ]; then
    log_info " Upload backup la cloud..."
    case $BACKUP_CLOUD_PROVIDER in
        "aws")
            if command -v aws &> /dev/null; then
                aws s3 cp $BACKUP_DIR/complete_backup_$DATE.tar.gz s3://$BACKUP_S3_BUCKET/backups/
                log_success "Backup încărcat în AWS S3"
            fi
            ;;
        "gcp")
            if command -v gsutil &> /dev/null; then
                gsutil cp $BACKUP_DIR/complete_backup_$DATE.tar.gz gs://$BACKUP_GCS_BUCKET/backups/
                log_success "Backup încărcat în Google Cloud Storage"
            fi
            ;;
    esac
fi

# 12. Trimite notificare (opțional)
if [ -n "$BACKUP_NOTIFICATION_EMAIL" ]; then
    log_info " Trimite notificare email..."
    {
        echo "Backup completat cu succes pentru $(hostname)"
        echo "Data: $DATE"
        echo "Dimensiune: $(du -sh $BACKUP_DIR/complete_backup_$DATE.tar.gz | cut -f1)"
        echo "Fișiere corupte: $corrupt_files"
        echo ""
        echo "Fișiere create:"
        find $BACKUP_DIR -name "*_$DATE.*" -type f -exec basename {} \;
    } | mail -s "Backup Success - $(hostname)" $BACKUP_NOTIFICATION_EMAIL 2>/dev/null || true
fi

# 13. Log rezultatul final
total_size=$(du -sh $BACKUP_DIR | cut -f1)
log_success " Backup completat cu succes!"
log_info " Dimensiune totală backup-uri: $total_size"
log_info " Backup-urile sunt păstrate pentru $RETENTION_DAYS zile"

# Pentru debugging, salvează log-ul acestei rulări
echo "$(date): Backup completat cu succes. Dimensiune: $total_size" >> /var/log/barbershop-backup.log

exit 0