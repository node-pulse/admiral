<?php

return [
    'title' => '系统设置',
    'subtitle' => '管理系统级配置和首选项（仅限管理员）',

    // Security section
    'security' => [
        'title' => '安全',
        'description' => '代理连接的双向TLS (mTLS) 身份验证状态',
    ],

    // Categories for settings
    'categories' => [
        'authentication' => '身份认证',
        'data_retention' => '数据保留',
        'alerting' => '告警',
        'pro_features' => '专业版功能',
        'system' => '系统',
    ],

    // Table section
    'table' => [
        'title' => '所有设置',
        'description' => '系统级配置和首选项。设置按类别组织以便于管理',
        'setting' => '设置',
        'setting_description' => '描述',
        'current_value' => '当前值',
        'actions' => '操作',
        'enabled' => '已启用',
        'disabled' => '已禁用',
    ],

    // Actions
    'actions' => [
        'update' => '更新',
    ],

    // Messages
    'messages' => [
        'updated' => '设置更新成功',
        'update_failed' => '更新设置失败',
        'mtls_enabled' => 'mTLS 启用成功！Caddy 已重启',
        'mtls_enable_failed' => '启用 mTLS 失败',
    ],

    // mTLS section
    'mtls' => [
        'title' => 'mTLS 身份认证',
        'status_label' => '状态',
        'unreachable_warning' => '警告：无法访问 submarines ingest 服务',
        'enable' => '启用 mTLS',
        'enabling' => '启用中...',
        'about' => '关于 mTLS',
        'manual_setup' => '手动设置',
        'dialog_title' => '更改 mTLS 配置',
        'dialog_description' => 'mTLS 是构建时决策，需要重新构建 Docker 镜像',
        'confirm_enable' => '这将为所有代理连接启用 mTLS 身份验证。Caddy 将重启。是否继续？',
    ],

    // Search section
    'search' => [
        'placeholder' => '按名称、描述、类别或值搜索设置...',
        'clear' => '清除',
        'found' => '找到',
        'setting' => '项设置',
        'settings' => '项设置',
        'no_results' => '未找到匹配的设置',
    ],

    // User profile settings (kept for backward compatibility)
    'profile' => [
        'title' => '个人资料',
        'subtitle' => '更新您的个人信息',
        'name' => '姓名',
        'email' => '邮箱',
        'language' => '语言',
        'language_select' => '选择语言',
        'save' => '保存更改',
        'saved' => '个人资料更新成功',
        'email_unverified' => '您的邮箱地址尚未验证。',
        'email_verification_sent' => '新的验证链接已发送到您的邮箱。',
        'resend_verification' => '点击此处重新发送验证邮件。',
    ],

    'appearance' => [
        'title' => '外观',
        'subtitle' => '自定义您的界面',
        'theme' => '主题',
        'light' => '浅色',
        'dark' => '深色',
        'system' => '跟随系统',
    ],

    'password' => [
        'title' => '密码',
        'subtitle' => '更改您的密码',
        'current_password' => '当前密码',
        'new_password' => '新密码',
        'confirm_password' => '确认新密码',
        'save' => '更新密码',
        'saved' => '密码更新成功',
    ],

    'two_factor' => [
        'title' => '双因素认证',
        'subtitle' => '为您的账号添加额外的安全保护',
        'enabled' => '双因素认证已启用',
        'disabled' => '双因素认证已禁用',
        'enable' => '启用',
        'disable' => '禁用',
        'confirm_password' => '请确认您的密码以继续',
        'scan_qr' => '使用您的身份验证应用扫描此二维码',
        'enter_code' => '输入您的身份验证应用提供的验证码',
        'recovery_codes' => '恢复代码',
        'recovery_codes_message' => '将这些恢复代码存储在安全的位置。如果您的双因素认证设备丢失，可以使用它们恢复对您账号的访问。',
        'regenerate' => '重新生成恢复代码',
        'show_codes' => '显示恢复代码',
        'download_codes' => '下载代码',
    ],

    'delete_account' => [
        'title' => '删除账号',
        'subtitle' => '删除您的账号及其所有资源',
        'warning' => '警告',
        'warning_message' => '请谨慎操作，此操作无法撤销。',
        'button' => '删除账号',
        'dialog_title' => '您确定要删除您的账号吗？',
        'dialog_description' => '一旦您的账号被删除，其所有资源和数据也将被永久删除。请输入您的密码以确认您想要永久删除您的账号。',
        'password' => '密码',
        'cancel' => '取消',
    ],
];
