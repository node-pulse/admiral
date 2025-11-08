<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Inertia\Inertia;

class AnsiblePlaybooksController extends Controller
{
    /**
     * Display the Ansible playbooks page
     */
    public function page()
    {
        return Inertia::render('ansible-playbooks');
    }

    /**
     * Get hierarchical list of available Ansible playbooks and directories
     */
    public function index()
    {
        $playbooksPath = base_path('ansible');

        if (!is_dir($playbooksPath)) {
            return response()->json([
                'tree' => [],
                'error' => 'Ansible directory not found',
            ]);
        }

        $tree = $this->buildDirectoryTree($playbooksPath, $playbooksPath);

        return response()->json([
            'tree' => $tree,
            'basePath' => 'ansible',
        ]);
    }

    /**
     * Get content of a specific playbook file
     */
    public function show(string $path)
    {
        $ansiblePath = base_path('ansible');
        $filePath = $ansiblePath . '/' . $path;

        // Security: Prevent directory traversal
        $realPath = realpath($filePath);
        $realBasePath = realpath($ansiblePath);

        if (!$realPath || !$realBasePath || strpos($realPath, $realBasePath) !== 0) {
            return response()->json([
                'error' => 'Invalid file path',
            ], 403);
        }

        if (!file_exists($filePath) || !is_file($filePath)) {
            return response()->json([
                'error' => 'File not found',
            ], 404);
        }

        $extension = pathinfo($filePath, PATHINFO_EXTENSION);
        if (!in_array($extension, ['yml', 'yaml', 'j2'])) {
            return response()->json([
                'error' => 'Only YAML and Jinja2 template files are allowed',
            ], 403);
        }

        $content = file_get_contents($filePath);
        $isTemplate = $extension === 'j2';

        return response()->json([
            'path' => $path,
            'content' => $content,
            'size' => filesize($filePath),
            'modified' => filemtime($filePath),
            'isTemplate' => $isTemplate,
        ]);
    }

    /**
     * Build a hierarchical tree structure of directories and files
     */
    private function buildDirectoryTree(string $path, string $basePath): array
    {
        $tree = [];

        if (!is_dir($path)) {
            return $tree;
        }

        $items = scandir($path);

        foreach ($items as $item) {
            if ($item === '.' || $item === '..') {
                continue;
            }

            // Skip hidden files and system directories
            if (str_starts_with($item, '.') || in_array($item, ['inventory', 'group_vars', 'host_vars'])) {
                continue;
            }

            $fullPath = $path . '/' . $item;
            $relativePath = str_replace($basePath . '/', '', $fullPath);

            if (is_dir($fullPath)) {
                $tree[] = [
                    'type' => 'directory',
                    'name' => $item,
                    'path' => $relativePath,
                    'children' => $this->buildDirectoryTree($fullPath, $basePath),
                ];
            } elseif (is_file($fullPath)) {
                $extension = pathinfo($fullPath, PATHINFO_EXTENSION);

                // Show .yml, .yaml, and .j2 files
                if (in_array($extension, ['yml', 'yaml', 'j2'])) {
                    $metadata = $this->parsePlaybookMetadata($fullPath);
                    $isTemplate = $extension === 'j2';

                    $tree[] = [
                        'type' => 'file',
                        'name' => $item,
                        'path' => $relativePath,
                        'title' => $metadata['name'] ?? ucfirst(str_replace(['-', '_', '.yml', '.yaml', '.j2'], [' ', ' ', '', '', ''], basename($item))),
                        'description' => $metadata['description'] ?? ($isTemplate ? 'Jinja2 Template' : null),
                        'size' => filesize($fullPath),
                        'modified' => filemtime($fullPath),
                        'isTemplate' => $isTemplate,
                    ];
                }
            }
        }

        // Sort: directories first, then files, both alphabetically
        usort($tree, function ($a, $b) {
            if ($a['type'] !== $b['type']) {
                return $a['type'] === 'directory' ? -1 : 1;
            }
            return strcmp($a['name'], $b['name']);
        });

        return $tree;
    }

    /**
     * Parse playbook file to extract metadata
     */
    private function parsePlaybookMetadata(string $filePath): array
    {
        $metadata = [];

        try {
            $content = file_get_contents($filePath);

            // Extract name from first "name:" field in YAML
            if (preg_match('/^-?\s*name:\s*(.+)$/m', $content, $matches)) {
                $metadata['name'] = trim($matches[1], " \t\n\r\0\x0B\"'");
            }

            // Look for description in comments at the top
            if (preg_match('/^#\s*Description:\s*(.+)$/m', $content, $matches)) {
                $metadata['description'] = trim($matches[1]);
            }

        } catch (\Exception $e) {
            \Log::warning("Failed to parse playbook metadata: {$filePath}", ['error' => $e->getMessage()]);
        }

        return $metadata;
    }
}
