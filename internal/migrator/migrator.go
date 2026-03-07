package migrator

import (
	"context"
	"fmt"

	"github.com/golang-migrate/migrate/v4"
	_ "github.com/golang-migrate/migrate/v4/database/postgres"
	_ "github.com/golang-migrate/migrate/v4/source/file"
	"markdownhub/internal/logger"
)

// Run 执行数据库迁移
func Run(ctx context.Context, dsn string) error {
	logger.Info("Running database migrations").Send()

	// 使用 file:// 协议，从嵌入的文件系统读取
	// 迁移文件通过 go:embed 指令嵌入
	m, err := migrate.New(
		"file://db/migrations",
		dsn,
	)
	if err != nil {
		return fmt.Errorf("failed to create migration instance: %w", err)
	}

	// 执行迁移
	if err := m.Up(); err != nil && err != migrate.ErrNoChange {
		return fmt.Errorf("migration failed: %w", err)
	}

	logger.Info("Database migrations completed").Send()
	return nil
}
