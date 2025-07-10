# Frontend Dockerfile pentru producție
FROM nginx:1.25-alpine

# Instalează dependențe necesare
RUN apk add --no-cache \
    curl \
    ca-certificates \
    tzdata

# Elimină configurația default
RUN rm -rf /usr/share/nginx/html/* /etc/nginx/conf.d/default.conf

# Copiază fișierele statice
COPY *.html /usr/share/nginx/html/
COPY css/ /usr/share/nginx/html/css/
COPY js/ /usr/share/nginx/html/js/
COPY images/ /usr/share/nginx/html/images/
COPY fonts/ /usr/share/nginx/html/fonts/
COPY videos/ /usr/share/nginx/html/videos/

# Copiază configurația nginx optimizată
COPY nginx-production.conf /etc/nginx/nginx.conf

# Crează directoarele necesare
RUN mkdir -p /var/www/certbot /var/log/nginx/cache

# Setează permisiunile corecte
RUN chown -R nginx:nginx /usr/share/nginx/html /var/www/certbot && \
    chmod -R 755 /usr/share/nginx/html

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:80/health || exit 1

# Expune porturile
EXPOSE 80 443

# Comandă de start
CMD ["nginx", "-g", "daemon off;"]