package models

import (
	"database/sql/driver"
	"encoding/json"
	"time"
)

// Setting represents a configuration setting stored in admiral.settings
type Setting struct {
	Key         string    `json:"key"`
	Value       JSONValue `json:"value"`
	Description *string   `json:"description,omitempty"`
	Tier        string    `json:"tier"` // free, pro, growth
	UpdatedAt   time.Time `json:"updated_at"`
	CreatedAt   time.Time `json:"created_at"`
}

// JSONValue wraps the JSONB value field to handle different types
type JSONValue struct {
	Raw json.RawMessage
}

// Scan implements the sql.Scanner interface for database deserialization
func (j *JSONValue) Scan(value interface{}) error {
	if value == nil {
		j.Raw = json.RawMessage("null")
		return nil
	}

	bytes, ok := value.([]byte)
	if !ok {
		return nil
	}

	j.Raw = json.RawMessage(bytes)
	return nil
}

// Value implements the driver.Valuer interface for database serialization
func (j JSONValue) Value() (driver.Value, error) {
	if len(j.Raw) == 0 {
		return nil, nil
	}
	return []byte(j.Raw), nil
}

// String returns the value as a string (strips quotes if it's a JSON string)
func (j *JSONValue) String() string {
	var s string
	if err := json.Unmarshal(j.Raw, &s); err == nil {
		return s
	}
	return string(j.Raw)
}

// Int returns the value as an int
func (j *JSONValue) Int() (int, error) {
	var i int
	err := json.Unmarshal(j.Raw, &i)
	return i, err
}

// Bool returns the value as a bool
func (j *JSONValue) Bool() (bool, error) {
	var b bool
	err := json.Unmarshal(j.Raw, &b)
	return b, err
}

// IsNull checks if the value is null
func (j *JSONValue) IsNull() bool {
	return string(j.Raw) == "null" || len(j.Raw) == 0
}

// RetentionSettings contains parsed retention configuration
type RetentionSettings struct {
	RetentionHours int  `json:"retention_hours"`
	Enabled        bool `json:"enabled"`
}
