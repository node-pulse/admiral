<?php

use App\Http\Controllers\PlaybooksController;
use App\Http\Controllers\PrivateKeysController;
use App\Http\Controllers\ServersController;
use App\Http\Controllers\SystemSettingsController;
use App\Http\Controllers\SshSessionsController;
use App\Http\Controllers\UsersController;
use Illuminate\Support\Facades\Route;
use Inertia\Inertia;

Route::get('/', function () {
    // Check registration_enabled from database settings
    $registrationEnabled = \App\Models\Setting::isEnabled('registration_enabled', false);

    return Inertia::render('welcome', [
        'canRegister' => $registrationEnabled,
    ]);
})->name('home');

// Override Fortify's password reset link request to add CAPTCHA validation
Route::post('/forgot-password', [\App\Http\Controllers\Auth\PasswordResetLinkController::class, 'store'])
    ->middleware('guest')
    ->name('password.email');

Route::middleware(['auth', 'verified'])->group(function () {
    Route::prefix('dashboard')->group(function () {
        Route::get('/', function () {
            return Inertia::render('dashboard');
        })->name('dashboard');

        // Servers management
        Route::prefix('servers')->group(function () {
            Route::get('/', [ServersController::class, 'index'])->name('servers');
            Route::get('/list', [ServersController::class, 'list'])->name('servers.list');
            Route::get('/{id}', [ServersController::class, 'show'])->name('servers.show');
            Route::post('/', [ServersController::class, 'store'])->name('servers.store');
            Route::put('/{id}', [ServersController::class, 'update'])->name('servers.update');
            Route::delete('/{id}', [ServersController::class, 'destroy'])->name('servers.destroy');

            // SSH key management
            Route::post('/{id}/keys', [ServersController::class, 'attachKey'])->name('servers.attach-key');
            Route::delete('/{serverId}/keys/{keyId}', [ServersController::class, 'detachKey'])->name('servers.detach-key');

            // SSH connection testing
            Route::post('/{id}/test-connection', [ServersController::class, 'testConnection'])->name('servers.test-connection');

            // SSH host key management
            Route::post('/{id}/reset-host-key', [ServersController::class, 'resetHostKey'])->name('servers.reset-host-key');
        });

        // SSH Keys management
        Route::prefix('ssh-keys')->group(function () {
            Route::get('/', [PrivateKeysController::class, 'page'])->name('ssh-keys');
            Route::get('/list', [PrivateKeysController::class, 'index'])->name('ssh-keys.index');
            Route::get('/{id}', [PrivateKeysController::class, 'show'])->name('ssh-keys.show');
            Route::post('/generate', [PrivateKeysController::class, 'generate'])->name('ssh-keys.generate');
            Route::post('/import', [PrivateKeysController::class, 'import'])->name('ssh-keys.import');
            Route::put('/{id}', [PrivateKeysController::class, 'update'])->name('ssh-keys.update');
            Route::delete('/{id}', [PrivateKeysController::class, 'destroy'])->name('ssh-keys.destroy');
            Route::get('/{id}/download-public', [PrivateKeysController::class, 'downloadPublicKey'])->name('ssh-keys.download-public');
        });

        // SSH Sessions management
        Route::prefix('ssh-sessions')->group(function () {
            Route::get('/', [SshSessionsController::class, 'page'])->name('ssh-sessions');
            Route::get('/list', [SshSessionsController::class, 'index'])->name('ssh-sessions.index');
            Route::get('/{id}', [SshSessionsController::class, 'show'])->name('ssh-sessions.show');
            Route::post('/{id}/terminate', [SshSessionsController::class, 'terminate'])->name('ssh-sessions.terminate');
        });
    });
});

// Admin-only routes
Route::middleware(['auth', 'verified', 'admin'])->prefix('dashboard')->group(function () {
    // System settings management (admin only)
    Route::prefix('system-settings')->group(function () {
        Route::get('/', [SystemSettingsController::class, 'index'])->name('system-settings');
        Route::put('/{key}', [SystemSettingsController::class, 'update'])->name('system-settings.update');
        Route::post('/{key}/toggle', [SystemSettingsController::class, 'toggle'])->name('system-settings.toggle');
    });

    // Deployments management (admin only)
    Route::prefix('deployments')->group(function () {
        Route::get('/', [\App\Http\Controllers\DeploymentsController::class, 'index'])->name('deployments');
        Route::get('/create', [\App\Http\Controllers\DeploymentsController::class, 'create'])->name('deployments.create');
        Route::get('/{id}/details', [\App\Http\Controllers\DeploymentsController::class, 'details'])->name('deployments.details');
    });

    // Users management (admin only)
    Route::get('/users', [UsersController::class, 'index'])->name('users');

    // Community Playbooks management (admin only)
    Route::prefix('playbooks')->group(function () {
        Route::get('/', [PlaybooksController::class, 'index'])->name('playbooks');
    });

    // Ansible Playbooks management (admin only)
    Route::prefix('ansible-playbooks')->group(function () {
        Route::get('/', [\App\Http\Controllers\AnsiblePlaybooksController::class, 'page'])->name('ansible-playbooks');
    });
});

require __DIR__.'/settings.php';
