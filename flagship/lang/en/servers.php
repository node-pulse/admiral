<?php

return [
    'title' => 'Servers',
    'subtitle' => 'Manage your server fleet and SSH connections',

    'list' => [
        'search_placeholder' => 'Search by hostname, name, or IP...',
        'add_server' => 'Add Server',
        'no_servers' => 'No servers found',
        'no_servers_description' => 'Add your first server to start monitoring.',
        'total_servers' => 'Total Servers',
        'online_servers' => 'Online Servers',
        'offline_servers' => 'Offline Servers',
    ],

    'table' => [
        'hostname' => 'Hostname',
        'name' => 'Name',
        'ip_address' => 'IP Address',
        'ssh_port' => 'SSH Port',
        'ssh_username' => 'SSH User',
        'status' => 'Status',
        'last_seen' => 'Last Seen',
        'actions' => 'Actions',
    ],

    'status' => [
        'online' => 'Online',
        'offline' => 'Offline',
        'unknown' => 'Unknown',
        'unreachable' => 'Unreachable',
    ],

    'actions' => [
        'view_details' => 'View Details',
        'edit' => 'Edit',
        'delete' => 'Delete',
        'open_terminal' => 'Open Terminal',
        'manage_keys' => 'Manage SSH Keys',
        'test_connection' => 'Test Connection',
        'reset_host_key' => 'Reset Host Key',
    ],

    'dialog' => [
        'add_title' => 'Add Server',
        'add_description' => 'Register a new server for monitoring.',
        'edit_title' => 'Edit Server',
        'edit_description' => 'Update server configuration.',
        'delete_title' => 'Delete Server',
        'delete_description' => 'Are you sure you want to delete this server? All associated data will be removed.',
        'details_title' => 'Server Details',
        'manage_keys_title' => 'Manage SSH Keys',
        'manage_keys_description' => 'Attach or detach SSH keys for this server.',

        'server_id_label' => 'Server ID',
        'hostname_label' => 'Hostname',
        'hostname_placeholder' => 'server.example.com',
        'name_label' => 'Display Name',
        'name_placeholder' => 'Optional friendly name',
        'ssh_host_label' => 'SSH Host',
        'ssh_host_placeholder' => 'Leave empty to use hostname',
        'ssh_port_label' => 'SSH Port',
        'ssh_port_placeholder' => '22',
        'ssh_username_label' => 'SSH Username',
        'ssh_username_placeholder' => 'root',
        'ssh_password_label' => 'SSH Password',
        'ssh_password_placeholder' => 'Optional',

        'primary_key_label' => 'Primary SSH Key',
        'primary_key_placeholder' => 'Select primary key',
        'additional_keys_label' => 'Additional Keys',

        'cancel' => 'Cancel',
        'create' => 'Add Server',
        'save' => 'Save Changes',
        'delete' => 'Delete Server',
        'attach' => 'Attach Key',
        'detach' => 'Detach',
        'set_primary' => 'Set as Primary',
        'test' => 'Test Connection',
    ],

    'terminal' => [
        'workspace' => 'Terminal Workspace',
        'new_session' => 'New Session',
        'close_workspace' => 'Close Workspace',
        'connecting' => 'Connecting...',
        'connected' => 'Connected',
        'disconnected' => 'Disconnected',
        'connection_failed' => 'Connection Failed',
    ],

    'messages' => [
        'server_added' => 'Server added successfully',
        'server_updated' => 'Server updated successfully',
        'server_deleted' => 'Server deleted successfully',
        'key_attached' => 'SSH key attached successfully',
        'key_detached' => 'SSH key detached successfully',
        'primary_key_set' => 'Primary SSH key updated',
        'connection_success' => 'SSH connection test successful',
        'connection_failed' => 'SSH connection test failed',
        'host_key_reset' => 'SSH host key reset successfully',
        'add_failed' => 'Failed to add server',
        'update_failed' => 'Failed to update server',
        'delete_failed' => 'Failed to delete server',
        'test_failed' => 'Connection test failed',
        'invalid_hostname' => 'Invalid hostname or IP address',
        'invalid_port' => 'SSH port must be between 1 and 65535',
        'duplicate_hostname' => 'A server with this hostname already exists',
    ],

    'filters' => [
        'all' => 'All Servers',
        'online' => 'Online',
        'offline' => 'Offline',
        'status' => 'Filter by status',
    ],

    'metrics' => [
        'cpu' => 'CPU Usage',
        'memory' => 'Memory Usage',
        'disk' => 'Disk Usage',
        'network' => 'Network',
        'load' => 'System Load',
        'uptime' => 'Uptime',
    ],
];
