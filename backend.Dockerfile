FROM node:18-alpine

# Adaugă utilizator non-root pentru securitate
RUN addgroup -g 1001 -S nodejs
RUN adduser -S backend -u 1001

# Setează directorul de lucru
WORKDIR /app

# Copiază package files pentru cache-ing mai bun
COPY backend/package*.json ./

# Instalează dependențele (inclusiv dev dependencies pentru rebuild)
RUN npm ci --only=production && npm cache clean --force

# Copiază codul sursă
COPY backend/ .

# Creează directorul logs cu permisiuni corecte
RUN mkdir -p logs && chown -R backend:nodejs logs && chmod 755 logs

# Schimbă la utilizatorul non-root
USER backend

# Expune portul
EXPOSE 5000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD node -e "const http=require('http');const req=http.request('http://localhost:5000/health',(res)=>{process.exit(res.statusCode===200?0:1)});req.on('error',()=>process.exit(1));req.end();"

# Comandă de start
CMD ["npm", "start"]