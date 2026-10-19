# ---- base: install dependencies once, reuse for test + production ----
FROM node:20-alpine AS base
WORKDIR /app
COPY package*.json ./
# "npm ci" when a lockfile is committed (reproducible), "npm install" otherwise
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi
COPY . .

# ---- test stage: Jenkins runs "docker build --target test"; a failing test fails the build ----
FROM base AS test
RUN npm test

# ---- production stage: small image, no dev files, non-root ----
FROM node:20-alpine AS production
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN if [ -f package-lock.json ]; then npm ci --omit=dev; else npm install --omit=dev; fi
COPY src ./src
EXPOSE 3002
HEALTHCHECK --interval=15s --timeout=3s --retries=5 \
  CMD wget -qO- http://localhost:3002/health || exit 1
USER node
CMD ["node", "src/server.js"]
