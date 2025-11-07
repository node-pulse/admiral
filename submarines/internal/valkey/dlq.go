package valkey

import (
	"context"
	"fmt"
	"log"
	"time"
)

// PendingMessage represents a message in the pending queue with delivery count
type PendingMessage struct {
	ID             string
	Consumer       string
	DeliveryCount  int64
	ElapsedTime    time.Duration
	Fields         map[string]string
}

// XPending returns pending messages with delivery counts for a consumer group
func (c *Client) XPending(ctx context.Context, stream, group string, count int64) ([]PendingMessage, error) {
	// XPENDING stream group START END COUNT
	cmd := c.client.B().Xpending().
		Key(stream).
		Group(group).
		Start("-").
		End("+").
		Count(count).
		Build()

	result := c.client.Do(ctx, cmd)
	if err := result.Error(); err != nil {
		// Empty pending list is OK
		if err.Error() == "valkey nil message" || err.Error() == "redis nil" {
			return []PendingMessage{}, nil
		}
		return nil, fmt.Errorf("failed to get pending messages: %w", err)
	}

	// Parse XPENDING response - array of [ID, consumer, idle, deliveryCount]
	arr, err := result.ToArray()
	if err != nil {
		return nil, fmt.Errorf("failed to parse pending array: %w", err)
	}

	messages := make([]PendingMessage, len(arr))
	for i, item := range arr {
		itemArr, err := item.ToArray()
		if err != nil || len(itemArr) < 4 {
			continue
		}

		id, _ := itemArr[0].ToString()
		consumer, _ := itemArr[1].ToString()
		idle, _ := itemArr[2].AsInt64()
		deliveryCount, _ := itemArr[3].AsInt64()

		messages[i] = PendingMessage{
			ID:            id,
			Consumer:      consumer,
			DeliveryCount: deliveryCount,
			ElapsedTime:   time.Duration(idle) * time.Millisecond,
		}
	}

	return messages, nil
}

// XRange reads messages by ID range (used to fetch full message data for DLQ)
func (c *Client) XRange(ctx context.Context, stream string, messageIDs ...string) ([]StreamMessage, error) {
	if len(messageIDs) == 0 {
		return []StreamMessage{}, nil
	}

	// Fetch each message by ID
	messages := []StreamMessage{}
	for _, id := range messageIDs {
		cmd := c.client.B().Xrange().Key(stream).Start(id).End(id).Build()
		result := c.client.Do(ctx, cmd)

		if err := result.Error(); err != nil {
			log.Printf("[WARN] Failed to fetch message %s: %v", id, err)
			continue
		}

		entries, err := result.AsXRange()
		if err != nil {
			log.Printf("[WARN] Failed to parse message %s: %v", id, err)
			continue
		}

		for _, entry := range entries {
			messages = append(messages, StreamMessage{
				ID:     entry.ID,
				Fields: entry.FieldValues,
			})
		}
	}

	return messages, nil
}

// MoveToDLQ moves a poison message to the dead letter queue
func (c *Client) MoveToDLQ(ctx context.Context, sourceStream, dlqStream, messageID string, fields map[string]string, retryCount int64) error {
	// Add metadata fields
	dlqFields := make(map[string]string)
	for k, v := range fields {
		dlqFields[k] = v
	}
	dlqFields["original_stream"] = sourceStream
	dlqFields["original_message_id"] = messageID
	dlqFields["failed_at"] = time.Now().UTC().Format(time.RFC3339)
	dlqFields["retry_count"] = fmt.Sprintf("%d", retryCount)

	// Add to DLQ stream
	_, err := c.XAdd(ctx, dlqStream, dlqFields)
	if err != nil {
		return fmt.Errorf("failed to add message to DLQ: %w", err)
	}

	log.Printf("[DLQ] Moved poison message %s to %s (retries: %d)", messageID, dlqStream, retryCount)
	return nil
}

// GetDLQMessages retrieves messages from the dead letter queue
func (c *Client) GetDLQMessages(ctx context.Context, dlqStream string, count int64) ([]StreamMessage, error) {
	cmd := c.client.B().Xrange().Key(dlqStream).Start("-").End("+").Count(count).Build()
	result := c.client.Do(ctx, cmd)

	if err := result.Error(); err != nil {
		if err.Error() == "valkey nil message" || err.Error() == "redis nil" {
			return []StreamMessage{}, nil
		}
		return nil, fmt.Errorf("failed to read DLQ: %w", err)
	}

	entries, err := result.AsXRange()
	if err != nil {
		return nil, fmt.Errorf("failed to parse DLQ messages: %w", err)
	}

	messages := make([]StreamMessage, len(entries))
	for i, entry := range entries {
		messages[i] = StreamMessage{
			ID:     entry.ID,
			Fields: entry.FieldValues,
		}
	}

	return messages, nil
}
