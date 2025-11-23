<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Validator;
use Symfony\Component\Yaml\Yaml;
use Symfony\Component\Yaml\Exception\ParseException;
use ZipArchive;

class CustomPlaybooksController extends Controller
{
    /**
     * Upload a custom playbook file (YAML or ZIP package)
     */
    public function upload(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'file' => 'required|file|mimes:yml,yaml,zip|max:102400', // 100MB max
            'name' => 'nullable|string|max:255',
        ]);

        if ($validator->fails()) {
            return response()->json([
                'success' => false,
                'message' => 'Validation failed',
                'errors' => $validator->errors(),
            ], 422);
        }

        try {
            $file = $request->file('file');
            $extension = $file->getClientOriginalExtension();
            $customPath = base_path('ansible/custom');

            // Ensure custom directory exists
            if (!is_dir($customPath)) {
                mkdir($customPath, 0755, true);
            }

            if ($extension === 'zip') {
                return $this->uploadPackage($file, $customPath, $request->input('name'));
            } else {
                return $this->uploadSimplePlaybook($file, $customPath, $request->input('name'));
            }

        } catch (\Exception $e) {
            Log::error('Custom playbook upload failed', [
                'error' => $e->getMessage(),
                'trace' => $e->getTraceAsString(),
            ]);

            return response()->json([
                'success' => false,
                'message' => 'Upload failed: ' . $e->getMessage(),
            ], 500);
        }
    }

    /**
     * Upload a simple YAML playbook file
     */
    private function uploadSimplePlaybook($file, string $customPath, ?string $customName)
    {
        $originalName = $file->getClientOriginalName();
        $content = file_get_contents($file->getRealPath());

        // Validate YAML syntax
        $validation = $this->validateYaml($content);
        if (!$validation['valid']) {
            return response()->json([
                'success' => false,
                'message' => 'YAML validation failed',
                'errors' => $validation['errors'],
            ], 422);
        }

        // Generate filename (use custom name or original)
        $filename = $customName
            ? $this->sanitizeFilename($customName) . '.yml'
            : $this->sanitizeFilename($originalName);

        $filePath = $customPath . '/' . $filename;

        // Check if file already exists
        if (file_exists($filePath)) {
            return response()->json([
                'success' => false,
                'message' => 'A playbook with this name already exists',
            ], 409);
        }

        // Save file
        file_put_contents($filePath, $content);

        Log::info('Custom playbook uploaded', [
            'filename' => $filename,
            'size' => strlen($content),
        ]);

        return response()->json([
            'success' => true,
            'message' => 'Playbook uploaded successfully',
            'playbook' => [
                'name' => $filename,
                'path' => 'custom/' . $filename,
                'size' => strlen($content),
                'type' => 'simple',
            ],
            'validation' => [
                'valid' => true,
                'warnings' => $validation['warnings'] ?? [],
            ],
        ], 201);
    }

    /**
     * Upload and extract a ZIP playbook package
     */
    private function uploadPackage($file, string $customPath, ?string $customName)
    {
        $zip = new ZipArchive;

        if ($zip->open($file->getRealPath()) !== true) {
            return response()->json([
                'success' => false,
                'message' => 'Failed to open ZIP file',
            ], 422);
        }

        // Validate package structure and size FIRST (before extraction)
        $validation = $this->validateZipPackage($zip);
        if (!$validation['valid']) {
            $zip->close();
            return response()->json([
                'success' => false,
                'message' => 'Package validation failed',
                'errors' => $validation['errors'],
            ], 422);
        }

        // Check for manifest.json
        $manifestIndex = $zip->locateName('manifest.json', ZipArchive::FL_NODIR);
        if ($manifestIndex === false) {
            $zip->close();
            return response()->json([
                'success' => false,
                'message' => 'Package must contain a manifest.json file',
                'errors' => ['Missing manifest.json - custom playbooks require a manifest following the Node Pulse Admiral schema'],
            ], 422);
        }

        // Read and validate manifest
        $manifestContent = $zip->getFromIndex($manifestIndex);
        $manifest = json_decode($manifestContent, true);

        if (json_last_error() !== JSON_ERROR_NONE) {
            $zip->close();
            return response()->json([
                'success' => false,
                'message' => 'Invalid manifest.json',
                'errors' => ['manifest.json is not valid JSON: ' . json_last_error_msg()],
            ], 422);
        }

        // Validate required manifest fields
        $manifestValidation = $this->validateManifest($manifest);
        if (!$manifestValidation['valid']) {
            $zip->close();
            return response()->json([
                'success' => false,
                'message' => 'Invalid manifest.json',
                'errors' => $manifestValidation['errors'],
            ], 422);
        }

        // Use manifest ID for directory name (or custom name if provided)
        $dirName = $customName
            ? $this->sanitizeFilename($customName)
            : $this->sanitizeFilename($manifest['id'] ?? pathinfo($file->getClientOriginalName(), PATHINFO_FILENAME));

        $extractPath = $customPath . '/' . $dirName;

        // Check if directory already exists
        if (is_dir($extractPath)) {
            $zip->close();
            return response()->json([
                'success' => false,
                'message' => 'A playbook package with this name already exists',
            ], 409);
        }

        // Extract
        mkdir($extractPath, 0755, true);
        $zip->extractTo($extractPath);
        $zip->close();

        Log::info('Custom playbook package uploaded', [
            'directory' => $dirName,
            'manifest' => [
                'id' => $manifest['id'],
                'name' => $manifest['name'],
                'version' => $manifest['version'],
            ],
        ]);

        return response()->json([
            'success' => true,
            'message' => 'Playbook package uploaded successfully',
            'playbook' => [
                'name' => $dirName,
                'path' => 'custom/' . $dirName,
                'type' => 'package',
                'manifest' => [
                    'id' => $manifest['id'],
                    'name' => $manifest['name'],
                    'version' => $manifest['version'],
                    'description' => $manifest['description'],
                    'author' => $manifest['author'],
                ],
                'contents' => $validation['files'],
            ],
            'validation' => [
                'valid' => true,
                'warnings' => array_merge($validation['warnings'] ?? [], $manifestValidation['warnings'] ?? []),
            ],
        ], 201);
    }

    /**
     * Validate YAML syntax and basic Ansible structure
     */
    private function validateYaml(string $content): array
    {
        $errors = [];
        $warnings = [];

        // Parse YAML
        try {
            $data = Yaml::parse($content);
        } catch (ParseException $e) {
            return [
                'valid' => false,
                'errors' => ['YAML syntax error: ' . $e->getMessage()],
            ];
        }

        // Must be an array (list of plays)
        if (!is_array($data)) {
            $errors[] = 'Playbook must be a list of plays';
        } else {
            // Check each play has required keys
            foreach ($data as $index => $play) {
                if (!is_array($play)) {
                    $errors[] = "Play #{$index} must be an object";
                    continue;
                }

                if (!isset($play['hosts'])) {
                    $errors[] = "Play #{$index} missing required 'hosts' key";
                }

                if (!isset($play['tasks']) && !isset($play['roles'])) {
                    $errors[] = "Play #{$index} must have either 'tasks' or 'roles'";
                }
            }
        }

        // Basic secret detection (warnings only)
        $secretPatterns = [
            '/password:\s*[\'"][^\'"]+[\'"]/i',
            '/api_key:\s*[\'"][^\'"]+[\'"]/i',
            '/secret:\s*[\'"][^\'"]+[\'"]/i',
            '/token:\s*[\'"][^\'"]+[\'"]/i',
        ];

        foreach ($secretPatterns as $pattern) {
            if (preg_match($pattern, $content)) {
                $warnings[] = 'Potential hardcoded secret detected. Consider using Ansible Vault or variables.';
                break;
            }
        }

        return [
            'valid' => empty($errors),
            'errors' => $errors,
            'warnings' => $warnings,
        ];
    }

    /**
     * Validate ZIP package structure
     */
    private function validateZipPackage(ZipArchive $zip): array
    {
        $errors = [];
        $warnings = [];
        $files = [
            'playbooks' => [],
            'templates' => [],
            'files' => [],
        ];

        $totalSize = 0;
        $maxSize = 100 * 1024 * 1024; // 100MB

        for ($i = 0; $i < $zip->numFiles; $i++) {
            $stat = $zip->statIndex($i);
            $filename = $stat['name'];
            $totalSize += $stat['size'];

            // Check total size
            if ($totalSize > $maxSize) {
                $errors[] = 'Package size exceeds 100MB limit';
                break;
            }

            // Skip directories
            if (substr($filename, -1) === '/') {
                continue;
            }

            // Categorize files (all file types allowed in custom playbooks)
            $extension = pathinfo($filename, PATHINFO_EXTENSION);
            if (preg_match('/\.(yml|yaml)$/i', $filename)) {
                $files['playbooks'][] = $filename;
            } elseif (preg_match('/\.j2$/i', $filename)) {
                $files['templates'][] = $filename;
            } else {
                $files['files'][] = $filename;
            }
        }

        // Must have at least one playbook file
        if (empty($files['playbooks'])) {
            $errors[] = 'Package must contain at least one .yml or .yaml file';
        }

        return [
            'valid' => empty($errors),
            'errors' => $errors,
            'warnings' => $warnings,
            'files' => $files,
        ];
    }

    /**
     * Create a new directory in ansible/custom/
     */
    public function createDirectory(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'path' => 'required|string',
            'name' => 'required|string|max:255',
        ]);

        if ($validator->fails()) {
            return response()->json([
                'success' => false,
                'errors' => $validator->errors(),
            ], 422);
        }

        $path = $request->input('path');
        $name = $request->input('name');

        // Security: Path must be under custom/ directory
        if (!str_starts_with($path, 'custom/') && $path !== 'custom') {
            return response()->json([
                'success' => false,
                'message' => 'Invalid path: must be under custom/ directory',
            ], 403);
        }

        // Sanitize directory name
        $sanitizedName = $this->sanitizeFilename($name);
        $customPath = base_path('ansible');
        $fullPath = $customPath . '/' . $path . '/' . $sanitizedName;

        // Prevent path traversal
        $realCustomPath = realpath($customPath . '/custom');
        $realPath = realpath(dirname($fullPath));

        if (!$realCustomPath || !$realPath || strpos($realPath, $realCustomPath) !== 0) {
            return response()->json([
                'success' => false,
                'message' => 'Invalid directory path',
            ], 403);
        }

        // Check if directory already exists
        if (is_dir($fullPath)) {
            return response()->json([
                'success' => false,
                'message' => 'Directory already exists',
            ], 409);
        }

        try {
            mkdir($fullPath, 0755, true);

            Log::info('Custom directory created', [
                'path' => $path . '/' . $sanitizedName,
            ]);

            return response()->json([
                'success' => true,
                'message' => 'Directory created successfully',
                'directory' => [
                    'name' => $sanitizedName,
                    'path' => $path . '/' . $sanitizedName,
                ],
            ], 201);

        } catch (\Exception $e) {
            Log::error('Failed to create custom directory', [
                'path' => $path,
                'error' => $e->getMessage(),
            ]);

            return response()->json([
                'success' => false,
                'message' => 'Failed to create directory: ' . $e->getMessage(),
            ], 500);
        }
    }

    /**
     * Upload file to a specific directory in ansible/custom/
     */
    public function uploadToDirectory(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'file' => 'required|file|max:102400', // 100MB max
            'path' => 'required|string',
        ]);

        if ($validator->fails()) {
            return response()->json([
                'success' => false,
                'message' => 'Validation failed',
                'errors' => $validator->errors(),
            ], 422);
        }

        $targetPath = $request->input('path');

        // Security: Path must be under custom/ directory
        if (!str_starts_with($targetPath, 'custom/')) {
            return response()->json([
                'success' => false,
                'message' => 'Invalid path: must be under custom/ directory',
            ], 403);
        }

        try {
            $file = $request->file('file');
            $customPath = base_path('ansible');
            $fullTargetPath = $customPath . '/' . $targetPath;

            // Ensure target directory exists
            if (!is_dir($fullTargetPath)) {
                return response()->json([
                    'success' => false,
                    'message' => 'Target directory does not exist',
                ], 404);
            }

            // Prevent path traversal
            $realCustomPath = realpath($customPath . '/custom');
            $realTargetPath = realpath($fullTargetPath);

            if (!$realCustomPath || !$realTargetPath || strpos($realTargetPath, $realCustomPath) !== 0) {
                return response()->json([
                    'success' => false,
                    'message' => 'Invalid target path',
                ], 403);
            }

            // Use original filename (sanitized)
            $originalName = $file->getClientOriginalName();
            $sanitizedName = $this->sanitizeFilename(pathinfo($originalName, PATHINFO_FILENAME));
            $extension = $file->getClientOriginalExtension();
            $filename = $sanitizedName . '.' . $extension;

            $filePath = $fullTargetPath . '/' . $filename;

            // Check if file already exists
            if (file_exists($filePath)) {
                return response()->json([
                    'success' => false,
                    'message' => 'A file with this name already exists',
                ], 409);
            }

            // Move uploaded file
            $file->move($fullTargetPath, $filename);

            Log::info('File uploaded to custom directory', [
                'filename' => $filename,
                'path' => $targetPath,
                'size' => filesize($filePath),
            ]);

            return response()->json([
                'success' => true,
                'message' => 'File uploaded successfully',
                'file' => [
                    'name' => $filename,
                    'path' => $targetPath . '/' . $filename,
                    'size' => filesize($filePath),
                ],
            ], 201);

        } catch (\Exception $e) {
            Log::error('Custom file upload failed', [
                'error' => $e->getMessage(),
                'trace' => $e->getTraceAsString(),
            ]);

            return response()->json([
                'success' => false,
                'message' => 'Upload failed: ' . $e->getMessage(),
            ], 500);
        }
    }

    /**
     * Delete a custom playbook
     */
    public function delete(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'path' => 'required|string',
        ]);

        if ($validator->fails()) {
            return response()->json([
                'success' => false,
                'errors' => $validator->errors(),
            ], 422);
        }

        $path = $request->input('path');
        $customPath = base_path('ansible/custom');

        // Security: Must be under custom/ directory
        if (!str_starts_with($path, 'custom/')) {
            return response()->json([
                'success' => false,
                'message' => 'Invalid path: must be under custom/ directory',
            ], 403);
        }

        $fullPath = base_path('ansible/' . $path);

        // Security: Prevent directory traversal
        $realPath = realpath($fullPath);
        $realCustomPath = realpath($customPath);

        if (!$realPath || !$realCustomPath || strpos($realPath, $realCustomPath) !== 0) {
            return response()->json([
                'success' => false,
                'message' => 'Invalid file path',
            ], 403);
        }

        if (!file_exists($fullPath)) {
            return response()->json([
                'success' => false,
                'message' => 'File or directory not found',
            ], 404);
        }

        try {
            if (is_dir($fullPath)) {
                $this->deleteDirectory($fullPath);
            } else {
                unlink($fullPath);
            }

            Log::info('Custom playbook deleted', ['path' => $path]);

            return response()->json([
                'success' => true,
                'message' => 'Playbook deleted successfully',
            ]);

        } catch (\Exception $e) {
            Log::error('Failed to delete custom playbook', [
                'path' => $path,
                'error' => $e->getMessage(),
            ]);

            return response()->json([
                'success' => false,
                'message' => 'Failed to delete: ' . $e->getMessage(),
            ], 500);
        }
    }

    /**
     * Recursively delete a directory
     */
    private function deleteDirectory(string $dir): void
    {
        if (!is_dir($dir)) {
            return;
        }

        $items = scandir($dir);
        foreach ($items as $item) {
            if ($item === '.' || $item === '..') {
                continue;
            }

            $path = $dir . '/' . $item;
            if (is_dir($path)) {
                $this->deleteDirectory($path);
            } else {
                unlink($path);
            }
        }

        rmdir($dir);
    }

    /**
     * Validate manifest.json against required schema
     */
    private function validateManifest(array $manifest): array
    {
        $errors = [];
        $warnings = [];

        // Required fields (simplified validation - not full JSON schema)
        $requiredFields = [
            'id' => 'string',
            'name' => 'string',
            'version' => 'string',
            'description' => 'string',
            'author' => 'array',
            'category' => 'string',
            'tags' => 'array',
            'ansible_version' => 'string',
            'os_support' => 'array',
            'structure' => 'array',
            'license' => 'string',
        ];

        foreach ($requiredFields as $field => $type) {
            if (!isset($manifest[$field])) {
                $errors[] = "Missing required field: {$field}";
            } elseif ($type === 'string' && !is_string($manifest[$field])) {
                $errors[] = "Field '{$field}' must be a string";
            } elseif ($type === 'array' && !is_array($manifest[$field])) {
                $errors[] = "Field '{$field}' must be an array";
            }
        }

        // Validate ID format
        if (isset($manifest['id']) && !preg_match('/^pb_[A-Za-z0-9]{10}$/', $manifest['id'])) {
            $errors[] = "Field 'id' must match pattern: pb_XXXXXXXXXX (10 alphanumeric characters)";
        }

        // Validate author structure
        if (isset($manifest['author']) && is_array($manifest['author'])) {
            if (!isset($manifest['author']['name'])) {
                $errors[] = "Field 'author.name' is required";
            }
        }

        // Validate version format (semantic versioning)
        if (isset($manifest['version']) && !preg_match('/^\d+\.\d+\.\d+/', $manifest['version'])) {
            $warnings[] = "Field 'version' should follow semantic versioning (e.g., 1.0.0)";
        }

        // Validate category
        $validCategories = ['monitoring', 'database', 'search', 'security', 'proxy', 'storage', 'dev-tools'];
        if (isset($manifest['category']) && !in_array($manifest['category'], $validCategories)) {
            $warnings[] = "Field 'category' should be one of: " . implode(', ', $validCategories);
        }

        // Validate structure.playbooks (must have install and uninstall)
        if (isset($manifest['structure'])) {
            if (!isset($manifest['structure']['playbooks'])) {
                $errors[] = "Missing required field: structure.playbooks";
            } else {
                // Validate install playbook
                if (!isset($manifest['structure']['playbooks']['install'])) {
                    $errors[] = "Missing required field: structure.playbooks.install";
                } else {
                    if (!isset($manifest['structure']['playbooks']['install']['file'])) {
                        $errors[] = "Missing required field: structure.playbooks.install.file";
                    }
                    if (!isset($manifest['structure']['playbooks']['install']['variables'])) {
                        $errors[] = "Missing required field: structure.playbooks.install.variables";
                    }
                }

                // Validate uninstall playbook
                if (!isset($manifest['structure']['playbooks']['uninstall'])) {
                    $errors[] = "Missing required field: structure.playbooks.uninstall";
                } else {
                    if (!isset($manifest['structure']['playbooks']['uninstall']['file'])) {
                        $errors[] = "Missing required field: structure.playbooks.uninstall.file";
                    }
                    if (!isset($manifest['structure']['playbooks']['uninstall']['variables'])) {
                        $errors[] = "Missing required field: structure.playbooks.uninstall.variables";
                    }
                }
            }
        }

        return [
            'valid' => empty($errors),
            'errors' => $errors,
            'warnings' => $warnings,
        ];
    }

    /**
     * Sanitize filename to prevent path traversal and ensure safe filesystem names
     */
    private function sanitizeFilename(string $filename): string
    {
        // Remove extension for processing
        $name = preg_replace('/\.(yml|yaml|zip)$/i', '', $filename);

        // Remove any path components
        $name = basename($name);

        // Replace unsafe characters with hyphens
        $name = preg_replace('/[^a-z0-9_-]/i', '-', $name);

        // Remove consecutive hyphens
        $name = preg_replace('/-+/', '-', $name);

        // Trim hyphens from edges
        $name = trim($name, '-');

        // Ensure not empty
        if (empty($name)) {
            $name = 'playbook-' . time();
        }

        return strtolower($name);
    }
}
