<?php

use App\Http\Controllers\DashboardController;
use Illuminate\Support\Facades\Route;

Route::middleware(['web', 'auth'])->group(function () {
    Route::prefix('dashboard')->group(function () {
        Route::get('/stats', [DashboardController::class, 'stats']);
        Route::get('/servers', [DashboardController::class, 'servers']);
        Route::get('/metrics', [DashboardController::class, 'metrics']);
    });
});
