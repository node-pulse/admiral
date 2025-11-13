# Two-Factor Authentication (2FA) Implementation Plan

## Executive Summary

This document outlines the implementation plan for adding TOTP-based Two-Factor Authentication (2FA) to the Node Pulse Dashboard login system. Users will be able to connect authenticator apps (Google Authenticator, Authy, Microsoft Authenticator, etc.) and use time-based one-time passwords during login.

**Current Status**:
- ✅ Laravel Fortify 2FA feature is **already enabled** in config
- ✅ Database schema **already supports** 2FA (columns exist)
- ✅ User model **already uses** `TwoFactorAuthenticatable` trait
- ⚠️ Frontend UI for 2FA setup/management is **missing**
- ⚠️ Two-factor challenge page exists but needs testing
- ⚠️ User profile settings need 2FA enable/disable UI

**Effort Estimate**: ~4-6 hours of development

---

## Architecture Overview

### Technology Stack

```
┌─────────────────────────────────────────────────┐
│  User's Authenticator App                       │
│  (Google Auth, Authy, Microsoft, 1Password)    │
└──────────────────┬──────────────────────────────┘
                   │ Scans QR Code
                   │ Generates 6-digit TOTP codes
                   ▼
┌─────────────────────────────────────────────────┐
│  Node Pulse Dashboard                           │
│                                                  │
│  ┌─────────────────────────────────────────┐   │
│  │  Laravel Fortify (Backend)              │   │
│  │  - TOTP secret generation               │   │
│  │  - QR code generation                   │   │
│  │  - Recovery codes generation            │   │
│  │  - Challenge validation                 │   │
│  └─────────────────────────────────────────┘   │
│                                                  │
│  ┌─────────────────────────────────────────┐   │
│  │  React/Inertia.js (Frontend)            │   │
│  │  - 2FA setup wizard                     │   │
│  │  - QR code display                      │   │
│  │  - Recovery codes download              │   │
│  │  - Login challenge form                 │   │
│  └─────────────────────────────────────────┘   │
│                                                  │
│  ┌─────────────────────────────────────────┐   │
│  │  PostgreSQL Database                    │   │
│  │  users.two_factor_secret                │   │
│  │  users.two_factor_recovery_codes        │   │
│  │  users.two_factor_confirmed_at          │   │
│  └─────────────────────────────────────────┘   │
└─────────────────────────────────────────────────┘
```

### Authentication Flow

#### First-Time 2FA Setup Flow
```
1. User logs in with password
   ↓
2. User navigates to Profile/Security Settings
   ↓
3. User clicks "Enable Two-Factor Authentication"
   ↓
4. Backend generates TOTP secret + QR code
   ↓
5. User scans QR code with authenticator app
   ↓
6. User enters first 6-digit code to confirm setup
   ↓
7. Backend validates code and enables 2FA
   ↓
8. User downloads recovery codes (one-time display)
```

#### Login with 2FA Enabled
```
1. User enters email + password
   ↓
2. Backend validates credentials
   ↓
3. If 2FA enabled → Redirect to two-factor challenge page
   ↓
4. User enters 6-digit code from authenticator app
   ↓
5. Backend validates TOTP code
   ↓
6. If valid → Login successful, redirect to dashboard
   If invalid → Show error, allow retry (rate limited)
```

#### Recovery Flow (Lost Authenticator)
```
1. User enters email + password
   ↓
2. Redirects to two-factor challenge page
   ↓
3. User clicks "Use recovery code instead"
   ↓
4. User enters one of their recovery codes
   ↓
5. Backend validates and burns the recovery code
   ↓
6. Login successful → Recommend regenerating recovery codes
```

---

## Database Schema (Already Implemented ✅)

The following columns already exist in `admiral.users`:

```sql
-- TOTP secret (Base32-encoded, encrypted at application level)
two_factor_secret TEXT NULL,

-- Recovery codes (JSON array, each code is hashed)
two_factor_recovery_codes TEXT NULL,

-- Timestamp when 2FA was confirmed/enabled (NULL = disabled)
two_factor_confirmed_at TIMESTAMP WITH TIME ZONE NULL,
```

**No database migrations needed!**

---

## Implementation Tasks

### Phase 1: Backend API Endpoints (Laravel)

#### 1.1 Enable Fortify 2FA Routes
**File**: `flagship/config/fortify.php`
- ✅ Already enabled: `Features::twoFactorAuthentication()`
- ✅ Password confirmation required: `'confirmPassword' => true`

