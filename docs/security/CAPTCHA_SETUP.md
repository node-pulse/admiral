# CAPTCHA Configuration Guide

This guide explains how to configure anti-bot protection for the Flagship authentication system.

## Overview

Flagship supports **three CAPTCHA providers**:

1. **Cloudflare Turnstile** (Recommended)
   - Privacy-friendly
   - Free tier available
   - Better UX (invisible mode available)
   - No Google dependency

2. **Google reCAPTCHA v2**
   - Checkbox verification
   - Widely recognized
   - Requires Google account

3. **Google reCAPTCHA v3**
   - Invisible (no user interaction)
   - Score-based verification
   - Requires Google account

## Quick Start

### 1. Choose Your CAPTCHA Provider

Set the provider in your `.env` file:

```env
# Options: turnstile, recaptcha_v2, recaptcha_v3, none
CAPTCHA_PROVIDER=turnstile
```

### 2. Get API Keys

#### Option A: Cloudflare Turnstile (Recommended)

1. Visit: https://dash.cloudflare.com/
2. Go to "Turnstile" section
3. Create a new site
4. Copy your Site Key and Secret Key

Add to `.env`:
```env
TURNSTILE_SITE_KEY=your_site_key_here
TURNSTILE_SECRET_KEY=your_secret_key_here
```

#### Option B: Google reCAPTCHA v2

1. Visit: https://www.google.com/recaptcha/admin
2. Create a new site
3. Select "reCAPTCHA v2" → "I'm not a robot" checkbox
4. Add your domains
5. Copy your Site Key and Secret Key

Add to `.env`:
```env
RECAPTCHA_V2_SITE_KEY=your_site_key_here
RECAPTCHA_V2_SECRET_KEY=your_secret_key_here
```

#### Option C: Google reCAPTCHA v3

1. Visit: https://www.google.com/recaptcha/admin
2. Create a new site
3. Select "reCAPTCHA v3"
4. Add your domains
5. Copy your Site Key and Secret Key

Add to `.env`:
```env
RECAPTCHA_V3_SITE_KEY=your_site_key_here
RECAPTCHA_V3_SECRET_KEY=your_secret_key_here
RECAPTCHA_V3_SCORE_THRESHOLD=0.5  # 0.0 (bot) to 1.0 (human)
```

### 3. Enable/Disable CAPTCHA for Specific Pages

You can selectively enable CAPTCHA for different authentication features using a comma-separated list:

```env
# Comma-separated list of features to enable CAPTCHA for
# Available: login, register, forgot_password, reset_password
CAPTCHA_ENABLED_FEATURES=login,register,forgot_password
```

To disable CAPTCHA for all features, leave it empty or omit it:

```env
CAPTCHA_ENABLED_FEATURES=
```

### 4. Restart Your Application

After updating `.env`, restart the services:

```bash
docker compose -f compose.development.yml restart flagship
```

Or if running locally:

```bash
php artisan config:clear
npm run build
```

## Complete .env Example

### For Cloudflare Turnstile

```env
# CAPTCHA Configuration
CAPTCHA_PROVIDER=turnstile
TURNSTILE_SITE_KEY=1x00000000000000000000AA
TURNSTILE_SECRET_KEY=1x0000000000000000000000000000000AA

# Enable CAPTCHA for specific pages
CAPTCHA_ENABLED_FEATURES=login,register,forgot_password
```

### For Google reCAPTCHA v2

```env
# CAPTCHA Configuration
CAPTCHA_PROVIDER=recaptcha_v2
RECAPTCHA_V2_SITE_KEY=6LcXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
RECAPTCHA_V2_SECRET_KEY=6LcXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX

# Enable CAPTCHA for specific pages
CAPTCHA_ENABLED_FEATURES=login,register,forgot_password
```

### For Google reCAPTCHA v3

```env
# CAPTCHA Configuration
CAPTCHA_PROVIDER=recaptcha_v3
RECAPTCHA_V3_SITE_KEY=6LcXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
RECAPTCHA_V3_SECRET_KEY=6LcXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
RECAPTCHA_V3_SCORE_THRESHOLD=0.5

# Enable CAPTCHA for specific pages
CAPTCHA_ENABLED_FEATURES=login,register,forgot_password
```

## Testing

### Local Development

