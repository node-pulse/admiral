<?php

namespace App\Services;

use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Validator;

class PlaybookDownloader
{
    /**
     * Cloudflare Worker Registry (catalog endpoint)
     */
    private const string REGISTRY_URL = 'https://registry.nodepulse.sh/api/catalog';

    /**
     * GitHub repository (for downloading playbook files)
     */
    private const string ALLOWED_REPO = 'github.com/node-pulse/playbooks';
    private const string REPO_API_BASE = 'https://api.github.com/repos/node-pulse/playbooks';
    private const string REPO_RAW_BASE = 'https://raw.githubusercontent.com/node-pulse/playbooks/main';

    /**
     * Local storage path for community playbooks (mirrors GitHub structure)
     */
    private string $storagePath;

    public function __construct()
    {
        // Store in ansible/catalog/ to mirror GitHub catalog/ directory
        $this->storagePath = base_path('ansible/catalog');

        // Ensure storage directory exists
        if (!File::isDirectory($this->storagePath)) {
            File::makeDirectory($this->storagePath, 0755, true);
        }
    }

    /**
     * Browse available playbooks from Cloudflare Worker registry
     *
     * @return array List of playbook manifests with download status
     */
    public function browse(): array
    {
        // Fetch catalog from Cloudflare Worker registry
        $response = Http::timeout(10)->get(self::REGISTRY_URL);

        if (!$response->successful()) {
            Log::error('Failed to fetch playbooks catalog from registry', [
                'status' => $response->status(),
                'body' => $response->body(),
            ]);
            throw new \Exception('Failed to fetch playbooks catalog from registry');
        }

        $data = $response->json();
        $playbooks = $data['playbooks'] ?? [];

        // Add download status for each playbook
        foreach ($playbooks as &$playbook) {
            $playbook['downloaded'] = $this->isDownloaded($playbook['source_path']);
        }

        return $playbooks;
    }

    /**
     * List downloaded playbooks
     *
     * @return array List of downloaded playbook manifests
     */
    public function listDownloaded(): array
    {
        $playbooks = [];

        // Read all letter directories (a-z)
        $letterDirs = File::directories($this->storagePath);

        foreach ($letterDirs as $letterDir) {
            // Read playbook directories in each letter directory
            $playbookDirs = File::directories($letterDir);

            foreach ($playbookDirs as $playbookDir) {
                $manifestPath = $playbookDir . '/manifest.json';

                if (File::exists($manifestPath)) {
                    try {
                        $manifest = json_decode(File::get($manifestPath), true);

                        // Add metadata
                        $manifest['downloaded'] = true;
                        $manifest['downloaded_at'] = File::lastModified($manifestPath);
                        $manifest['source_path'] = str_replace($this->storagePath . '/', '', $playbookDir);

                        $playbooks[] = $manifest;
                    } catch (\Exception $e) {
                        Log::warning('Failed to parse downloaded manifest', [
                            'path' => $manifestPath,
                            'error' => $e->getMessage(),
                        ]);
                    }
                }
            }
        }

        return $playbooks;
    }

    /**
     * Check if a playbook is downloaded
     *
     * @param string $sourcePath Path in format "catalog/f/fail2ban"
     * @return bool
     */
    public function isDownloaded(string $sourcePath): bool
    {
        // Remove "catalog/" prefix if present
        $path = str_replace('catalog/', '', $sourcePath);

        $manifestPath = $this->storagePath . '/' . $path . '/manifest.json';
        return File::exists($manifestPath);
    }

