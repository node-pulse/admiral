<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\File;

class AnsibleInitCommand extends Command
{
    protected $signature = 'ansible:init';
    protected $description = 'Initialize Ansible directory structure';

    public function handle()
    {
        $basePath = base_path('../ansible');

        $directories = [
            'inventory',
            'playbooks',
            'roles/nodepulse-agent/tasks',
            'roles/nodepulse-agent/templates',
            'roles/nodepulse-agent/files',
            'roles/nodepulse-agent/handlers',
            'roles/nodepulse-agent/vars',
            'roles/nodepulse-agent/defaults',
            'group_vars',
            'host_vars',
        ];

        foreach ($directories as $dir) {
            $path = "$basePath/$dir";
            if (!File::exists($path)) {
                File::makeDirectory($path, 0755, true);
                $this->info("Created: $path");
            } else {
                $this->comment("Already exists: $path");
            }
        }

        // Create .gitkeep files in empty directories
        $gitkeepDirs = [
            'host_vars',
            'roles/nodepulse-agent/files',
        ];

        foreach ($gitkeepDirs as $dir) {
            $path = "$basePath/$dir/.gitkeep";
            if (!File::exists($path)) {
                File::put($path, '');
                $this->info("Created .gitkeep in: $dir");
            }
        }

        $this->info('Ansible directory structure initialized successfully!');

        return 0;
    }
}
