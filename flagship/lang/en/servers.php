<?php

return [
    'title' => 'Servers',
    'subtitle' => 'Manage your server fleet',

    'add_server' => 'Add Server',
    'edit_server' => 'Edit Server',
    'delete_server' => 'Delete Server',
    'connect' => 'Connect',
    'terminal' => 'Terminal',
    'metrics' => 'Metrics',

    'table' => [
        'name' => 'Name',
        'hostname' => 'Hostname',
        'ip_address' => 'IP Address',
        'status' => 'Status',
        'last_seen' => 'Last Seen',
        'uptime' => 'Uptime',
        'cpu' => 'CPU',
        'memory' => 'Memory',
        'disk' => 'Disk',
        'actions' => 'Actions',
    ],

    'status' => [
        'online' => 'Online',
        'offline' => 'Offline',
        'unknown' => 'Unknown',
        'never' => 'Never',
    ],

    'form' => [
        'name' => 'Server Name',
        'name_placeholder' => 'e.g., prod-web-01',
        'hostname' => 'Hostname/IP',
        'hostname_placeholder' => 'e.g., 192.168.1.100',
        'port' => 'SSH Port',
        'port_placeholder' => '22',
        'username' => 'Username',
        'username_placeholder' => 'root',
        'ssh_key' => 'SSH Key',
        'ssh_key_placeholder' => 'Select SSH key',
        'description' => 'Description',
        'description_placeholder' => 'Optional description',
        'tags' => 'Tags',
        'tags_placeholder' => 'e.g., production, web',
    ],

    'messages' => [
        'added' => 'Server added successfully',
        'updated' => 'Server updated successfully',
        'deleted' => 'Server deleted successfully',
        'not_found' => 'Server not found',
        'connection_failed' => 'Connection failed',
        'confirm_delete' => 'Are you sure you want to delete this server?',
    ],

    'quick_connect' => [
        'title' => 'Quick Connect',
        'server' => 'Server',
        'select_server' => 'Select a server',
        'connect' => 'Connect',
    ],
];
