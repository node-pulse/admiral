<?php

namespace App\Providers;

use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        // migration is handled in separate migrate service
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        \Inertia\Inertia::share([
            'captcha' => function () {
                $captchaService = app(\App\Services\CaptchaService::class);

                return [
                    'provider' => $captchaService->getProvider(),
                    'siteKey' => $captchaService->getSiteKey(),
                    'enabled' => [
                        'login' => $captchaService->isEnabled('login'),
                        'register' => $captchaService->isEnabled('register'),
                        'forgot_password' => $captchaService->isEnabled('forgot_password'),
                        'reset_password' => $captchaService->isEnabled('reset_password'),
                    ],
                ];
            },
        ]);
    }
}
