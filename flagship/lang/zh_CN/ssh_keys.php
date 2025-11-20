<?php

return [
    'title' => 'SSH 密钥',
    'subtitle' => '管理用于服务器认证的 SSH 私钥',

    'list' => [
        'search_placeholder' => '按名称或指纹搜索...',
        'add_key' => '添加 SSH 密钥',
        'no_keys' => '未找到 SSH 密钥',
        'no_keys_description' => '生成或导入您的第一个 SSH 密钥以开始使用。',
        'total_keys' => '密钥总数',
    ],

    'table' => [
        'name' => '名称',
        'fingerprint' => '指纹',
        'servers' => '服务器',
        'created' => '创建时间',
        'actions' => '操作',
    ],

    'actions' => [
        'view_details' => '查看详情',
        'edit' => '编辑',
        'delete' => '删除',
        'download_public' => '下载公钥',
        'copy_public' => '复制公钥',
    ],

    'dialog' => [
        'add_title' => '添加 SSH 密钥',
        'add_description' => '生成新的 SSH 密钥对或导入现有私钥。',
        'edit_title' => '编辑 SSH 密钥',
        'edit_description' => '更新 SSH 密钥信息。',
        'delete_title' => '删除 SSH 密钥',
        'delete_description' => '确定要删除此 SSH 密钥吗？此操作无法撤销。',
        'details_title' => 'SSH 密钥详情',

        'method' => '方式',
        'generate' => '生成新密钥',
        'import' => '导入现有密钥',

        'name_label' => '名称',
        'name_placeholder' => '例如：生产服务器',

        'description_label' => '描述',
        'description_placeholder' => '可选描述',

        'key_type_label' => '密钥类型',
        'key_size_label' => '密钥大小',

        'private_key_label' => '私钥',
        'private_key_placeholder' => '在此粘贴您的私钥（PEM 格式）',

        'passphrase_label' => '密码短语',
        'passphrase_placeholder' => '加密密钥的可选密码短语',

        'public_key_label' => '公钥',
        'fingerprint_label' => '指纹',
        'linked_servers_label' => '关联服务器',
        'no_servers_linked' => '此密钥未关联任何服务器',

        'cancel' => '取消',
        'generate_key' => '生成密钥',
        'import_key' => '导入密钥',
        'save' => '保存更改',
        'delete' => '删除密钥',
    ],

    'messages' => [
        'key_generated' => 'SSH 密钥生成成功',
        'key_imported' => 'SSH 密钥导入成功',
        'key_updated' => 'SSH 密钥更新成功',
        'key_deleted' => 'SSH 密钥删除成功',
        'public_key_copied' => '公钥已复制到剪贴板',
        'public_key_downloaded' => '公钥已下载',
        'generation_failed' => '生成 SSH 密钥失败',
        'import_failed' => '导入 SSH 密钥失败',
        'update_failed' => '更新 SSH 密钥失败',
        'delete_failed' => '删除 SSH 密钥失败',
        'invalid_private_key' => '私钥格式无效',
    ],
];
