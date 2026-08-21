#!/bin/sh
set -e

echo "[Docker] Inicializando backend Diligência 360..."

# 1. Gera o Prisma Client
echo "[Prisma] Gerando Prisma Client..."
npx prisma generate --schema prisma/schema.prisma --config prisma.config.js

# 2. Executa migrations pendentes de forma segura (sem reset)
if [ -n "$DATABASE_URL" ]; then
  echo "[Prisma] Aplicando migrações pendentes no PostgreSQL com prisma migrate deploy..."
  npx prisma migrate deploy --schema prisma/schema.prisma --config prisma.config.js || echo "[Prisma] Aviso: Não foi possível executar migrations no momento."
fi

# 3. Inicia o servidor Express
echo "[Server] Iniciando servidor Express na porta ${PORT:-3000}..."
exec node index.js
