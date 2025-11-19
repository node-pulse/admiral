<?php

namespace App\Http\Controllers;

use App\Models\CertificateAuthority;
use App\Models\Setting;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Process;
use Inertia\Inertia;
use Inertia\Response;

class SystemSettingsController extends Controller
{
    /**
     * Display the settings page.
     */
    public function index(): Response
    {
        $settings = Setting::all()->map(function ($setting) {
            // Parse JSONB value for frontend
            $value = $setting->value;

            // Handle boolean values
            if ($value === 'true') {
                $parsedValue = true;
            } elseif ($value === 'false') {
                $parsedValue = false;
            } elseif ($value === 'null') {
                $parsedValue = null;
            } else {
                // Try to decode JSON
                $decoded = json_decode($value, true);
                $parsedValue = json_last_error() === JSON_ERROR_NONE ? $decoded : $value;
            }

            return [
                'key' => $setting->key,
                'value' => $parsedValue,
                'description' => $setting->description,
                'tier' => $setting->tier,
            ];
        });

        // Check mTLS status from submarines health endpoint
        $mtlsStatus = $this->getMtlsStatus();

        return Inertia::render('system-settings', [
            'settings' => $settings,
            'mtls' => $mtlsStatus,
        ]);
    }

    /**
     * Check if mTLS is actually configured (CA exists).
     */
    private function getMtlsStatus(): array
    {
        try {
            // Check if Submarines is reachable
            $response = Http::timeout(3)->get(config('services.submarines.url') . '/health');

            if (!$response->successful()) {
                return ['status' => 'Unreachable', 'reachable' => false, 'enabled' => false];
            }

            // Check if CA certificate exists (the real indicator of mTLS being configured)
            $caCertPath = base_path('../secrets/certs/ca.crt');
            $caExists = file_exists($caCertPath) && filesize($caCertPath) > 0;

            // Also check if there's an active CA in the database
            $activeCA = CertificateAuthority::active()->first();

            $isConfigured = $caExists && $activeCA !== null;

            return [
                'enabled' => $isConfigured,
                'status' => $isConfigured ? 'Enabled' : 'Disabled',
                'reachable' => true,
            ];

        } catch (\Exception $e) {
            return ['status' => 'Unreachable', 'reachable' => false, 'enabled' => false];
        }
    }

    /**
     * Update a setting.
     */
    public function update(Request $request, string $key)
    {
        $request->validate([
            'value' => 'required',
        ]);

        $setting = Setting::findOrFail($key);

        // Convert value to appropriate JSON string format
        $value = $request->input('value');

        if (is_bool($value)) {
            $jsonValue = $value ? 'true' : 'false';
        } elseif (is_null($value)) {
            $jsonValue = 'null';
        } elseif (is_array($value) || is_object($value)) {
            $jsonValue = json_encode($value);
        } else {
            $jsonValue = $value;
        }

        $setting->value = $jsonValue;
        $setting->save();

        return back()->with('success', 'Setting updated successfully');
    }

    /**
     * Toggle a boolean setting.
     */
    public function toggle(Request $request, string $key)
    {
        $setting = Setting::findOrFail($key);

        // Get current value
        $currentValue = $setting->value;

        // Toggle boolean value
        $newValue = ($currentValue === 'true') ? 'false' : 'true';

        $setting->value = $newValue;
        $setting->save();

        return back()->with('success', 'Setting toggled successfully');
    }

