<?php

namespace App\Http\Controllers\Auth;

use App\Rules\CaptchaRule;
use App\Services\CaptchaService;
use Illuminate\Contracts\Auth\PasswordBroker;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\Password;
use Illuminate\Validation\ValidationException;
use Laravel\Fortify\Contracts\FailedPasswordResetLinkRequestResponse;
use Laravel\Fortify\Contracts\SuccessfulPasswordResetLinkRequestResponse;
use Laravel\Fortify\Fortify;

class PasswordResetLinkController extends Controller
{
    /**
     * Send a reset link to the given user.
     */
    public function store(Request $request): SuccessfulPasswordResetLinkRequestResponse|FailedPasswordResetLinkRequestResponse
    {
        $captchaService = app(CaptchaService::class);

        $rules = [
            Fortify::email() => 'required|email',
        ];

        // Add CAPTCHA validation if enabled
        if ($captchaService->isEnabled('forgot_password')) {
            $rules['captcha_token'] = ['required', new CaptchaRule($request->ip())];
        }

        $request->validate($rules);

        // We will send the password reset link to this user. Once we have attempted
        // to send the link, we will examine the response then see the message we
        // need to show to the user. Finally, we'll send out a proper response.
        $status = $this->broker()->sendResetLink(
            $request->only(Fortify::email())
        );

        if ($status == Password::RESET_LINK_SENT) {
            return app(SuccessfulPasswordResetLinkRequestResponse::class, ['status' => $status]);
        }

        if ($request->wantsJson()) {
            throw ValidationException::withMessages([
                Fortify::email() => [trans($status)],
            ]);
        }

        return app(FailedPasswordResetLinkRequestResponse::class, ['status' => $status]);
    }

    /**
     * Get the broker to be used during password reset.
     */
    protected function broker(): PasswordBroker
    {
        return Password::broker(config('fortify.passwords'));
    }
}
