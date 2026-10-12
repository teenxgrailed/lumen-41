# Base stage for both development and production
FROM node:22-alpine3.19 AS base
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
# The release SHA is declared in the stages that use it, not here: an ENV in
# the base stage changes on every commit and would invalidate the `npm ci`
# layers below it, so a CI image build could never reuse its cache.

# Install netcat
RUN apk add --no-cache netcat-openbsd

# Development stage
FROM base AS development
WORKDIR /app
ENV NODE_ENV=development
COPY . .
COPY package*.json ./
RUN npm install --legacy-peer-deps --ignore-scripts
RUN chmod +x /app/entrypoint.sh
ENTRYPOINT ["/app/entrypoint.sh"]
CMD ["npm", "run", "dev"]

# Runtime builder stage - everything the worker and collaboration services
# need. Deliberately stops short of `next build`: those two runtimes ship
# esbuild bundles, so making them wait for the web build means three full
# Next builds per release on one host, which is what exhausts its memory.
FROM base AS runtime-builder
WORKDIR /app
ENV NODE_OPTIONS=--max-old-space-size=4096
COPY package*.json ./
RUN npm ci --include=dev --legacy-peer-deps --ignore-scripts
COPY . .
RUN npm run prisma:generate
RUN npm run build:worker
RUN npm run build:collaboration

# Web builder stage - adds the Next build on top of the shared runtime build.
FROM runtime-builder AS builder
WORKDIR /app
# Next.js type checking can exceed Node's default ~2 GiB heap in Coolify's
# source build. Match the dedicated production Dockerfile's build allowance.
ENV NODE_OPTIONS=--max-old-space-size=4096
# Release images are built in CI and passed NEEDT_BUILD_SHA; Coolify's own
# source build passes SOURCE_COMMIT instead, which stays as the fallback.
ARG SOURCE_COMMIT=local
ARG NEEDT_BUILD_SHA
ENV NEEDT_BUILD_SHA=${NEEDT_BUILD_SHA:-$SOURCE_COMMIT}
ENV NEXT_PUBLIC_NEEDT_BUILD_SHA=$NEEDT_BUILD_SHA
# Next inlines NEXT_PUBLIC_* into the browser bundle at build time, so an
# image built outside Coolify only has them if they are declared here.
ARG NEXT_PUBLIC_APP_URL
ARG NEXT_PUBLIC_COLLABORATION_URL
ARG NEXT_PUBLIC_VAPID_PUBLIC_KEY
ARG NEXT_PUBLIC_SENTRY_DSN
ARG NEXT_PUBLIC_SENTRY_ENVIRONMENT
ENV NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL \
    NEXT_PUBLIC_COLLABORATION_URL=$NEXT_PUBLIC_COLLABORATION_URL \
    NEXT_PUBLIC_VAPID_PUBLIC_KEY=$NEXT_PUBLIC_VAPID_PUBLIC_KEY \
    NEXT_PUBLIC_SENTRY_DSN=$NEXT_PUBLIC_SENTRY_DSN \
    NEXT_PUBLIC_SENTRY_ENVIRONMENT=$NEXT_PUBLIC_SENTRY_ENVIRONMENT
# Source maps upload only when CI mounts the Sentry secrets; Coolify's
# fallback build has none and builds without uploading.
RUN --mount=type=secret,id=sentry_auth_token,required=false \
    --mount=type=secret,id=sentry_org,required=false \
    --mount=type=secret,id=sentry_project,required=false \
    for name in auth_token org project; do \
      file="/run/secrets/sentry_$name"; \
      if [ -s "$file" ]; then \
        export "SENTRY_$(echo "$name" | tr a-z A-Z)=$(cat "$file")"; \
      fi; \
    done && \
    npm run build

# Runtime dependencies are installed from package-lock.json so the entrypoint
# always uses the project's Prisma 6 CLI. Without this layer, `npx prisma`
# downloads the latest major at container startup and can reject our schema.
FROM base AS runtime-deps
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev --legacy-peer-deps --ignore-scripts
# `prisma migrate deploy` needs the schema engine. Lifecycle scripts are
# intentionally disabled above, so copy the engine downloaded by the builder's
# explicit `prisma generate` step instead of downloading into a read-only
# node_modules directory at container startup.
COPY --from=runtime-builder /app/node_modules/@prisma/engines ./node_modules/@prisma/engines
RUN test -x /app/node_modules/@prisma/engines/schema-engine-*

# Worker stage - same image, runs the BullMQ worker instead of the web server.
# Coolify: set this service's "Docker Build Stage Target" to `worker`.
FROM base AS worker
WORKDIR /app

ENV NODE_ENV=production

COPY --from=runtime-deps /app/node_modules ./node_modules
COPY --from=runtime-builder /app/dist/worker ./dist/worker
COPY --from=runtime-builder /app/node_modules/@prisma/client ./node_modules/@prisma/client
COPY --from=runtime-builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=runtime-builder /app/prisma ./prisma
COPY entrypoint.sh .
RUN chmod +x /app/entrypoint.sh
USER node

# entrypoint.sh runs `exec "$@"`, so this CMD becomes the worker process.
ENTRYPOINT ["/app/entrypoint.sh"]
# Declared last so the layers above stay cached between releases.
ARG SOURCE_COMMIT=local
ARG NEEDT_BUILD_SHA
ENV NEEDT_BUILD_SHA=${NEEDT_BUILD_SHA:-$SOURCE_COMMIT}
CMD ["node", "dist/worker/index.js"]

# Collaboration stage - same image, runs the Hocuspocus collaboration server.
# Coolify: set this service's "Docker Build Stage Target" to `collaboration`.
FROM base AS collaboration
WORKDIR /app

ENV NODE_ENV=production

COPY --from=runtime-deps /app/node_modules ./node_modules
COPY --from=runtime-builder /app/dist/collaboration ./dist/collaboration
COPY --from=runtime-builder /app/node_modules/@prisma/client ./node_modules/@prisma/client
COPY --from=runtime-builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=runtime-builder /app/prisma ./prisma
COPY entrypoint.sh .
RUN chmod +x /app/entrypoint.sh
USER node

EXPOSE 1234

ENTRYPOINT ["/app/entrypoint.sh"]
# Declared last so the layers above stay cached between releases.
ARG SOURCE_COMMIT=local
ARG NEEDT_BUILD_SHA
ENV NEEDT_BUILD_SHA=${NEEDT_BUILD_SHA:-$SOURCE_COMMIT}
CMD ["node", "dist/collaboration/index.mjs"]

# Production stage
FROM base AS production
WORKDIR /app

ENV NODE_ENV=production

COPY --from=runtime-deps /app/node_modules ./node_modules
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/dist/worker ./dist/worker
COPY --from=builder /app/node_modules/@prisma/client ./node_modules/@prisma/client
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/prisma ./prisma
COPY entrypoint.sh .
RUN chmod +x /app/entrypoint.sh
USER node

EXPOSE 3000

ENTRYPOINT ["/app/entrypoint.sh"]
# Run the web service with the default command. In Coolify, create a second
# service from the same image and override its command with:
# node dist/worker/index.js
# Declared last so the layers above stay cached between releases.
ARG SOURCE_COMMIT=local
ARG NEEDT_BUILD_SHA
ENV NEEDT_BUILD_SHA=${NEEDT_BUILD_SHA:-$SOURCE_COMMIT}
CMD ["node", "server.js"] 
