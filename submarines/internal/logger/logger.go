package logger

import (
	"log/slog"
	"os"
)

// New creates a new structured logger based on environment
func New() *slog.Logger {
	// Check if debug mode
	debug := os.Getenv("DEBUG") == "true" || os.Getenv("LOG_LEVEL") == "debug"

	logLevel := slog.LevelInfo
	if debug {
		logLevel = slog.LevelDebug
	}

	// Use JSON handler for production-ready structured logs
	handler := slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{
		Level: logLevel,
		AddSource: debug, // Add source file/line in debug mode
	})

	return slog.New(handler)
}
