<?php

use App\Http\Controllers\DashboardController;
use App\Http\Controllers\DeploymentsController;
use Illuminate\Support\Facades\Route;

Route::middleware(['web', 'auth'])->group(function () {
    Route::prefix('dashboard')->group(function () {
        Route::get('/stats', [DashboardController::class, 'stats']);
        Route::get('/servers', [DashboardController::class, 'servers']);
        Route::get('/metrics', [DashboardController::class, 'metrics']);
    });
});

// Deployments API routes (admin only)
Route::middleware(['web', 'auth', 'verified', 'admin'])->prefix('deployments')->group(function () {
    Route::get('/', [DeploymentsController::class, 'list']);
    Route::post('/', [DeploymentsController::class, 'store']);
    Route::get('/{id}', [DeploymentsController::class, 'show']);
    Route::post('/{id}/cancel', [DeploymentsController::class, 'cancel']);
});
