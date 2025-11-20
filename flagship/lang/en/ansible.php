<?php

return [
    'title' => 'Ansible Playbooks',
    'subtitle' => 'Browse and view Ansible playbooks for server deployments',

    'list' => [
        'search_placeholder' => 'Search playbooks...',
        'add_playbook' => 'Add Playbook',
        'no_playbooks' => 'No playbooks found',
        'no_playbooks_description' => 'Create or import your first Ansible playbook.',
        'total_playbooks' => 'Total Playbooks',
    ],

    'categories' => [
        'all' => 'All',
        'deployment' => 'Deployment',
        'maintenance' => 'Maintenance',
        'security' => 'Security',
        'monitoring' => 'Monitoring',
        'custom' => 'Custom',
    ],

    'table' => [
        'name' => 'Name',
        'category' => 'Category',
        'description' => 'Description',
        'servers' => 'Target Servers',
        'last_run' => 'Last Run',
        'status' => 'Status',
        'actions' => 'Actions',
    ],

    'status' => [
        'idle' => 'Idle',
        'running' => 'Running',
        'success' => 'Success',
        'failed' => 'Failed',
        'cancelled' => 'Cancelled',
    ],

    'actions' => [
        'run' => 'Run Playbook',
        'edit' => 'Edit',
        'view_logs' => 'View Logs',
        'duplicate' => 'Duplicate',
        'delete' => 'Delete',
        'schedule' => 'Schedule',
        'upload_playbooks' => 'Upload Custom Playbooks',
        'copy' => 'Copy',
        'download' => 'Download',
    ],

    'dialog' => [
        'add_title' => 'Add Ansible Playbook',
        'add_description' => 'Create a new playbook or import an existing one.',
        'edit_title' => 'Edit Playbook',
        'edit_description' => 'Modify playbook configuration.',
        'run_title' => 'Run Playbook',
        'run_description' => 'Select target servers and execute the playbook.',
        'delete_title' => 'Delete Playbook',
        'delete_description' => 'Are you sure you want to delete this playbook?',
        'logs_title' => 'Playbook Execution Logs',

        'name_label' => 'Playbook Name',
        'name_placeholder' => 'e.g., Deploy Web Application',

        'description_label' => 'Description',
        'description_placeholder' => 'Brief description of what this playbook does',

        'category_label' => 'Category',
        'category_placeholder' => 'Select category',

        'content_label' => 'Playbook Content (YAML)',
        'content_placeholder' => 'Paste your Ansible playbook YAML here',

        'servers_label' => 'Target Servers',
        'servers_placeholder' => 'Select servers to run this playbook on',

        'variables_label' => 'Variables',
        'variables_placeholder' => 'Extra variables (JSON or YAML)',

        'tags_label' => 'Tags',
        'tags_placeholder' => 'Run specific tags only (optional)',

        'cancel' => 'Cancel',
        'create' => 'Create Playbook',
        'save' => 'Save Changes',
        'run' => 'Run Now',
        'delete' => 'Delete Playbook',
        'close' => 'Close',
    ],

    'messages' => [
        'playbook_created' => 'Playbook created successfully',
        'playbook_updated' => 'Playbook updated successfully',
        'playbook_deleted' => 'Playbook deleted successfully',
        'playbook_started' => 'Playbook execution started',
        'playbook_completed' => 'Playbook execution completed successfully',
        'playbook_failed' => 'Playbook execution failed',
        'creation_failed' => 'Failed to create playbook',
        'update_failed' => 'Failed to update playbook',
        'delete_failed' => 'Failed to delete playbook',
        'execution_failed' => 'Failed to start playbook execution',
        'invalid_yaml' => 'Invalid YAML',
        'no_servers_selected' => 'Please select at least one target server',
        'failed_to_fetch' => 'Failed to load playbooks',
        'failed_to_load_file' => 'Failed to load file content',
        'unknown_yaml_error' => 'Unknown YAML parsing error',
        'copied_to_clipboard' => 'Copied to clipboard',
        'failed_to_copy' => 'Failed to copy to clipboard',
        'file_downloaded' => 'File downloaded',
        'no_playbooks_found' => 'No playbooks found',
        'select_file' => 'Select a file',
        'jinja2_template' => 'Jinja2 Template',
        'binary_file' => 'Binary File',
        'binary_file_notice' => 'This file cannot be displayed as it is a binary file.',
        'file_type' => 'File type',
        'size' => 'Size',
        'yaml_parsing_error' => 'YAML Parsing Error',
        'yaml_syntax_invalid' => 'This file contains invalid YAML syntax and may not work correctly with Ansible.',
        'yaml_content' => 'YAML Content',
        'lines' => 'lines',
        'select_playbook_notice' => 'Select a playbook file from the tree to view its contents',
    ],

    'community' => [
        'title' => 'Community Playbooks',
        'subtitle' => 'Pre-built playbooks from the community',
        'install' => 'Install',
        'installed' => 'Installed',
        'install_success' => 'Community playbook installed successfully',
        'install_failed' => 'Failed to install community playbook',
    ],
];
