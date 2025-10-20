package valkey

import (
	"context"
	"fmt"
	"log"

	"github.com/nodepulse/dashboard/backend/internal/config"
	"github.com/valkey-io/valkey-go"
)

type Client struct {
	client valkey.Client
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

// XAdd publishes a message to a Redis/Valkey Stream
func (c *Client) XAdd(ctx context.Context, stream string, values map[string]string) (string, error) {
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

// XReadGroup reads messages from a Redis/Valkey Stream using a consumer group
func (c *Client) XReadGroup(ctx context.Context, group, consumer, stream, id string, count int64) ([]StreamMessage, error) {
	cmd := c.client.B().Xreadgroup().Group(group, consumer).Count(count).Streams().Key(stream).Id(id).Build()
	result := c.client.Do(ctx, cmd)
	if err := result.Error(); err != nil {
		return nil, fmt.Errorf("failed to read from stream %s: %w", stream, err)
	}

	messages := []StreamMessage{}
	// Parse the XREADGROUP response - returns []XRangeEntry
	entries, err := result.AsXRead()
	if err != nil {
		return nil, fmt.Errorf("failed to parse stream response: %w", err)
	}

	// Convert XRangeEntry to StreamMessage
	for _, entry := range entries {
		messages = append(messages, StreamMessage{
			ID:     entry.ID,
			Fields: entry.FieldValues,
		})
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
	cmd := c.client.B().XgroupCreate().Key(stream).Group(group).Id(startID).Build()
	result := c.client.Do(ctx, cmd)
	// Ignore "BUSYGROUP" error (group already exists)
	if err := result.Error(); err != nil {
		if err.Error() != "BUSYGROUP Consumer Group name already exists" {
			return fmt.Errorf("failed to create consumer group: %w", err)
		}
	}
	return nil
}

// StreamMessage represents a message from a Redis/Valkey Stream
type StreamMessage struct {
	ID     string
	Fields map[string]string
}
