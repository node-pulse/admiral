<?php

return [

    /*
    |--------------------------------------------------------------------------
    | CAPTCHA Provider
    |--------------------------------------------------------------------------
    |
    | Supported providers: "turnstile", "recaptcha_v2", "recaptcha_v3", "none"
    |
    | - turnstile: Cloudflare Turnstile (privacy-friendly, free)
    | - recaptcha_v2: Google reCAPTCHA v2 (checkbox)
    | - recaptcha_v3: Google reCAPTCHA v3 (invisible, score-based)
    | - none: Disable CAPTCHA (not recommended for production)
    |
    */

    'provider' => env('CAPTCHA_PROVIDER', 'turnstile'),

    /*
    |--------------------------------------------------------------------------
    | Enabled Features
    |--------------------------------------------------------------------------
    |
    | Comma-separated list of features that should have CAPTCHA enabled.
    | Available features: login, register, forgot_password, reset_password
    |
    | Example: "login,register,forgot_password"
    | To disable all: "" (empty string) or omit the env var
    |
    */

    'enabled_features' => env('CAPTCHA_ENABLED_FEATURES', ''),

    /*
    |--------------------------------------------------------------------------
    | Cloudflare Turnstile Configuration
    |--------------------------------------------------------------------------
    |
    | Get your keys at: https://dash.cloudflare.com/
    |
    */

    'turnstile' => [
        'site_key' => env('TURNSTILE_SITE_KEY', ''),
        'secret_key' => env('TURNSTILE_SECRET_KEY', ''),
        'verify_url' => 'https://challenges.cloudflare.com/turnstile/v0/siteverify',
    ],

    /*
    |--------------------------------------------------------------------------
    | Google reCAPTCHA v2 Configuration
    |--------------------------------------------------------------------------
    |
    | Get your keys at: https://www.google.com/recaptcha/admin
    |
    */

    'recaptcha_v2' => [
        'site_key' => env('RECAPTCHA_V2_SITE_KEY', ''),
        'secret_key' => env('RECAPTCHA_V2_SECRET_KEY', ''),
        'verify_url' => 'https://www.google.com/recaptcha/api/siteverify',
    ],

    /*
    |--------------------------------------------------------------------------
    | Google reCAPTCHA v3 Configuration
    |--------------------------------------------------------------------------
    |
    | Get your keys at: https://www.google.com/recaptcha/admin
    | Score threshold: 0.0 (bot) to 1.0 (human)
    |
    */

    'recaptcha_v3' => [
        'site_key' => env('RECAPTCHA_V3_SITE_KEY', ''),
        'secret_key' => env('RECAPTCHA_V3_SECRET_KEY', ''),
        'verify_url' => 'https://www.google.com/recaptcha/api/siteverify',
        'score_threshold' => env('RECAPTCHA_V3_SCORE_THRESHOLD', 0.5),
    ],

];
