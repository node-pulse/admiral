<?php

namespace App\Http\Controllers;

use App\Models\Server;
use App\Models\ServerCertificate;
use App\Models\CertificateAuthority;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Validation\Rule;

/**
 * CertificateController
 *
 * Handles mTLS certificate management operations.
 * Acts as a Laravel interface to the Submarines certificate API.
 */
class CertificateController extends Controller
{
    /**
     * Submarines API base URL.
     */
    private string $submarinesUrl;

    public function __construct()
    {
        $this->submarinesUrl = config('services.submarines.url', 'http://submarines-ingest:8080');
    }

    /**
     * List all certificate authorities.
     *
     * GET /api/certificates/ca
     */
    public function listCAs(Request $request): JsonResponse
    {
        $cas = CertificateAuthority::orderBy('created_at', 'desc')->get();

        return response()->json([
            'success' => true,
            'data' => $cas,
        ]);
    }

    /**
     * Get the active certificate authority.
     *
     * GET /api/certificates/ca/active
     */
    public function getActiveCA(): JsonResponse
    {
        $ca = CertificateAuthority::active()->first();

        if (!$ca) {
            return response()->json([
                'success' => false,
                'error' => 'No active CA found',
            ], 404);
        }

        return response()->json([
            'success' => true,
            'data' => $ca,
            'active_certificates_count' => $ca->active_certificates_count,
        ]);
    }

