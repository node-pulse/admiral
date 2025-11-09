<?php

namespace App\Http\Controllers;

use App\Services\PlaybookDownloader;
use Illuminate\Http\Request;
use Inertia\Inertia;

class PlaybooksController extends Controller
{
    protected PlaybookDownloader $downloader;

    public function __construct(PlaybookDownloader $downloader)
    {
        $this->downloader = $downloader;
    }

    /**
     * Display the playbooks management page
     */
    public function index()
    {
        return Inertia::render('playbooks/index');
    }

    /**
     * List downloaded community playbooks (API endpoint)
     */
    public function list(Request $request)
    {
        try {
            $playbooks = $this->downloader->listDownloaded();

            return response()->json([
                'playbooks' => [
                    'data' => $playbooks,
                ],
            ]);
        } catch (\Exception $e) {
            return response()->json([
                'error' => 'Failed to list downloaded playbooks',
                'message' => $e->getMessage(),
            ], 500);
        }
    }

    /**
     * Show a specific playbook by ID
     */
    public function show(string $playbookId)
    {
        try {
            $downloaded = $this->downloader->listDownloaded();

            foreach ($downloaded as $playbook) {
                if ($playbook['id'] === $playbookId) {
                    return response()->json([
                        'playbook' => $playbook,
                    ]);
                }
            }

            return response()->json([
                'error' => 'Playbook not found',
            ], 404);
        } catch (\Exception $e) {
            return response()->json([
                'error' => 'Failed to fetch playbook',
                'message' => $e->getMessage(),
            ], 500);
        }
    }

    /**
     * Browse available playbooks from registry
     */
    public function browse()
    {
        try {
            $playbooks = $this->downloader->browse();

            return response()->json([
                'playbooks' => $playbooks,
            ]);
        } catch (\Exception $e) {
            return response()->json([
                'error' => 'Failed to browse playbooks from registry',
                'message' => $e->getMessage(),
            ], 500);
        }
    }

    /**
     * Download a playbook from GitHub
     */
    public function download(Request $request)
    {
        $request->validate([
            'playbook_id' => 'required|string|regex:/^pb_[A-Za-z0-9]{10}$/',
            'source_path' => 'required|string',
        ]);

        try {
            $playbook = $this->downloader->download(
                $request->playbook_id,
                $request->source_path
            );

            return response()->json([
                'message' => 'Playbook downloaded successfully',
                'playbook' => $playbook,
            ]);
        } catch (\Exception $e) {
            return response()->json([
                'error' => 'Failed to download playbook',
                'message' => $e->getMessage(),
            ], 500);
        }
    }

    /**
     * Remove a playbook
     */
    public function remove(string $playbookId)
    {
        try {
            $this->downloader->remove($playbookId);

            return response()->json([
                'message' => 'Playbook removed successfully',
            ]);
        } catch (\Exception $e) {
            return response()->json([
                'error' => 'Failed to remove playbook',
                'message' => $e->getMessage(),
            ], 500);
        }
    }
}
