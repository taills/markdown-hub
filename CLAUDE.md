# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**MarkdownHub** is a real-time collaborative, Git-native writing environment for Markdown documents. It combines real-time WebSocket collaboration with automatic version control snapshots and granular heading-level permissions.

**Design Philosophy:**
- Markdown-native: plain text Markdown is the source of truth
- Real-time collaboration via WebSocket with strong data consistency
- Git-like version control with heuristic-based automatic snapshots
- Heading-level granular permissions

**Tech Stack:**
- Backend: Go (Gin framework, WebSocket, PostgreSQL with pgvector)
- Frontend: React 18 + TypeScript (Vite build system)
- Database: PostgreSQL with sqlc for type-safe queries
- Deployment: Single binary with embedded frontend (go:embed)

## Essential Commands

### Backend Development

```bash
# Build and run with Docker Compose (recommended)
docker-compose up --build

# Generate sqlc code after modifying db/queries/*.sql
sqlc generate

# Run database migrations
migrate -path db/migrations -database "postgres://postgres:postgres@localhost:5432/markdownhub?sslmode=disable" up

# Build the Go binary (includes embedded frontend)
go build -o markdownhub ./cmd/

# Run the backend (requires DATABASE_URL)
DATABASE_URL="postgres://postgres:postgres@localhost:5432/markdownhub?sslmode=disable" ./markdownhub

# Run Go tests
go test ./...
```

### Frontend Development

```bash
# Install dependencies
cd web && pnpm install

# Run development server (Vite)
pnpm dev

# Build for production
pnpm build

# Run tests
pnpm test

# Run tests in watch mode
pnpm test:watch

# Lint TypeScript
pnpm lint

# Format code
pnpm format

# Type check
pnpm type-check
```

### Database Workflow

When adding new database functionality:

```bash
# 1. Add SQL query to db/queries/*.sql with -- name: comment
# 2. Generate Go code
sqlc generate

# 3. Use the generated code in internal/core/*.go
```

## Architecture

### Backend Layer Structure

The backend follows strict separation of concerns:

```
cmd/main.go                    → Application entry point
internal/api/                  → HTTP handlers & WebSocket (request/response layer)
internal/core/                 → Business logic services (uses sqlc-generated code directly)
internal/store/                → Database connection & transaction management
  ├── store.go                 → DB initialization, connection pooling, transactions
  └── *.sql.go                 → sqlc-generated code (DO NOT MODIFY)
internal/models/               → Domain models (uses string IDs)
db/queries/*.sql               → SQL query definitions (sqlc source)
db/migrations/*.sql            → Database schema migrations
```

**Critical Rule: All SQL must be defined in `db/queries/*.sql` and accessed via sqlc-generated code. Never write SQL directly in Go files.**

### sqlc-Based Database Access Pattern

**Strict Rules:**
1. All SQL queries MUST be defined in `db/queries/*.sql` with `-- name:` annotations
2. Run `sqlc generate` to create type-safe Go code in `internal/store/`
3. Core services (`internal/core/`) directly call sqlc-generated methods
4. `internal/store/store.go` handles ONLY connection management and transactions—no SQL operations
5. Use `uuid.UUID` in store layer, `string` in models layer—convert in core layer

**Type Conversion Pattern:**
```go
// String → UUID when calling sqlc methods
userUUID, err := uuid.Parse(userID)
if err != nil {
    return nil, fmt.Errorf("invalid user ID: %w", err)
}

// UUID → String when returning to API layer
return &models.User{
    ID: dbUser.ID.String(),
    // ...
}

// Nullable UUID handling
if doc.DocumentID.Valid {
    docID := doc.DocumentID.UUID.String()
}
```

**Parameter Passing:**
```go
// ✅ Correct: Use generated Params struct
user, err := s.db.CreateUser(ctx, store.CreateUserParams{
    Username:     username,
    Email:        email,
    PasswordHash: hash,
})

// ❌ Wrong: Multiple parameters
user, err := s.db.CreateUser(ctx, username, email, hash)
```

### Service Wiring

Services are dependency-injected in `cmd/main.go`:

```go
permSvc := core.NewPermissionService(db)
authSvc := core.NewAuthService(db)
docSvc := core.NewDocumentService(db, permSvc)
// ... passed to api.NewServer()
```

### Frontend Structure

```
web/src/
  ├── components/           → React components
  ├── hooks/                → Custom React hooks
  ├── services/api.ts       → API client (HTTP + WebSocket)
  ├── types/                → TypeScript type definitions
  ├── utils/                → Utility functions
  ├── i18n.ts               → Internationalization (i18next)
  └── App.tsx               → Main application component
```

State management uses React hooks and Context (no external state library).

### Real-time Collaboration (WebSocket)

WebSocket connections are managed in `internal/api/ws_handler.go` with an EventBus pattern for broadcasting changes. Ensure thread-safe writes to WebSocket connections.

### Version Control (Snapshots)

Automatic snapshot creation is triggered by heuristics defined in `internal/core/document.go`:
- Line changes > 20
- Byte changes > 2048
- Time since last save > 5 minutes

### Granular Permissions

Permissions can be set at the heading level within documents. The backend parses Markdown to build a simple AST and validates edit operations against byte ranges.

## Build and Deployment

The frontend is embedded into the Go binary at compile time:

1. `pnpm build` creates `web/dist/`
2. `cmd/embed.go` uses `//go:embed dist` to include assets
3. `go build ./cmd/` produces a single binary
4. The server serves static files from the embedded FS

When `dist/` is not present (dev mode), the API still works but frontend routes return 404.

## Environment Variables

- `DATABASE_URL`: PostgreSQL connection string (default: `postgres://postgres:postgres@localhost:5432/markdownhub?sslmode=disable`)
- `ADDR`: Server listen address (default: `:8080`)
- `JWT_SECRET`: JWT signing key (default: `change-me-in-production`)

## Testing

Backend tests can be run with `go test ./...`. Frontend uses Vitest (`pnpm test`).

## Important Patterns

### Error Handling
- Use `errors.Is` and `errors.As` for error checking
- Wrap errors with context: `fmt.Errorf("operation failed: %w", err)`
- Return `store.ErrNotFound` for missing records

### Concurrency
- Use `context.Context` for cancellation and timeouts
- WebSocket writes must be synchronized (use mutex if necessary)
- Use channels for message passing between goroutines

### Frontend
- Functional components with hooks
- Strict TypeScript mode enabled
- No `any` types—define proper interfaces
- Minimize re-renders with `useMemo`/`useCallback` when appropriate