    /**
     * Enable mTLS authentication.
     * This performs the same actions as scripts/setup-mtls.sh but via the UI.
     */
    public function enableMtls(Request $request): JsonResponse
    {
        try {
            // 1. Check if CA already exists
            $activeCA = CertificateAuthority::active()->first();

            if ($activeCA) {
                return response()->json([
                    'success' => false,
                    'error' => 'mTLS is already enabled with an active CA',
                ], 400);
            }

            // 2. Call Submarines API to create CA
            $submarinesUrl = config('services.submarines.url', 'http://submarines-ingest:8080');

            $response = Http::timeout(60)->post("{$submarinesUrl}/internal/ca/create", [
                'name' => 'Node Pulse Production CA',
                'validity_days' => 3650, // 10 years
            ]);

            if (!$response->successful()) {
                throw new \Exception('Failed to create CA: ' . $response->json('error'));
            }

            $caData = $response->json();

            // 3. Export CA certificate to filesystem
            $caCertPath = base_path('../secrets/certs/ca.crt');
            $certDir = dirname($caCertPath);

            if (!is_dir($certDir)) {
                mkdir($certDir, 0755, true);
            }

            file_put_contents($caCertPath, $caData['certificate_pem']);
            chmod($caCertPath, 0644);

            // 4. Update compose.yml (uncomment CA cert mount)
            $this->uncommentComposeVolume();

            // 5. Update Caddyfile.prod (uncomment TLS block)
            $this->uncommentCaddyfileTls();

            // 6. Restart Caddy container
            $this->restartCaddyContainer();

            return response()->json([
                'success' => true,
                'message' => 'mTLS enabled successfully. Caddy has been restarted.',
                'ca' => [
                    'id' => $caData['id'],
                    'name' => $caData['name'],
                    'valid_until' => $caData['valid_until'],
                ],
            ]);

        } catch (\Exception $e) {
            Log::error('Failed to enable mTLS', [
                'error' => $e->getMessage(),
                'trace' => $e->getTraceAsString(),
            ]);

            return response()->json([
                'success' => false,
                'error' => 'Failed to enable mTLS',
                'detail' => $e->getMessage(),
            ], 500);
        }
    }

    /**
     * Uncomment CA certificate mount in compose.yml
     */
    private function uncommentComposeVolume(): void
    {
        $composePath = base_path('../compose.yml');

        if (!file_exists($composePath)) {
            throw new \Exception('compose.yml not found');
        }

        $content = file_get_contents($composePath);

        // Uncomment: # - ./secrets/certs/ca.crt:/certs/ca.crt:ro
        $content = preg_replace(
            '/^(\s*)# - \.\/secrets\/certs\/ca\.crt:\/certs\/ca\.crt:ro/m',
            '$1- ./secrets/certs/ca.crt:/certs/ca.crt:ro',
            $content
        );

        file_put_contents($composePath, $content);
    }

    /**
     * Uncomment mTLS TLS block in Caddyfile.prod
     */
    private function uncommentCaddyfileTls(): void
    {
        $caddyfilePath = base_path('../caddy/Caddyfile.prod');

        if (!file_exists($caddyfilePath)) {
            throw new \Exception('Caddyfile.prod not found');
        }

        $content = file_get_contents($caddyfilePath);

        // Uncomment TLS block (lines starting with # followed by tls content)
        // Pattern: # tls { ... }
        $content = preg_replace('/^(\s*)# (tls \{)/m', '$1$2', $content);
        $content = preg_replace('/^(\s*)# (    client_auth \{)/m', '$1$2', $content);
        $content = preg_replace('/^(\s*)# (        mode require_and_verify)/m', '$1$2', $content);
        $content = preg_replace('/^(\s*)# (        trusted_ca_cert_file \/certs\/ca\.crt)/m', '$1$2', $content);
        $content = preg_replace('/^(\s*)# (    \})/m', '$1$2', $content);
        $content = preg_replace('/^(\s*)# (\})/m', '$1$2', $content);

        file_put_contents($caddyfilePath, $content);
    }

    /**
     * Restart Caddy container using Docker Compose
     */
    private function restartCaddyContainer(): void
    {
        $projectRoot = base_path('..');

        // Run: docker compose restart caddy
        $result = Process::run([
            'docker', 'compose', '-f', "{$projectRoot}/compose.yml",
            'restart', 'caddy'
        ]);

        if (!$result->successful()) {
            throw new \Exception('Failed to restart Caddy: ' . $result->errorOutput());
        }
    }

    /**
     * Disable mTLS authentication.
     * Note: This is not supported in production builds.
     */
    public function disableMtls(Request $request): JsonResponse
    {
        return response()->json([
            'success' => false,
            'error' => 'Disabling mTLS is not supported in production builds',
            'detail' => 'mTLS is a build-time decision and cannot be disabled without rebuilding with development Dockerfile',
        ], 400);
    }
}
