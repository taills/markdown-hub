# --- Build stage: frontend ---
FROM node:20-alpine AS web-builder
WORKDIR /app/web
COPY web/package.json web/pnpm-lock.yaml* ./
RUN npm install -g pnpm && pnpm install --frozen-lockfile
COPY web/ .
RUN pnpm build

# --- Build stage: backend ---
FROM golang:1.25-alpine AS go-builder
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
COPY --from=web-builder /app/cmd/dist ./cmd/dist
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o /markdownhub ./cmd/

# --- Final stage ---
FROM alpine:latest
RUN apk add --no-cache ca-certificates tzdata
COPY --from=go-builder /markdownhub /usr/local/bin/markdownhub
EXPOSE 8080
ENTRYPOINT ["/usr/local/bin/markdownhub"]
