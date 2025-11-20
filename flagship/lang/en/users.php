<?php

return [
    'title' => 'Users',
    'subtitle' => 'Manage system users and permissions',

    'list' => [
        'title' => 'Users Management',
        'description' => 'Manage user accounts, roles, and access permissions',
        'search_placeholder' => 'Search users...',
        'add_user' => 'Add User',
        'no_users' => 'No users found',
        'loading' => 'Loading...',
        'total_users' => 'Total Users',
        'admin_users' => 'Administrators',
        'all_roles' => 'All roles',
        'all_status' => 'All status',
        'showing' => 'Showing',
        'of' => 'of',
        'users' => 'users',
        'previous' => 'Previous',
        'next' => 'Next',
    ],

    'table' => [
        'name' => 'Name',
        'email' => 'Email',
        'role' => 'Role',
        'status' => 'Status',
        'two_factor' => '2FA',
        'created' => 'Created',
        'last_login' => 'Last Login',
        'actions' => 'Actions',
    ],

    'roles' => [
        'admin' => 'Admin',
        'user' => 'User',
        'viewer' => 'Viewer',
    ],

    'status' => [
        'active' => 'Active',
        'disabled' => 'Disabled',
        'inactive' => 'Inactive',
        'suspended' => 'Suspended',
        'two_factor_enabled' => 'On',
        'two_factor_disabled' => 'Off',
    ],

    'actions' => [
        'add_user' => 'Add User',
        'view_details' => 'View Details',
        'edit' => 'Edit',
        'make_admin' => 'Make Admin',
        'make_user' => 'Make User',
        'change_role' => 'Change Role',
        'enable_account' => 'Enable Account',
        'disable_account' => 'Disable Account',
        'suspend' => 'Suspend',
        'activate' => 'Activate',
        'delete_user' => 'Delete User',
        'reset_password' => 'Reset Password',
    ],

    'dialog' => [
        'add_title' => 'Add New User',
        'add_description' => 'Create a new user account with specified role and permissions',
        'edit_title' => 'Edit User',
        'edit_description' => 'Update user information and permissions',
        'delete_title' => 'Delete User',
        'delete_description' => 'Are you sure you want to delete',
        'delete_warning' => 'This action cannot be undone',
        'details_title' => 'User Details',

        'name' => 'Name',
        'name_placeholder' => 'John Doe',

        'email' => 'Email',
        'email_placeholder' => 'john@example.com',

        'password' => 'Password',
        'password_placeholder' => 'Minimum 8 characters',

        'role' => 'Role',
        'role_placeholder' => 'Select role',

        'status_label' => 'Status',

        'cancel' => 'Cancel',
        'create' => 'Create User',
        'creating' => 'Creating...',
        'save' => 'Save Changes',
        'delete' => 'Delete User',
        'deleting' => 'Deleting...',
    ],

    'messages' => [
        'fetch_failed' => 'Failed to fetch users',
        'fill_all_fields' => 'Please fill in all fields',
        'user_created' => 'User created successfully',
        'create_failed' => 'Failed to create user',
        'user_updated' => 'User updated successfully',
        'user_deleted' => 'User deleted successfully',
        'delete_failed' => 'Failed to delete user',
        'role_updated' => 'User role updated successfully',
        'role_update_failed' => 'Failed to update user role',
        'role_changed' => 'User role changed successfully',
        'user_enabled' => 'User enabled successfully',
        'user_disabled' => 'User disabled successfully',
        'status_update_failed' => 'Failed to update user status',
        'user_suspended' => 'User suspended successfully',
        'user_activated' => 'User activated successfully',
        'password_reset' => 'Password reset email sent',
        'creation_failed' => 'Failed to create user',
        'update_failed' => 'Failed to update user',
        'cannot_delete_self' => 'You cannot delete your own account',
        'cannot_change_own_role' => 'You cannot change your own role',
    ],
];
