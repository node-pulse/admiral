<?php

namespace App\Providers;

use Illuminate\Database\Migrations\Migrator;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        // Disable Laravel's built-in migration system
        // Database migrations are managed centrally in /migrate using node-pg-migrate
        $this->app->extend(Migrator::class, function ($migrator) {
            // Override the paths method to return empty array (no migration paths)
            $migrator->paths([]);
            return $migrator;
        });
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        //
    }
}
