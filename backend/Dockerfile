# ── Stage 1: Build frontend ───────────────────────────────────────────────────
FROM node:24-alpine AS frontend

WORKDIR /frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --prefer-offline

COPY frontend .
RUN npm run build

# ── Stage 2: Build Go binary ──────────────────────────────────────────────────
FROM golang:1.26-alpine AS gobuilder

WORKDIR /build

COPY backend/go.mod backend/go.sum ./
RUN go mod download

COPY backend .

# Overlay the compiled frontend into the embed path.
COPY --from=frontend /frontend/dist ./internal/ui/dist

# App version, injected via ldflags. When APP_VERSION is unset the build keeps
# the value baked into internal/version (--build-arg APP_VERSION=x.y.z).
ARG APP_VERSION
RUN set -e; \
    LDFLAGS=""; \
    if [ -n "$APP_VERSION" ]; then \
      LDFLAGS="-X github.com/publiciallc/go-help-desk/backend/internal/version.Version=$APP_VERSION"; \
    fi; \
    CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags "$LDFLAGS" -o /app ./cmd/server

# ── Stage 3: Runtime ──────────────────────────────────────────────────────────
FROM alpine:3.21

RUN addgroup -S ohd && adduser -S ohd -G ohd

WORKDIR /app
COPY --from=gobuilder /app /app/server

RUN mkdir -p /data/attachments && chown -R ohd:ohd /data

USER ohd

EXPOSE 8080

ENTRYPOINT ["/app/server"]