**Generated Routes** (already available):
```
POST   /user/two-factor-authentication          - Enable 2FA
DELETE /user/two-factor-authentication          - Disable 2FA
GET    /user/two-factor-qr-code                 - Get QR code SVG
GET    /user/two-factor-recovery-codes          - Get recovery codes
POST   /user/two-factor-recovery-codes          - Regenerate recovery codes
POST   /two-factor-challenge                    - Validate 2FA code during login
```

#### 1.2 Create TwoFactorAuthenticationController
**File**: `flagship/app/Http/Controllers/TwoFactorAuthenticationController.php` (optional)

Laravel Fortify handles all 2FA logic by default, but we may want to add custom endpoints for:
- Checking 2FA status: `GET /api/user/two-factor-status`
- Getting setup instructions: `GET /api/user/two-factor-setup-guide`

**Estimated Time**: 1 hour (if custom endpoints needed)

---

### Phase 2: Frontend UI Components (React/Inertia.js)

#### 2.1 Two-Factor Challenge Page (Login Flow)
**File**: `flagship/resources/js/pages/auth/two-factor-challenge.tsx`
- ✅ Route already configured in `FortifyServiceProvider.php:104`
- ⚠️ Page implementation needs verification

**Required Features**:
- Form with 6-digit code input (auto-focus, numeric only)
- "Use recovery code instead" toggle
- Recovery code input (8-character alphanumeric)
- Error handling for invalid codes
- Rate limiting display (5 attempts per minute)
- Back to login link

**Design**: Similar to existing login page style

**Estimated Time**: 2 hours

#### 2.2 Profile Security Settings Page
**File**: `flagship/resources/js/pages/profile/security.tsx` (new)

**Required Features**:
- Display 2FA status (enabled/disabled badge)
- "Enable Two-Factor Authentication" button (if disabled)
- "Disable Two-Factor Authentication" button (if enabled)
- Password confirmation modal before enable/disable
- Display last confirmed date

**Estimated Time**: 2 hours

#### 2.3 Two-Factor Setup Wizard Modal
**File**: `flagship/resources/js/components/two-factor-setup-modal.tsx` (new)

**Required Features**:
```
Step 1: Introduction
- Explain what 2FA is
- List supported authenticator apps
- "Continue" button

Step 2: Scan QR Code
- Display QR code (SVG from backend)
- Show text secret (for manual entry)
- "I've scanned the QR code" button

Step 3: Verify Setup
- 6-digit code input
- "Verify and Enable" button
- Error handling for wrong codes

Step 4: Recovery Codes
- Display 10 recovery codes in grid
- "Download Recovery Codes" button (saves as .txt)
- "Copy to Clipboard" button
- Warning: "Store these in a safe place"
- "I've saved my recovery codes" checkbox
- "Finish Setup" button (disabled until checkbox checked)
```

**Estimated Time**: 3 hours

#### 2.4 Recovery Codes Management
**File**: `flagship/resources/js/components/recovery-codes-display.tsx` (new)

**Required Features**:
- Display recovery codes in 2-column grid
- Copy individual codes
- Copy all codes
- Download as .txt file
- Regenerate recovery codes button (with password confirmation)

**Estimated Time**: 1 hour

#### 2.5 UI Components
**Files**:
- `flagship/resources/js/components/ui/code-input.tsx` (new)
  - 6-digit code input with auto-focus and auto-submit
  - Split into 6 individual boxes for better UX

**Estimated Time**: 1 hour

---

### Phase 3: Integration & Testing

#### 3.1 Update Profile Navigation
**File**: `flagship/resources/js/layouts/app-layout.tsx` or profile menu

Add "Security" tab/link to profile section navigation.

**Estimated Time**: 30 minutes

#### 3.2 Add Inertia Routes
**File**: `flagship/routes/web.php`

```php
Route::middleware(['auth', 'verified'])->group(function () {
    // Profile Security Settings
    Route::get('/profile/security', [ProfileController::class, 'security'])
        ->name('profile.security');
});
```

**Estimated Time**: 15 minutes

#### 3.3 Create Profile Security Controller Method
**File**: `flagship/app/Http/Controllers/ProfileController.php`

```php
public function security(Request $request)
{
    return Inertia::render('profile/security', [
        'twoFactorEnabled' => ! is_null($request->user()->two_factor_secret),
        'twoFactorConfirmedAt' => $request->user()->two_factor_confirmed_at,
    ]);
}
```

**Estimated Time**: 15 minutes

#### 3.4 Testing Checklist

**Manual Testing**:
- [ ] Enable 2FA with Google Authenticator
- [ ] Enable 2FA with Authy
- [ ] Login with 2FA code
- [ ] Login with recovery code
- [ ] Test invalid 2FA code (should show error)
- [ ] Test rate limiting (5 attempts per minute)
- [ ] Disable 2FA
- [ ] Re-enable 2FA (new secret generated)
- [ ] Regenerate recovery codes
- [ ] Test recovery code burn (single-use)
- [ ] Test with account disabled (should reject)

