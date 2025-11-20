<?php

return [
    'title' => 'Deployments',
    'subtitle' => 'Deploy agents to your servers using Ansible',

    'actions' => [
        'new_deployment' => 'New Deployment',
        'create_deployment' => 'Create Deployment',
        'view_details' => 'View Details',
        'cancel' => 'Cancel',
    ],

    'stats' => [
        'total_deployments' => 'Total Deployments',
        'running' => 'Running',
        'completed' => 'Completed',
        'failed' => 'Failed',
    ],

    'filters' => [
        'search_placeholder' => 'Search deployments...',
        'filter_by_status' => 'Filter by status',
        'all_status' => 'All Status',
    ],

    'status' => [
        'pending' => 'Pending',
        'running' => 'Running',
        'completed' => 'Completed',
        'failed' => 'Failed',
        'cancelled' => 'Cancelled',
    ],

    'table' => [
        'name' => 'Name',
        'playbook' => 'Playbook',
        'status' => 'Status',
        'servers' => 'Servers',
        'success_rate' => 'Success Rate',
        'duration' => 'Duration',
        'created' => 'Created',
        'total' => 'Total',
    ],

    'empty' => [
        'no_deployments_found' => 'No deployments found',
        'get_started' => 'Get started by creating your first deployment.',
    ],

    'pagination' => [
        'page' => 'Page',
        'of' => 'of',
        'pages' => 'pages',
        'previous' => 'Previous',
        'next' => 'Next',
    ],

    'messages' => [
        'failed_to_fetch' => 'Failed to load deployments',
    ],
];
