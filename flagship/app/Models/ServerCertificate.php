<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Carbon\Carbon;

/**
 * ServerCertificate Model
 *
 * Represents mTLS client certificates for agent authentication.
 * Certificates are encrypted at rest and managed through the Submarines API.
 */
class ServerCertificate extends Model
{
    /**
     * The table associated with the model.
     */
    protected $table = 'admiral.server_certificates';

    /**
     * The attributes that are mass assignable.
     */
    protected $fillable = [
        'server_id',
        'ca_id',
        'certificate_pem',
        'private_key_encrypted',
        'serial_number',
        'subject_dn',
        'fingerprint_sha256',
        'valid_from',
        'valid_until',
        'status',
        'key_algorithm',
        'key_size',
        'revoked_at',
    ];

    /**
     * The attributes that should be cast.
     */
    protected $casts = [
        'valid_from' => 'datetime',
        'valid_until' => 'datetime',
        'revoked_at' => 'datetime',
        'created_at' => 'datetime',
        'updated_at' => 'datetime',
    ];

    /**
     * The attributes that should be hidden for serialization.
     */
    protected $hidden = [
        'private_key_encrypted',
    ];

    /**
     * Get the server that owns the certificate.
     * Note: No foreign key constraint - relationship is logical only.
     */
    public function server()
    {
        return Server::where('server_id', $this->server_id)->first();
    }

    /**
     * Get the certificate authority that signed this certificate.
     * Note: No foreign key constraint - relationship is logical only.
     */
    public function certificateAuthority()
    {
        return CertificateAuthority::find($this->ca_id);
    }

    /**
     * Scope a query to only include active certificates.
     */
    public function scopeActive($query)
    {
        return $query->where('status', 'active');
    }

    /**
     * Scope a query to only include revoked certificates.
     */
    public function scopeRevoked($query)
    {
        return $query->where('status', 'revoked');
    }

    /**
     * Scope a query to only include expired certificates.
     */
    public function scopeExpired($query)
    {
        return $query->where('status', 'expired');
    }

    /**
     * Scope a query to only include certificates expiring soon.
     *
     * @param  int  $days  Number of days to check (default: 30)
     */
    public function scopeExpiringSoon($query, int $days = 30)
    {
        $threshold = Carbon::now()->addDays($days);
        return $query->where('status', 'active')
                     ->where('valid_until', '<=', $threshold)
                     ->where('valid_until', '>', Carbon::now());
    }

    /**
     * Check if the certificate is expired.
     */
    public function isExpired(): bool
    {
        return $this->status === 'expired' || $this->valid_until->isPast();
    }

    /**
     * Check if the certificate is revoked.
     */
    public function isRevoked(): bool
    {
        return $this->status === 'revoked';
    }

    /**
     * Check if the certificate is active and valid.
     */
    public function isActive(): bool
    {
        return $this->status === 'active' && !$this->isExpired();
    }

    /**
     * Get the number of days until the certificate expires.
     */
    public function daysUntilExpiry(): int
    {
        if ($this->isExpired()) {
            return 0;
        }

        return Carbon::now()->diffInDays($this->valid_until, false);
    }

    /**
     * Get the percentage of certificate lifetime remaining.
     */
    public function lifetimeRemainingPercent(): float
    {
        if ($this->isExpired()) {
            return 0.0;
        }

        $totalDays = $this->valid_from->diffInDays($this->valid_until);
        $remainingDays = Carbon::now()->diffInDays($this->valid_until);

        return ($remainingDays / $totalDays) * 100;
    }

    /**
     * Determine if the certificate needs renewal soon.
     *
     * @param  int  $thresholdDays  Days before expiry to consider renewal needed
     */
    public function needsRenewal(int $thresholdDays = 30): bool
    {
        return $this->isActive() && $this->daysUntilExpiry() <= $thresholdDays;
    }

    /**
     * Get a human-readable expiry status.
     */
    public function getExpiryStatusAttribute(): string
    {
        if ($this->isRevoked()) {
            return 'Revoked';
        }

        if ($this->isExpired()) {
            return 'Expired';
        }

        $days = $this->daysUntilExpiry();

        if ($days <= 7) {
            return "Expires in {$days} days (critical)";
        }

        if ($days <= 30) {
            return "Expires in {$days} days (warning)";
        }

        return "Valid ({$days} days remaining)";
    }

    /**
     * Get the certificate's validity period as a human-readable string.
     */
    public function getValidityPeriodAttribute(): string
    {
        return sprintf(
            '%s to %s',
            $this->valid_from->format('Y-m-d'),
            $this->valid_until->format('Y-m-d')
        );
    }
}