**Automated Testing**:
```php
// flagship/tests/Feature/TwoFactorAuthenticationTest.php
- test_user_can_enable_two_factor_authentication()
- test_user_can_confirm_two_factor_authentication()
- test_user_can_get_qr_code()
- test_user_can_get_recovery_codes()
- test_user_can_disable_two_factor_authentication()
- test_user_must_confirm_password_before_enabling_2fa()
- test_login_with_two_factor_authentication()
- test_login_with_recovery_code()
- test_invalid_two_factor_code_is_rejected()
- test_recovery_code_is_burned_after_use()
```

**Estimated Time**: 4 hours (manual + automated)

---

## Security Considerations

### 1. TOTP Secret Storage
- Secrets are encrypted at application level by Laravel
- Never expose secrets in API responses (except during initial setup)
- Secrets are Base32-encoded for QR code compatibility

### 2. Recovery Codes
- Generated as 10 random 8-character alphanumeric strings
- Stored as bcrypt hashes (same as passwords)
- Single-use only (burned after successful login)
- Can be regenerated at any time (invalidates old codes)

### 3. Rate Limiting
- Two-factor challenge: 5 attempts per minute (per session)
- QR code generation: Requires password confirmation
- Recovery code regeneration: Requires password confirmation

### 4. Password Confirmation
- Required before enabling 2FA
- Required before disabling 2FA
- Required before viewing recovery codes
- Required before regenerating recovery codes
- Confirmation valid for 3 hours (Laravel default)

### 5. Account Recovery
- If user loses both authenticator AND recovery codes:
  - Admin must manually reset 2FA in database:
    ```sql
    UPDATE admiral.users
    SET two_factor_secret = NULL,
        two_factor_recovery_codes = NULL,
        two_factor_confirmed_at = NULL
    WHERE email = 'user@example.com';
    ```
  - User should verify identity through support ticket
  - Log this action for audit trail

### 6. Brute Force Protection
- Fortify's built-in rate limiting (5 attempts/minute)
- Consider adding account lockout after N failed attempts
- Consider email notification on failed 2FA attempts

---

## User Experience Considerations

### 1. Onboarding
- Make 2FA **optional** at launch
- Add dismissible banner encouraging 2FA for admin users
- Provide clear setup instructions with screenshots

### 2. Mobile Responsiveness
- QR codes must be scannable on mobile screens
- Code input should trigger numeric keyboard on mobile
- Recovery codes should be easily copyable on mobile

### 3. Accessibility
- QR code must have alt text
- Provide manual secret entry option (not just QR)
- Code inputs should be keyboard navigable
- Screen reader friendly labels

### 4. Error Messages
```
- "Invalid authentication code. Please try again."
- "Invalid recovery code. Please try again."
- "Too many attempts. Please try again in 1 minute."
- "This recovery code has already been used."
- "Two-factor authentication enabled successfully."
- "Two-factor authentication disabled."
```

### 5. Help & Documentation
- Link to "What is 2FA?" documentation
- List of recommended authenticator apps
- FAQ: "What if I lose my phone?"
- FAQ: "Can I use SMS instead?" (Answer: No, TOTP is more secure)

---

## Recommended Authenticator Apps

Include in setup instructions:

1. **Google Authenticator** (iOS, Android)
2. **Authy** (iOS, Android, Desktop) - Recommended for multi-device sync
3. **Microsoft Authenticator** (iOS, Android)
4. **1Password** (All platforms)
5. **Bitwarden** (All platforms)

**Note**: Do NOT recommend SMS-based 2FA (less secure, not supported by Fortify TOTP)

---

## Rollout Plan

### Stage 1: Development (Week 1)
- [ ] Implement backend endpoints (if custom needed)
- [ ] Build frontend components
- [ ] Create two-factor challenge page
- [ ] Create security settings page
- [ ] Create setup wizard modal

### Stage 2: Testing (Week 1-2)
- [ ] Manual testing with multiple authenticator apps
- [ ] Automated test suite
- [ ] Security review
- [ ] UX testing with sample users

### Stage 3: Documentation (Week 2)
- [ ] User documentation (how to enable 2FA)
- [ ] Admin documentation (how to reset 2FA for users)
- [ ] Update README.md with 2FA feature
- [ ] Create video tutorial (optional)

### Stage 4: Deployment (Week 2)
- [ ] Deploy to staging environment
- [ ] Test in staging with production-like data
- [ ] Deploy to production (zero downtime)
- [ ] Monitor error logs for 48 hours

