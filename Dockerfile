# One coherent runtime: Next.js, SQLite, Git and the independent Python oracle.
FROM node:22-bookworm-slim AS base
ENV NEXT_TELEMETRY_DISABLED=1 PYTHONUNBUFFERED=1
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates git python3 python3-venv \
    && rm -rf /var/lib/apt/lists/*
COPY requirements.lock.txt /tmp/requirements.lock.txt
RUN python3 -m venv /opt/venv \
    && /opt/venv/bin/pip install --no-cache-dir -r /tmp/requirements.lock.txt \
    && rm /tmp/requirements.lock.txt

FROM base AS build
WORKDIR /app
# Native SQLite can compile on architectures without a matching prebuilt binary.
RUN apt-get update \
    && apt-get install -y --no-install-recommends build-essential \
    && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev

FROM base AS runtime
WORKDIR /app
ARG INVARIANT_SOURCE_COMMIT=unknown
ARG INVARIANT_SOURCE_DIRTY=unknown
ENV NODE_ENV=production PORT=3000 \
    INVARIANT_PYTHON=/opt/venv/bin/python \
    INVARIANT_DATA_DIR=/app/.runtime \
    INVARIANT_SOURCE_COMMIT=${INVARIANT_SOURCE_COMMIT} \
    INVARIANT_SOURCE_DIRTY=${INVARIANT_SOURCE_DIRTY}
LABEL org.opencontainers.image.title="INVARIANT" \
      org.opencontainers.image.source="https://github.com/vbajaria/8090hackathon-invariant" \
      org.opencontainers.image.revision="${INVARIANT_SOURCE_COMMIT}" \
      org.opencontainers.image.licenses="MIT"
COPY --chown=node:node --from=build /app/.next ./.next
COPY --chown=node:node --from=build /app/node_modules ./node_modules
COPY --chown=node:node package.json package-lock.json next.config.ts LICENSE README.md requirements.lock.txt ./
COPY --chown=node:node app ./app
COPY --chown=node:node lib ./lib
COPY --chown=node:node components ./components
COPY --chown=node:node public ./public
COPY --chown=node:node oracle ./oracle
COPY --chown=node:node demo ./demo
COPY --chown=node:node finance ./finance
COPY --chown=node:node invariant_adapter.py ./invariant_adapter.py
COPY --chown=node:node docker ./docker
RUN mkdir -p /app/.runtime && chown node:node /app /app/.runtime
USER node
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=7s --start-period=30s --retries=6 CMD ["node", "docker/healthcheck.mjs"]
CMD ["npm", "run", "start"]
