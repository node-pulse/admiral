package health

import (
	"context"
	"encoding/json"
	"net/http"
	"time"

	"github.com/nodepulse/admiral/submarines/internal/database"
	"github.com/nodepulse/admiral/submarines/internal/valkey"
)

// Response represents the health check response
type Response struct {
	Status   string            `json:"status"` // "healthy", "degraded", "unhealthy"
	Checks   map[string]Check  `json:"checks"`
	Metadata map[string]string `json:"metadata,omitempty"`
}

// Check represents a single health check result
type Check struct {
	Status  string `json:"status"`
	Message string `json:"message,omitempty"`
}

// Handler creates an HTTP handler for health checks
func Handler(db *database.DB, valkeyClient *valkey.Client, version string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
		defer cancel()

		response := Response{
			Status: "healthy",
			Checks: make(map[string]Check),
			Metadata: map[string]string{
				"service": "digest-worker",
				"version": version,
			},
		}

		// Check database
		dbCheck := checkDatabase(ctx, db)
		response.Checks["database"] = dbCheck
		if dbCheck.Status != "pass" {
			response.Status = "unhealthy"
		}

		// Check Valkey
		valkeyCheck := checkValkey(ctx, valkeyClient)
		response.Checks["valkey"] = valkeyCheck
		if valkeyCheck.Status != "pass" {
			response.Status = "unhealthy"
		}

		// Set HTTP status code
		statusCode := http.StatusOK
		if response.Status == "unhealthy" {
			statusCode = http.StatusServiceUnavailable
		}

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(statusCode)
		json.NewEncoder(w).Encode(response)
	}
}

func checkDatabase(ctx context.Context, db *database.DB) Check {
	if err := db.Ping(ctx); err != nil {
		return Check{
			Status:  "fail",
			Message: err.Error(),
		}
	}
	return Check{
		Status: "pass",
	}
}

func checkValkey(ctx context.Context, valkeyClient *valkey.Client) Check {
	if err := valkeyClient.Ping(ctx); err != nil {
		return Check{
			Status:  "fail",
			Message: err.Error(),
		}
	}
	return Check{
		Status: "pass",
	}
}
