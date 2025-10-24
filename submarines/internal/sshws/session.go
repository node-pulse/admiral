package sshws

import (
	"database/sql"
	"fmt"
	"log"
)

// SessionLogger handles SSH session audit logging
type SessionLogger struct {
	db               *sql.DB
	sessionID        string
	serverID         string
	sshUsername      string
	sshHost          string
	sshPort          int
	authMethod       string
	hostKeyFp        string
	userID           *int64  // Flagship/Laravel user ID
	betterAuthID     *string // Better Auth user ID
	ipAddress        *string // Client IP address
	userAgent        *string // Client user agent
	recordingEnabled bool
	sequence         int
}

// NewSessionLogger creates a new session logger
func NewSessionLogger(db *sql.DB, sessionID, serverID string) *SessionLogger {
	return &SessionLogger{
		db:               db,
		sessionID:        sessionID,
		serverID:         serverID,
		recordingEnabled: false, // Default: only log metadata, not full I/O
		sequence:         0,
	}
}

// SetSSHDetails sets SSH connection details for logging
func (sl *SessionLogger) SetSSHDetails(username, host string, port int) {
	sl.sshUsername = username
	sl.sshHost = host
	sl.sshPort = port
}

// SetAuthMethod sets the authentication method used
func (sl *SessionLogger) SetAuthMethod(method string) {
	sl.authMethod = method
}

// SetHostKeyFingerprint sets the host key fingerprint
func (sl *SessionLogger) SetHostKeyFingerprint(fingerprint string) {
	sl.hostKeyFp = fingerprint
}

// SetUserID sets the Flagship/Laravel user ID
func (sl *SessionLogger) SetUserID(userID int64) {
	sl.userID = &userID
}

// SetBetterAuthID sets the Better Auth user ID
func (sl *SessionLogger) SetBetterAuthID(betterAuthID string) {
	sl.betterAuthID = &betterAuthID
}

// SetIPAddress sets the client IP address
func (sl *SessionLogger) SetIPAddress(ipAddress string) {
	sl.ipAddress = &ipAddress
}

// SetUserAgent sets the client user agent
func (sl *SessionLogger) SetUserAgent(userAgent string) {
	sl.userAgent = &userAgent
}

// EnableRecording enables full session recording (I/O capture)
func (sl *SessionLogger) EnableRecording(enabled bool) {
	sl.recordingEnabled = enabled
}

// LogSessionStart logs the beginning of an SSH session
func (sl *SessionLogger) LogSessionStart() error {
	query := `
		INSERT INTO admiral.ssh_sessions (
			session_id,
			server_id,
			user_id,
			better_auth_id,
			ip_address,
			user_agent,
			started_at,
			status,
			auth_method,
			ssh_username,
			ssh_host,
			ssh_port,
			host_key_fingerprint
		) VALUES ($1, $2, $3, $4, $5, $6, NOW(), 'active', $7, $8, $9, $10, $11)
	`

	_, err := sl.db.Exec(query,
		sl.sessionID,
		sl.serverID,
		sl.userID,
		sl.betterAuthID,
		sl.ipAddress,
		sl.userAgent,
		sl.authMethod,
		sl.sshUsername,
		sl.sshHost,
		sl.sshPort,
		sl.hostKeyFp,
	)

	if err != nil {
		log.Printf("[Session Logger] Failed to log session start: %v", err)
		return fmt.Errorf("failed to log session start: %w", err)
	}

	log.Printf("[Session Logger] Session %s started (server: %s, user: %s@%s:%d, auth: %s)",
		sl.sessionID, sl.serverID, sl.sshUsername, sl.sshHost, sl.sshPort, sl.authMethod)
	return nil
}

// LogSessionEnd logs the end of an SSH session
func (sl *SessionLogger) LogSessionEnd(status, disconnectReason string) error {
	query := `
		UPDATE admiral.ssh_sessions
		SET
			ended_at = NOW(),
			duration_seconds = EXTRACT(EPOCH FROM (NOW() - started_at))::INTEGER,
			status = $2,
			disconnect_reason = $3,
			updated_at = NOW()
		WHERE session_id = $1
	`

	_, err := sl.db.Exec(query, sl.sessionID, status, disconnectReason)
	if err != nil {
		log.Printf("[Session Logger] Failed to log session end: %v", err)
		return fmt.Errorf("failed to log session end: %w", err)
	}

	log.Printf("[Session Logger] Session %s ended (status: %s, reason: %s)",
		sl.sessionID, status, disconnectReason)
	return nil
}

// LogSessionFailure logs a failed SSH connection attempt
func (sl *SessionLogger) LogSessionFailure(reason string) error {
	return sl.LogSessionEnd("failed", reason)
}

// RecordEvent records a terminal event (input/output/resize) if recording is enabled
func (sl *SessionLogger) RecordEvent(eventType, data string) error {
	if !sl.recordingEnabled {
		return nil // Recording disabled, skip
	}

	sl.sequence++

	query := `
		INSERT INTO admiral.ssh_session_recordings (
			session_id,
			sequence,
			timestamp,
			event_type,
			data,
			data_size
		)
		SELECT
			id,
			$2,
			NOW(),
			$3,
			$4,
			$5
		FROM admiral.ssh_sessions
		WHERE session_id = $1
	`

	dataSize := len(data)
	_, err := sl.db.Exec(query, sl.sessionID, sl.sequence, eventType, data, dataSize)
	if err != nil {
		log.Printf("[Session Logger] Failed to record event: %v", err)
		return fmt.Errorf("failed to record event: %w", err)
	}

	return nil
}
