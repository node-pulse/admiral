<?php

use App\Http\Controllers\AnsiblePlaybooksController;
use App\Http\Controllers\CertificateController;
use App\Http\Controllers\CustomPlaybooksController;
use App\Http\Controllers\DashboardController;
use App\Http\Controllers\DeploymentsController;
use App\Http\Controllers\LocaleController;
use App\Http\Controllers\PlaybooksController;
use App\Http\Controllers\ProcessController;
use App\Http\Controllers\UsersController;
use Illuminate\Support\Facades\Route;

Route::middleware(['web', 'auth'])->group(function () {
    Route::prefix('dashboard')->group(function () {
        Route::get('/stats', [DashboardController::class, 'stats']);
        Route::get('/servers', [DashboardController::class, 'servers']);
        Route::get('/metrics', [DashboardController::class, 'metrics']);
    });

    // Process monitoring
    Route::prefix('processes')->group(function () {
        Route::get('/top', [ProcessController::class, 'top']);
    });

    // Locale management
    Route::prefix('locale')->group(function () {
        Route::get('/available', [LocaleController::class, 'available']);
        Route::post('/update', [LocaleController::class, 'update']);
    });

    Route::prefix('fleetops')->group(function () {
        Route::get('/ansible-playbooks/list', [AnsiblePlaybooksController::class, 'index']);
        Route::get('/ansible-playbooks/details/{path}', [AnsiblePlaybooksController::class, 'show'])->where('path', '.*');
    });
});

// Community Playbooks API routes (admin only)
Route::middleware(['web', 'auth', 'verified', 'admin'])->prefix('playbooks')->group(function () {
    Route::get('/', [PlaybooksController::class, 'list']);
    Route::get('/browse', [PlaybooksController::class, 'browse']);  // Browse registry catalog
    Route::get('/updates', [PlaybooksController::class, 'checkUpdates']);  // Check for updates
    Route::get('/{playbookId}', [PlaybooksController::class, 'show']);
    Route::post('/download', [PlaybooksController::class, 'download']);
    Route::post('/update-all', [PlaybooksController::class, 'updateAll']);  // Update all playbooks
    Route::post('/{playbookId}/update', [PlaybooksController::class, 'updatePlaybook']);  // Update specific playbook
    Route::delete('/{playbookId}', [PlaybooksController::class, 'remove']);
});

// Custom Playbooks API routes (admin only)
Route::middleware(['web', 'auth', 'verified', 'admin'])->prefix('custom-playbooks')->group(function () {
    Route::post('/upload', [CustomPlaybooksController::class, 'upload']);
    Route::post('/upload-to-directory', [CustomPlaybooksController::class, 'uploadToDirectory']);
    Route::post('/create-directory', [CustomPlaybooksController::class, 'createDirectory']);
    Route::delete('/delete', [CustomPlaybooksController::class, 'delete']);
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

// Users Management API routes (admin only)
Route::middleware(['web', 'auth', 'verified', 'admin'])->prefix('users')->group(function () {
    Route::get('/', [UsersController::class, 'list']);
    Route::post('/', [UsersController::class, 'store']);
    Route::patch('/{user}/status', [UsersController::class, 'updateStatus']);
    Route::patch('/{user}/role', [UsersController::class, 'updateRole']);
    Route::delete('/{user}', [UsersController::class, 'destroy']);
});
