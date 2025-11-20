# Cloudflare Turnstile CAPTCHA Double Validation with Fortify 2FA

**Date:** 2025-11-20
**Status:** Resolved
**Severity:** High (blocking authentication for users without 2FA)
**Related Feature:** Laravel Fortify authentication with two-factor authentication

## Issue Description

Users without 2FA enabled on their accounts were unable to log in due to Cloudflare Turnstile returning `timeout-or-duplicate` errors. The CAPTCHA token was being validated twice during the login process, causing the second validation to fail.

### Symptoms

1. Login attempts failed for users **without 2FA enabled** on their accounts
2. Laravel logs showed `timeout-or-duplicate` errors from Turnstile API
3. Production (where users have 2FA enabled) worked fine
4. Localhost (where test users don't have 2FA enabled) failed consistently
5. Frontend CAPTCHA widget rendered correctly, but authentication still failed

### Error Messages

```
Failed to verify captcha: timeout-or-duplicate
```

## Root Cause

**CAPTCHA validation was placed inside the `Fortify::authenticateUsing` callback**, which gets called multiple times during the login pipeline when Fortify's two-factor authentication feature is enabled.

### Authentication Flow

When Fortify's 2FA feature is enabled (`config/fortify.php`), the login pipeline runs:

1. `RedirectIfTwoFactorAuthenticatable` - Checks if user has 2FA enabled
   - Calls `authenticateUsing` callback to validate credentials
   - **If user has 2FA**: Stops here and redirects to 2FA challenge
   - **If user doesn't have 2FA**: Continues to next action

2. `AttemptToAuthenticate` - Logs in the user
   - Calls `authenticateUsing` callback again
   - This is the second CAPTCHA validation → **Fails with `timeout-or-duplicate`**

### Why Production Worked

- **Production users have 2FA enabled on their accounts**
- Login stops after first `authenticateUsing` call
- CAPTCHA validated only once
- No error

### Why Localhost Failed

- **Localhost test users don't have 2FA enabled**
- Login continues through both actions
- CAPTCHA validated twice (first validation consumes the token)
- Second validation fails with `timeout-or-duplicate`

## Solution

**Move CAPTCHA validation out of the `authenticateUsing` callback** into a dedicated middleware that runs once before Fortify's authentication pipeline.

### Implementation

1. **Created `ValidateLoginCaptcha` middleware** (`app/Http/Middleware/ValidateLoginCaptcha.php`)
   - Validates CAPTCHA exactly once before authentication
   - Uses existing `Request::validateCaptchaIfEnabled('login')` macro

2. **Added custom login pipeline to Fortify** (`config/fortify.php`)
   ```php
   'pipelines' => [
       'login' => [
           \App\Http\Middleware\ValidateLoginCaptcha::class,
           config('fortify.limiters.login') ? \Laravel\Fortify\Actions\EnsureLoginIsNotThrottled::class : null,
           config('fortify.lowercase_usernames') ? \Laravel\Fortify\Actions\CanonicalizeUsername::class : null,
           \Laravel\Fortify\Actions\RedirectIfTwoFactorAuthenticatable::class,
           \Laravel\Fortify\Actions\AttemptToAuthenticate::class,
           \Laravel\Fortify\Actions\PrepareAuthenticatedSession::class,
       ],
   ],
   ```

3. **Removed CAPTCHA validation from `authenticateUsing` callback** (`app/Providers/FortifyServiceProvider.php`)
   - Callback now only validates credentials and checks for disabled users
   - Can be called multiple times without issues

4. **Added CAPTCHA config sharing to Inertia** (`app/Http/Middleware/HandleInertiaRequests.php`)
   - Shares `captcha` configuration with frontend
   - Enables CAPTCHA widget to render on auth pages

### Benefits

- ✅ CAPTCHA validated exactly once for all users (with or without 2FA)
- ✅ Clean separation of concerns (CAPTCHA → then authentication)
- ✅ Future-proof against Fortify pipeline changes
- ✅ No special-casing or flags needed
- ✅ Works consistently across production and localhost

## Related Files

### Created/Modified Files

- `app/Http/Middleware/ValidateLoginCaptcha.php` - **NEW** - CAPTCHA validation middleware
- `config/fortify.php` - **MODIFIED** - Added custom login pipeline
- `app/Providers/FortifyServiceProvider.php` - **MODIFIED** - Removed CAPTCHA from `authenticateUsing`
- `app/Http/Middleware/HandleInertiaRequests.php` - **MODIFIED** - Added captcha config sharing

### Existing CAPTCHA Files (Unchanged)

- `app/Services/CaptchaService.php` - CAPTCHA verification service
- `app/Rules/CaptchaRule.php` - CAPTCHA validation rule
- `resources/js/components/captcha.tsx` - CAPTCHA widget component
- `app/Http/Controllers/Auth/PasswordResetLinkController.php` - Password reset with CAPTCHA
- `config/captcha.php` - CAPTCHA configuration

## Testing

1. **Users without 2FA** can now log in successfully
2. **Users with 2FA** continue to work as before
3. **Password reset** works (already validated CAPTCHA in controller, not affected by this issue)
4. **Both production and localhost** now have consistent behavior

## Lessons Learned

1. **Understand the full request lifecycle** - Fortify's pipeline can call custom callbacks multiple times depending on enabled features
2. **CAPTCHA tokens are single-use** - Cloudflare Turnstile tokens can only be validated once
3. **Use pipelines for pre-authentication logic** - Fortify's custom pipelines are the right place for logic that should run once before authentication
4. **Environment differences matter** - Production and localhost had different behavior due to 2FA being enabled on user accounts, not just config
5. **Test both 2FA and non-2FA flows** - Edge cases appear when features interact in unexpected ways

## Prevention

### For Future Fortify Customizations

- Place one-time validations (CAPTCHA, rate limiting, etc.) in custom pipeline actions
- Keep `authenticateUsing` callback focused on credential validation only
- Test with both 2FA-enabled and 2FA-disabled user accounts
- Understand which Fortify actions call your custom callbacks

### Debugging Checklist

```bash
# Check Laravel logs for CAPTCHA errors
docker exec node-pulse-flagship tail -f storage/logs/laravel.log | grep -i captcha

# Verify CAPTCHA config is shared with frontend
docker exec node-pulse-flagship php artisan tinker --execute="
\$middleware = app(App\Http\Middleware\HandleInertiaRequests::class);
\$shared = \$middleware->share(new Illuminate\Http\Request());
print_r(\$shared['captcha']);
"

# Check if 2FA is enabled for a user
docker exec node-pulse-flagship php artisan tinker --execute="
\$user = App\Models\User::where('email', 'test@example.com')->first();
echo 'Has 2FA: ' . (\$user->two_factor_secret ? 'YES' : 'NO');
"
```

## References

- [Laravel Fortify Documentation](https://laravel.com/docs/11.x/fortify)
- [Cloudflare Turnstile Documentation](https://developers.cloudflare.com/turnstile/)
- [Fortify Two-Factor Authentication](https://laravel.com/docs/11.x/fortify#two-factor-authentication)
- Laravel Fortify source code:
  - `vendor/laravel/fortify/src/Actions/RedirectIfTwoFactorAuthenticatable.php`
  - `vendor/laravel/fortify/src/Actions/AttemptToAuthenticate.php`

## Notes

- The initial investigation incorrectly focused on i18n changes, as the issue coincidentally appeared during i18n implementation
- The bug report initially blamed "timeout-or-duplicate" on environment differences, but the real cause was the double callback invocation
- Production appeared to work because all production users had 2FA enabled on their accounts, masking the underlying issue
