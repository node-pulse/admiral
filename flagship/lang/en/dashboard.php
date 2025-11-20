<?php

return [
    'title' => 'Admiral Dashboard',
    'subtitle' => 'Fleet Overview',

    'stats' => [
        'total_servers' => 'Total Servers',
        'online_servers' => 'Online',
        'offline_servers' => 'Offline',
        'active_alerts' => 'Active Alerts',
    ],

    'metrics' => [
        'title' => 'System Metrics',
        'select_server' => 'Select servers to view metrics',
        'no_data' => 'No metrics data available',
        'time_range' => [
            '1h' => 'Last Hour',
            '6h' => 'Last 6 Hours',
            '24h' => 'Last 24 Hours',
            '7d' => 'Last 7 Days',
            '30d' => 'Last 30 Days',
        ],
        'cpu_usage' => 'CPU Usage',
        'memory_usage' => 'Memory Usage',
        'disk_usage' => 'Disk Usage',
        'network_traffic' => 'Network Traffic',
    ],

    'processes' => [
        'title' => 'Running Processes',
        'no_data' => 'No process data available',
        'pid' => 'PID',
        'name' => 'Name',
        'user' => 'User',
        'cpu' => 'CPU %',
        'memory' => 'Memory %',
        'status' => 'Status',
    ],
];
