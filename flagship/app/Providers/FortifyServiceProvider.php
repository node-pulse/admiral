<?php

namespace App\Providers;

use App\Actions\Fortify\CreateNewUser;
use App\Actions\Fortify\ResetUserPassword;
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\ServiceProvider;
use Illuminate\Support\Str;
use Inertia\Inertia;
use Laravel\Fortify\Features;
use Laravel\Fortify\Fortify;

class FortifyServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        //
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        $this->configureActions();
        $this->configureViews();
        $this->configureRateLimiting();
        $this->configureCaptchaValidation();
    }

    /**
     * Configure Fortify actions.
     */
    private function configureActions(): void
    {
        Fortify::resetUserPasswordsUsing(ResetUserPassword::class);
        Fortify::createUsersUsing(CreateNewUser::class);

        // Add CAPTCHA validation to login requests
        Fortify::authenticateUsing(function (Request $request) {
            $captchaService = app(\App\Services\CaptchaService::class);

            // Validate CAPTCHA if enabled for login
            if ($captchaService->isEnabled('login')) {
                $request->validate([
                    'captcha_token' => ['required', new \App\Rules\CaptchaRule($request->ip())],
                ]);
            }

            // Perform the actual authentication using Laravel's Auth
            $credentials = $request->only(Fortify::username(), 'password');

            if (Auth::attempt($credentials, $request->boolean('remember'))) {
                $user = Auth::user();

                // Check if user account is disabled
                if ($user->isDisabled()) {
                    Auth::logout();
                    throw \Illuminate\Validation\ValidationException::withMessages([
                        Fortify::username() => __('Your account has been disabled.'),
                    ])->errorBag('default');
                }

                return $user;
            }

            return null;
        });
    }

    /**
     * Configure Fortify views.
     */
    private function configureViews(): void
    {
        Fortify::loginView(fn (Request $request) => Inertia::render('auth/login', [
            'canResetPassword' => Features::enabled(Features::resetPasswords()),
            'canRegister' => Features::enabled(Features::registration()),
            'status' => $request->session()->get('status'),
        ]));

        Fortify::resetPasswordView(fn (Request $request) => Inertia::render('auth/reset-password', [
            'email' => $request->email,
            'token' => $request->route('token'),
        ]));

        Fortify::requestPasswordResetLinkView(fn (Request $request) => Inertia::render('auth/forgot-password', [
            'status' => $request->session()->get('status'),
        ]));

        Fortify::verifyEmailView(fn (Request $request) => Inertia::render('auth/verify-email', [
            'status' => $request->session()->get('status'),
        ]));

        Fortify::registerView(fn () => Inertia::render('auth/register'));

        Fortify::twoFactorChallengeView(fn () => Inertia::render('auth/two-factor-challenge'));

        Fortify::confirmPasswordView(fn () => Inertia::render('auth/confirm-password'));
    }

    /**
     * Configure rate limiting.
     */
    private function configureRateLimiting(): void
    {
        RateLimiter::for('two-factor', function (Request $request) {
            return Limit::perMinute(5)->by($request->session()->get('login.id'));
        });

        RateLimiter::for('login', function (Request $request) {
            $throttleKey = Str::transliterate(Str::lower($request->input(Fortify::username())).'|'.$request->ip());

            return Limit::perMinute(5)->by($throttleKey);
        });
    }

    /**
     * Configure CAPTCHA validation for password reset requests.
     */
    private function configureCaptchaValidation(): void
    {
        // Use Laravel's request macro to add CAPTCHA validation before Fortify processes
        Request::macro('validateCaptchaIfEnabled', function (string $feature) {
            $captchaService = app(\App\Services\CaptchaService::class);

            if ($captchaService->isEnabled($feature)) {
                $this->validate([
                    'captcha_token' => ['required', new \App\Rules\CaptchaRule($this->ip())],
                ]);
            }
        });
    }
}
