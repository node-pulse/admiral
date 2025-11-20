<?php

return [
    'title' => 'System Settings',
    'subtitle' => 'Manage system-wide configuration and preferences (Admin only)',

    // Security section
    'security' => [
        'title' => 'Security',
        'description' => 'Mutual TLS (mTLS) authentication status for agent connections',
    ],

    // Categories for settings
    'categories' => [
        'authentication' => 'Authentication',
        'data_retention' => 'Data Retention',
        'alerting' => 'Alerting',
        'pro_features' => 'Pro Features',
        'system' => 'System',
    ],

    // Table section
    'table' => [
        'title' => 'All Settings',
        'description' => 'System-wide configuration and preferences. Settings are organized by category for easier management',
        'setting' => 'Setting',
        'setting_description' => 'Description',
        'current_value' => 'Current Value',
        'actions' => 'Actions',
        'enabled' => 'Enabled',
        'disabled' => 'Disabled',
    ],

    // Actions
    'actions' => [
        'update' => 'Update',
    ],

    // Messages
    'messages' => [
        'updated' => 'Setting updated successfully',
        'update_failed' => 'Failed to update setting',
        'mtls_enabled' => 'mTLS enabled successfully! Caddy has been restarted',
        'mtls_enable_failed' => 'Failed to enable mTLS',
    ],

    // mTLS section
    'mtls' => [
        'title' => 'mTLS Authentication',
        'status_label' => 'Status',
        'unreachable_warning' => 'Warning: Unable to reach submarines ingest service',
        'enable' => 'Enable mTLS',
        'enabling' => 'Enabling...',
        'about' => 'About mTLS',
        'manual_setup' => 'Manual Setup',
        'dialog_title' => 'Changing mTLS Configuration',
        'dialog_description' => 'mTLS is a build-time decision and requires rebuilding the Docker images',
        'confirm_enable' => 'This will enable mTLS authentication for all agent connections. Caddy will be restarted. Continue?',
    ],

    // Search section
    'search' => [
        'placeholder' => 'Search settings by name, description, category, or value...',
        'clear' => 'Clear',
        'found' => 'Found',
        'setting' => 'setting',
        'settings' => 'settings',
        'no_results' => 'No settings found matching',
    ],

    // User profile settings (kept for backward compatibility)
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
