# ==========================================================
# DILIGÊNCIA 360 — Dockerfile do Frontend (React + Vite + Nginx)
# Multi-stage build leve e otimizado
# ==========================================================

# Estágio 1: Build da SPA React / Vite
FROM node:20-alpine AS builder

WORKDIR /app

ARG VITE_FIREBASE_API_KEY
ARG VITE_FIREBASE_AUTH_DOMAIN
ARG VITE_FIREBASE_PROJECT_ID
ARG VITE_FIREBASE_STORAGE_BUCKET
ARG VITE_FIREBASE_MESSAGING_SENDER_ID
ARG VITE_FIREBASE_APP_ID
ARG VITE_FIREBASE_MEASUREMENT_ID

ENV VITE_FIREBASE_API_KEY=$VITE_FIREBASE_API_KEY
ENV VITE_FIREBASE_AUTH_DOMAIN=$VITE_FIREBASE_AUTH_DOMAIN
ENV VITE_FIREBASE_PROJECT_ID=$VITE_FIREBASE_PROJECT_ID
ENV VITE_FIREBASE_STORAGE_BUCKET=$VITE_FIREBASE_STORAGE_BUCKET
ENV VITE_FIREBASE_MESSAGING_SENDER_ID=$VITE_FIREBASE_MESSAGING_SENDER_ID
ENV VITE_FIREBASE_APP_ID=$VITE_FIREBASE_APP_ID
ENV VITE_FIREBASE_MEASUREMENT_ID=$VITE_FIREBASE_MEASUREMENT_ID

# Copia manifestos de dependência
COPY package*.json ./

# Instala dependências
RUN npm ci

# Copia o código-fonte da aplicação frontend
COPY . .

# Executa typecheck e compilação do Vite
RUN npm run build

# Estágio 2: Servidor estático Nginx de alta performance
FROM nginx:alpine AS runner

# Remove configuração padrão
RUN rm -rf /etc/nginx/conf.d/default.conf

# Copia configuração customizada com proxy reverso de /api/
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copia os artefatos compilados do estágio anterior
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
