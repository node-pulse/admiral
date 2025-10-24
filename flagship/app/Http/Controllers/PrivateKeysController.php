<?php

namespace App\Http\Controllers;

use App\Models\PrivateKey;
use Illuminate\Http\Request;
use Inertia\Inertia;

class PrivateKeysController extends Controller
{
    /**
     * Display SSH keys page
     */
    public function page()
    {
        return Inertia::render('ssh-keys');
    }

    /**
     * List all private keys (without private key content)
     */
    public function index(Request $request)
    {
        $query = PrivateKey::query()
            ->with(['servers' => function ($query) {
                $query->select('servers.id', 'servers.hostname', 'servers.name');
            }])
            ->withCount('servers')
            ->orderBy('created_at', 'desc');

        // Search filter
        if ($request->has('search')) {
            $search = $request->input('search');
            $query->where(function ($q) use ($search) {
                $q->where('name', 'ilike', "%{$search}%")
                    ->orWhere('description', 'ilike', "%{$search}%")
                    ->orWhere('fingerprint', 'ilike', "%{$search}%");
            });
        }

        $perPage = $request->input('per_page', 20);
        $keys = $query->paginate($perPage);

        return response()->json([
            'private_keys' => $keys->through(function ($key) {
                return [
                    'id' => $key->id,
                    'name' => $key->name,
                    'description' => $key->description,
                    'fingerprint' => $key->fingerprint,
                    'public_key' => $key->public_key,
                    'servers_count' => $key->servers_count,
                    'servers' => $key->servers->map(function ($server) {
                        return [
                            'id' => $server->id,
                            'hostname' => $server->hostname,
                            'name' => $server->name,
                            'display_name' => $server->name ?: $server->hostname,
                        ];
                    }),
                    'created_at' => $key->created_at->toIso8601String(),
                    'updated_at' => $key->updated_at->toIso8601String(),
                ];
            }),
            'meta' => [
                'current_page' => $keys->currentPage(),
                'per_page' => $keys->perPage(),
                'total' => $keys->total(),
                'last_page' => $keys->lastPage(),
            ],
        ]);
    }

    /**
     * Get a single private key details
     */
    public function show(string $id)
    {
        $key = PrivateKey::with('servers')->findOrFail($id);

        return response()->json([
            'private_key' => [
                'id' => $key->id,
                'name' => $key->name,
                'description' => $key->description,
                'fingerprint' => $key->fingerprint,
                'public_key' => $key->public_key,
                'servers' => $key->servers->map(function ($server) {
                    return [
                        'id' => $server->id,
                        'hostname' => $server->hostname,
                        'name' => $server->name,
                        'is_primary' => $server->pivot->is_primary,
                        'purpose' => $server->pivot->purpose,
                    ];
                }),
                'created_at' => $key->created_at->toIso8601String(),
                'updated_at' => $key->updated_at->toIso8601String(),
            ],
        ]);
    }

    /**
     * Generate a new SSH key pair
     */
    public function generate(Request $request)
    {
        $validated = $request->validate([
            'name' => 'required|string|max:255|unique:private_keys,name',
            'description' => 'nullable|string',
            'key_type' => 'nullable|string|in:rsa,ed25519',
            'key_size' => 'nullable|integer|in:2048,4096',
        ]);

        $keyType = $validated['key_type'] ?? 'rsa';
        $keySize = $validated['key_size'] ?? 4096;

        // Generate SSH key pair using ssh-keygen
        $tmpDir = sys_get_temp_dir();
        $keyFile = $tmpDir . '/ssh_key_' . uniqid();

        try {
            if ($keyType === 'ed25519') {
                $command = sprintf(
                    'ssh-keygen -t ed25519 -f %s -N "" -C "%s" 2>&1',
                    escapeshellarg($keyFile),
                    escapeshellarg($validated['name'])
                );
            } else {
                $command = sprintf(
                    'ssh-keygen -t rsa -b %d -f %s -N "" -C "%s" 2>&1',
                    $keySize,
                    escapeshellarg($keyFile),
                    escapeshellarg($validated['name'])
                );
            }

            exec($command, $output, $returnCode);

            if ($returnCode !== 0) {
                throw new \RuntimeException('Failed to generate SSH key: ' . implode("\n", $output));
            }

            // Read generated keys
            $privateKey = file_get_contents($keyFile);
            $publicKey = file_get_contents($keyFile . '.pub');

            // Generate fingerprint
            $fingerprintCommand = sprintf('ssh-keygen -lf %s', escapeshellarg($keyFile));
            exec($fingerprintCommand, $fingerprintOutput);
            $fingerprint = $fingerprintOutput[0] ?? null;

            // Clean up temp files
            @unlink($keyFile);
            @unlink($keyFile . '.pub');

            // Save to database
            $key = PrivateKey::create([
                'name' => $validated['name'],
                'description' => $validated['description'],
                'private_key_content' => $privateKey, // Will be auto-encrypted
                'public_key' => $publicKey,
                'fingerprint' => $fingerprint,
            ]);

            return response()->json([
                'message' => 'SSH key pair generated successfully',
                'private_key' => [
                    'id' => $key->id,
                    'name' => $key->name,
                    'fingerprint' => $key->fingerprint,
                    'public_key' => $key->public_key,
                ],
            ], 201);
        } catch (\Exception $e) {
            // Clean up temp files on error
            @unlink($keyFile);
            @unlink($keyFile . '.pub');

            return response()->json([
                'message' => 'Failed to generate SSH key',
                'error' => $e->getMessage(),
            ], 500);
        }
    }

