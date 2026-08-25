# ==========================================================
# DILIGÊNCIA 360 — Backend Express sem banco relacional
# ==========================================================

FROM node:24-alpine AS runner

WORKDIR /app
RUN apk add --no-cache wget

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000
CMD ["node", "index.js"]
