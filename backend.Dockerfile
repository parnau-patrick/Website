# Backend Dockerfile pentru producție
FROM node:18-alpine AS base

# Instalează dependențele de sistem necesare
RUN apk add --no-cache \
    dumb-init \
    curl \
    ca-certificates

# Creează utilizator non-root pentru securitate
RUN addgroup -g 1001 -S nodejs && \
    adduser -S backend -u 1001 -G nodejs

# Setează directorul de lucru
WORKDIR /app

# Copiază și instalează dependențele
COPY backend/package*.json ./
RUN npm ci --only=production --no-audit --no-fund && \
    npm cache clean --force

# Copiază codul sursă
COPY backend/ .

# Creează directoare necesare cu permisiuni corecte
RUN mkdir -p logs temp uploads && \
    chown -R backend:nodejs . && \
    chmod 755 logs temp

# Schimbă la utilizatorul non-root
USER backend

# Expune portul
EXPOSE 5000

# Health check îmbunătățit
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD curl -f http://localhost:5000/health || exit 1

# Folosește dumb-init pentru semnale de proces corecte
ENTRYPOINT ["dumb-init", "--"]

# Comandă de start
CMD ["node", "server.js"]