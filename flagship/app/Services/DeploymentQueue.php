<?php

namespace App\Services;

use App\Models\Deployment;
use Illuminate\Support\Facades\Redis;

class DeploymentQueue
{
    private const STREAM_KEY = 'nodepulse:deployments:stream';
    private const MAX_STREAM_BACKLOG = 2000; // Reject new deployments if stream has more than this many pending

    /**
     * Publish deployment job to Valkey stream
     *
     * @param Deployment $deployment
     * @param array $serverIds
     * @param array $extraVars
     * @return string Stream message ID
     * @throws \Exception if stream is overloaded
     */
    public static function publish(Deployment $deployment, array $serverIds, array $extraVars): string
    {
        // Check stream backlog before adding (backpressure protection)
        $streamLength = Redis::xLen(self::STREAM_KEY);
        if ($streamLength >= self::MAX_STREAM_BACKLOG) {
            throw new \Exception("Deployment queue is overloaded ({$streamLength} pending jobs). Please try again later.");
        }

        $message = [
            'deployment_id' => $deployment->id,
            'playbook' => $deployment->playbook,
            'server_ids' => json_encode($serverIds),
            // Encode as object {} instead of array [] when empty
            'variables' => json_encode((object) $extraVars),
            'timestamp' => now()->toIso8601String(),
        ];

        // XADD to Valkey stream WITHOUT MAXLEN (no auto-trimming to prevent data loss)
        // Messages are removed only after deployer workers ACK them
        $messageId = Redis::xAdd(
            self::STREAM_KEY,
            '*', // Auto-generate ID
            $message
        );

        \Log::info('Published deployment to Valkey stream', [
            'deployment_id' => $deployment->id,
            'stream_key' => self::STREAM_KEY,
            'message_id' => $messageId,
            'stream_length' => $streamLength + 1,
        ]);

        return $messageId;
    }

    /**
     * Get stream info for monitoring
     *
     * @return array
     */
    public static function getStreamInfo(): array
    {
        try {
            $info = Redis::xInfo('STREAM', self::STREAM_KEY);

            return [
                'stream_key' => self::STREAM_KEY,
                'length' => $info['length'] ?? 0,
                'first_entry' => $info['first-entry'] ?? null,
                'last_entry' => $info['last-entry'] ?? null,
            ];
        } catch (\Exception $e) {
            return [
                'stream_key' => self::STREAM_KEY,
                'error' => $e->getMessage(),
            ];
        }
    }

    /**
     * Get pending jobs count
     *
     * @return int
     */
    public static function getPendingCount(): int
    {
        try {
            $info = Redis::xInfo('STREAM', self::STREAM_KEY);
            return $info['length'] ?? 0;
        } catch (\Exception $e) {
            return 0;
        }
    }
}
