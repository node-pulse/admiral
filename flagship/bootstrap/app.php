<?php

use App\Http\Middleware\HandleAppearance;
use App\Http\Middleware\HandleInertiaRequests;
use App\Http\Middleware\SetLocale;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Middleware\AddLinkHeadersForPreloadedAssets;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        channels: __DIR__.'/../routes/channels.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware) {
        // Trust proxies - safe for both dev and production when using Docker
        // Trusts private IP ranges (Docker networks use 172.16.0.0/12)
        $middleware->trustProxies(
            at: env('APP_ENV') === 'local'
                ? '*'  // Dev: trust all (you're behind localhost anyway)
                : ['10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16']  // Prod: trust private IPs only
        );

        $middleware->encryptCookies(except: [
            'appearance',
            'sidebar_state',
        ]);

        $middleware->web(append: [
            SetLocale::class,
            HandleAppearance::class,
            HandleInertiaRequests::class,
            AddLinkHeadersForPreloadedAssets::class,
        ]);

        $middleware->alias([
            'captcha.password.reset' => \App\Http\Middleware\ValidateCaptchaForPasswordReset::class,
            'admin' => \App\Http\Middleware\EnsureUserIsAdmin::class,
        ]);
    })
    ->withExceptions(function (Exceptions $exceptions) {
        //
    })->create();
