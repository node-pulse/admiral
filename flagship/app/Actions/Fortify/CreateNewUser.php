<?php

namespace App\Actions\Fortify;

use App\Models\User;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Rule;
use Laravel\Fortify\Contracts\CreatesNewUsers;

class CreateNewUser implements CreatesNewUsers
{
    use PasswordValidationRules;

    /**
     * Validate and create a newly registered user.
     *
     * @param  array<string, string>  $input
     */
    public function create(array $input): User
    {
        // Check if registration is enabled (from database settings)
        $registrationEnabled = \Illuminate\Support\Facades\DB::table('admiral.settings')
            ->where('key', 'registration_enabled')
            ->value('value');

        // JSONB boolean value is stored as "true" or "false" string in PostgreSQL
        if ($registrationEnabled !== 'true') {
            $validator = Validator::make([], []);
            $validator->errors()->add('email', 'Registration is currently disabled. Please contact an administrator.');
            throw new \Illuminate\Validation\ValidationException($validator);
        }

        $captchaService = app(\App\Services\CaptchaService::class);

        $rules = [
            'name' => ['required', 'string', 'max:255'],
            'email' => [
                'required',
                'string',
                'email',
                'max:255',
                Rule::unique(User::class),
            ],
            'password' => $this->passwordRules(),
        ];

        // Add CAPTCHA validation if enabled
        if ($captchaService->isEnabled('register')) {
            $rules['captcha_token'] = ['required', new \App\Rules\CaptchaRule(request()->ip())];
        }

        Validator::make($input, $rules)->validate();

        return User::create([
            'name' => $input['name'],
            'email' => $input['email'],
            'password' => $input['password'],
            'role' => 'user', // Default role for new registrations
        ]);
    }
}
