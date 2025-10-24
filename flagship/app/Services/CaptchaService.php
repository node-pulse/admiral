<?php

namespace App\Services;

use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class CaptchaService
{
    protected string $provider;
    protected array $config;

    public function __construct()
    {
        $this->provider = config('captcha.provider', 'turnstile');
        $this->config = config('captcha.'.$this->provider, []);
    }

    /**
     * Verify the CAPTCHA response
     */
    public function verify(string $response, string $ipAddress = null): bool
    {
        if ($this->provider === 'none' || empty($response)) {
            return $this->provider === 'none';
        }

        return match ($this->provider) {
            'turnstile' => $this->verifyTurnstile($response, $ipAddress),
            'recaptcha_v2' => $this->verifyRecaptchaV2($response, $ipAddress),
            'recaptcha_v3' => $this->verifyRecaptchaV3($response, $ipAddress),
            default => false,
        };
    }

    /**
     * Verify Cloudflare Turnstile
     */
    protected function verifyTurnstile(string $response, ?string $ipAddress): bool
    {
        try {
            $result = Http::asForm()->post($this->config['verify_url'], [
                'secret' => $this->config['secret_key'],
                'response' => $response,
                'remoteip' => $ipAddress,
            ])->json();

            if (! isset($result['success'])) {
                Log::warning('Turnstile verification failed: Invalid response format', ['result' => $result]);

                return false;
            }

            if (! $result['success']) {
                Log::info('Turnstile verification failed', [
                    'error_codes' => $result['error-codes'] ?? [],
                ]);
            }

            return $result['success'] === true;
        } catch (\Exception $e) {
            Log::error('Turnstile verification exception', [
                'message' => $e->getMessage(),
            ]);

            return false;
        }
    }

    /**
     * Verify Google reCAPTCHA v2
     */
    protected function verifyRecaptchaV2(string $response, ?string $ipAddress): bool
    {
        try {
            $result = Http::asForm()->post($this->config['verify_url'], [
                'secret' => $this->config['secret_key'],
                'response' => $response,
                'remoteip' => $ipAddress,
            ])->json();

            if (! isset($result['success'])) {
                Log::warning('reCAPTCHA v2 verification failed: Invalid response format', ['result' => $result]);

                return false;
            }

            if (! $result['success']) {
                Log::info('reCAPTCHA v2 verification failed', [
                    'error_codes' => $result['error-codes'] ?? [],
                ]);
            }

            return $result['success'] === true;
        } catch (\Exception $e) {
            Log::error('reCAPTCHA v2 verification exception', [
                'message' => $e->getMessage(),
            ]);

            return false;
        }
    }

    /**
     * Verify Google reCAPTCHA v3
     */
    protected function verifyRecaptchaV3(string $response, ?string $ipAddress): bool
    {
        try {
            $result = Http::asForm()->post($this->config['verify_url'], [
                'secret' => $this->config['secret_key'],
                'response' => $response,
                'remoteip' => $ipAddress,
            ])->json();

            if (! isset($result['success'])) {
                Log::warning('reCAPTCHA v3 verification failed: Invalid response format', ['result' => $result]);

                return false;
            }

            if (! $result['success']) {
                Log::info('reCAPTCHA v3 verification failed', [
                    'error_codes' => $result['error-codes'] ?? [],
                ]);

                return false;
            }

            // Check score threshold for v3
            $score = $result['score'] ?? 0;
            $threshold = $this->config['score_threshold'] ?? 0.5;

            if ($score < $threshold) {
                Log::info('reCAPTCHA v3 score below threshold', [
                    'score' => $score,
                    'threshold' => $threshold,
                ]);

                return false;
            }

            return true;
        } catch (\Exception $e) {
            Log::error('reCAPTCHA v3 verification exception', [
                'message' => $e->getMessage(),
            ]);

            return false;
        }
    }

    /**
     * Check if CAPTCHA is enabled for a specific feature
     */
    public function isEnabled(string $feature): bool
    {
        if ($this->provider === 'none') {
            return false;
        }

        return config("captcha.enabled.{$feature}", false);
    }

    /**
     * Get the current provider
     */
    public function getProvider(): string
    {
        return $this->provider;
    }

    /**
     * Get the site key for the current provider
     */
    public function getSiteKey(): ?string
    {
        return $this->config['site_key'] ?? null;
    }
}
