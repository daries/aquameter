# ── Stage 1: Build frontend ───────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

# Native module build tools (better-sqlite3)
RUN apk add --no-cache python3 make g++

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

# Trim dev deps setelah build
RUN npm prune --omit=dev

# ── Stage 2: Production runtime ───────────────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app

# Runtime libs untuk native modules
RUN apk add --no-cache libstdc++

# Copy node_modules (sudah tanpa dev deps)
COPY --from=builder /app/node_modules ./node_modules

# Copy frontend build output
COPY --from=builder /app/dist ./dist

# Copy server source
COPY server ./server

# Copy package.json untuk npm start
COPY package.json ./

# Data volume: SQLite DB, db-config.json, WA auth
VOLUME ["/data"]

EXPOSE 3001

ENV NODE_ENV=production
ENV PORT=3001
ENV DATA_DIR=/data

CMD ["node", "server/index.js"]
