<?php

return [
    'title' => '用户',
    'subtitle' => '管理系统用户和权限',

    'list' => [
        'title' => '用户管理',
        'description' => '管理用户账户、角色和访问权限',
        'search_placeholder' => '按姓名或邮箱搜索...',
        'add_user' => '添加用户',
        'no_users' => '未找到用户',
        'loading' => '加载中...',
        'total_users' => '用户总数',
        'admin_users' => '管理员',
        'all_roles' => '所有角色',
        'all_status' => '所有状态',
        'showing' => '显示',
        'of' => '共',
        'users' => '位用户',
        'previous' => '上一页',
        'next' => '下一页',
    ],

    'table' => [
        'name' => '姓名',
        'email' => '邮箱',
        'role' => '角色',
        'status' => '状态',
        'two_factor' => '双因素认证',
        'created' => '加入时间',
        'last_login' => '最后登录',
        'actions' => '操作',
    ],

    'roles' => [
        'admin' => '管理员',
        'user' => '用户',
        'viewer' => '查看者',
    ],

    'status' => [
        'active' => '活跃',
        'disabled' => '已禁用',
        'inactive' => '未激活',
        'suspended' => '已停用',
        'two_factor_enabled' => '已启用',
        'two_factor_disabled' => '未启用',
    ],

    'actions' => [
        'add_user' => '添加用户',
        'view_details' => '查看详情',
        'edit' => '编辑',
        'make_admin' => '设为管理员',
        'make_user' => '设为普通用户',
        'change_role' => '更改角色',
        'enable_account' => '启用账户',
        'disable_account' => '禁用账户',
        'suspend' => '停用',
        'activate' => '激活',
        'delete_user' => '删除用户',
        'reset_password' => '重置密码',
    ],

    'dialog' => [
        'add_title' => '添加新用户',
        'add_description' => '使用指定的角色和权限创建新用户账户',
        'edit_title' => '编辑用户',
        'edit_description' => '更新用户信息和权限',
        'delete_title' => '删除用户',
        'delete_description' => '确定要删除',
        'delete_warning' => '此操作无法撤销',
        'details_title' => '用户详情',

        'name' => '姓名',
        'name_placeholder' => '张三',

        'email' => '邮箱',
        'email_placeholder' => 'zhangsan@example.com',

        'password' => '密码',
        'password_placeholder' => '最少8个字符',

        'role' => '角色',
        'role_placeholder' => '选择角色',

        'status_label' => '状态',

        'cancel' => '取消',
        'create' => '创建用户',
        'creating' => '创建中...',
        'save' => '保存更改',
        'delete' => '删除用户',
        'deleting' => '删除中...',
    ],

    'messages' => [
        'fetch_failed' => '获取用户列表失败',
        'fill_all_fields' => '请填写所有字段',
        'user_created' => '用户创建成功',
        'create_failed' => '创建用户失败',
        'user_updated' => '用户更新成功',
        'user_deleted' => '用户删除成功',
        'delete_failed' => '删除用户失败',
        'role_updated' => '用户角色更新成功',
        'role_update_failed' => '更新用户角色失败',
        'role_changed' => '用户角色更改成功',
        'user_enabled' => '用户已启用',
        'user_disabled' => '用户已禁用',
        'status_update_failed' => '更新用户状态失败',
        'user_suspended' => '用户已停用',
        'user_activated' => '用户已激活',
        'password_reset' => '密码重置邮件已发送',
        'creation_failed' => '创建用户失败',
        'update_failed' => '更新用户失败',
        'cannot_delete_self' => '您不能删除自己的账户',
        'cannot_change_own_role' => '您不能更改自己的角色',
    ],
];