    /**
     * Download a playbook from GitHub
     *
     * @param string $playbookId Playbook ID from manifest.json (e.g., "pb_Xk7nM2pQw9")
     * @param string $sourcePath Path in GitHub repo (e.g., "catalog/f/fail2ban")
     * @return array Downloaded playbook manifest
     */
    public function download(string $playbookId, string $sourcePath): array
    {
        // Security: Validate source path doesn't contain directory traversal
        if (str_contains($sourcePath, '..') || str_contains($sourcePath, '~')) {
            throw new \Exception('Invalid source path');
        }

        // Security: Ensure source path starts with "catalog/"
        if (!str_starts_with($sourcePath, 'catalog/')) {
            throw new \Exception('Source path must start with "catalog/"');
        }

        Log::info('Downloading playbook', [
            'playbook_id' => $playbookId,
            'source_path' => $sourcePath,
        ]);

        // Step 1: Download manifest.json
        $manifestUrl = self::REPO_RAW_BASE . '/' . $sourcePath . '/manifest.json';

        try {
            $manifestResponse = Http::timeout(30)
                ->withHeaders([
                    'User-Agent' => 'Node-Pulse-Admiral/1.0',
                ])
                ->get($manifestUrl);

            if (!$manifestResponse->successful()) {
                Log::error('Failed to download manifest.json', [
                    'url' => $manifestUrl,
                    'status' => $manifestResponse->status(),
                    'body' => $manifestResponse->body(),
                ]);
                throw new \Exception('Failed to download manifest.json: HTTP ' . $manifestResponse->status());
            }

            $manifest = $manifestResponse->json();
        } catch (\Illuminate\Http\Client\ConnectionException $e) {
            Log::error('Connection failed while downloading manifest', [
                'url' => $manifestUrl,
                'error' => $e->getMessage(),
            ]);
            throw new \Exception('Failed to connect to GitHub: ' . $e->getMessage());
        }

        // Step 2: Validate manifest against expected schema
        $this->validateManifest($manifest);

        // Step 3: Verify playbook_id matches
        if ($manifest['id'] !== $playbookId) {
            throw new \Exception('Playbook ID mismatch');
        }

        // Step 4: Determine local storage path (mirrors GitHub structure)
        // catalog/f/fail2ban → ansible/catalog/f/fail2ban
        $relativePath = str_replace('catalog/', '', $sourcePath); // f/fail2ban
        $fullPath = $this->storagePath . '/' . $relativePath;

        // Step 5: Download all playbook files
        $files = $this->downloadPlaybookFiles($sourcePath, $fullPath);

        Log::info('Playbook downloaded successfully', [
            'playbook_id' => $playbookId,
            'local_path' => $relativePath,
            'files_count' => count($files),
        ]);

        // Return manifest with metadata
        $manifest['downloaded'] = true;
        $manifest['downloaded_at'] = time();
        $manifest['source_path'] = $sourcePath;

        return $manifest;
    }

    /**
     * Download all files from a playbook directory (recursive)
     */
    private function downloadPlaybookFiles(string $sourcePath, string $destinationPath): array
    {
        // Ensure destination directory exists
        if (!File::isDirectory($destinationPath)) {
            File::makeDirectory($destinationPath, 0755, true);
        }

        $downloadedFiles = [];

        // Fetch directory contents from GitHub API
        $url = self::REPO_API_BASE . '/contents/' . $sourcePath;

        Log::debug('Fetching directory contents from GitHub', [
            'url' => $url,
            'source_path' => $sourcePath,
        ]);

        try {
            $response = Http::timeout(30)
                ->withHeaders([
                    'Accept' => 'application/vnd.github.v3+json',
                    'User-Agent' => 'Node-Pulse-Admiral/1.0',
                ])
                ->get($url);

            if (!$response->successful()) {
                Log::error('GitHub API request failed', [
                    'url' => $url,
                    'status' => $response->status(),
                    'body' => $response->body(),
                ]);
                throw new \Exception('Failed to fetch playbook directory contents: HTTP ' . $response->status());
            }

            $contents = $response->json();
        } catch (\Illuminate\Http\Client\ConnectionException $e) {
            Log::error('GitHub API connection failed', [
                'url' => $url,
                'error' => $e->getMessage(),
            ]);
            throw new \Exception('Failed to connect to GitHub API: ' . $e->getMessage());
        }

        foreach ($contents as $item) {
            if ($item['type'] === 'file') {
                // Download file
                try {
                    $fileResponse = Http::timeout(30)
                        ->withHeaders([
                            'User-Agent' => 'Node-Pulse-Admiral/1.0',
                        ])
                        ->get($item['download_url']);

                    if ($fileResponse->successful()) {
                        $localFilePath = $destinationPath . '/' . $item['name'];
                        File::put($localFilePath, $fileResponse->body());
                        $downloadedFiles[] = $localFilePath;

                        Log::debug('Downloaded file', ['path' => $localFilePath]);
                    } else {
                        Log::warning('Failed to download file', [
                            'url' => $item['download_url'],
                            'status' => $fileResponse->status(),
                        ]);
                    }
                } catch (\Illuminate\Http\Client\ConnectionException $e) {
                    Log::error('Failed to download file', [
                        'url' => $item['download_url'],
                        'error' => $e->getMessage(),
                    ]);
                    throw new \Exception('Failed to download file: ' . $e->getMessage());
                }
            } elseif ($item['type'] === 'dir') {
                // Recursively download subdirectories (templates/, files/, etc.)
                $subPath = $sourcePath . '/' . $item['name'];
                $subDestPath = $destinationPath . '/' . $item['name'];
                $subFiles = $this->downloadPlaybookFiles($subPath, $subDestPath);
                $downloadedFiles = array_merge($downloadedFiles, $subFiles);
            }
        }

        return $downloadedFiles;
    }

