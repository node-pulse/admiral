<?php

use App\Http\Controllers\AnsiblePlaybooksController;
use App\Http\Controllers\CertificateController;
use App\Http\Controllers\DashboardController;
use App\Http\Controllers\DeploymentsController;
use Illuminate\Support\Facades\Route;

Route::middleware(['web', 'auth'])->group(function () {
    Route::prefix('dashboard')->group(function () {
        Route::get('/stats', [DashboardController::class, 'stats']);
        Route::get('/servers', [DashboardController::class, 'servers']);
        Route::get('/metrics', [DashboardController::class, 'metrics']);
    });

    Route::prefix('fleetops')->group(function () {
        Route::get('/ansible-playbooks/list', [AnsiblePlaybooksController::class, 'index']);
        Route::get('/ansible-playbooks/details/{path}', [AnsiblePlaybooksController::class, 'show'])->where('path', '.*');
    });
});

// Deployments API routes (admin only)
Route::middleware(['web', 'auth', 'verified', 'admin'])->prefix('deployments')->group(function () {
    Route::get('/', [DeploymentsController::class, 'list']);
    Route::post('/', [DeploymentsController::class, 'store']);
    Route::get('/{id}', [DeploymentsController::class, 'show']);
    Route::post('/{id}/cancel', [DeploymentsController::class, 'cancel']);
});

// Certificate Management API routes (admin only)
Route::middleware(['web', 'auth', 'verified', 'admin'])->prefix('certificates')->group(function () {
    // Certificate Authority management
    Route::get('/ca', [CertificateController::class, 'listCAs']);
    Route::get('/ca/active', [CertificateController::class, 'getActiveCA']);
    Route::post('/ca', [CertificateController::class, 'createCA']);

    // Certificate expiration monitoring
    Route::get('/expiring', [CertificateController::class, 'listExpiringCertificates']);
});

// Server Certificate Management API routes (admin only)
Route::middleware(['web', 'auth', 'verified', 'admin'])->prefix('servers')->group(function () {
    // Certificate operations for specific server
    Route::get('/{server}/certificate', [CertificateController::class, 'getCertificate']);
    Route::post('/{server}/certificate', [CertificateController::class, 'generateCertificate']);
    Route::delete('/{server}/certificate/{certificate}', [CertificateController::class, 'revokeCertificate']);
    Route::post('/{server}/certificate/renew', [CertificateController::class, 'renewCertificate']);
    Route::get('/{server}/certificates', [CertificateController::class, 'listServerCertificates']);
});
