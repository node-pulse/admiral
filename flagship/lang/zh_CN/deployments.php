<?php

return [
    'title' => '部署',
    'subtitle' => '使用 Ansible 将代理部署到您的服务器',

    'actions' => [
        'new_deployment' => '新建部署',
        'create_deployment' => '创建部署',
        'view_details' => '查看详情',
        'cancel' => '取消',
    ],

    'stats' => [
        'total_deployments' => '总部署数',
        'running' => '运行中',
        'completed' => '已完成',
        'failed' => '失败',
    ],

    'filters' => [
        'search_placeholder' => '搜索部署...',
        'filter_by_status' => '按状态筛选',
        'all_status' => '所有状态',
    ],

    'status' => [
        'pending' => '等待中',
        'running' => '运行中',
        'completed' => '已完成',
        'failed' => '失败',
        'cancelled' => '已取消',
    ],

    'table' => [
        'name' => '名称',
        'playbook' => '剧本',
        'status' => '状态',
        'servers' => '服务器',
        'success_rate' => '成功率',
        'duration' => '持续时间',
        'created' => '创建时间',
        'total' => '总计',
    ],

    'empty' => [
        'no_deployments_found' => '未找到部署',
        'get_started' => '开始创建您的第一个部署。',
    ],

    'pagination' => [
        'page' => '第',
        'of' => '页，共',
        'pages' => '页',
        'previous' => '上一页',
        'next' => '下一页',
    ],

    'messages' => [
        'failed_to_fetch' => '无法加载部署列表',
    ],
];
