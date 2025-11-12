<?php

namespace Database\Seeders;

use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;

class AdminUserSeeder extends Seeder
{
    /**
     * Seed the initial admin user.
     *
     * This seeder is idempotent - it can be run multiple times safely.
     * If an admin user already exists, it will skip creation.
     *
     * Usage:
     *   php artisan db:seed --class=AdminUserSeeder
     *
     * Environment variables (set by deploy.sh):
     *   - ADMIN_NAME: Full name of admin user
     *   - ADMIN_EMAIL: Admin email address (used for login)
     *   - ADMIN_PASSWORD: Plain-text password (will be hashed)
     */
    public function run(): void
    {
        // SECURITY: Only allow in non-production environments or during initial setup
        // Production check: If environment is production AND users exist, abort
        if (app()->environment('production')) {
            $userCount = User::count();

            if ($userCount > 0) {
                $this->command->error('❌ Security: Cannot run AdminUserSeeder in production when users already exist');
                $this->command->error('💡 Use the admin panel to create additional admin users');

                // Exit with error code (security prevention)
                exit(1);
            }

            // Production + no users = initial setup (allowed)
            $this->command->warn('⚠️  Running in PRODUCTION mode for initial setup');
            $this->command->warn('⚠️  This should only be done during first deployment');
        }

        // Check if any users exist (idempotent check)
        $existingUserCount = User::count();
        if ($existingUserCount > 0) {
            $this->command->info("ℹ️  Admin user already exists (found {$existingUserCount} user(s) in database)");
            $this->command->info('✓ Skipping admin user creation (idempotent)');
            return;
        }

        // Read from environment variables (set in .env by deploy.sh)
        $name = env('ADMIN_NAME');
        $email = env('ADMIN_EMAIL');
        $password = env('ADMIN_PASSWORD');

        // Validate required environment variables
        if (empty($email) || empty($password)) {
            $this->command->error('❌ ADMIN_EMAIL and ADMIN_PASSWORD environment variables are required');
            $this->command->info('💡 These should be set in .env by the deployment script');

            // Exit with error code so deploy script can detect failure
            exit(1);
        }

        if (empty($name)) {
            $name = 'Administrator'; // Default fallback
        }

        // Create admin user with email verification
        try {
            $user = User::create([
                'name' => $name,
                'email' => $email,
                'password' => Hash::make($password),
                'role' => 'admin', // Set as admin user
                'email_verified_at' => now(), // Auto-verify admin email
            ]);

            $this->command->info('✓ Admin user created successfully');
            $this->command->info("  Name:  {$user->name}");
            $this->command->info("  Email: {$user->email}");
        } catch (\Exception $e) {
            $this->command->error('❌ Failed to create admin user: ' . $e->getMessage());
            throw $e;
        }
    }
}
