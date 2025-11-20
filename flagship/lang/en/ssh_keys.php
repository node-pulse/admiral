<?php

return [
    'title' => 'SSH Keys',
    'subtitle' => 'Manage SSH private keys for server authentication',

    'list' => [
        'search_placeholder' => 'Search by name or fingerprint...',
        'add_key' => 'Add SSH Key',
        'no_keys' => 'No SSH keys found',
        'no_keys_description' => 'Generate or import your first SSH key to get started.',
        'total_keys' => 'Total Keys',
    ],

    'table' => [
        'name' => 'Name',
        'fingerprint' => 'Fingerprint',
        'servers' => 'Servers',
        'created' => 'Created',
        'actions' => 'Actions',
    ],

    'actions' => [
        'view_details' => 'View Details',
        'edit' => 'Edit',
        'delete' => 'Delete',
        'download_public' => 'Download Public Key',
        'copy_public' => 'Copy Public Key',
    ],

    'dialog' => [
        'add_title' => 'Add SSH Key',
        'add_description' => 'Generate a new SSH key pair or import an existing private key.',
        'edit_title' => 'Edit SSH Key',
        'edit_description' => 'Update SSH key information.',
        'delete_title' => 'Delete SSH Key',
        'delete_description' => 'Are you sure you want to delete this SSH key? This action cannot be undone.',
        'details_title' => 'SSH Key Details',

        'method' => 'Method',
        'generate' => 'Generate New',
        'import' => 'Import Existing',

        'name_label' => 'Name',
        'name_placeholder' => 'e.g., Production Servers',

        'description_label' => 'Description',
        'description_placeholder' => 'Optional description',

        'key_type_label' => 'Key Type',
        'key_size_label' => 'Key Size',

        'private_key_label' => 'Private Key',
        'private_key_placeholder' => 'Paste your private key here (PEM format)',

        'passphrase_label' => 'Passphrase',
        'passphrase_placeholder' => 'Optional passphrase for encrypted keys',

        'public_key_label' => 'Public Key',
        'fingerprint_label' => 'Fingerprint',
        'linked_servers_label' => 'Linked Servers',
        'no_servers_linked' => 'No servers linked to this key',

        'cancel' => 'Cancel',
        'generate_key' => 'Generate Key',
        'import_key' => 'Import Key',
        'save' => 'Save Changes',
        'delete' => 'Delete Key',
    ],

    'messages' => [
        'key_generated' => 'SSH key generated successfully',
        'key_imported' => 'SSH key imported successfully',
        'key_updated' => 'SSH key updated successfully',
        'key_deleted' => 'SSH key deleted successfully',
        'public_key_copied' => 'Public key copied to clipboard',
        'public_key_downloaded' => 'Public key downloaded',
        'generation_failed' => 'Failed to generate SSH key',
        'import_failed' => 'Failed to import SSH key',
        'update_failed' => 'Failed to update SSH key',
        'delete_failed' => 'Failed to delete SSH key',
        'invalid_private_key' => 'Invalid private key format',
    ],
];
