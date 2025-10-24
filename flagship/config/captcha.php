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
    | Enable CAPTCHA for Specific Features
    |--------------------------------------------------------------------------
    |
    | You can selectively enable/disable CAPTCHA for different auth features
    |
    */

    'enabled' => [
        'login' => env('CAPTCHA_ENABLE_LOGIN', true),
        'register' => env('CAPTCHA_ENABLE_REGISTER', true),
        'forgot_password' => env('CAPTCHA_ENABLE_FORGOT_PASSWORD', true),
        'reset_password' => env('CAPTCHA_ENABLE_RESET_PASSWORD', false),
    ],

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
