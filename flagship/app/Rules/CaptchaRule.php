<?php

namespace App\Rules;

use App\Services\CaptchaService;
use Closure;
use Illuminate\Contracts\Validation\ValidationRule;

class CaptchaRule implements ValidationRule
{
    protected CaptchaService $captchaService;
    protected ?string $ipAddress;

    public function __construct(?string $ipAddress = null)
    {
        $this->captchaService = new CaptchaService;
        $this->ipAddress = $ipAddress;
    }

    /**
     * Run the validation rule.
     */
    public function validate(string $attribute, mixed $value, Closure $fail): void
    {
        if (! is_string($value) || empty($value)) {
            $fail('The CAPTCHA verification is required.');

            return;
        }

        if (! $this->captchaService->verify($value, $this->ipAddress)) {
            $fail('The CAPTCHA verification failed. Please try again.');
        }
    }
}