    /**
     * Validate manifest.json structure
     */
    private function validateManifest(array $manifest): void
    {
        $validator = Validator::make($manifest, [
            'id' => 'required|string|regex:/^pb_[A-Za-z0-9]{10}$/',
            'name' => 'required|string|max:255',
            'version' => 'required|string|max:50',
            'description' => 'nullable|string',
            'author' => 'required|array',
            'author.name' => 'required|string',
            'entry_point' => 'required|string',
            'category' => 'required|string',
            'os_support' => 'required|array|min:1',
            'variables' => 'nullable|array',
        ]);

        if ($validator->fails()) {
            Log::error('Manifest validation failed', [
                'errors' => $validator->errors()->toArray(),
            ]);
            throw new \Exception('Invalid manifest.json: ' . $validator->errors()->first());
        }
    }

    /**
     * Remove a playbook
     *
     * @param string $playbookId Playbook ID (e.g., "pb_Xk7nM2pQw9")
     * @return void
     */
    public function remove(string $playbookId): void
    {
        // Find the playbook by ID in downloaded playbooks
        $downloaded = $this->listDownloaded();
        $playbook = null;

        foreach ($downloaded as $pb) {
            if ($pb['id'] === $playbookId) {
                $playbook = $pb;
                break;
            }
        }

        if (!$playbook) {
            throw new \Exception('Playbook not found');
        }

        // Delete directory (e.g., ansible/catalog/f/fail2ban)
        $relativePath = str_replace('catalog/', '', $playbook['source_path']);
        $fullPath = $this->storagePath . '/' . $relativePath;

        if (File::isDirectory($fullPath)) {
            File::deleteDirectory($fullPath);
            Log::info('Deleted playbook files', ['path' => $fullPath]);
        }

        Log::info('Playbook removed', ['playbook_id' => $playbookId]);
    }

    /**
     * Check for available updates for downloaded playbooks
     *
     * @return array List of playbooks with update information
     */
    public function checkForUpdates(): array
    {
        // Get downloaded playbooks
        $downloaded = $this->listDownloaded();

        // Get registry catalog
        $response = Http::timeout(10)->get(self::REGISTRY_URL);

        if (!$response->successful()) {
            Log::error('Failed to fetch playbooks catalog for update check', [
                'status' => $response->status(),
                'body' => $response->body(),
            ]);
            throw new \Exception('Failed to fetch playbooks catalog from registry');
        }

        $data = $response->json();
        $catalogPlaybooks = $data['playbooks'] ?? [];

        // Create a map of registry playbooks by ID for quick lookup
        $catalogMap = [];
        foreach ($catalogPlaybooks as $pb) {
            $catalogMap[$pb['id']] = $pb;
        }

        // Check each downloaded playbook for updates
        $updates = [];
        foreach ($downloaded as $localPlaybook) {
            $playbookId = $localPlaybook['id'];

            if (isset($catalogMap[$playbookId])) {
                $remotePlaybook = $catalogMap[$playbookId];
                $localVersion = $localPlaybook['version'] ?? '0.0.0';
                $remoteVersion = $remotePlaybook['version'] ?? '0.0.0';

                // Compare versions
                if (version_compare($remoteVersion, $localVersion, '>')) {
                    $updates[] = [
                        'id' => $playbookId,
                        'name' => $localPlaybook['name'],
                        'current_version' => $localVersion,
                        'latest_version' => $remoteVersion,
                        'source_path' => $remotePlaybook['source_path'],
                        'update_available' => true,
                    ];
                }
            }
        }

        return $updates;
    }

