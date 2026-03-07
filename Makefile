# MarkdownHub Makefile
# 交叉编译三大平台 (linux, darwin, windows) + 两种架构 (amd64, arm64)

# 配置
APP_NAME := markdownhub
VERSION := $(shell git describe --tags --always --dirty 2>/dev/null || echo "dev")
BUILD_TIME := $(shell date -u '+%Y-%m-%d_%H:%M:%S')
LDFLAGS := -s -w -X main.version=$(VERSION) -X main.buildTime=$(BUILD_TIME)

# 平台和架构配置
PLATFORMS := linux darwin windows
ARCHITECTURES := amd64 arm64

# 前端输出目录 (vite 配置的输出目录)
DIST_DIR := cmd/dist

# 默认目标
.PHONY: all
all: build

# 安装依赖
.PHONY: deps
deps:
	@echo "=== 安装前端依赖 ==="
	cd web && pnpm install
	@echo "=== 安装 Go 依赖 ==="
	go mod download

# 构建前端 (vite 输出到 cmd/dist，无需复制)
.PHONY: frontend
frontend:
	@echo "=== 构建前端 ==="
	cd web && pnpm build
	@echo "=== 前端构建完成，输出目录: $(DIST_DIR) ==="

# 构建 Go 后端（不嵌入前端，用于开发）
.PHONY: build-backend
build-backend:
	@echo "=== 构建后端 ==="
	CGO_ENABLED=0 go build -ldflags="$(LDFLAGS)" -o $(APP_NAME) ./cmd/

# 本机构建（嵌入前端）
.PHONY: build
build: frontend
	@echo "=== 构建后端（嵌入前端）==="
	CGO_ENABLED=0 go build -ldflags="$(LDFLAGS)" -o $(APP_NAME) ./cmd/

# 交叉编译所有平台
.PHONY: cross
cross: frontend
	@echo "=== 交叉编译所有平台 ==="
	@mkdir -p releases
	@for platform in $(PLATFORMS); do \
		for arch in $(ARCHITECTURES); do \
			echo "Building $$platform/$$arch..."; \
			EXT=""; \
			if [ "$$platform" = "windows" ]; then \
				EXT=".exe"; \
			fi; \
			GOOS=$$platform GOARCH=$$arch CGO_ENABLED=0 go build \
				-ldflags="$(LDFLAGS)" \
				-o releases/$(APP_NAME)-$$platform-$$arch$$EXT \
				./cmd/; \
		done; \
	done
	@echo "=== 构建完成 ==="
	@ls -lh releases/

# 单独构建特定平台
.PHONY: build-linux-amd64
build-linux-amd64: frontend
	GOOS=linux GOARCH=amd64 CGO_ENABLED=0 go build -ldflags="$(LDFLAGS)" -o releases/$(APP_NAME)-linux-amd64 ./cmd/

.PHONY: build-linux-arm64
build-linux-arm64: frontend
	GOOS=linux GOARCH=arm64 CGO_ENABLED=0 go build -ldflags="$(LDFLAGS)" -o releases/$(APP_NAME)-linux-arm64 ./cmd/

.PHONY: build-darwin-amd64
build-darwin-amd64: frontend
	GOOS=darwin GOARCH=amd64 CGO_ENABLED=0 go build -ldflags="$(LDFLAGS)" -o releases/$(APP_NAME)-darwin-amd64 ./cmd/

.PHONY: build-darwin-arm64
build-darwin-arm64: frontend
	GOOS=darwin GOARCH=arm64 CGO_ENABLED=0 go build -ldflags="$(LDFLAGS)" -o releases/$(APP_NAME)-darwin-arm64 ./cmd/

.PHONY: build-windows-amd64
build-windows-amd64: frontend
	GOOS=windows GOARCH=amd64 CGO_ENABLED=0 go build -ldflags="$(LDFLAGS)" -o releases/$(APP_NAME)-windows-amd64.exe ./cmd/

.PHONY: build-windows-arm64
build-windows-arm64: frontend
	GOOS=windows GOARCH=arm64 CGO_ENABLED=0 go build -ldflags="$(LDFLAGS)" -o releases/$(APP_NAME)-windows-arm64.exe ./cmd/

# 使用 Docker 交叉编译（无需本地安装 Go）
.PHONY: docker-build
docker-build:
	@echo "=== 使用 Docker 交叉编译 ==="
	docker run --rm \
		-v "$$(pwd)":/app \
		-w /app \
		golang:1.25-alpine \
		make cross

# 清理
.PHONY: clean
clean:
	rm -rf $(APP_NAME)
	rm -rf releases/
	rm -rf cmd/dist

# 运行开发服务器
.PHONY: run
run: build-backend
	@echo "=== 启动开发服务器 ==="
	DATABASE_URL="postgres://postgres:postgres@localhost:5432/markdownhub?sslmode=disable" \
	ADDR=":8080" \
	JWT_SECRET="change-me-in-production" \
	./$(APP_NAME)

# 使用 Docker Compose 运行
.PHONY: up
up:
	docker-compose up --build

# 停止 Docker Compose
.PHONY: down
down:
	docker-compose down

# 显示帮助
.PHONY: help
help:
	@echo "MarkdownHub 构建脚本"
	@echo ""
	@echo "可用目标:"
	@echo "  make deps           - 安装所有依赖"
	@echo "  make frontend       - 构建前端资源"
	@echo "  make build          - 本机构建（嵌入前端）"
	@echo "  make cross          - 交叉编译所有平台 (linux/darwin/windows + amd64/arm64)"
	@echo "  make docker-build   - 使用 Docker 交叉编译"
	@echo "  make run            - 运行开发服务器"
	@echo "  make up             - 使用 Docker Compose 启动"
	@echo "  make clean          - 清理构建产物"
	@echo ""
	@echo "交叉编译目标:"
	@for platform in $(PLATFORMS); do \
		for arch in $(ARCHITECTURES); do \
			echo "  make build-$$platform-$$arch"; \
		done; \
	done
