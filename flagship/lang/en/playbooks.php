<?php

return [
    'title' => 'Community Playbooks',
    'subtitle' => 'Browse and download Ansible playbooks from the community catalog',

    'search' => [
        'placeholder' => 'Search playbooks...',
        'categories' => 'Categories',
    ],

    'actions' => [
        'check_updates' => 'Check Updates',
        'download' => 'Download',
        'downloaded' => 'Downloaded',
        'update_available' => 'Update Available',
        'update_all' => 'Update All',
    ],

    'messages' => [
        'download_success' => 'downloaded successfully',
        'download_failed' => 'Failed to download playbook',
        'update_success' => 'updated successfully',
        'update_failed' => 'Failed to update playbook',
        'remove_success' => 'removed successfully',
        'remove_failed' => 'Failed to remove playbook',
        'fetch_failed' => 'Failed to fetch playbooks from registry',
        'invalid_source_path' => 'Invalid playbook source path',
        'no_updates_available' => 'No updates available',
        'update_all_success' => 'Successfully updated {count} playbook(s)',
        'update_all_failed' => 'Failed to update {count} playbook(s)',
        'update_all_error' => 'Failed to update playbooks',
        'no_playbooks_found' => 'No playbooks found',
    ],

    'confirm' => [
        'remove' => 'Are you sure you want to remove "{name}"?',
        'update' => 'Update "{name}" to the latest version?',
        'update_all' => 'Update {count} playbook(s) to the latest version?',
    ],

    'state' => [
        'updated_to_version' => 'updated to v',
    ],
];
