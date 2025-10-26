<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Symfony\Component\Process\Process;

class AnsibleInventoryCommand extends Command
{
    protected $signature = 'ansible:inventory
                            {--server-ids= : Comma-separated server IDs}
                            {--tags= : Comma-separated tags}
                            {--status= : Filter by status}';

    protected $description = 'Generate and display Ansible inventory';

    public function handle()
    {
        $inventoryScript = base_path('../ansible/inventory/dynamic.php');

        if (!file_exists($inventoryScript)) {
            $this->error('Inventory script not found. Run: php artisan ansible:init');
            return 1;
        }

        $env = [];

        if ($serverIds = $this->option('server-ids')) {
            $env['ANSIBLE_SERVER_IDS'] = $serverIds;
        }

        if ($tags = $this->option('tags')) {
            $env['ANSIBLE_TAGS'] = $tags;
        }

        if ($status = $this->option('status')) {
            $env['ANSIBLE_STATUS'] = $status;
        }

        $process = new Process([$inventoryScript, '--list'], null, $env);
        $process->run();

        if (!$process->isSuccessful()) {
            $this->error('Failed to generate inventory:');
            $this->error($process->getErrorOutput());
            return 1;
        }

        $this->info('Ansible Inventory:');
        $this->line($process->getOutput());

        return 0;
    }
}
