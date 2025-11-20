<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class ValidateLoginCaptcha
{
    /**
     * Handle an incoming request.
     *
     * Validates CAPTCHA for login requests before Fortify's authentication pipeline.
     * This ensures CAPTCHA is validated exactly once, avoiding "timeout-or-duplicate"
     * errors when Fortify calls authenticateUsing multiple times (e.g., for 2FA checks).
     */
    public function handle(Request $request, Closure $next): Response
    {
        // Use the existing macro defined in FortifyServiceProvider
        $request->validateCaptchaIfEnabled('login');

        return $next($request);
    }
}
