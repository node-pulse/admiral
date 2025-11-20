<?php

return [
    'login' => [
        'title' => '登录',
        'subtitle' => '欢迎回来',
        'email' => '邮箱',
        'password' => '密码',
        'remember_me' => '记住我',
        'forgot_password' => '忘记密码？',
        'submit' => '登录',
        'no_account' => '没有账号？',
        'register' => '注册',
    ],

    'register' => [
        'title' => '创建账号',
        'subtitle' => '开始使用 Node Pulse',
        'name' => '姓名',
        'email' => '邮箱',
        'password' => '密码',
        'password_confirmation' => '确认密码',
        'submit' => '创建账号',
        'have_account' => '已有账号？',
        'login' => '登录',
    ],

    'forgot_password' => [
        'title' => '忘记密码',
        'subtitle' => '输入您的邮箱以重置密码',
        'email' => '邮箱',
        'submit' => '发送重置链接',
        'back_to_login' => '返回登录',
    ],

    'reset_password' => [
        'title' => '重置密码',
        'subtitle' => '输入您的新密码',
        'email' => '邮箱',
        'password' => '密码',
        'password_confirmation' => '确认密码',
        'submit' => '重置密码',
    ],

    'verify_email' => [
        'title' => '验证邮箱',
        'message' => '感谢注册！在开始之前，请验证您的邮箱地址。',
        'resend' => '重新发送验证邮件',
        'logout' => '退出登录',
    ],

    'confirm_password' => [
        'title' => '确认密码',
        'message' => '请在继续之前确认您的密码。',
        'password' => '密码',
        'submit' => '确认',
    ],

    'two_factor_challenge' => [
        'title' => '双因素认证',
        'message' => '请输入您的身份验证应用程序提供的验证码以确认访问您的账号。',
        'code' => '验证码',
        'recovery_code' => '恢复代码',
        'use_recovery_code' => '使用恢复代码',
        'use_auth_code' => '使用验证码',
        'submit' => '登录',
    ],

    'failed' => '这些凭据与我们的记录不匹配。',
    'password' => '提供的密码不正确。',
    'throttle' => '登录尝试次数过多。请在 :seconds 秒后重试。',
];
