<?php

return [
    /*
    |--------------------------------------------------------------------------
    | Flagship Domain
    |--------------------------------------------------------------------------
    |
    | The primary domain where all services are accessible.
    | Agents send metrics to: {FLAGSHIP_DOMAIN}/metrics/prometheus
    |
    */

    'flagship_domain' => env('FLAGSHIP_DOMAIN', 'localhost:8000'),

];
