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
