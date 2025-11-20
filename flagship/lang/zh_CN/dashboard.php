<?php

return [
    'title' => 'Admiral 仪表盘',
    'subtitle' => '集群概览',

    'stats' => [
        'total_servers' => '服务器总数',
        'online_servers' => '在线',
        'offline_servers' => '离线',
        'active_alerts' => '活跃警报',
    ],

    'metrics' => [
        'title' => '系统指标',
        'select_server' => '选择服务器以查看指标',
        'no_data' => '暂无指标数据',
        'time_range' => [
            '1h' => '过去1小时',
            '6h' => '过去6小时',
            '24h' => '过去24小时',
            '7d' => '过去7天',
            '30d' => '过去30天',
        ],
        'cpu_usage' => 'CPU 使用率',
        'memory_usage' => '内存使用率',
        'disk_usage' => '磁盘使用率',
        'network_traffic' => '网络流量',
    ],

    'processes' => [
        'title' => '运行进程',
        'no_data' => '暂无进程数据',
        'pid' => '进程ID',
        'name' => '名称',
        'user' => '用户',
        'cpu' => 'CPU %',
        'memory' => '内存 %',
        'status' => '状态',
    ],
];
