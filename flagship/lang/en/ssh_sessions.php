<?php

return [
    'title' => 'SSH Sessions',
    'subtitle' => 'Monitor and manage active SSH connections',

    'list' => [
        'search_placeholder' => 'Search by server, user, or IP...',
        'no_sessions' => 'No SSH sessions found',
        'no_sessions_description' => 'No active or recent SSH sessions to display.',
        'total_sessions' => 'Total Sessions',
        'active_sessions' => 'Active Sessions',
    ],

    'table' => [
        'server' => 'Server',
        'user' => 'User',
        'ip_address' => 'IP Address',
        'started' => 'Started',
        'ended' => 'Ended',
        'duration' => 'Duration',
        'status' => 'Status',
        'actions' => 'Actions',
    ],

    'status' => [
        'active' => 'Active',
        'completed' => 'Completed',
        'terminated' => 'Terminated',
        'failed' => 'Failed',
    ],

    'actions' => [
        'view_details' => 'View Details',
        'terminate' => 'Terminate',
        'view_logs' => 'View Logs',
    ],

    'dialog' => [
        'details_title' => 'SSH Session Details',
        'terminate_title' => 'Terminate SSH Session',
        'terminate_description' => 'Are you sure you want to terminate this SSH session? This will disconnect the user.',

        'session_id' => 'Session ID',
        'server_name' => 'Server',
        'username' => 'Username',
        'client_ip' => 'Client IP',
        'client_version' => 'Client Version',
        'started_at' => 'Started At',
        'ended_at' => 'Ended At',
        'duration' => 'Duration',
        'session_status' => 'Status',
        'command_count' => 'Commands Executed',

        'cancel' => 'Cancel',
        'terminate' => 'Terminate Session',
        'close' => 'Close',
    ],

    'messages' => [
        'session_terminated' => 'SSH session terminated successfully',
        'terminate_failed' => 'Failed to terminate SSH session',
        'session_not_found' => 'SSH session not found',
    ],
];
