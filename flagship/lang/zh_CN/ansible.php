<?php

return [
    'title' => 'Ansible 剧本',
    'subtitle' => '浏览和查看用于服务器部署的 Ansible 剧本',

    'list' => [
        'search_placeholder' => '搜索剧本...',
        'add_playbook' => '添加剧本',
        'no_playbooks' => '未找到剧本',
        'no_playbooks_description' => '创建或导入您的第一个 Ansible 剧本。',
        'total_playbooks' => '剧本总数',
    ],

    'categories' => [
        'all' => '全部',
        'deployment' => '部署',
        'maintenance' => '维护',
        'security' => '安全',
        'monitoring' => '监控',
        'custom' => '自定义',
    ],

    'table' => [
        'name' => '名称',
        'category' => '分类',
        'description' => '描述',
        'servers' => '目标服务器',
        'last_run' => '最后运行',
        'status' => '状态',
        'actions' => '操作',
    ],

    'status' => [
        'idle' => '空闲',
        'running' => '运行中',
        'success' => '成功',
        'failed' => '失败',
        'cancelled' => '已取消',
    ],

    'actions' => [
        'run' => '运行剧本',
        'edit' => '编辑',
        'view_logs' => '查看日志',
        'duplicate' => '复制',
        'delete' => '删除',
        'schedule' => '计划',
        'upload_playbooks' => '上传自定义剧本',
        'copy' => '复制',
        'download' => '下载',
    ],

    'dialog' => [
        'add_title' => '添加 Ansible 剧本',
        'add_description' => '创建新剧本或导入现有剧本。',
        'edit_title' => '编辑剧本',
        'edit_description' => '修改剧本配置。',
        'run_title' => '运行剧本',
        'run_description' => '选择目标服务器并执行剧本。',
        'delete_title' => '删除剧本',
        'delete_description' => '确定要删除此剧本吗？',
        'logs_title' => '剧本执行日志',

        'name_label' => '剧本名称',
        'name_placeholder' => '例如：部署 Web 应用',

        'description_label' => '描述',
        'description_placeholder' => '简要描述此剧本的功能',

        'category_label' => '分类',
        'category_placeholder' => '选择分类',

        'content_label' => '剧本内容 (YAML)',
        'content_placeholder' => '在此粘贴您的 Ansible 剧本 YAML',

        'servers_label' => '目标服务器',
        'servers_placeholder' => '选择要在其上运行此剧本的服务器',

        'variables_label' => '变量',
        'variables_placeholder' => '额外变量（JSON 或 YAML）',

        'tags_label' => '标签',
        'tags_placeholder' => '仅运行特定标签（可选）',

        'cancel' => '取消',
        'create' => '创建剧本',
        'save' => '保存更改',
        'run' => '立即运行',
        'delete' => '删除剧本',
        'close' => '关闭',
    ],

    'messages' => [
        'playbook_created' => '剧本创建成功',
        'playbook_updated' => '剧本更新成功',
        'playbook_deleted' => '剧本删除成功',
        'playbook_started' => '剧本执行已启动',
        'playbook_completed' => '剧本执行成功完成',
        'playbook_failed' => '剧本执行失败',
        'creation_failed' => '创建剧本失败',
        'update_failed' => '更新剧本失败',
        'delete_failed' => '删除剧本失败',
        'execution_failed' => '启动剧本执行失败',
        'invalid_yaml' => '无效的 YAML',
        'no_servers_selected' => '请至少选择一个目标服务器',
        'failed_to_fetch' => '无法加载剧本',
        'failed_to_load_file' => '无法加载文件内容',
        'unknown_yaml_error' => '未知的 YAML 解析错误',
        'copied_to_clipboard' => '已复制到剪贴板',
        'failed_to_copy' => '复制到剪贴板失败',
        'file_downloaded' => '文件已下载',
        'no_playbooks_found' => '未找到剧本',
        'select_file' => '选择一个文件',
        'jinja2_template' => 'Jinja2 模板',
        'binary_file' => '二进制文件',
        'binary_file_notice' => '此文件无法显示，因为它是二进制文件。',
        'file_type' => '文件类型',
        'size' => '大小',
        'yaml_parsing_error' => 'YAML 解析错误',
        'yaml_syntax_invalid' => '此文件包含无效的 YAML 语法，可能无法正常与 Ansible 配合使用。',
        'yaml_content' => 'YAML 内容',
        'lines' => '行',
        'select_playbook_notice' => '从树中选择一个剧本文件以查看其内容',
    ],

    'community' => [
        'title' => '社区剧本',
        'subtitle' => '来自社区的预构建剧本',
        'install' => '安装',
        'installed' => '已安装',
        'install_success' => '社区剧本安装成功',
        'install_failed' => '安装社区剧本失败',
    ],
];
