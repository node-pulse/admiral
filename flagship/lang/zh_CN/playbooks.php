<?php

return [
    'title' => '社区剧本',
    'subtitle' => '浏览并下载社区目录中的 Ansible 剧本',

    'search' => [
        'placeholder' => '搜索剧本...',
        'categories' => '分类',
    ],

    'actions' => [
        'check_updates' => '检查更新',
        'download' => '下载',
        'downloaded' => '已下载',
        'update_available' => '有更新',
        'update_all' => '全部更新',
    ],

    'messages' => [
        'download_success' => '下载成功',
        'download_failed' => '下载剧本失败',
        'update_success' => '更新成功',
        'update_failed' => '更新剧本失败',
        'remove_success' => '移除成功',
        'remove_failed' => '移除剧本失败',
        'fetch_failed' => '无法从仓库获取剧本',
        'invalid_source_path' => '无效的剧本源路径',
        'no_updates_available' => '没有可用更新',
        'update_all_success' => '成功更新了 {count} 个剧本',
        'update_all_failed' => '更新 {count} 个剧本失败',
        'update_all_error' => '无法更新剧本',
        'no_playbooks_found' => '未找到剧本',
    ],

    'confirm' => [
        'remove' => '确定要移除"{name}"吗？',
        'update' => '将"{name}"更新到最新版本？',
        'update_all' => '将 {count} 个剧本更新到最新版本？',
    ],

    'state' => [
        'updated_to_version' => '已更新到版本',
    ],
];
