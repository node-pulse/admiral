<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Setting extends Model
{
    /**
     * The table associated with the model.
     *
     * @var string
     */
    protected $table = 'admiral.settings';

    /**
     * The primary key for the model.
     *
     * @var string
     */
    protected $primaryKey = 'key';

    /**
     * Indicates if the IDs are auto-incrementing.
     *
     * @var bool
     */
    public $incrementing = false;

    /**
     * The data type of the primary key.
     *
     * @var string
     */
    protected $keyType = 'string';

    /**
     * The attributes that are mass assignable.
     *
     * @var array<int, string>
     */
    protected $fillable = [
        'key',
        'value',
        'description',
        'tier',
    ];

    /**
     * Get a setting value by key
     *
     * @param string $key
     * @param mixed $default
     * @return mixed
     */
    public static function get(string $key, $default = null)
    {
        $setting = static::find($key);

        if (!$setting) {
            return $default;
        }

        // Parse JSONB value
        $value = $setting->value;

        // Handle boolean values stored as strings
        if ($value === 'true') return true;
        if ($value === 'false') return false;
        if ($value === 'null') return null;

        // Try to decode as JSON for complex types
        if (is_string($value)) {
            $decoded = json_decode($value, true);
            if (json_last_error() === JSON_ERROR_NONE) {
                return $decoded;
            }
        }

        return $value;
    }

    /**
     * Set a setting value by key
     *
     * @param string $key
     * @param mixed $value
     * @return bool
     */
    public static function set(string $key, $value): bool
    {
        // Convert boolean to string for JSONB storage
        if (is_bool($value)) {
            $value = $value ? 'true' : 'false';
        } elseif (is_null($value)) {
            $value = 'null';
        } elseif (is_array($value) || is_object($value)) {
            $value = json_encode($value);
        }

        return static::updateOrCreate(
            ['key' => $key],
            ['value' => $value]
        ) !== null;
    }

    /**
     * Check if a boolean setting is enabled
     *
     * @param string $key
     * @param bool $default
     * @return bool
     */
    public static function isEnabled(string $key, bool $default = false): bool
    {
        $value = static::get($key, $default);
        return $value === true || $value === 'true';
    }

    /**
     * Get all settings grouped by category
     *
     * @return array
     */
    public static function getAllGrouped(): array
    {
        $settings = static::all();

        $grouped = [
            'authentication' => [],
            'data_retention' => [],
            'alerting' => [],
            'pro_features' => [],
            'system' => [],
        ];

        foreach ($settings as $setting) {
            $key = $setting->key;

            // Categorize settings
            if (str_contains($key, 'registration') || str_contains($key, 'auth')) {
                $grouped['authentication'][] = $setting;
            } elseif (str_contains($key, 'retention')) {
                $grouped['data_retention'][] = $setting;
            } elseif (str_contains($key, 'alert')) {
                $grouped['alerting'][] = $setting;
            } elseif ($setting->tier === 'pro' || $setting->tier === 'growth') {
                $grouped['pro_features'][] = $setting;
            } else {
                $grouped['system'][] = $setting;
            }
        }

        return $grouped;
    }
}
