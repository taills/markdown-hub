# MarkdownHub

[English](#english) | [中文](#中文)

---

## English

### Overview

MarkdownHub is a real-time collaborative, Git-native writing environment for Markdown documents. It combines real-time WebSocket collaboration with automatic version control snapshots and granular heading-level permissions.

### Features

- **Real-time Collaboration**: Multiple users can edit documents simultaneously via WebSocket
- **Git-like Version Control**: Automatic snapshots based on heuristics (line changes, byte changes, time intervals)
- **Granular Permissions**: Heading-level permission management within documents
- **Markdown-native**: Plain text Markdown is the source of truth
- **PostgreSQL + pgvector**: Rich database capabilities with vector support for AI features

### Tech Stack

- **Backend**: Go (Gin framework, WebSocket, PostgreSQL with pgvector)
- **Frontend**: React 18 + TypeScript (Vite build system)
- **Database**: PostgreSQL with sqlc for type-safe queries
- **Deployment**: Single binary with embedded frontend (go:embed)

### Quick Start

#### Using Docker Compose (Recommended)

```bash
# Start all services
docker-compose up --build

# Or use Make
make up
```

The application will be available at http://localhost:8080

#### From Source

```bash
# Install dependencies
make deps

# Build for your platform
make build

# Run
./markdownhub
```

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | `postgres://postgres:postgres@localhost:5432/markdownhub?sslmode=disable` |
| `ADDR` | Server listen address | `:8080` |

**Note:** Configuration options like `JWT_SECRET`, `LOG_LEVEL`, and `LOG_PRETTY` are now stored in the database's `settings` table. On first run, the application will automatically generate a secure JWT secret if not provided.

### Development

```bash
# Run frontend dev server
cd web && pnpm dev

# Run backend
make run

# Run tests
go test ./...
cd web && pnpm test
```

### Build from Source

```bash
# Local build (embedded frontend)
make build

# Cross-compile for all platforms (Linux/macOS/Windows + amd64/arm64)
make cross

# Build using Docker (no local Go required)
make docker-build
```

Built binaries will be in the `releases/` directory.

### Project Structure

```
.
├── cmd/              # Application entry point
├── internal/         # Internal packages
│   ├── api/          # HTTP handlers & WebSocket
│   ├── core/         # Business logic
│   ├── migrator/     # Database migrations
│   └── store/        # Database layer (sqlc)
├── web/              # React frontend
├── db/
│   ├── migrations/   # Database migrations
│   └── queries/      # SQL queries (sqlc source)
├── releases/         # Built binaries
└── Makefile          # Build automation
```

### License

MIT

---

## 中文

### 概述

MarkdownHub 是一个实时协作、Git 原生的 Markdown 文档写作环境。它结合了实时 WebSocket 协作与自动版本控制快照，以及标题级别的精细权限管理。

### 功能特性

- **实时协作**: 通过 WebSocket 支持多人同时编辑文档
- **类 Git 版本控制**: 基于启发式算法自动创建快照（行数变化、字节变化、时间间隔）
- **精细权限**: 文档内标题级别的权限管理
- **Markdown 原生**: 纯文本 Markdown 为数据源
- **PostgreSQL + pgvector**: 强大的数据库能力，支持 AI 功能的向量搜索

### 技术栈

- **后端**: Go (Gin 框架, WebSocket, 带 pgvector 的 PostgreSQL)
- **前端**: React 18 + TypeScript (Vite 构建系统)
- **数据库**: PostgreSQL，使用 sqlc 进行类型安全查询
- **部署**: 单二进制文件，前端内嵌 (go:embed)

### 快速开始

#### 使用 Docker Compose（推荐）

```bash
# 启动所有服务
docker-compose up --build

# 或使用 Make
make up
```

访问 http://localhost:8080

#### 源码构建

```bash
# 安装依赖
make deps

# 构建本平台版本
make build

# 运行
./markdownhub
```

### 环境变量

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `DATABASE_URL` | PostgreSQL 连接字符串 | `postgres://postgres:postgres@localhost:5432/markdownhub?sslmode=disable` |
| `ADDR` | 服务器监听地址 | `:8080` |

**注意:** 配置项如 `JWT_SECRET`、`LOG_LEVEL`、`LOG_PRETTY` 现已存储在数据库的 `settings` 表中。首次启动时，如果未提供 JWT_SECRET，程序会自动生成一个安全的密钥。

### 开发

```bash
# 运行前端开发服务器
cd web && pnpm dev

# 运行后端
make run

# 运行测试
go test ./...
cd web && pnpm test
```

### 源码构建

```bash
# 本地构建（嵌入前端）
make build

# 交叉编译所有平台（Linux/macOS/Windows + amd64/arm64）
make cross

# 使用 Docker 构建（无需本地 Go 环境）
make docker-build
```

构建产物位于 `releases/` 目录。

### 项目结构

```
.
├── cmd/              # 应用入口
├── internal/         # 内部包
│   ├── api/          # HTTP 处理器和 WebSocket
│   ├── core/        # 业务逻辑
│   ├── migrator/    # 数据库迁移
│   └── store/       # 数据库层 (sqlc)
├── web/              # React 前端
├── db/
│   ├── migrations/   # 数据库迁移
│   └── queries/     # SQL 查询 (sqlc 源码)
├── releases/         # 构建的二进制文件
└── Makefile         # 构建自动化
```

### 许可证

MIT
