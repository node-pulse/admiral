<?php

return [
    'title' => '服务器',
    'subtitle' => '管理您的服务器集群和 SSH 连接',

    'list' => [
        'search_placeholder' => '按主机名、名称或 IP 搜索...',
        'add_server' => '添加服务器',
        'no_servers' => '未找到服务器',
        'no_servers_description' => '添加您的第一台服务器以开始监控。',
        'total_servers' => '服务器总数',
        'online_servers' => '在线服务器',
        'offline_servers' => '离线服务器',
    ],

    'table' => [
        'hostname' => '主机名',
        'name' => '名称',
        'ip_address' => 'IP 地址',
        'ssh_port' => 'SSH 端口',
        'ssh_username' => 'SSH 用户',
        'status' => '状态',
        'last_seen' => '最后在线',
        'actions' => '操作',
    ],

    'status' => [
        'online' => '在线',
        'offline' => '离线',
        'unknown' => '未知',
        'unreachable' => '无法访问',
    ],

    'actions' => [
        'view_details' => '查看详情',
        'edit' => '编辑',
        'delete' => '删除',
        'open_terminal' => '打开终端',
        'manage_keys' => '管理 SSH 密钥',
        'test_connection' => '测试连接',
        'reset_host_key' => '重置主机密钥',
    ],

    'dialog' => [
        'add_title' => '添加服务器',
        'add_description' => '注册新服务器进行监控。',
        'edit_title' => '编辑服务器',
        'edit_description' => '更新服务器配置。',
        'delete_title' => '删除服务器',
        'delete_description' => '确定要删除此服务器吗？所有相关数据都将被删除。',
        'details_title' => '服务器详情',
        'manage_keys_title' => '管理 SSH 密钥',
        'manage_keys_description' => '为此服务器附加或分离 SSH 密钥。',

        'server_id_label' => '服务器 ID',
        'hostname_label' => '主机名',
        'hostname_placeholder' => 'server.example.com',
        'name_label' => '显示名称',
        'name_placeholder' => '可选的友好名称',
        'ssh_host_label' => 'SSH 主机',
        'ssh_host_placeholder' => '留空以使用主机名',
        'ssh_port_label' => 'SSH 端口',
        'ssh_port_placeholder' => '22',
        'ssh_username_label' => 'SSH 用户名',
        'ssh_username_placeholder' => 'root',
        'ssh_password_label' => 'SSH 密码',
        'ssh_password_placeholder' => '可选',

        'primary_key_label' => '主 SSH 密钥',
        'primary_key_placeholder' => '选择主密钥',
        'additional_keys_label' => '其他密钥',

        'cancel' => '取消',
        'create' => '添加服务器',
        'save' => '保存更改',
        'delete' => '删除服务器',
        'attach' => '附加密钥',
        'detach' => '分离',
        'set_primary' => '设为主密钥',
        'test' => '测试连接',
    ],

    'terminal' => [
        'workspace' => '终端工作区',
        'new_session' => '新建会话',
        'close_workspace' => '关闭工作区',
        'connecting' => '正在连接...',
        'connected' => '已连接',
        'disconnected' => '已断开',
        'connection_failed' => '连接失败',
    ],

    'messages' => [
        'server_added' => '服务器添加成功',
        'server_updated' => '服务器更新成功',
        'server_deleted' => '服务器删除成功',
        'key_attached' => 'SSH 密钥附加成功',
        'key_detached' => 'SSH 密钥分离成功',
        'primary_key_set' => '主 SSH 密钥已更新',
        'connection_success' => 'SSH 连接测试成功',
        'connection_failed' => 'SSH 连接测试失败',
        'host_key_reset' => 'SSH 主机密钥重置成功',
        'add_failed' => '添加服务器失败',
        'update_failed' => '更新服务器失败',
        'delete_failed' => '删除服务器失败',
        'test_failed' => '连接测试失败',
        'invalid_hostname' => '无效的主机名或 IP 地址',
        'invalid_port' => 'SSH 端口必须在 1 到 65535 之间',
        'duplicate_hostname' => '已存在使用此主机名的服务器',
    ],

    'filters' => [
        'all' => '全部服务器',
        'online' => '在线',
        'offline' => '离线',
        'status' => '按状态筛选',
    ],

    'metrics' => [
        'cpu' => 'CPU 使用率',
        'memory' => '内存使用率',
        'disk' => '磁盘使用率',
        'network' => '网络',
        'load' => '系统负载',
        'uptime' => '运行时间',
    ],
];