    /**
     * Create a new certificate authority.
     *
     * POST /api/certificates/ca
     */
    public function createCA(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'name' => 'required|string|max:255',
            'validity_days' => 'integer|min:365|max:3650',
        ]);

        try {
            // Call Submarines API to generate CA
            $response = Http::timeout(30)->post("{$this->submarinesUrl}/internal/ca/create", [
                'name' => $validated['name'],
                'validity_days' => $validated['validity_days'] ?? 3650,
            ]);

            if (!$response->successful()) {
                Log::error('Failed to create CA via Submarines API', [
                    'status' => $response->status(),
                    'body' => $response->body(),
                ]);

                return response()->json([
                    'success' => false,
                    'error' => 'Failed to create CA',
                    'detail' => $response->json('error'),
                ], $response->status());
            }

            $caData = $response->json();

            return response()->json([
                'success' => true,
                'data' => $caData,
                'message' => 'Certificate Authority created successfully',
            ], 201);

        } catch (\Exception $e) {
            Log::error('Exception while creating CA', [
                'error' => $e->getMessage(),
            ]);

            return response()->json([
                'success' => false,
                'error' => 'Failed to create CA',
                'detail' => $e->getMessage(),
            ], 500);
        }
    }

    /**
     * Get certificate details for a server.
     *
     * GET /api/servers/{server}/certificate
     */
    public function getCertificate(Server $server): JsonResponse
    {
        $certificate = ServerCertificate::where('server_id', $server->server_id)
            ->where('status', 'active')
            ->orderBy('created_at', 'desc')
            ->first();

        if (!$certificate) {
            return response()->json([
                'success' => false,
                'error' => 'No active certificate found for this server',
            ], 404);
        }

        return response()->json([
            'success' => true,
            'data' => $certificate,
        ]);
    }

    /**
     * Generate a new client certificate for a server.
     *
     * POST /api/servers/{server}/certificate
     */
    public function generateCertificate(Server $server, Request $request): JsonResponse
    {
        $validated = $request->validate([
            'validity_days' => 'integer|min:1|max:365',
        ]);

        try {
            // Call Submarines API to generate certificate
            $response = Http::timeout(30)->post("{$this->submarinesUrl}/internal/certificates/generate", [
                'server_id' => $server->server_id,
                'validity_days' => $validated['validity_days'] ?? config('certificates.default_validity_days', 180),
            ]);

            if (!$response->successful()) {
                Log::error('Failed to generate certificate via Submarines API', [
                    'server_id' => $server->server_id,
                    'status' => $response->status(),
                    'body' => $response->body(),
                ]);

                return response()->json([
                    'success' => false,
                    'error' => 'Failed to generate certificate',
                    'detail' => $response->json('error'),
                ], $response->status());
            }

            $certData = $response->json();

            // Reload from database to get the latest certificate
            $certificate = ServerCertificate::where('serial_number', $certData['serial_number'])->first();

            return response()->json([
                'success' => true,
                'data' => $certificate,
                'message' => 'Certificate generated successfully',
            ], 201);

        } catch (\Exception $e) {
            Log::error('Exception while generating certificate', [
                'server_id' => $server->server_id,
                'error' => $e->getMessage(),
            ]);

            return response()->json([
                'success' => false,
                'error' => 'Failed to generate certificate',
                'detail' => $e->getMessage(),
            ], 500);
        }
    }

    /**
     * Revoke a certificate.
     *
     * DELETE /api/servers/{server}/certificate/{certificate}
     */
    public function revokeCertificate(Server $server, ServerCertificate $certificate, Request $request): JsonResponse
    {
        // Verify certificate belongs to server
        if ($certificate->server_id !== $server->server_id) {
            return response()->json([
                'success' => false,
                'error' => 'Certificate does not belong to this server',
            ], 403);
        }

        $validated = $request->validate([
            'reason' => 'nullable|string|max:255',
        ]);

        try {
            // Call Submarines API to revoke certificate
            $response = Http::timeout(30)->post("{$this->submarinesUrl}/internal/certificates/revoke", [
                'certificate_id' => $certificate->id,
                'reason' => $validated['reason'] ?? 'Manual revocation via API',
            ]);

            if (!$response->successful()) {
                Log::error('Failed to revoke certificate via Submarines API', [
                    'certificate_id' => $certificate->id,
                    'status' => $response->status(),
                    'body' => $response->body(),
                ]);

                return response()->json([
                    'success' => false,
                    'error' => 'Failed to revoke certificate',
                    'detail' => $response->json('error'),
                ], $response->status());
            }

            // Reload certificate from database
            $certificate->refresh();

            return response()->json([
                'success' => true,
                'message' => 'Certificate revoked successfully',
            ]);

        } catch (\Exception $e) {
            Log::error('Exception while revoking certificate', [
                'certificate_id' => $certificate->id,
                'error' => $e->getMessage(),
            ]);

            return response()->json([
                'success' => false,
                'error' => 'Failed to revoke certificate',
                'detail' => $e->getMessage(),
            ], 500);
        }
    }

    /**
     * Renew a certificate (generate new one, revoke old).
     *
     * POST /api/servers/{server}/certificate/renew
     */
    public function renewCertificate(Server $server, Request $request): JsonResponse
    {
        $validated = $request->validate([
            'validity_days' => 'integer|min:1|max:365',
        ]);

        try {
            // Generate new certificate
            $response = Http::timeout(30)->post("{$this->submarinesUrl}/internal/certificates/generate", [
                'server_id' => $server->server_id,
                'validity_days' => $validated['validity_days'] ?? config('certificates.default_validity_days', 180),
            ]);

            if (!$response->successful()) {
                return response()->json([
                    'success' => false,
                    'error' => 'Failed to renew certificate',
                    'detail' => $response->json('error'),
                ], $response->status());
            }

            $certData = $response->json();

            // Reload from database
            $certificate = ServerCertificate::where('serial_number', $certData['serial_number'])->first();

            return response()->json([
                'success' => true,
                'data' => $certificate,
                'message' => 'Certificate renewed successfully',
            ], 201);

        } catch (\Exception $e) {
            Log::error('Exception while renewing certificate', [
                'server_id' => $server->server_id,
                'error' => $e->getMessage(),
            ]);

            return response()->json([
                'success' => false,
                'error' => 'Failed to renew certificate',
                'detail' => $e->getMessage(),
            ], 500);
        }
    }

    /**
     * List all certificates expiring soon.
     *
     * GET /api/certificates/expiring
     */
    public function listExpiringCertificates(Request $request): JsonResponse
    {
        $days = $request->integer('days', 30);

        $certificates = ServerCertificate::expiringSoon($days)
            ->orderBy('valid_until', 'asc')
            ->get();

        return response()->json([
            'success' => true,
            'data' => $certificates,
            'threshold_days' => $days,
            'count' => $certificates->count(),
        ]);
    }

    /**
     * List all certificates for a server.
     *
     * GET /api/servers/{server}/certificates
     */
    public function listServerCertificates(Server $server): JsonResponse
    {
        $certificates = ServerCertificate::where('server_id', $server->server_id)
            ->orderBy('created_at', 'desc')
            ->get();

        return response()->json([
            'success' => true,
            'data' => $certificates,
            'count' => $certificates->count(),
        ]);
    }
}
