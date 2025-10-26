#!/usr/bin/env php
<?php

/**
 * Ansible Dynamic Inventory for Node Pulse Admiral
 *
 * Reads server list from PostgreSQL admiral.servers table
 * Outputs Ansible inventory in JSON format
 *
 * Usage:
 *   ./dynamic.php --list
 *   ./dynamic.php --host <hostname>
 */

// Bootstrap Laravel to access database
// Detect base path dynamically for portability (flagship root)
$basePath = dirname(dirname(dirname(__DIR__)));
require $basePath . '/vendor/autoload.php';
$app = require_once $basePath . '/bootstrap/app.php';
$app->make(\Illuminate\Contracts\Console\Kernel::class)->bootstrap();

use Illuminate\Support\Facades\DB;
use App\Models\PrivateKey;

/**
 * Get all servers from database
 */
function getServers(array $filters = []): array
{
    $query = DB::table('admiral.servers')
        ->whereNotNull('ssh_host')
        ->whereNotNull('ssh_username');

    // Filter by server IDs if provided
    if (!empty($filters['server_ids'])) {
        $query->whereIn('id', $filters['server_ids']);
    }

    // Filter by tags if provided
    if (!empty($filters['tags'])) {
        foreach ($filters['tags'] as $tag) {
            $query->whereJsonContains('tags', $tag);
        }
    }

    // Filter by status
    if (!empty($filters['status'])) {
        $query->where('status', $filters['status']);
    }

    // Only include servers with SSH configured
    $servers = $query->get();

    return $servers->map(function ($server) {
        return [
            'hostname' => $server->hostname,
            'ansible_host' => $server->ssh_host,
            'ansible_port' => $server->ssh_port ?? 22,
            'ansible_user' => $server->ssh_username,
            'server_id' => $server->id,
            'server_uuid' => $server->server_id,
            'tags' => json_decode($server->tags ?? '[]', true),
            'distro' => $server->distro,
            'architecture' => $server->architecture,
        ];
    })->all();
}

/**
 * Get SSH private key for a server
 */
function getSSHKey(string $serverId): ?string
{
    // Get the primary private key for this server
    $privateKey = DB::table('admiral.server_private_keys')
        ->where('server_id', $serverId)
        ->where('is_primary', true)
        ->first();

    if (!$privateKey) {
        return null;
    }

    // Load the PrivateKey model to get decrypted content
    $key = PrivateKey::find($privateKey->private_key_id);

    if (!$key) {
        return null;
    }

    // Use the model's accessor to decrypt
    return $key->getDecryptedPrivateKey();
}

// Track temporary key files for cleanup
$tempKeyFiles = [];

/**
 * Cleanup temporary SSH key files
 */
function cleanupTempKeys(): void
{
    global $tempKeyFiles;
    foreach ($tempKeyFiles as $keyFile) {
        if (file_exists($keyFile)) {
            @unlink($keyFile);
        }
    }
}

// Register shutdown function to cleanup keys
register_shutdown_function('cleanupTempKeys');

/**
 * Generate Ansible inventory
 */
function generateInventory(array $filters = []): array
{
    global $tempKeyFiles;

    $servers = getServers($filters);

    $inventory = [
        '_meta' => [
            'hostvars' => []
        ],
        'all' => [
            'children' => ['ungrouped']
        ],
        'ungrouped' => [
            'hosts' => []
        ]
    ];

    // Group by distro
    $distroGroups = [];

    // Group by tags
    $tagGroups = [];

    foreach ($servers as $server) {
        $hostname = $server['hostname'];

        // Add to ungrouped
        $inventory['ungrouped']['hosts'][] = $hostname;

        // Add host variables
        $inventory['_meta']['hostvars'][$hostname] = [
            'ansible_host' => $server['ansible_host'],
            'ansible_port' => $server['ansible_port'],
            'ansible_user' => $server['ansible_user'],
            'server_id' => $server['server_id'],
            'server_uuid' => $server['server_uuid'],
            'architecture' => $server['architecture'],
        ];

        // Get SSH key for this server
        $sshKey = getSSHKey($server['server_id']);
        if ($sshKey) {
            // Write key to temporary file with secure path
            $keyPath = sys_get_temp_dir() . "/ansible_key_{$server['server_id']}_" . uniqid();
            file_put_contents($keyPath, $sshKey);
            chmod($keyPath, 0600);
            $inventory['_meta']['hostvars'][$hostname]['ansible_ssh_private_key_file'] = $keyPath;

            // Track for cleanup
            $tempKeyFiles[] = $keyPath;
        }

        // Group by distro
        if ($server['distro']) {
            $distroGroup = strtolower(str_replace(' ', '_', $server['distro']));
            if (!isset($distroGroups[$distroGroup])) {
                $distroGroups[$distroGroup] = [];
            }
            $distroGroups[$distroGroup][] = $hostname;
        }

        // Group by tags
        foreach ($server['tags'] as $tag) {
            $tagGroup = "tag_" . strtolower(str_replace([' ', '-'], '_', $tag));
            if (!isset($tagGroups[$tagGroup])) {
                $tagGroups[$tagGroup] = [];
            }
            $tagGroups[$tagGroup][] = $hostname;
        }
    }

    // Add distro groups to inventory
    foreach ($distroGroups as $group => $hosts) {
        $inventory[$group] = ['hosts' => $hosts];
        $inventory['all']['children'][] = $group;
    }

    // Add tag groups to inventory
    foreach ($tagGroups as $group => $hosts) {
        $inventory[$group] = ['hosts' => $hosts];
        $inventory['all']['children'][] = $group;
    }

    return $inventory;
}

/**
 * Get host variables for a specific host
 */
function getHost(string $hostname): array
{
    $inventory = generateInventory();
    return $inventory['_meta']['hostvars'][$hostname] ?? [];
}

// Main execution
$options = getopt('', ['list', 'host:']);

if (isset($options['list'])) {
    // Read filters from environment or stdin
    $filters = [];

    // Check for environment variables
    if ($serverIds = getenv('ANSIBLE_SERVER_IDS')) {
        $filters['server_ids'] = explode(',', $serverIds);
    }

    if ($tags = getenv('ANSIBLE_TAGS')) {
        $filters['tags'] = explode(',', $tags);
    }

    if ($status = getenv('ANSIBLE_STATUS')) {
        $filters['status'] = $status;
    }

    echo json_encode(generateInventory($filters), JSON_PRETTY_PRINT);
} elseif (isset($options['host'])) {
    echo json_encode(getHost($options['host']), JSON_PRETTY_PRINT);
} else {
    fwrite(STDERR, "Usage: dynamic.php --list | --host <hostname>\n");
    exit(1);
}
