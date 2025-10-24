<?php

namespace App\Http\Middleware;

use App\Rules\CaptchaRule;
use App\Services\CaptchaService;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class ValidateCaptchaForPasswordReset
{
    /**
     * Handle an incoming request.
     *
     * @param  \Closure(\Illuminate\Http\Request): (\Symfony\Component\HttpFoundation\Response)  $next
     */
    public function handle(Request $request, Closure $next): Response
    {
        $captchaService = app(CaptchaService::class);

        // Only validate on POST requests (password reset submission)
        if ($request->isMethod('post') && $captchaService->isEnabled('forgot_password')) {
            $request->validate([
                'captcha_token' => ['required', new CaptchaRule($request->ip())],
            ]);
        }

        return $next($request);
    }
}
