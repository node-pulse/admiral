package validation

import (
	"context"
	"database/sql"
	"fmt"
	"time"

	"github.com/valkey-io/valkey-go"
)

// ServerIDValidator handles server ID validation with Valkey caching
type ServerIDValidator struct {
	db          *sql.DB
	valkey      valkey.Client
	cacheTTL    time.Duration
}

// NewServerIDValidator creates a new server ID validator
func NewServerIDValidator(db *sql.DB, valkeyClient valkey.Client, cacheTTLSeconds int) *ServerIDValidator {
	return &ServerIDValidator{
		db:       db,
		valkey:   valkeyClient,
		cacheTTL: time.Duration(cacheTTLSeconds) * time.Second,
	}
}

// ValidateServerID checks if a server_id exists in the database with Valkey caching
// Returns (exists bool, error)
//
// Cache strategy:
// - Valid servers: cached for cacheTTL (default 3600s / 1 hour)
// - Invalid servers: cached for cacheTTL (same as valid - prevents DB hammering)
//
// Flow:
// 1. Check Valkey cache first
// 2. On cache miss, query PostgreSQL
// 3. Cache result (both valid AND invalid)
// 4. Return validation result
func (v *ServerIDValidator) ValidateServerID(ctx context.Context, serverID string) (bool, error) {
	if serverID == "" {
		return false, fmt.Errorf("server_id cannot be empty")
	}

	cacheKey := fmt.Sprintf("server:valid:%s", serverID)

	// 1. Check Valkey cache first
	cached := v.valkey.Do(ctx, v.valkey.B().Get().Key(cacheKey).Build())
	if cached.Error() == nil {
		val, err := cached.ToString()
		if err == nil {
			// Cache hit - return cached result
			return val == "true", nil
		}
	}

	// 2. Cache miss - query database
	var exists bool
	err := v.db.QueryRowContext(ctx,
		"SELECT EXISTS(SELECT 1 FROM admiral.servers WHERE server_id = $1)",
		serverID,
	).Scan(&exists)

	if err != nil {
		return false, fmt.Errorf("database query failed: %w", err)
	}

	// 3. Cache the result (both valid AND invalid with same TTL)
	cacheValue := "false"
	if exists {
		cacheValue = "true"
	}

	// Set with TTL (same for both valid and invalid)
	setCmd := v.valkey.B().Set().Key(cacheKey).Value(cacheValue).Ex(v.cacheTTL).Build()
	_ = v.valkey.Do(ctx, setCmd) // Ignore cache write errors (graceful degradation)

	return exists, nil
}

// InvalidateCache removes a server_id from the cache
// Useful when a server is deleted or added
func (v *ServerIDValidator) InvalidateCache(ctx context.Context, serverID string) error {
	cacheKey := fmt.Sprintf("server:valid:%s", serverID)
	delCmd := v.valkey.B().Del().Key(cacheKey).Build()

	result := v.valkey.Do(ctx, delCmd)
	if result.Error() != nil {
		return fmt.Errorf("failed to invalidate cache: %w", result.Error())
	}

	return nil
}

// GetCacheKey returns the cache key for a server_id (for debugging/testing)
func (v *ServerIDValidator) GetCacheKey(serverID string) string {
	return fmt.Sprintf("server:valid:%s", serverID)
}
