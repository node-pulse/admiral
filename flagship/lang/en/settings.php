<?php

return [
    'title' => 'Settings',
    'subtitle' => 'Manage your account settings',

    'profile' => [
        'title' => 'Profile',
        'subtitle' => 'Update your profile information',
        'name' => 'Name',
        'email' => 'Email',
        'language' => 'Language',
        'language_select' => 'Select Language',
        'save' => 'Save Changes',
        'saved' => 'Profile updated successfully',
    ],

    'appearance' => [
        'title' => 'Appearance',
        'subtitle' => 'Customize your interface',
        'theme' => 'Theme',
        'light' => 'Light',
        'dark' => 'Dark',
        'system' => 'System',
    ],

    'password' => [
        'title' => 'Password',
        'subtitle' => 'Change your password',
        'current_password' => 'Current Password',
        'new_password' => 'New Password',
        'confirm_password' => 'Confirm New Password',
        'save' => 'Update Password',
        'saved' => 'Password updated successfully',
    ],

    'two_factor' => [
        'title' => 'Two-Factor Authentication',
        'subtitle' => 'Add additional security to your account',
        'enabled' => 'Two-factor authentication is enabled',
        'disabled' => 'Two-factor authentication is disabled',
        'enable' => 'Enable',
        'disable' => 'Disable',
        'confirm_password' => 'Please confirm your password to continue',
        'scan_qr' => 'Scan this QR code with your authenticator app',
        'enter_code' => 'Enter the code from your authenticator app',
        'recovery_codes' => 'Recovery Codes',
        'recovery_codes_message' => 'Store these recovery codes in a secure location. They can be used to recover access to your account if your two-factor authentication device is lost.',
        'regenerate' => 'Regenerate Recovery Codes',
        'show_codes' => 'Show Recovery Codes',
        'download_codes' => 'Download Codes',
    ],

    'delete_account' => [
        'title' => 'Delete Account',
        'subtitle' => 'Permanently delete your account',
        'warning' => 'Once your account is deleted, all of its resources and data will be permanently deleted.',
        'button' => 'Delete Account',
    ],
];
