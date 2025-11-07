package retry

import (
	"context"
	"fmt"
	"log"
	"time"
)

// Config holds retry configuration
type Config struct {
	MaxAttempts int
	InitialDelay time.Duration
	MaxDelay time.Duration
	Multiplier float64
}

// DefaultConfig returns sensible defaults for retry behavior
func DefaultConfig() Config {
	return Config{
		MaxAttempts: 5,
		InitialDelay: 1 * time.Second,
		MaxDelay: 30 * time.Second,
		Multiplier: 2.0, // Exponential backoff: 1s, 2s, 4s, 8s, 16s
	}
}

// WithExponentialBackoff executes fn with exponential backoff retry strategy
// Returns error only if all retries exhausted
func WithExponentialBackoff(ctx context.Context, cfg Config, operation string, fn func() error) error {
	var lastErr error
	delay := cfg.InitialDelay

	for attempt := 1; attempt <= cfg.MaxAttempts; attempt++ {
		// Check if context cancelled
		if ctx.Err() != nil {
			return fmt.Errorf("%s cancelled: %w", operation, ctx.Err())
		}

		// Execute function
		err := fn()
		if err == nil {
			// Success!
			if attempt > 1 {
				log.Printf("[RETRY] %s succeeded on attempt %d/%d", operation, attempt, cfg.MaxAttempts)
			}
			return nil
		}

		// Failed - store error
		lastErr = err
		log.Printf("[RETRY] %s failed (attempt %d/%d): %v", operation, attempt, cfg.MaxAttempts, err)

		// If this was the last attempt, don't sleep
		if attempt >= cfg.MaxAttempts {
			break
		}

		// Log retry delay
		log.Printf("[RETRY] Retrying %s in %v...", operation, delay)

		// Sleep with context cancellation support
		select {
		case <-ctx.Done():
			return fmt.Errorf("%s cancelled during retry: %w", operation, ctx.Err())
		case <-time.After(delay):
			// Calculate next delay with exponential backoff
			delay = time.Duration(float64(delay) * cfg.Multiplier)
			if delay > cfg.MaxDelay {
				delay = cfg.MaxDelay
			}
		}
	}

	return fmt.Errorf("%s failed after %d attempts: %w", operation, cfg.MaxAttempts, lastErr)
}

// WithLinearBackoff executes fn with linear backoff (constant delay between retries)
func WithLinearBackoff(ctx context.Context, maxAttempts int, delay time.Duration, operation string, fn func() error) error {
	cfg := Config{
		MaxAttempts: maxAttempts,
		InitialDelay: delay,
		MaxDelay: delay,
		Multiplier: 1.0, // No exponential growth
	}
	return WithExponentialBackoff(ctx, cfg, operation, fn)
}
