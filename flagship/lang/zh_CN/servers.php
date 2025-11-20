<?php

return [
    'title' => '服务器',
    'subtitle' => '管理您的服务器集群',

    'add_server' => '添加服务器',
    'edit_server' => '编辑服务器',
    'delete_server' => '删除服务器',
    'connect' => '连接',
    'terminal' => '终端',
    'metrics' => '指标',

    'table' => [
        'name' => '名称',
        'hostname' => '主机名',
        'ip_address' => 'IP 地址',
        'status' => '状态',
        'last_seen' => '最后在线',
        'uptime' => '运行时间',
        'cpu' => 'CPU',
        'memory' => '内存',
        'disk' => '磁盘',
        'actions' => '操作',
    ],

    'status' => [
        'online' => '在线',
        'offline' => '离线',
        'unknown' => '未知',
        'never' => '从未',
    ],

    'form' => [
        'name' => '服务器名称',
        'name_placeholder' => '例如：prod-web-01',
        'hostname' => '主机名/IP',
        'hostname_placeholder' => '例如：192.168.1.100',
        'port' => 'SSH 端口',
        'port_placeholder' => '22',
        'username' => '用户名',
        'username_placeholder' => 'root',
        'ssh_key' => 'SSH 密钥',
        'ssh_key_placeholder' => '选择 SSH 密钥',
        'description' => '描述',
        'description_placeholder' => '可选描述',
        'tags' => '标签',
        'tags_placeholder' => '例如：生产环境、网站',
    ],

    'messages' => [
        'added' => '服务器添加成功',
        'updated' => '服务器更新成功',
        'deleted' => '服务器删除成功',
        'not_found' => '未找到服务器',
        'connection_failed' => '连接失败',
        'confirm_delete' => '确定要删除此服务器吗？',
    ],

    'quick_connect' => [
        'title' => '快速连接',
        'server' => '服务器',
        'select_server' => '选择服务器',
        'connect' => '连接',
    ],
];
