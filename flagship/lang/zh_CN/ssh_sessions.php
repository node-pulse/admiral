<?php

return [
    'title' => 'SSH 会话',
    'subtitle' => '监控和管理活跃的 SSH 连接',

    'list' => [
        'search_placeholder' => '按服务器、用户或 IP 搜索...',
        'no_sessions' => '未找到 SSH 会话',
        'no_sessions_description' => '没有活跃或最近的 SSH 会话可显示。',
        'total_sessions' => '会话总数',
        'active_sessions' => '活跃会话',
    ],

    'table' => [
        'server' => '服务器',
        'user' => '用户',
        'ip_address' => 'IP 地址',
        'started' => '开始时间',
        'ended' => '结束时间',
        'duration' => '持续时间',
        'status' => '状态',
        'actions' => '操作',
    ],

    'status' => [
        'active' => '活跃',
        'completed' => '已完成',
        'terminated' => '已终止',
        'failed' => '失败',
    ],

    'actions' => [
        'view_details' => '查看详情',
        'terminate' => '终止',
        'view_logs' => '查看日志',
    ],

    'dialog' => [
        'details_title' => 'SSH 会话详情',
        'terminate_title' => '终止 SSH 会话',
        'terminate_description' => '确定要终止此 SSH 会话吗？这将断开用户连接。',

        'session_id' => '会话 ID',
        'server_name' => '服务器',
        'username' => '用户名',
        'client_ip' => '客户端 IP',
        'client_version' => '客户端版本',
        'started_at' => '开始时间',
        'ended_at' => '结束时间',
        'duration' => '持续时间',
        'session_status' => '状态',
        'command_count' => '执行的命令数',

        'cancel' => '取消',
        'terminate' => '终止会话',
        'close' => '关闭',
    ],

    'messages' => [
        'session_terminated' => 'SSH 会话已成功终止',
        'terminate_failed' => '终止 SSH 会话失败',
        'session_not_found' => '未找到 SSH 会话',
    ],
];
