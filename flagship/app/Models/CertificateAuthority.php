<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Carbon\Carbon;

/**
 * CertificateAuthority Model
 *
 * Represents a self-signed Certificate Authority for mTLS.
 * Only one CA can be active at a time.
 */
class CertificateAuthority extends Model
{
    /**
     * The table associated with the model.
     */
    protected $table = 'admiral.certificate_authorities';

    /**
     * The attributes that are mass assignable.
     */
    protected $fillable = [
        'name',
        'certificate_pem',
        'private_key_encrypted',
        'valid_from',
        'valid_until',
        'is_active',
        'description',
        'issuer_dn',
        'subject_dn',
        'serial_number',
        'key_algorithm',
        'key_size',
    ];

    /**
     * The attributes that should be cast.
     */
    protected $casts = [
        'valid_from' => 'datetime',
        'valid_until' => 'datetime',
        'is_active' => 'boolean',
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
     * Get the certificates signed by this CA.
     * Note: No foreign key constraint - relationship is logical only.
     */
    public function certificates()
    {
        return ServerCertificate::where('ca_id', $this->id)->get();
    }

    /**
     * Get the active certificates signed by this CA.
     * Note: No foreign key constraint - relationship is logical only.
     */
    public function activeCertificates()
    {
        return ServerCertificate::where('ca_id', $this->id)
                    ->where('status', 'active')
                    ->get();
    }

    /**
     * Scope a query to only include the active CA.
     */
    public function scopeActive($query)
    {
        return $query->where('is_active', true);
    }

    /**
     * Check if the CA is expired.
     */
    public function isExpired(): bool
    {
        return $this->valid_until->isPast();
    }

    /**
     * Get the number of days until the CA expires.
     */
    public function daysUntilExpiry(): int
    {
        if ($this->isExpired()) {
            return 0;
        }

        return Carbon::now()->diffInDays($this->valid_until, false);
    }

    /**
     * Get the count of active certificates signed by this CA.
     */
    public function getActiveCertificatesCountAttribute(): int
    {
        return ServerCertificate::where('ca_id', $this->id)
            ->where('status', 'active')
            ->count();
    }

    /**
     * Get a human-readable status.
     */
    public function getStatusAttribute(): string
    {
        if ($this->isExpired()) {
            return 'Expired';
        }

        if (!$this->is_active) {
            return 'Inactive';
        }

        return 'Active';
    }
}
