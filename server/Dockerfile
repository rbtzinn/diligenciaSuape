# ==========================================================
# DILIGÊNCIA 360 — Dockerfile do Backend (Express + Prisma)
# ==========================================================

FROM node:20-alpine AS runner

WORKDIR /app

# Instala ferramentas úteis e dependências do sistema
RUN apk add --no-cache openssl wget libc6-compat

# Copia manifestos de dependência
COPY package*.json ./

# Instala dependências de produção + CLI do Prisma
RUN npm ci --omit=dev && npm install prisma@7.9.1

# Copia código-fonte do servidor, prisma e migrations
COPY . .

# Garante permissões de execução no script de inicialização
RUN chmod +x docker-entrypoint.sh

# Variáveis de ambiente padrão
ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

# Executa migrações automáticas e inicia o servidor
ENTRYPOINT ["/bin/sh", "docker-entrypoint.sh"]
