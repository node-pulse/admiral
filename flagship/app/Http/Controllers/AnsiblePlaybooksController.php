<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;

class AnsiblePlaybooksController extends Controller
{
    /**
     * Get list of available Ansible playbooks
     */
    public function index()
    {
        $playbooksPath = base_path('ansible/playbooks');

        if (!is_dir($playbooksPath)) {
            return response()->json([
                'playbooks' => [],
                'error' => 'Playbooks directory not found',
            ]);
        }

        $playbooks = [];

        // Scan for .yml files recursively
        $iterator = new \RecursiveIteratorIterator(
            new \RecursiveDirectoryIterator($playbooksPath, \RecursiveDirectoryIterator::SKIP_DOTS),
            \RecursiveIteratorIterator::SELF_FIRST
        );

        foreach ($iterator as $file) {
            if ($file->isFile() && $file->getExtension() === 'yml') {
                // Get relative path from playbooks directory
                $relativePath = str_replace($playbooksPath . '/', '', $file->getPathname());

                // Parse playbook metadata (name from first task or file comment)
                $metadata = $this->parsePlaybookMetadata($file->getPathname());

                $playbooks[] = [
                    'path' => $relativePath,
                    'name' => $metadata['name'] ?? ucfirst(str_replace(['-', '_', '.yml'], [' ', ' ', ''], basename($relativePath))),
                    'description' => $metadata['description'] ?? null,
                    'category' => dirname($relativePath),
                    'required_vars' => $metadata['required_vars'] ?? [],
                ];
            }
        }

        // Sort by category and name
        usort($playbooks, function ($a, $b) {
            $catCmp = strcmp($a['category'], $b['category']);
            return $catCmp !== 0 ? $catCmp : strcmp($a['name'], $b['name']);
        });

        return response()->json([
            'playbooks' => $playbooks,
        ]);
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
                $metadata['name'] = trim($matches[1]);
            }

            // Look for required variables marked with | mandatory
            if (preg_match_all('/(\w+):\s*["{].*?\|\s*mandatory/m', $content, $matches)) {
                $metadata['required_vars'] = $matches[1];
            }

        } catch (\Exception $e) {
            \Log::warning("Failed to parse playbook metadata: {$filePath}", ['error' => $e->getMessage()]);
        }

        return $metadata;
    }
}