    /**
     * Update a playbook to the latest version
     *
     * @param string $playbookId Playbook ID (e.g., "pb_Xk7nM2pQw9")
     * @return array Updated playbook manifest
     */
    public function update(string $playbookId): array
    {
        // Get registry catalog to find the playbook
        $response = Http::timeout(10)->get(self::REGISTRY_URL);

        if (!$response->successful()) {
            throw new \Exception('Failed to fetch playbooks catalog from registry');
        }

        $data = $response->json();
        $catalogPlaybooks = $data['playbooks'] ?? [];

        // Find the playbook in catalog
        $remotePlaybook = null;
        foreach ($catalogPlaybooks as $pb) {
            if ($pb['id'] === $playbookId) {
                $remotePlaybook = $pb;
                break;
            }
        }

        if (!$remotePlaybook) {
            throw new \Exception('Playbook not found in registry');
        }

        // Check if playbook is downloaded
        $downloaded = $this->listDownloaded();
        $localPlaybook = null;
        foreach ($downloaded as $pb) {
            if ($pb['id'] === $playbookId) {
                $localPlaybook = $pb;
                break;
            }
        }

        if (!$localPlaybook) {
            throw new \Exception('Playbook is not downloaded. Use download() instead.');
        }

        Log::info('Updating playbook', [
            'playbook_id' => $playbookId,
            'source_path' => $remotePlaybook['source_path'],
        ]);

        // Security: Validate source path doesn't contain directory traversal
        if (str_contains($remotePlaybook['source_path'], '..') || str_contains($remotePlaybook['source_path'], '~')) {
            throw new \Exception('Invalid source path');
        }

        // Security: Ensure source path starts with "catalog/"
        if (!str_starts_with($remotePlaybook['source_path'], 'catalog/')) {
            throw new \Exception('Source path must start with "catalog/"');
        }

        // Step 1: Download new version to temporary location
        $relativePath = str_replace('catalog/', '', $remotePlaybook['source_path']);
        $tempPath = $this->storagePath . '/' . $relativePath . '.tmp';

        try {
            // Download all files to temporary directory
            $files = $this->downloadPlaybookFiles($remotePlaybook['source_path'], $tempPath);

            // Step 2: Validate the downloaded manifest
            $manifestPath = $tempPath . '/manifest.json';
            if (!File::exists($manifestPath)) {
                throw new \Exception('Downloaded manifest.json not found');
            }

            $manifest = json_decode(File::get($manifestPath), true);
            $this->validateManifest($manifest);

            // Verify playbook_id matches
            if ($manifest['id'] !== $playbookId) {
                throw new \Exception('Playbook ID mismatch');
            }

            // Step 3: Now that download is complete and valid, remove old version
            $oldPath = $this->storagePath . '/' . $relativePath;
            if (File::isDirectory($oldPath)) {
                File::deleteDirectory($oldPath);
            }

            // Step 4: Move temporary directory to final location
            File::move($tempPath, $oldPath);

            Log::info('Playbook updated successfully', [
                'playbook_id' => $playbookId,
                'version' => $manifest['version'] ?? 'unknown',
                'files_count' => \count($files),
            ]);

            // Return manifest with metadata
            $manifest['downloaded'] = true;
            $manifest['downloaded_at'] = time();
            $manifest['source_path'] = $remotePlaybook['source_path'];

            return $manifest;
        } catch (\Exception $e) {
            // Cleanup temporary directory if it exists
            if (File::isDirectory($tempPath)) {
                File::deleteDirectory($tempPath);
            }

            Log::error('Failed to update playbook', [
                'playbook_id' => $playbookId,
                'error' => $e->getMessage(),
            ]);

            throw $e;
        }
    }

    /**
     * Update all playbooks that have available updates
     *
     * @return array Results of update operations
     */
    public function updateAll(): array
    {
        $updates = $this->checkForUpdates();
        $results = [
            'success' => [],
            'failed' => [],
            'total' => \count($updates),
        ];

        foreach ($updates as $update) {
            try {
                $updatedPlaybook = $this->update($update['id']);
                $results['success'][] = [
                    'id' => $update['id'],
                    'name' => $update['name'],
                    'version' => $updatedPlaybook['version'],
                ];
            } catch (\Exception $e) {
                $results['failed'][] = [
                    'id' => $update['id'],
                    'name' => $update['name'],
                    'error' => $e->getMessage(),
                ];
                Log::error('Failed to update playbook', [
                    'playbook_id' => $update['id'],
                    'error' => $e->getMessage(),
                ]);
            }
        }

        return $results;
    }
}