    /**
     * Import an existing SSH private key
     */
    public function import(Request $request)
    {
        $validated = $request->validate([
            'name' => 'required|string|max:255|unique:private_keys,name',
            'description' => 'nullable|string',
            'private_key' => 'required|string',
            'public_key' => 'nullable|string',
        ]);

        try {
            // Write private key to temp file for validation and fingerprint generation
            $tmpDir = sys_get_temp_dir();
            $keyFile = $tmpDir . '/ssh_key_import_' . uniqid();
            file_put_contents($keyFile, $validated['private_key']);
            chmod($keyFile, 0600);

            // Validate the private key
            $validateCommand = sprintf('ssh-keygen -y -f %s 2>&1', escapeshellarg($keyFile));
            exec($validateCommand, $output, $returnCode);

            if ($returnCode !== 0) {
                @unlink($keyFile);
                return response()->json([
                    'message' => 'Invalid SSH private key format',
                    'error' => implode("\n", $output),
                ], 400);
            }

            // If no public key provided, derive it from private key
            $publicKey = $validated['public_key'] ?? implode("\n", $output);

            // Generate fingerprint
            $fingerprintCommand = sprintf('ssh-keygen -lf %s 2>&1', escapeshellarg($keyFile));
            exec($fingerprintCommand, $fingerprintOutput);
            $fingerprint = $fingerprintOutput[0] ?? null;

            // Clean up temp file
            @unlink($keyFile);

            // Save to database
            $key = PrivateKey::create([
                'name' => $validated['name'],
                'description' => $validated['description'],
                'private_key_content' => $validated['private_key'], // Will be auto-encrypted
                'public_key' => $publicKey,
                'fingerprint' => $fingerprint,
            ]);

            return response()->json([
                'message' => 'SSH key imported successfully',
                'private_key' => [
                    'id' => $key->id,
                    'name' => $key->name,
                    'fingerprint' => $key->fingerprint,
                    'public_key' => $key->public_key,
                ],
            ], 201);
        } catch (\Exception $e) {
            @unlink($keyFile ?? null);

            return response()->json([
                'message' => 'Failed to import SSH key',
                'error' => $e->getMessage(),
            ], 500);
        }
    }

    /**
     * Update private key metadata (not the key itself)
     */
    public function update(Request $request, string $id)
    {
        $key = PrivateKey::findOrFail($id);

        $validated = $request->validate([
            'name' => 'sometimes|string|max:255|unique:private_keys,name,' . $id,
            'description' => 'nullable|string',
        ]);

        $key->update($validated);

        return response()->json([
            'message' => 'Private key updated successfully',
            'private_key' => [
                'id' => $key->id,
                'name' => $key->name,
                'description' => $key->description,
            ],
        ]);
    }

    /**
     * Delete a private key
     */
    public function destroy(string $id)
    {
        $key = PrivateKey::findOrFail($id);

        // Check if key is in use
        if ($key->servers()->count() > 0) {
            return response()->json([
                'message' => 'Cannot delete private key that is in use by servers',
                'servers_count' => $key->servers()->count(),
            ], 400);
        }

        $key->delete();

        return response()->json([
            'message' => 'Private key deleted successfully',
        ]);
    }

    /**
     * Download the public key
     */
    public function downloadPublicKey(string $id)
    {
        $key = PrivateKey::findOrFail($id);

        return response($key->public_key, 200)
            ->header('Content-Type', 'text/plain')
            ->header('Content-Disposition', 'attachment; filename="' . $key->name . '.pub"');
    }
}