For local testing, you can use Cloudflare Turnstile's test keys:

```env
# Turnstile Test Keys (always passes)
TURNSTILE_SITE_KEY=1x00000000000000000000AA
TURNSTILE_SECRET_KEY=1x0000000000000000000000000000000AA
```

Or Google reCAPTCHA test keys:

```env
# reCAPTCHA v2 Test Keys
RECAPTCHA_V2_SITE_KEY=6LeIxAcTAAAAAJcZVRqyHh71UMIEGNQ_MXjiZKhI
RECAPTCHA_V2_SECRET_KEY=6LeIxAcTAAAAAGG-vFI1TnRWxMZNFuojJ4WifJWe
```

### Disable CAPTCHA (Not Recommended for Production)

To completely disable CAPTCHA:

```env
CAPTCHA_PROVIDER=none
```

## Troubleshooting

### CAPTCHA Not Showing

1. Check that `CAPTCHA_PROVIDER` is set correctly
2. Verify site keys are correct
3. Clear browser cache
4. Check browser console for errors
5. Ensure frontend build is updated: `npm run build`

### Validation Always Fails

1. Verify secret keys are correct
2. Check that your domain is registered with the CAPTCHA provider
3. For Turnstile: ensure "localhost" is added for local development
4. Check Laravel logs: `docker compose -f compose.development.yml logs flagship`

### reCAPTCHA v3 Score Issues

If users are being blocked incorrectly, adjust the threshold:

```env
# Lower threshold = more lenient (may allow bots)
RECAPTCHA_V3_SCORE_THRESHOLD=0.3

# Higher threshold = more strict (may block humans)
RECAPTCHA_V3_SCORE_THRESHOLD=0.7
```

Default is 0.5 (balanced).

## Security Best Practices

1. **Never commit API keys** to version control
2. **Use different keys** for development and production
3. **Enable rate limiting** (already configured in Fortify)
4. **Monitor CAPTCHA logs** for suspicious activity
5. **Regularly rotate secret keys**

## Advanced Configuration

### Custom CAPTCHA Validation

You can customize validation in `config/captcha.php`:

```php
return [
    'provider' => env('CAPTCHA_PROVIDER', 'turnstile'),

    // Comma-separated list of enabled features
    'enabled_features' => env('CAPTCHA_ENABLED_FEATURES', ''),

    // ... more configuration
];
```

### Add CAPTCHA to Custom Forms

To add CAPTCHA to your own forms:

1. **Frontend** (React):
   ```tsx
   import { Captcha } from '@/components/captcha';

   const [captchaToken, setCaptchaToken] = useState('');

   <Captcha
       onVerify={(token) => setCaptchaToken(token)}
       onError={() => setCaptchaToken('')}
       onExpire={() => setCaptchaToken('')}
   />
   ```

2. **Backend** (Laravel):
   ```php
   use App\Rules\CaptchaRule;

   $request->validate([
       'captcha_token' => ['required', new CaptchaRule($request->ip())],
   ]);
   ```

## Support

- **Cloudflare Turnstile**: https://developers.cloudflare.com/turnstile/
- **Google reCAPTCHA**: https://developers.google.com/recaptcha/
- **Laravel Fortify**: https://laravel.com/docs/fortify

## Files Modified

- `config/captcha.php` - CAPTCHA configuration
- `app/Services/CaptchaService.php` - CAPTCHA verification service
- `app/Rules/CaptchaRule.php` - Validation rule
- `app/Providers/AppServiceProvider.php` - Shares CAPTCHA config with Inertia
- `app/Providers/FortifyServiceProvider.php` - Adds CAPTCHA to auth flows
- `app/Actions/Fortify/CreateNewUser.php` - Registration CAPTCHA
- `app/Http/Controllers/Auth/PasswordResetLinkController.php` - Password reset CAPTCHA
- `resources/js/components/captcha.tsx` - CAPTCHA React component
- `resources/js/components/recaptcha-v3-provider.tsx` - reCAPTCHA v3 provider
- `resources/js/pages/auth/login.tsx` - Login page with CAPTCHA
- `resources/js/pages/auth/register.tsx` - Register page with CAPTCHA
- `resources/js/pages/auth/forgot-password.tsx` - Forgot password page with CAPTCHA
