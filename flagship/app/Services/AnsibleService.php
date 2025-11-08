<?php

namespace App\Services;

use App\Models\Deployment;
use App\Models\DeploymentServer;
use Illuminate\Support\Facades\Log;
use Symfony\Component\Process\Process;

class AnsibleService
{
    private string $ansiblePath;
    private string $playbookPath;
    private string $inventoryPath;

    public function __construct()
    {
        $this->ansiblePath = base_path('ansible');
        $this->playbookPath = base_path('ansible');
        $this->inventoryPath = base_path('ansible/inventory/dynamic.php');
    }

    /**
     * Run an Ansible playbook
     */
    public function runPlaybook(
        Deployment $deployment,
        string $playbook,
        array $serverIds = [],
        array $extraVars = []
    ): bool {
        // Update deployment status
        $deployment->update([
            'status' => 'running',
            'started_at' => now(),
        ]);

        // Build Ansible command
        $command = $this->buildCommand($playbook, $serverIds, $extraVars);

        Log::info("Running Ansible playbook", [
            'deployment_id' => $deployment->id,
            'playbook' => $playbook,
            'command' => $command,
        ]);

        // Execute Ansible
        $process = new Process(
            $command,
            $this->ansiblePath,
            $this->buildEnvironment($serverIds),
            null,
            3600  // 1 hour timeout
        );

        // Start the process and track PID for cancellation
        $process->start();

        // Store process ID in cache for cancellation
        cache()->put("deployment:{$deployment->id}:process_id", $process->getPid(), 3600);

        $output = '';
        $errorOutput = '';

        $process->wait(function ($type, $buffer) use (&$output, &$errorOutput, $deployment) {
            if (Process::ERR === $type) {
                $errorOutput .= $buffer;
            } else {
                $output .= $buffer;
            }

            // Parse Ansible output and update progress
            $this->parseAnsibleOutput($buffer, $deployment);
        });

        // Update deployment with results
        $deployment->update([
            'status' => $process->isSuccessful() ? 'completed' : 'failed',
            'completed_at' => now(),
            'output' => $output,
            'error_output' => $errorOutput,
        ]);

        // Parse final stats
        $this->parseFinalStats($output, $deployment);

        return $process->isSuccessful();
    }

    /**
     * Build Ansible command
     */
    private function buildCommand(string $playbook, array $serverIds, array $extraVars): array
    {
        $command = [
            'ansible-playbook',
            "{$this->playbookPath}/{$playbook}",
            '-i', $this->inventoryPath,
            '--timeout=30',
        ];

        // Add extra vars
        if (!empty($extraVars)) {
            $command[] = '--extra-vars';
            $command[] = json_encode($extraVars);
        }

        return $command;
    }

    /**
     * Build environment variables for Ansible
     */
    private function buildEnvironment(array $serverIds = []): array
    {
        $env = array_merge($_ENV, [
            'ANSIBLE_CONFIG' => base_path('ansible/ansible.cfg'),
            'ANSIBLE_FORCE_COLOR' => 'true',
            'ANSIBLE_HOST_KEY_CHECKING' => 'False',
        ]);

        if (!empty($serverIds)) {
            $env['ANSIBLE_SERVER_IDS'] = implode(',', $serverIds);
        }

        return $env;
    }

    /**
     * Parse Ansible output for progress updates
     */
    private function parseAnsibleOutput(string $buffer, Deployment $deployment): void
    {
        // Parse task execution
        if (preg_match('/TASK \[(.*?)\]/', $buffer, $matches)) {
            Log::debug("Ansible task", [
                'deployment_id' => $deployment->id,
                'task' => $matches[1],
            ]);
        }

        // Parse host results (ok, changed, failed)
        if (preg_match('/(ok|changed|failed|skipped):\s+\[(.*?)\]/', $buffer, $matches)) {
            $status = $matches[1];
            $hostname = $matches[2];

            // Find the server and update status
            $server = $deployment->servers()
                ->where('hostname', $hostname)
                ->first();

            if ($server) {
                DeploymentServer::where('deployment_id', $deployment->id)
                    ->where('server_id', $server->id)
                    ->update([
                        'status' => $this->mapAnsibleStatus($status),
                        'changed' => $status === 'changed',
                    ]);
            }
        }
    }

    /**
     * Parse final Ansible stats
     */
    private function parseFinalStats(string $output, Deployment $deployment): void
    {
        // Parse recap section
        // Example:
        // PLAY RECAP *****
        // server1 : ok=5 changed=2 unreachable=0 failed=0 skipped=0 rescued=0 ignored=0

        $stats = [
            'successful_servers' => 0,
            'failed_servers' => 0,
            'skipped_servers' => 0,
        ];

        if (preg_match_all('/(\S+)\s+:\s+ok=(\d+).*?failed=(\d+).*?skipped=(\d+)/', $output, $matches, PREG_SET_ORDER)) {
            foreach ($matches as $match) {
                $hostname = $match[1];
                $ok = (int) $match[2];
                $failed = (int) $match[3];
                $skipped = (int) $match[4];

                if ($failed > 0) {
                    $stats['failed_servers']++;
                } elseif ($skipped > 0) {
                    $stats['skipped_servers']++;
                } else {
                    $stats['successful_servers']++;
                }
            }
        }

        $deployment->update($stats);
    }

    /**
     * Map Ansible status to our status
     */
    private function mapAnsibleStatus(string $ansibleStatus): string
    {
        return match($ansibleStatus) {
            'ok', 'changed' => 'success',
            'failed' => 'failed',
            'skipped' => 'skipped',
            default => 'pending',
        };
    }

    /**
     * Test Ansible connectivity
     */
    public function testConnection(array $serverIds = []): array
    {
        $command = [
            'ansible',
            'all',
            '-i', $this->inventoryPath,
            '-m', 'ping',
            '--timeout=10',
        ];

        $process = new Process(
            $command,
            $this->ansiblePath,
            $this->buildEnvironment($serverIds)
        );

        $process->run();

        return [
            'success' => $process->isSuccessful(),
            'output' => $process->getOutput(),
            'error' => $process->getErrorOutput(),
        ];
    }
}
