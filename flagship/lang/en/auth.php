<?php

return [
    'login' => [
        'title' => 'Sign In',
        'subtitle' => 'Welcome back',
        'email' => 'Email',
        'password' => 'Password',
        'remember_me' => 'Remember me',
        'forgot_password' => 'Forgot your password?',
        'submit' => 'Sign In',
        'no_account' => "Don't have an account?",
        'register' => 'Register',
    ],

    'register' => [
        'title' => 'Create Account',
        'subtitle' => 'Get started with Node Pulse',
        'name' => 'Name',
        'email' => 'Email',
        'password' => 'Password',
        'password_confirmation' => 'Confirm Password',
        'submit' => 'Create Account',
        'have_account' => 'Already have an account?',
        'login' => 'Sign In',
    ],

    'forgot_password' => [
        'title' => 'Forgot Password',
        'subtitle' => 'Enter your email to reset your password',
        'email' => 'Email',
        'submit' => 'Send Reset Link',
        'back_to_login' => 'Back to Sign In',
    ],

    'reset_password' => [
        'title' => 'Reset Password',
        'subtitle' => 'Enter your new password',
        'email' => 'Email',
        'password' => 'Password',
        'password_confirmation' => 'Confirm Password',
        'submit' => 'Reset Password',
    ],

    'verify_email' => [
        'title' => 'Verify Email',
        'message' => 'Thanks for signing up! Before getting started, please verify your email address.',
        'resend' => 'Resend Verification Email',
        'logout' => 'Logout',
    ],

    'confirm_password' => [
        'title' => 'Confirm Password',
        'message' => 'Please confirm your password before continuing.',
        'password' => 'Password',
        'submit' => 'Confirm',
    ],

    'two_factor_challenge' => [
        'title' => 'Two-Factor Authentication',
        'message' => 'Please confirm access to your account by entering the authentication code provided by your authenticator application.',
        'code' => 'Code',
        'recovery_code' => 'Recovery Code',
        'use_recovery_code' => 'Use a recovery code',
        'use_auth_code' => 'Use an authentication code',
        'submit' => 'Login',
    ],

    'failed' => 'These credentials do not match our records.',
    'password' => 'The provided password is incorrect.',
    'throttle' => 'Too many login attempts. Please try again in :seconds seconds.',
];
