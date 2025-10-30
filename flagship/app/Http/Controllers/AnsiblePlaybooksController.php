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
        $playbooksPath = base_path('ansible/playbooks');

        if (!is_dir($playbooksPath)) {
            return response()->json([
                'tree' => [],
                'error' => 'Playbooks directory not found',
            ]);
        }

        $tree = $this->buildDirectoryTree($playbooksPath, $playbooksPath);

        return response()->json([
            'tree' => $tree,
            'basePath' => 'ansible/playbooks',
        ]);
    }

    /**
     * Get content of a specific playbook file
     */
    public function show(Request $request, string $path)
    {
        $playbooksPath = base_path('ansible/playbooks');
        $filePath = $playbooksPath . '/' . $path;

        // Security: Prevent directory traversal
        $realPath = realpath($filePath);
        $realBasePath = realpath($playbooksPath);

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

        if (!in_array(pathinfo($filePath, PATHINFO_EXTENSION), ['yml', 'yaml'])) {
            return response()->json([
                'error' => 'Only YAML files are allowed',
            ], 403);
        }

        $content = file_get_contents($filePath);

        return response()->json([
            'path' => $path,
            'content' => $content,
            'size' => filesize($filePath),
            'modified' => filemtime($filePath),
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

            $fullPath = $path . '/' . $item;
            $relativePath = str_replace($basePath . '/', '', $fullPath);

            if (is_dir($fullPath)) {
                $tree[] = [
                    'type' => 'directory',
                    'name' => $item,
                    'path' => $relativePath,
                    'children' => $this->buildDirectoryTree($fullPath, $basePath),
                ];
            } elseif (is_file($fullPath) && in_array(pathinfo($fullPath, PATHINFO_EXTENSION), ['yml', 'yaml'])) {
                $metadata = $this->parsePlaybookMetadata($fullPath);

                $tree[] = [
                    'type' => 'file',
                    'name' => $item,
                    'path' => $relativePath,
                    'title' => $metadata['name'] ?? ucfirst(str_replace(['-', '_', '.yml'], [' ', ' ', ''], basename($item, '.yml'))),
                    'description' => $metadata['description'] ?? null,
                    'size' => filesize($fullPath),
                    'modified' => filemtime($fullPath),
                ];
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
