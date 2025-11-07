package valkey

import (
	"context"
	"fmt"
	"log"

	"github.com/nodepulse/admiral/submarines/internal/config"
	"github.com/valkey-io/valkey-go"
)

type Client struct {
	client valkey.Client
}

// GetClient returns the underlying Valkey client
func (c *Client) GetClient() valkey.Client {
	return c.client
}

func New(cfg *config.Config) (*Client, error) {
	client, err := valkey.NewClient(valkey.ClientOption{
		InitAddress: []string{cfg.GetValkeyAddress()},
		Password:    cfg.ValkeyPassword,
	})
	if err != nil {
		return nil, fmt.Errorf("failed to create valkey client: %w", err)
	}

	// Test connection
	ctx := context.Background()
	pong := client.Do(ctx, client.B().Ping().Build())
	if err := pong.Error(); err != nil {
		return nil, fmt.Errorf("failed to ping valkey: %w", err)
	}

	log.Println("Connected to Valkey successfully")

	return &Client{client: client}, nil
}

func (c *Client) Get(ctx context.Context, key string) (string, error) {
	cmd := c.client.Do(ctx, c.client.B().Get().Key(key).Build())
	if err := cmd.Error(); err != nil {
		return "", err
	}
	return cmd.ToString()
}

func (c *Client) Set(ctx context.Context, key, value string) error {
	cmd := c.client.Do(ctx, c.client.B().Set().Key(key).Value(value).Build())
	return cmd.Error()
}

func (c *Client) SetEx(ctx context.Context, key, value string, seconds int64) error {
	cmd := c.client.Do(ctx, c.client.B().Setex().Key(key).Seconds(seconds).Value(value).Build())
	return cmd.Error()
}

func (c *Client) Del(ctx context.Context, keys ...string) error {
	cmd := c.client.Do(ctx, c.client.B().Del().Key(keys...).Build())
	return cmd.Error()
}

func (c *Client) Close() {
	c.client.Close()
}

// Ping checks if Valkey connection is alive
func (c *Client) Ping(ctx context.Context) error {
	cmd := c.client.Do(ctx, c.client.B().Ping().Build())
	return cmd.Error()
}

// HealthCheck performs a more thorough health check (read/write test)
func (c *Client) HealthCheck(ctx context.Context) error {
	testKey := "health:check"
	testValue := "ok"

	// Try to write
	if err := c.Set(ctx, testKey, testValue); err != nil {
		return fmt.Errorf("valkey health check write failed: %w", err)
	}

	// Try to read
	value, err := c.Get(ctx, testKey)
	if err != nil {
		return fmt.Errorf("valkey health check read failed: %w", err)
	}

	if value != testValue {
		return fmt.Errorf("valkey health check value mismatch: expected %s, got %s", testValue, value)
	}

	// Clean up
	c.Del(ctx, testKey)

	return nil
}

// XAdd publishes a message to a Redis/Valkey Stream (NO auto-trimming to prevent data loss)
func (c *Client) XAdd(ctx context.Context, stream string, values map[string]string) (string, error) {
	// Build XADD command WITHOUT MAXLEN - we don't want to lose data
	// Backpressure protection happens at application level (reject when stream too long)
	// Messages are removed only after digest workers ACK them
	cmd := c.client.B().Xadd().Key(stream).Id("*").FieldValue()
	for k, v := range values {
		cmd = cmd.FieldValue(k, v)
	}

	result := c.client.Do(ctx, cmd.Build())
	if err := result.Error(); err != nil {
		return "", fmt.Errorf("failed to add to stream %s: %w", stream, err)
	}
	return result.ToString()
}

// XLen returns the number of entries in a stream
func (c *Client) XLen(ctx context.Context, stream string) (int64, error) {
	cmd := c.client.B().Xlen().Key(stream).Build()
	result := c.client.Do(ctx, cmd)
	if err := result.Error(); err != nil {
		return 0, fmt.Errorf("failed to get stream length: %w", err)
	}
	return result.AsInt64()
}

// CheckStreamBackpressure checks if stream is above threshold and returns error if so
func (c *Client) CheckStreamBackpressure(ctx context.Context, stream string, maxLen int64) error {
	length, err := c.XLen(ctx, stream)
	if err != nil {
		return fmt.Errorf("failed to check stream backpressure: %w", err)
	}

	if length > maxLen {
		return fmt.Errorf("stream %s is overloaded: %d messages (max: %d) - digest workers may be falling behind", stream, length, maxLen)
	}

	return nil
}

// XReadGroup reads messages from a Redis/Valkey Stream using a consumer group
func (c *Client) XReadGroup(ctx context.Context, group, consumer, stream, id string, count int64) ([]StreamMessage, error) {
	cmd := c.client.B().Xreadgroup().Group(group, consumer).Count(count).Block(5000).Streams().Key(stream).Id(id).Build()
	result := c.client.Do(ctx, cmd)

	// Check for errors
	if err := result.Error(); err != nil {
		// Check if it's a nil response (no messages within block timeout)
		if err.Error() == "valkey nil message" || err.Error() == "redis nil" {
			return []StreamMessage{}, nil
		}
		return nil, fmt.Errorf("failed to read from stream %s: %w", stream, err)
	}

	messages := []StreamMessage{}
	// Parse the XREADGROUP response - returns map[string][]XRangeEntry
	streamData, err := result.AsXRead()
	if err != nil {
		// Empty result is OK when blocking times out
		if err.Error() == "valkey nil message" || err.Error() == "redis nil" {
			return []StreamMessage{}, nil
		}
		return nil, fmt.Errorf("failed to parse stream response: %w", err)
	}

	// Convert XRangeEntry to StreamMessage
	// streamData is a map where keys are stream names
	for _, entries := range streamData {
		for _, entry := range entries {
			messages = append(messages, StreamMessage{
				ID:     entry.ID,
				Fields: entry.FieldValues,
			})
		}
	}

	return messages, nil
}

// XAck acknowledges messages in a consumer group
func (c *Client) XAck(ctx context.Context, stream, group string, ids ...string) error {
	cmd := c.client.B().Xack().Key(stream).Group(group).Id(ids...).Build()
	result := c.client.Do(ctx, cmd)
	return result.Error()
}

// XGroupCreate creates a consumer group for a stream
func (c *Client) XGroupCreate(ctx context.Context, stream, group string, startID string) error {
	cmd := c.client.B().XgroupCreate().Key(stream).Group(group).Id(startID).Mkstream().Build()
	result := c.client.Do(ctx, cmd)
	// Ignore "BUSYGROUP" error (group already exists)
	if err := result.Error(); err != nil {
		errMsg := err.Error()
		// Check for both possible error message formats
		if errMsg != "BUSYGROUP Consumer Group name already exists" &&
		   errMsg != "BUSYGROUP Consumer group name already exists" {
			return fmt.Errorf("failed to create consumer group: %w", err)
		}
		log.Printf("Consumer group %s already exists for stream %s", group, stream)
	} else {
		log.Printf("Created consumer group %s for stream %s", group, stream)
	}
	return nil
}

// StreamMessage represents a message from a Redis/Valkey Stream
type StreamMessage struct {
	ID     string
	Fields map[string]string
}

// PublishToStream is a convenience wrapper for XAdd
func (c *Client) PublishToStream(stream string, values map[string]string) (string, error) {
	return c.XAdd(context.Background(), stream, values)
}

// StreamLength is a convenience wrapper for XLen
func (c *Client) StreamLength(stream string) (int64, error) {
	return c.XLen(context.Background(), stream)
}
