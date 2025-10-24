<?php

use Illuminate\Support\Facades\Broadcast;
use App\Models\Server;

Broadcast::channel('App.Models.User.{id}', function ($user, $id) {
    return (int) $user->id === (int) $id;
});

// SSH Terminal Channel - user must have access to the server
Broadcast::channel('ssh.{serverId}.{sessionId}', function ($user, $serverId, $sessionId) {
    $server = Server::find($serverId);

    // Check if user has access to this server
    // For now, just check if server exists and user is authenticated
    return $server !== null ? ['id' => $user->id, 'name' => $user->name] : false;
});
