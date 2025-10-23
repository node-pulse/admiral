<?php

namespace App\Providers;

use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        // migration is handled in separate migrate service
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        //
    }
}
