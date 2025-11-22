# Node Pulse Admiral

[English](README.md) | [中文简介](#node-pulse-admiral)

**生产就绪的服务器监控平台**，具有全自动 Ansible 部署、丰富的 Playbook 库、实时指标收集和集成 SSH 终端。

## 核心功能

### 实时指标收集

- **高效的代理端解析** - 带宽减少 98%（从每次采集 61KB 降至 1KB）
- **全面的元数据** - 主机名、IP 地址、操作系统版本、硬件规格
- **最小化数据库占用** - 减少 99.8%（从每次采集 1100+ 行降至 1 行）
- **高性能查询** - 直接列访问，速度提升 10-30 倍
- **15 秒间隔** - 实时了解系统性能

### SSH 访问管理

- **加密 SSH 密钥存储** - 使用主密钥加密的安全私钥保险库
- **基于浏览器的终端** - 直接从仪表板通过 WebSocket 访问 SSH
- **会话审计日志** - 完整的 SSH 会话审计跟踪，满足合规要求

### 自动化部署与配置

- **基于 Playbook 的自动化** - 使用经过实战检验的 Ansible Playbook 部署和配置应用程序
- **内置安全 Playbook** - SSH 加固、防火墙配置（UFW/firewalld）、fail2ban 等
- **社区 Playbook** - 预构建的 Playbook，支持数据库（PostgreSQL、MySQL、Redis）、Web 服务器（Nginx、Caddy）、Docker 和 30 多种流行应用
- **自定义 Playbook 上传** - 上传您自己的 Ansible Playbook（.yml 文件或 .zip 包），具有验证和安全扫描功能
- **零接触代理部署** - 全自动监控堆栈安装（Node Pulse Agent + node_exporter + process_exporter）
- **灵活的安全模式** - 支持 mTLS 和非 mTLS 配置
- **实时部署跟踪** - 实时输出流和每台服务器状态跟踪

### 告警管理

- **可自定义的告警规则** - 为 CPU、内存、磁盘和网络指标定义阈值
- **告警历史跟踪** - 完整的触发告警审计跟踪
- **多渠道通知** - 电子邮件、Slack、webhook 集成（即将推出）

### 用户与访问管理

- **多用户身份验证** - 企业级用户管理，使用 Laravel Fortify
- **会话管理** - 使用 Redis 兼容的 Valkey 进行安全会话处理
- **双因素身份验证（2FA）** - 基于 TOTP 的 2FA，支持二维码设置和恢复代码
- **用户管理** - 创建、更新和管理用户账户，具有基于角色的访问控制
- **密码确认** - 敏感操作（如启用 2FA 或 mTLS）需要密码确认

## 截图

### 服务器管理仪表板

![服务器仪表板](screenshots/AdmiralScreenshot_Servers.png)
_使用实时状态监控、SSH 密钥管理和一键终端访问管理您的服务器群_

### 基于浏览器的 SSH 终端

![Web 终端](screenshots/AdmiralScreenshot_WebTerminal.png)
_安全的基于 WebSocket 的 SSH 终端，可直接从浏览器即时访问服务器_

## 前置要求

- Linux 服务器（推荐 Ubuntu 22.04+）
- Docker Engine 24.0+
- Docker Compose v2.20+
- Root/sudo 访问权限
- 最低 2GB RAM，2 个 CPU 核心

## 快速开始

### 生产部署（推荐）

**下载并部署最新版本：**

```bash
# 下载最新版本
curl -LO https://github.com/node-pulse/admiral/releases/latest/download/node-pulse-admiral-latest.tar.gz

# 验证校验和（可选但推荐）
curl -LO https://github.com/node-pulse/admiral/releases/latest/download/node-pulse-admiral-latest.tar.gz.sha256
sha256sum -c node-pulse-admiral-latest.tar.gz.sha256

# 解压
sudo tar xzf node-pulse-admiral-latest.tar.gz -C /opt/admiral --strip-components=1

# 进入解压后的目录（例如 node-pulse-admiral-0.8.7/）
cd /opt/admiral

# 运行交互式部署
sudo ./deploy.sh
```

部署脚本将：

- 引导您完成配置
- 自动设置 mTLS 证书
- 拉取预构建的 Docker 镜像
- 创建初始管理员用户
- 启动所有服务

### 开发 / 手动设置

**对于开发或从源码手动设置：**

1. **克隆仓库**：

   ```bash
   git clone https://github.com/node-pulse/admiral.git
   cd admiral
   ```

2. **复制环境文件**：

   ```bash
   cp .env.example .env
   # 使用您的设置编辑 .env
   ```

3. **启动服务**（开发模式）：

   ```bash
   docker compose -f compose.development.yml up -d
   ```

   这将启动所有服务：

   - PostgreSQL（端口 5432）
   - Valkey（端口 6379）
   - Submarines Ingest（端口 8080）
   - Submarines SSH WS（端口 6001）
   - Submarines Digest（后台工作进程）
   - Submarines Deployer（后台工作进程）
   - Flagship（端口 9000 + Vite HMR 端口 5173）
   - Caddy（端口 8000）

   **或**（生产模式，使用 mTLS）：

   ```bash
   sudo ./scripts/deploy.sh
   ```

4. **检查服务状态**：

   ```bash
   docker compose -f compose.development.yml ps
   ```

5. **查看日志**：

   ```bash
   docker compose -f compose.development.yml logs -f

   # 或特定服务
   docker compose -f compose.development.yml logs -f submarines-ingest
   docker compose -f compose.development.yml logs -f flagship
   ```

## 服务 URL

所有服务运行后（开发模式）：

- **Caddy 反向代理**：http://localhost:8000（路由到 Flagship）
- **Flagship（管理仪表板）**：http://localhost:9000（直接访问）
- **Vite Dev Server**（HMR）：http://localhost:5173
- **Submarines Ingest**：http://localhost:8080（指标端点）
- **Submarines SSH WS**：http://localhost:6001（WebSocket 终端）
- **PostgreSQL**：localhost:5432
- **Valkey**：localhost:6379

## 数据库架构

PostgreSQL 数据库使用单个 **admiral** 架构存储所有应用数据（由 Submarines 和 Flagship 共享）：

- `servers`：服务器/代理注册表
- `metrics`：**简化指标** - 每行 39 个基本指标（相比原始 Prometheus 减少 98% 带宽）
  - CPU：6 个字段（原始计数器值）
  - 内存：7 个字段（字节）
  - 交换：3 个字段（字节）
  - 磁盘：8 个字段（字节和 I/O 计数器）
  - 网络：8 个字段（主网络接口的计数器）
  - 系统：3 个负载平均字段
  - 进程：3 个字段
  - 运行时间：1 个字段
- `alerts`：告警记录
- `alert_rules`：告警规则配置
- `users`：用户账户（Laravel Fortify 身份验证）
- `sessions`：用户会话
- `ssh_sessions`：SSH 会话审计日志
- `private_keys`：服务器访问的 SSH 私钥
- `settings`：应用程序设置

### 指标架构

Node Pulse 使用**代理端解析**进行高效的指标收集：

1. **node_exporter** 在每台服务器上运行（localhost:9100）
2. **Node Pulse Agent** 在本地抓取 node_exporter
3. **Agent 解析** Prometheus 指标并提取 39 个基本字段
4. **Agent 发送紧凑的 JSON**（约 1KB）到 Submarines
5. **Submarines** 写入 PostgreSQL（每次抓取 1 行）

**优势：**

- 带宽减少 98.32%（61KB → 1KB）
- 数据库减少 99.8%（1100+ 行 → 1 行）
- 查询速度提升 10-30 倍（直接列访问 vs JSONB）
- 分布式解析负载（卸载到代理端）

## API 端点

### 指标收集

**主要端点：**

```
POST http://your-domain/metrics/prometheus
```

接受简化指标格式，包含 39 个基本字段（从 Prometheus 导出器代理端解析）。

**请求格式：**

```json
{
  "node_exporter": [
    {
      "timestamp": "2025-10-30T12:00:00Z",
      "cpu_idle_seconds": 7184190.53,
      "cpu_iowait_seconds": 295.19,
      "cpu_system_seconds": 2979.08,
      "cpu_user_seconds": 7293.29,
      "cpu_steal_seconds": 260.7,
      "cpu_cores": 4,
      "memory_total_bytes": 8326443008,
      "memory_available_bytes": 7920050176,
      ... (总共 39 个字段)
    }
  ],
  "process_exporter": [
    {
      "timestamp": "2025-10-30T12:00:00Z",
      "name": "nginx",
      "num_procs": 4,
      "cpu_seconds_total": 1234.56,
      "memory_bytes": 104857600
    }
  ]
}
```

### 仪表板 API

- `GET /api/servers` - 列出所有服务器
- `GET /api/servers/:id/metrics` - 获取特定服务器的指标
- `GET /api/processes/top` - 按 CPU 或内存获取前 N 个进程
- `GET /health` - 健康检查端点

## 配置 Node Pulse Agent

推荐的部署使用 **node_exporter** + **Node Pulse Agent** 和代理端解析：

### 架构

```
node_exporter (localhost:9100) → Agent 本地解析 → 发送 39 个指标（1KB JSON）→ Submarines
```

### Agent 配置

更新您的 Node Pulse 代理配置（`/etc/nodepulse/nodepulse.yml`）：

```yaml
# Prometheus 抓取器配置
scrapers:
  prometheus:
    enabled: true
    endpoints:
      - url: "http://127.0.0.1:9100/metrics"
        name: "node_exporter"
        interval: 15s

# 服务器配置
server:
  endpoint: "https://your-dashboard-domain/metrics/prometheus"
  format: "prometheus" # 以 Prometheus 格式发送解析后的 JSON
  timeout: 10s

# Agent 行为
agent:
  server_id: "auto-generated-uuid"
  interval: 15s # 抓取和推送的频率

# 缓冲（写前日志以提高可靠性）
buffer:
  enabled: true
  retention_hours: 48
  max_size_mb: 100

# 日志记录
logging:
  level: "info"
  file: "/var/log/nodepulse/nodepulse.log"
  max_size_mb: 50
  max_backups: 3
  max_age_days: 7
```

### 通过 Ansible 部署

使用包含的 Ansible Playbook 部署 node_exporter 和 agent：

```bash
# 1. 部署 node_exporter（必须先部署）
ansible-playbook ansible/playbooks/prometheus/deploy-node-exporter.yml -i inventory.yml

# 2. 部署 Node Pulse Agent
# 生产环境（使用 mTLS）：
ansible-playbook ansible/playbooks/nodepulse/deploy-agent-mtls.yml -i inventory.yml

# 开发环境（不使用 mTLS）：
ansible-playbook ansible/playbooks/nodepulse/deploy-agent-no-mtls.yml -i inventory.yml
```

详细部署说明请参阅 `ansible/playbooks/nodepulse/QUICK_START.md`。

## 开发

### Submarines（Go-Gin 后端）

```bash
cd submarines
go mod download

# 运行收集服务器（接收代理指标）
go run cmd/ingest/main.go

# 运行消化工作进程（从 Valkey Stream 消费，写入 PostgreSQL）
go run cmd/digest/main.go
```

### Flagship（Laravel Web 仪表板）

```bash
cd flagship
composer install
npm install

# 运行开发服务器（所有服务）
composer dev

# 或单独运行
php artisan serve              # Laravel Web 服务器
npm run dev                    # Vite 开发服务器
php artisan queue:listen       # 队列工作进程
php artisan pail               # 日志查看器

# 其他命令
php artisan migrate            # 运行迁移
php artisan test               # 运行测试
```

## Laravel + Inertia.js 技术栈

Flagship 使用 **Laravel 12** 和 **Inertia.js** 提供现代 SPA 体验：

- **后端**：Laravel 用于 API、身份验证和业务逻辑
- **前端**：React 19 与 TypeScript
- **路由**：通过 Inertia.js 进行服务器端路由（无需客户端路由器）
- **UI 组件**：Radix UI + Tailwind CSS
- **身份验证**：Laravel Fortify 支持验证码

### 创建新页面

1. 在 `flagship/app/Http/Controllers/` 中创建控制器：

```php
<?php
namespace App\Http\Controllers;

use Inertia\Inertia;

class ExampleController extends Controller
{
    public function index()
    {
        return Inertia::render('example', [
            'data' => [...],
        ]);
    }
}
```

2. 在 `flagship/resources/js/pages/` 中创建 React 组件：

```tsx
// resources/js/pages/example.tsx
export default function Example({ data }) {
  return <div>您的页面内容</div>;
}
```

3. 在 `flagship/routes/web.php` 中添加路由：

```php
Route::get('/example', [ExampleController::class, 'index']);
```

## 停止服务

```bash
# 停止所有服务（开发环境）
docker compose -f compose.development.yml down

# 停止并删除卷（警告：这将删除所有数据）
docker compose -f compose.development.yml down -v
```

## 更新服务

```bash
# 重新构建并重启特定服务（开发环境）
docker compose -f compose.development.yml up -d --build submarines-ingest
docker compose -f compose.development.yml up -d --build submarines-digest
docker compose -f compose.development.yml up -d --build flagship

# 重新构建所有服务
docker compose -f compose.development.yml up -d --build
```

## 为什么选择推送式架构？

Node Pulse 使用**推送式**方法，其中代理主动将指标发送到仪表板，与传统的拉取式系统（例如 Prometheus，从目标抓取指标）不同。这提供了显著的优势：

### 关键优势

1. **防火墙友好**：代理可以通过防火墙、NAT 和网络限制推送指标，而无需暴露入站端口。这对于以下情况非常理想：

   - 位于企业防火墙后的代理
   - 具有严格安全策略的服务器
   - 没有公共 IP 的云实例
   - 具有动态 IP 的边缘设备

2. **内置可靠性**：每个代理都有一个本地缓冲区，在仪表板无法访问时存储指标，确保：

   - 在网络中断或仪表板维护期间不会丢失数据
   - 使用指数退避的自动重试
   - 最多 48 小时的缓冲指标（可配置）

3. **简化网络配置**：无需：

   - 在受监控服务器上打开入站防火墙规则
   - 配置服务发现机制
   - 维护抓取器 IP 的白名单
   - 设置 VPN 隧道进行监控访问

4. **实时数据**：收集后立即到达指标（默认 15 秒间隔），提供：

   - 立即了解系统状态
   - 更快的事件检测和响应
   - 无抓取间隔延迟

5. **可扩展性**：仪表板可独立于代理数量进行扩展：

   - Valkey Streams 在流量高峰期缓冲传入指标
   - 多个消化工作进程并行处理指标
   - 基于流延迟的水平扩展
   - 无需管理抓取调度和间隔

6. **高效的数据模型**：使用简化指标的代理端解析：
   - **带宽减少 98.32%**（每次抓取从 61KB 降至 1KB）
   - **数据库减少 99.8%**（每次抓取从 1100+ 行降至 1 行）
   - **查询速度提升 10-30 倍**，具有直接列访问
   - 分布式解析负载（卸载到代理端，而非中央服务器）

## 架构

Node Pulse Admiral 使用带有 Docker Compose 编排的**推送式指标管道**：

### 指标数据流

```
node_exporter (:9100) 和 process_exporter (:9256)
    │
    │ 抓取（HTTP）
    ▼
Node Pulse Agent - 解析并提取 39 个指标，WAL 缓冲
Node Pulse Agent - 解析并提取前 N 个进程，WAL 缓冲
    │
    │ 通过 HTTPS POST 推送 JSON
    ▼
Submarines Ingest (:8080) - 验证并发布
    │
    │ 流式传输到 Valkey
    ▼
Valkey Streams (:6379) - 消息缓冲和背压
    │
    │ 消费（批量 100）
    ▼
Submarines Digest (worker) - 批量插入
    │
    │ INSERT 查询
    ▼
PostgreSQL (:5432) - admiral.metrics + admiral.process_snapshots
```

### 组件架构

**Submarines（Go）- 指标管道**

- **Ingest**（:8080）- 从代理接收指标，发布到 Valkey Stream（约 5ms 响应）
- **Digest**（worker）- 从流消费，批量写入 PostgreSQL
- **Deployer**（worker）- 执行 Ansible Playbook 进行代理部署
- **SSH WS**（:6001）- 用于服务器访问的 WebSocket 终端

**Flagship（Laravel + React）- 管理 UI**

- 具有实时图表的 Web 仪表板
- 服务器管理和配置
- 用户身份验证（Laravel Fortify）
- 指标和进程的 API 端点
- 由容器内的 Nginx（:8090）+ PHP-FPM（:9000）提供服务
- 在生产环境中通过 Caddy 反向代理暴露

**数据层**

- **PostgreSQL 18** - Admiral 架构（指标、服务器、用户、告警）
- **Valkey** - 消息流、缓存、会话（Redis 兼容）

**反向代理和 Web 服务器**

- **Caddy** - 边缘反向代理、TLS 终止、自动 HTTPS、在服务之间路由流量
- **Nginx** - Flagship 的应用服务器（提供静态文件，将 PHP 请求代理到 PHP-FPM）

## 当前状态（2025 年 11 月）

### 生产就绪功能 ✅

- **指标收集** - 简化指标架构，带宽减少 98%
- **进程监控** - 按 CPU/内存排序的前几个进程，具有时间序列跟踪
- **Ansible 部署** - 统一的 Playbook 系统，并行执行（100 台服务器）
- **SSH 终端** - 基于 WebSocket 的终端，具有会话审计日志
- **数据保留** - 可配置的保留策略（免费版本 24h/48h/72h）
- **双因素身份验证** - 基于 TOTP 的 2FA，具有恢复代码
- **自定义 Playbook** - 上传并执行自定义 Ansible Playbook
- **社区 Playbook** - 30 多个常见应用程序的预构建 Playbook
- **用户管理** - 具有基于角色的访问控制的多用户系统
- **服务器 ID 验证** - 99% 缓存命中率，通过负缓存进行 DoS 保护
- **安全 Playbook** - SSH 加固和防火墙配置
- **mTLS 支持** - 具有一键 UI 设置的代理身份验证的可选双向 TLS
- **仪表板指标** - CPU、内存、磁盘和网络的实时图表

### 进行中 🔄

- **Playbook 测试** - 在多个 Linux 发行版（Ubuntu、Debian、RHEL/Rocky）上进行全面测试
- **文档** - 用户指南和视频教程

### 即将推出的功能 🔮

详细计划请参阅[路线图](docs/roadmap.md)：

- 计划部署（2026 年第一季度）
- 高级库存管理（2026 年第二季度）
- 部署审计跟踪（2026 年第二季度）
- 凭证保险库集成（2026 年第四季度）
- Playbook 的 Git 集成（2027 年第三季度）

## 故障排除

### 服务无法启动

检查特定服务的日志：

```bash
docker compose -f compose.development.yml logs submarines-ingest
docker compose -f compose.development.yml logs submarines-digest
docker compose -f compose.development.yml logs submarines-deployer
docker compose -f compose.development.yml logs flagship
docker compose -f compose.development.yml logs postgres
docker compose -f compose.development.yml logs valkey
```

### 数据库连接问题

1. 确保 PostgreSQL 健康：

   ```bash
   docker compose -f compose.development.yml ps postgres
   ```

2. 检查数据库日志：

   ```bash
   docker compose -f compose.development.yml logs postgres
   ```

3. 从 Submarines 验证连接：
   ```bash
   docker compose -f compose.development.yml exec submarines-ingest sh
   # 在容器内：
   # 检查 postgres 在端口 5432 上是否可访问
   ```

### Valkey 连接问题

```bash
docker compose -f compose.development.yml logs valkey
docker compose -f compose.development.yml exec valkey valkey-cli --raw incr ping
```

### Flagship（Laravel）问题

1. 检查 Laravel 应用程序日志：

   ```bash
   docker compose -f compose.development.yml logs flagship
   # 或检查挂载的日志
   tail -f logs/flagship/laravel.log
   ```

2. 访问 Laravel 容器：

   ```bash
   docker compose -f compose.development.yml exec flagship bash
   php artisan about  # 显示 Laravel 环境信息
   ```

3. 检查前端构建：
   ```bash
   # 在 flagship 容器内
   npm run build  # 生产构建
   npm run dev    # 具有热重载的开发
   ```

### 前端无法加载

1. 检查 Vite 开发服务器是否正在运行：

   ```bash
   docker compose -f compose.development.yml logs flagship | grep vite
   ```

2. 确保 Submarines API 可访问：
   ```bash
   curl http://localhost:8080/health
   ```

### Valkey Streams 问题

检查流延迟（等待处理的消息数）：

```bash
docker compose -f compose.development.yml exec valkey valkey-cli \
  --raw XPENDING nodepulse:metrics:stream nodepulse-workers
```

如果延迟高，请考虑扩展消化工作进程。

## 生产部署

对于生产环境：

1. 更新 `.env` 中的所有密钥
2. 在 Dockerfile 中使用 `production` 目标
3. 为 Submarines 设置 `GIN_MODE=release`
4. 为 Flagship 设置 `APP_ENV=production` 和 `APP_DEBUG=false`
5. 运行 `php artisan optimize` 进行 Laravel 优化
6. 使用 `npm run build` 构建前端资源
7. 在 `.env` 中配置正确的域（FLAGSHIP_DOMAIN）
8. 使用 `Caddyfile.prod` 通过 Let's Encrypt 自动 HTTPS
9. 为 PostgreSQL 设置适当的备份策略
10. 配置监控和告警
11. 根据 Valkey Stream 延迟扩展消化工作进程
12. 配置 Laravel 身份验证和授权
13. 设置适当的会话和缓存驱动程序

## 许可证

[Apache 2.0](LICENSE)

## 支持

有关问题和疑问，请在 GitHub 上打开 issue。
