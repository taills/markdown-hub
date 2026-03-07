package migrator

import (
	"context"
	"fmt"

	"github.com/golang-migrate/migrate/v4"
	_ "github.com/golang-migrate/migrate/v4/database/postgres"
	"markdownhub/internal/logger"
)

// Run 执行数据库迁移
// migrationsPath 是迁移文件所在的目录路径
func Run(ctx context.Context, dsn, migrationsPath string) error {
	logger.Info("Running database migrations").Str("path", migrationsPath).Send()

	m, err := migrate.New(
		"file://"+migrationsPath,
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
