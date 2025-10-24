<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Casts\Attribute;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Encryption\Encrypter;

class PrivateKey extends Model
{
    protected $table = 'private_keys';

    protected $fillable = [
        'name',
        'description',
        'private_key_content',
        'public_key',
        'fingerprint',
        'team_id',
    ];

    protected $casts = [
        'created_at' => 'datetime',
        'updated_at' => 'datetime',
    ];

    protected $hidden = [
        'private_key_content', // Never expose private key in JSON responses by default
    ];

    public function servers(): BelongsToMany
    {
        return $this->belongsToMany(Server::class, 'server_private_keys')
            ->withPivot('purpose', 'is_primary', 'last_used_at')
            ->withTimestamps();
    }

    /**
     * Get the master key encrypter instance
     */
    protected static function getMasterEncrypter(): Encrypter
    {
        $masterKey = config('app.master_key');

        if (empty($masterKey)) {
            throw new \RuntimeException(
                'Master encryption key not configured. ' .
                'Please ensure /secrets/master.key exists and is mounted. ' .
                'Run deploy.sh to generate the key.'
            );
        }

        // Trim whitespace
        $masterKey = trim($masterKey);

        // Parse the key (handle base64: prefix like Laravel does, or use raw string)
        if (str_starts_with($masterKey, 'base64:')) {
            $masterKey = base64_decode(substr($masterKey, 7));
        } elseif (strlen($masterKey) < 32) {
            // If raw string is too short, pad it to 32 bytes for AES-256
            $masterKey = str_pad($masterKey, 32, '0');
        }

        // Ensure key is exactly 32 bytes for AES-256-CBC
        $masterKey = substr($masterKey, 0, 32);

        return new Encrypter($masterKey, config('app.cipher'));
    }

    /**
     * Encrypt/decrypt private_key_content using the master key
     * This uses a separate encryption key from Laravel's APP_KEY
     */
    protected function privateKeyContent(): Attribute
    {
        return Attribute::make(
            get: function ($value) {
                if (is_null($value)) {
                    return null;
                }

                return static::getMasterEncrypter()->decryptString($value);
            },
            set: function ($value) {
                if (is_null($value)) {
                    return null;
                }

                return static::getMasterEncrypter()->encryptString($value);
            }
        );
    }

    /**
     * Get the decrypted private key content
     * Accessor method for convenience
     */
    public function getDecryptedPrivateKey(): string
    {
        return $this->private_key_content;
    }
}
