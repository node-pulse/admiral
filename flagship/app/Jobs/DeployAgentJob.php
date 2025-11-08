<?php

namespace App\Jobs;

use App\Models\Deployment;
use App\Models\DeploymentServer;
use App\Services\AnsibleService;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Log;

class DeployAgentJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public $timeout = 3600; // 1 hour
    public $tries = 1;      // No retries for deployments

    public function __construct(
        private Deployment $deployment,
        private array $serverIds,
        private array $variables = []
    ) {
        $this->onQueue('deployments');
    }

    public function handle(AnsibleService $ansible): void
    {
        Log::info("Starting agent deployment", [
            'deployment_id' => $this->deployment->id,
            'servers' => count($this->serverIds),
        ]);

        // Create deployment server records
        foreach ($this->serverIds as $serverId) {
            DeploymentServer::create([
                'deployment_id' => $this->deployment->id,
                'server_id' => $serverId,
                'status' => 'pending',
            ]);
        }

        // Update total servers count
        $this->deployment->update([
            'total_servers' => count($this->serverIds),
        ]);

        try {
            // Run Ansible playbook (use playbook from deployment record)
            $success = $ansible->runPlaybook(
                $this->deployment,
                $this->deployment->playbook,
                $this->serverIds,
                $this->variables
            );

            if ($success) {
                Log::info("Deployment completed successfully", [
                    'deployment_id' => $this->deployment->id,
                ]);
            } else {
                Log::warning("Deployment completed with errors", [
                    'deployment_id' => $this->deployment->id,
                ]);
            }
        } catch (\Exception $e) {
            Log::error("Deployment failed", [
                'deployment_id' => $this->deployment->id,
                'error' => $e->getMessage(),
            ]);

            $this->deployment->update([
                'status' => 'failed',
                'completed_at' => now(),
                'error_output' => $e->getMessage(),
            ]);

            throw $e;
        }
    }

    public function failed(\Throwable $exception): void
    {
        Log::error("Deployment job failed", [
            'deployment_id' => $this->deployment->id,
            'exception' => $exception->getMessage(),
        ]);

        $this->deployment->update([
            'status' => 'failed',
            'completed_at' => now(),
            'error_output' => $exception->getMessage(),
        ]);
    }
}
