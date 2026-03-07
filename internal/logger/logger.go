package logger

import (
	"io"
	"os"
	"time"

	"github.com/rs/zerolog"
	"github.com/rs/zerolog/log"
)

var (
	// Logger is the global structured logger instance
	Logger zerolog.Logger
)

// Config holds logger configuration
type Config struct {
	// Level sets the minimum log level (debug, info, warn, error)
	Level string

	// Pretty enables human-readable console output (disable in production)
	Pretty bool

	// Output specifies where to write logs (default: os.Stdout)
	Output io.Writer
}

// Init initializes the global logger with the given configuration
func Init(cfg Config) {
	// Parse log level
	level := zerolog.InfoLevel
	switch cfg.Level {
	case "debug":
		level = zerolog.DebugLevel
	case "info":
		level = zerolog.InfoLevel
	case "warn":
		level = zerolog.WarnLevel
	case "error":
		level = zerolog.ErrorLevel
	}

	zerolog.SetGlobalLevel(level)

	// Configure time format
	zerolog.TimeFieldFormat = time.RFC3339

	// Set output
	output := cfg.Output
	if output == nil {
		output = os.Stdout
	}

	// Pretty console output for development
	if cfg.Pretty {
		output = zerolog.ConsoleWriter{
			Out:        output,
			TimeFormat: "15:04:05",
		}
	}

	Logger = zerolog.New(output).With().
		Timestamp().
		Caller().
		Logger()

	// Set global logger
	log.Logger = Logger
}

// Info logs an info-level message
func Info(msg string) *zerolog.Event {
	return Logger.Info().Str("msg", msg)
}

// Debug logs a debug-level message
func Debug(msg string) *zerolog.Event {
	return Logger.Debug().Str("msg", msg)
}

// Warn logs a warning-level message
func Warn(msg string) *zerolog.Event {
	return Logger.Warn().Str("msg", msg)
}

// Error logs an error-level message
func Error(msg string) *zerolog.Event {
	return Logger.Error().Str("msg", msg)
}

// Fatal logs a fatal-level message and exits
func Fatal(msg string) *zerolog.Event {
	return Logger.Fatal().Str("msg", msg)
}

// WithContext returns a logger with the given key-value pairs
func WithContext(keyvals ...interface{}) zerolog.Logger {
	ctx := Logger.With()
	for i := 0; i < len(keyvals); i += 2 {
		if i+1 < len(keyvals) {
			key, ok := keyvals[i].(string)
			if ok {
				ctx = ctx.Interface(key, keyvals[i+1])
			}
		}
	}
	return ctx.Logger()
}
