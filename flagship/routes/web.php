<?php

use App\Http\Controllers\PrivateKeysController;
use App\Http\Controllers\ServersController;
use Illuminate\Support\Facades\Route;
use Inertia\Inertia;
use Laravel\Fortify\Features;

Route::get('/', function () {
    return Inertia::render('welcome', [
        'canRegister' => Features::enabled(Features::registration()),
    ]);
})->name('home');

Route::middleware(['auth', 'verified'])->group(function () {
    Route::get('dashboard', function () {
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
});

require __DIR__.'/settings.php';