### Stage 5: Communication (Week 2-3)
- [ ] Email announcement to all users
- [ ] In-app banner encouraging 2FA
- [ ] Blog post about security improvements
- [ ] Require 2FA for admin users after 30-day grace period

---

## Configuration Options

### Environment Variables
```env
# .env (no new variables needed, uses existing Laravel config)

# Optional: Enforce 2FA for admin users
REQUIRE_2FA_FOR_ADMINS=false

# Optional: Grace period before enforcing 2FA (days)
2FA_GRACE_PERIOD_DAYS=30
```

### Fortify Configuration
**File**: `flagship/config/fortify.php`

```php
Features::twoFactorAuthentication([
    'confirm' => true,              // Require password confirmation
    'confirmPassword' => true,      // Require password before viewing codes
    // 'window' => 0                // TOTP time window (0 = exact time only)
])
```

**Recommendation**: Keep `window => 0` (default) for maximum security. This means codes expire exactly after 30 seconds.

---

## Future Enhancements

### Phase 2 Features (Post-Launch)
1. **Trusted Devices**
   - Remember device for 30 days
   - Skip 2FA on trusted devices
   - Device management UI

2. **Backup Methods**
   - Email-based backup codes
   - SMS fallback (if absolutely necessary)
   - Hardware security key support (WebAuthn)

3. **Audit Logging**
   - Log all 2FA events (enable, disable, failed attempts)
   - Store in `admiral.audit_logs` table
   - Alert on suspicious activity

4. **Admin Controls**
   - Force 2FA for all users
   - View 2FA adoption rate dashboard
   - Bulk 2FA reset (with approval workflow)

5. **Enhanced UX**
   - Progressive Web App (PWA) for code generation
   - Browser extension support
   - Biometric authentication (Face ID, Touch ID)

---

## References

### Laravel Fortify Documentation
- [Two-Factor Authentication](https://laravel.com/docs/11.x/fortify#two-factor-authentication)
- [Password Confirmation](https://laravel.com/docs/11.x/fortify#password-confirmation)

### TOTP Standard (RFC 6238)
- [RFC 6238: Time-Based One-Time Password Algorithm](https://datatracker.ietf.org/doc/html/rfc6238)

### Security Best Practices
- [OWASP Authentication Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html#multi-factor-authentication)
- [NIST Digital Identity Guidelines](https://pages.nist.gov/800-63-3/sp800-63b.html#memsecretver)

---

## Support & Troubleshooting

### Common Issues

**Issue**: QR code not scanning
- **Solution**: Ensure sufficient screen brightness, try manual secret entry

**Issue**: Codes always invalid
- **Solution**: Check device time synchronization (TOTP requires accurate time)

**Issue**: Lost authenticator app and recovery codes
- **Solution**: Contact admin for manual 2FA reset (requires identity verification)

**Issue**: Can't disable 2FA
- **Solution**: Must enter current password for confirmation

### Admin Tools

**Reset User's 2FA** (Database):
```sql
-- READ ONLY - Ask user for permission before running
UPDATE admiral.users
SET two_factor_secret = NULL,
    two_factor_recovery_codes = NULL,
    two_factor_confirmed_at = NULL
WHERE email = 'user@example.com';
```

**Check 2FA Status** (Database):
```sql
SELECT
    email,
    two_factor_confirmed_at IS NOT NULL as has_2fa_enabled,
    two_factor_confirmed_at
FROM admiral.users
WHERE role = 'admin'
ORDER BY two_factor_confirmed_at DESC;
```

---

## Success Metrics

Track the following metrics post-launch:

1. **Adoption Rate**
   - % of users with 2FA enabled
   - % of admin users with 2FA enabled
   - Target: 80% admin adoption in 60 days

2. **Security Improvements**
   - Reduction in account takeover incidents
   - Failed 2FA login attempts (potential attacks)

3. **User Experience**
   - Support tickets related to 2FA
   - Average time to complete setup
   - Drop-off rate during setup wizard

4. **Technical Metrics**
   - 2FA challenge response time (<100ms)
   - QR code generation time (<200ms)
   - Recovery code usage rate

---

## Conclusion

This implementation plan leverages the existing Laravel Fortify infrastructure, which is already 80% complete. The main work involves building user-facing UI components and ensuring a smooth user experience.

**Estimated Total Effort**:
- Development: 10-12 hours
- Testing: 4 hours
- Documentation: 2 hours
- **Total: ~16-18 hours** (2-3 days for one developer)

**Risk Assessment**: Low
- Using battle-tested Laravel Fortify package
- Database schema already prepared
- No breaking changes to existing authentication

**Recommendation**: Proceed with implementation. Start with Phase 1 (two-factor challenge page) to enable testing, then build out Phase 2 (security settings and setup wizard).
