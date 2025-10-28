<?php

return [
    /*
    |--------------------------------------------------------------------------
    | Ingest Domain
    |--------------------------------------------------------------------------
    |
    | The domain where Submarines ingest service is accessible.
    | This is used as the default endpoint for agents to send metrics.
    |
    */

    'ingest_domain' => env('INGEST_DOMAIN', 'localhost:8080'),

];
