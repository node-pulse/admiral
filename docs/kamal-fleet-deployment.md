# Kamal Fleet Deployment Engine

## Overview

This document describes how **Kamal** is used within NodePulse Admiral as a **deployment engine** for orchestrating workloads across your managed server fleet.

> **Important**: Kamal is NOT used to deploy the Admiral control plane itself. Admiral uses Docker Compose for its own deployment (see `deployment-strategy.md`).

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  NodePulse Admiral (Control Plane)                          │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐            │
│  │ Submarines │  │  Flagship  │  │  Cruiser   │            │
│  │  (Go API)  │  │  (Rails)   │  │ (Next.js)  │            │
│  └────────────┘  └─────┬──────┘  └────────────┘            │
│                        │                                     │
│                        │ Kamal Service API                   │
│                        │ (Programmatic deployment)           │
└────────────────────────┼─────────────────────────────────────┘
                         │
                         │ SSH + Docker commands
                         ▼
┌─────────────────────────────────────────────────────────────┐
│  Managed Server Fleet (Customer Servers)                    │
│                                                              │
│  ┌──────────────────┐  ┌──────────────────┐                │
│  │  Server A        │  │  Server B        │                │
│  │  - Agent         │  │  - Agent         │                │
│  │  - Rails App     │  │  - Next.js App   │                │
│  │  - PostgreSQL    │  │  - Redis         │                │
│  └──────────────────┘  └──────────────────┘                │
│                                                              │
│  ┌──────────────────┐  ┌──────────────────┐                │
│  │  Server C        │  │  Server D        │                │
│  │  - Agent         │  │  - Agent         │                │
│  │  - Worker Jobs   │  │  - Database      │                │
│  └──────────────────┘  └──────────────────┘                │
└─────────────────────────────────────────────────────────────┘
```

---

## Use Cases

### 1. Deploy Customer Applications

Customers can deploy their containerized applications to their managed servers through the Admiral dashboard:

**Example Workflow:**
1. Customer logs into Admiral dashboard
2. Navigates to "Deployments" section
3. Selects target server(s) from their fleet
4. Provides application details:
   - Docker image (e.g., `ghcr.io/customer/app:v1.2.3`)
   - Environment variables
   - Domain name
   - Resource limits
5. Clicks "Deploy"
6. Kamal orchestrates zero-downtime deployment

### 2. Database Provisioning

Provision databases on powerful servers in the fleet:

```yaml
# Deploy PostgreSQL to Server A
service: customer-db-prod
image: postgres:16-alpine
servers:
  db:
    - server-a.customer.com
env:
  secret:
    - POSTGRES_PASSWORD
volumes:
  - /var/lib/postgresql/data:/var/lib/postgresql/data
```

### 3. Multi-Server Application Deployment

Deploy the same application across multiple servers for high availability:

```yaml
# Deploy Rails app to 3 servers
service: customer-app
image: ghcr.io/customer/rails-app:v2.1.0
servers:
  web:
    - server-01.customer.com
    - server-02.customer.com
    - server-03.customer.com
proxy:
  ssl: true
  host: app.customer.com
```

### 4. Background Worker Deployment

Deploy dedicated worker processes:

```yaml
service: customer-workers
image: ghcr.io/customer/app:v2.1.0
servers:
  job:
    - server-worker-01.customer.com
    - server-worker-02.customer.com
cmd: bundle exec sidekiq -C config/sidekiq.yml
```

---

## Integration with Flagship

### Kamal Gem in Gemfile

The Kamal gem is included in Flagship's Gemfile:

```ruby
# flagship/Gemfile
gem "kamal", require: false
```

> **Note**: `require: false` means Kamal is available but not auto-loaded. It's only used programmatically when needed.

### Programmatic Usage

Flagship uses Kamal's Ruby API to trigger deployments:

```ruby
# app/services/kamal_deployment_service.rb
class KamalDeploymentService
  def initialize(deployment)
    @deployment = deployment
    @server = deployment.server
  end

  def deploy
    # Generate Kamal config from deployment record
    config = generate_config

    # Write temporary config file
    config_path = write_config(config)

    # Execute Kamal deployment
    result = execute_kamal_deploy(config_path)

    # Update deployment status
    update_deployment_status(result)
  ensure
    # Clean up temporary config
    FileUtils.rm_f(config_path)
  end

  private

  def generate_config
    {
      service: @deployment.service_name,
      image: @deployment.image_url,
      servers: {
        web: [@server.hostname]
      },
      registry: {
        server: @deployment.registry_server,
        username: @deployment.registry_username,
        password: ["KAMAL_REGISTRY_PASSWORD"]
      },
      env: {
        secret: @deployment.secret_env_vars,
        clear: @deployment.clear_env_vars
      },
      proxy: @deployment.proxy_config
    }
  end

  def execute_kamal_deploy(config_path)
    # Run Kamal CLI programmatically
    Dir.chdir(Rails.root) do
      system("kamal deploy -c #{config_path}")
    end
  end
end
```

---

## Database Schema

Store deployment configurations and history in PostgreSQL:

```sql
-- Deployment configurations
CREATE TABLE deployments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id UUID NOT NULL REFERENCES servers(id),

  -- Application details
  service_name VARCHAR(255) NOT NULL,
  image_url VARCHAR(512) NOT NULL,

  -- Registry credentials
  registry_server VARCHAR(255),
  registry_username VARCHAR(255),

  -- Environment variables (encrypted)
  secret_env_vars JSONB,
  clear_env_vars JSONB,

  -- Proxy/SSL config
  proxy_config JSONB,

  -- Volumes
  volumes JSONB,

  -- Resource limits
  resource_limits JSONB,

  -- Deployment status
  status VARCHAR(50) NOT NULL, -- pending, deploying, deployed, failed, rolled_back

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  deployed_at TIMESTAMP WITH TIME ZONE,

  -- Audit
  created_by_user_id UUID REFERENCES users(id),

  CONSTRAINT valid_status CHECK (
    status IN ('pending', 'deploying', 'deployed', 'failed', 'rolled_back')
  )
);

-- Deployment history (audit log)
CREATE TABLE deployment_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deployment_id UUID NOT NULL REFERENCES deployments(id),

  event_type VARCHAR(50) NOT NULL, -- deploy_started, deploy_completed, deploy_failed, rollback
  message TEXT,
  metadata JSONB,

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Kamal config templates
CREATE TABLE kamal_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL UNIQUE,
  description TEXT,

  -- Application type (rails, nextjs, postgres, redis, etc.)
  app_type VARCHAR(50) NOT NULL,

  -- Template YAML (ERB format)
  template_yaml TEXT NOT NULL,

  -- Version
  version VARCHAR(20),

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_deployments_server_id ON deployments(server_id);
CREATE INDEX idx_deployments_status ON deployments(status);
CREATE INDEX idx_deployment_events_deployment_id ON deployment_events(deployment_id);
```

---

## Kamal Config Templates

Store reusable templates for common deployment patterns:

### Template: Rails Application

```yaml
# app/kamal_templates/rails.yml.erb
service: <%= service_name %>
image: <%= image_url %>

servers:
  web:
    <% servers.each do |server| %>
    - <%= server %>
    <% end %>

registry:
  server: <%= registry_server %>
  username: <%= registry_username %>
  password:
    - KAMAL_REGISTRY_PASSWORD

env:
  secret:
    - RAILS_MASTER_KEY
    - SECRET_KEY_BASE
    <% secret_env_vars.each do |key| %>
    - <%= key %>
    <% end %>
  clear:
    RAILS_ENV: production
    RAILS_MAX_THREADS: 5
    WEB_CONCURRENCY: 2
    <% clear_env_vars.each do |key, value| %>
    <%= key %>: <%= value %>
    <% end %>

proxy:
  ssl: true
  host: <%= domain %>

volumes:
  - <%= service_name %>_storage:/rails/storage

asset_path: /rails/public/assets

healthcheck:
  path: /up
  interval: 10s
  timeout: 5s
```

### Template: Next.js Application

```yaml
# app/kamal_templates/nextjs.yml.erb
service: <%= service_name %>
image: <%= image_url %>

servers:
  web:
    <% servers.each do |server| %>
    - <%= server %>
    <% end %>

registry:
  server: <%= registry_server %>
  username: <%= registry_username %>
  password:
    - KAMAL_REGISTRY_PASSWORD

env:
  clear:
    NODE_ENV: production
    PORT: 3000
    <% clear_env_vars.each do |key, value| %>
    <%= key %>: <%= value %>
    <% end %>

proxy:
  ssl: true
  host: <%= domain %>

healthcheck:
  path: /api/health
  interval: 10s
  timeout: 5s
```

### Template: PostgreSQL Database

```yaml
# app/kamal_templates/postgres.yml.erb
service: <%= service_name %>
image: postgres:16-alpine

servers:
  db:
    - <%= server %>

env:
  secret:
    - POSTGRES_PASSWORD
  clear:
    POSTGRES_USER: <%= db_user %>
    POSTGRES_DB: <%= db_name %>

volumes:
  - <%= data_path %>:/var/lib/postgresql/data

healthcheck:
  cmd: pg_isready -U <%= db_user %>
  interval: 10s
  timeout: 5s
  retries: 5

# No proxy for database (internal service)
proxy: false
```

### Template: Redis Cache

```yaml
# app/kamal_templates/redis.yml.erb
service: <%= service_name %>
image: redis:7-alpine

servers:
  cache:
    - <%= server %>

command: redis-server --appendonly yes --requirepass <%= redis_password %>

volumes:
  - <%= data_path %>:/data

healthcheck:
  cmd: redis-cli ping
  interval: 10s
  timeout: 5s

# No proxy for cache (internal service)
proxy: false
```

---

## UI/UX Flow in Flagship

### 1. Deployment Form

```
┌─────────────────────────────────────────────┐
│  Deploy Application                         │
├─────────────────────────────────────────────┤
│                                             │
│  Application Type:  [Rails ▾]              │
│                                             │
│  Service Name:      [customer-app       ]  │
│                                             │
│  Docker Image:      [ghcr.io/customer/  ]  │
│                     [app:v1.2.0         ]  │
│                                             │
│  Target Servers:    ☑ server-01.example.com│
│                     ☐ server-02.example.com│
│                     ☑ server-03.example.com│
│                                             │
│  Domain:            [app.example.com    ]  │
│                                             │
│  ──── Environment Variables ────           │
│                                             │
│  DATABASE_URL       [postgresql://...   ]  │
│  SECRET_KEY_BASE    [************       ] 🔒│
│                                             │
│  [+ Add Variable]                          │
│                                             │
│  ──── Advanced Settings ────               │
│                                             │
│  ☑ Enable SSL (Let's Encrypt)             │
│  ☑ Zero-downtime deployment                │
│  ☐ Custom health check                     │
│                                             │
│               [Cancel]  [Deploy Now]       │
└─────────────────────────────────────────────┘
```

### 2. Deployment Progress

```
┌─────────────────────────────────────────────┐
│  Deploying: customer-app                    │
├─────────────────────────────────────────────┤
│                                             │
│  ✅ Validated configuration                 │
│  ✅ Connected to registry                   │
│  ✅ Pulled image: ghcr.io/customer/app:v1.2│
│  🔄 Deploying to server-01.example.com...  │
│     ├─ Building Docker image                │
│     ├─ Starting new container               │
│     └─ Running health checks                │
│  ⏳ Waiting: server-03.example.com          │
│                                             │
│  Logs:                                      │
│  ┌─────────────────────────────────────┐   │
│  │ [2025-10-20 14:32:11] Starting...  │   │
│  │ [2025-10-20 14:32:15] Container up │   │
│  │ [2025-10-20 14:32:18] Health OK    │   │
│  └─────────────────────────────────────┘   │
│                                             │
│                        [Cancel Deployment] │
└─────────────────────────────────────────────┘
```

### 3. Deployment History

```
┌─────────────────────────────────────────────────────────────┐
│  Deployments for Server: server-01.example.com              │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Service          Version    Status      Deployed          │
│  ───────────────────────────────────────────────────────── │
│  customer-app     v1.2.0     ✅ Running  2 hours ago       │
│  customer-db      16-alpine  ✅ Running  1 day ago         │
│  customer-cache   7-alpine   ✅ Running  1 day ago         │
│  customer-app     v1.1.5     🔙 Rolled   3 days ago        │
│  customer-app     v1.1.0     ❌ Failed   5 days ago        │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## Rails Models

### Deployment Model

```ruby
# app/models/deployment.rb
class Deployment < ApplicationRecord
  belongs_to :server
  belongs_to :created_by_user, class_name: 'User', optional: true
  has_many :deployment_events, dependent: :destroy

  validates :service_name, presence: true, format: { with: /\A[a-z0-9-]+\z/ }
  validates :image_url, presence: true
  validates :status, inclusion: { in: %w[pending deploying deployed failed rolled_back] }

  encrypts :secret_env_vars

  scope :active, -> { where(status: 'deployed') }
  scope :recent, -> { order(created_at: :desc) }

  def deploy!
    update!(status: 'deploying', deployed_at: Time.current)
    log_event('deploy_started', 'Deployment started')

    result = KamalDeploymentService.new(self).deploy

    if result.success?
      update!(status: 'deployed')
      log_event('deploy_completed', 'Deployment completed successfully')
    else
      update!(status: 'failed')
      log_event('deploy_failed', result.error_message)
    end
  rescue => e
    update!(status: 'failed')
    log_event('deploy_failed', e.message)
    raise
  end

  def rollback!
    # Kamal supports rollback to previous version
    log_event('rollback_started', 'Rolling back deployment')

    result = KamalDeploymentService.new(self).rollback

    if result.success?
      update!(status: 'rolled_back')
      log_event('rollback_completed', 'Rollback completed')
    else
      log_event('rollback_failed', result.error_message)
    end
  end

  private

  def log_event(event_type, message, metadata = {})
    deployment_events.create!(
      event_type: event_type,
      message: message,
      metadata: metadata
    )
  end
end
```

### KamalTemplate Model

```ruby
# app/models/kamal_template.rb
class KamalTemplate < ApplicationRecord
  validates :name, presence: true, uniqueness: true
  validates :app_type, presence: true
  validates :template_yaml, presence: true

  APP_TYPES = %w[rails nextjs postgres redis mysql worker generic].freeze
  validates :app_type, inclusion: { in: APP_TYPES }

  def render(variables = {})
    ERB.new(template_yaml).result_with_hash(variables)
  end

  def self.for_app_type(type)
    find_by(app_type: type)
  end
end
```

---

## Controllers

### DeploymentsController

```ruby
# app/controllers/deployments_controller.rb
class DeploymentsController < ApplicationController
  before_action :authenticate_user!
  before_action :set_server, only: [:new, :create]
  before_action :set_deployment, only: [:show, :rollback, :destroy]

  def index
    @deployments = current_user.deployments.includes(:server).recent
  end

  def show
    @events = @deployment.deployment_events.order(created_at: :desc)
  end

  def new
    @deployment = @server.deployments.build
    @templates = KamalTemplate.all
  end

  def create
    @deployment = @server.deployments.build(deployment_params)
    @deployment.created_by_user = current_user

    if @deployment.save
      # Trigger async deployment
      DeployApplicationJob.perform_later(@deployment.id)

      redirect_to deployment_path(@deployment),
        notice: 'Deployment started. Please wait...'
    else
      render :new
    end
  end

  def rollback
    @deployment.rollback!
    redirect_to deployment_path(@deployment),
      notice: 'Rollback initiated'
  rescue => e
    redirect_to deployment_path(@deployment),
      alert: "Rollback failed: #{e.message}"
  end

  def destroy
    @deployment.destroy
    redirect_to deployments_path, notice: 'Deployment removed'
  end

  private

  def set_server
    @server = current_user.servers.find(params[:server_id])
  end

  def set_deployment
    @deployment = current_user.deployments.find(params[:id])
  end

  def deployment_params
    params.require(:deployment).permit(
      :service_name,
      :image_url,
      :registry_server,
      :registry_username,
      secret_env_vars: {},
      clear_env_vars: {},
      proxy_config: {},
      volumes: [],
      resource_limits: {}
    )
  end
end
```

---

## Background Jobs

### DeployApplicationJob

```ruby
# app/jobs/deploy_application_job.rb
class DeployApplicationJob < ApplicationJob
  queue_as :deployments

  def perform(deployment_id)
    deployment = Deployment.find(deployment_id)
    deployment.deploy!
  rescue => e
    Rails.logger.error("Deployment failed: #{e.message}")
    raise
  end
end
```

---

## Security Considerations

### 1. SSH Key Management

Kamal needs SSH access to managed servers:

```ruby
# Store SSH keys securely
class Server < ApplicationRecord
  encrypts :ssh_private_key

  def ssh_connection_string
    "#{ssh_user}@#{hostname}"
  end

  def write_ssh_key_to_temp_file
    file = Tempfile.new(['ssh_key', '.pem'])
    file.write(ssh_private_key)
    file.chmod(0600)
    file.close
    file.path
  end
end
```

### 2. Registry Credentials

Encrypt registry passwords:

```ruby
class Deployment < ApplicationRecord
  encrypts :registry_password

  def registry_credentials
    {
      server: registry_server,
      username: registry_username,
      password: registry_password
    }
  end
end
```

### 3. Environment Variable Encryption

```ruby
# All secret environment variables are encrypted
class Deployment < ApplicationRecord
  encrypts :secret_env_vars

  # Never log secret env vars
  def inspect
    super.gsub(/secret_env_vars.*?,/, 'secret_env_vars: [FILTERED],')
  end
end
```

### 4. RBAC (Role-Based Access Control)

```ruby
# Only authorized users can deploy
class DeploymentsController < ApplicationController
  before_action :require_deploy_permission

  private

  def require_deploy_permission
    unless current_user.can_deploy?
      redirect_to root_path, alert: 'Not authorized'
    end
  end
end
```

---

## Best Practices

### 1. Always Use Templates

Don't generate Kamal configs manually. Use templates for consistency:

```ruby
# Good ✅
template = KamalTemplate.for_app_type('rails')
config = template.render(variables)

# Bad ❌
config = "service: #{name}\nimage: #{image}\n..."
```

### 2. Test Deployments in Staging First

```ruby
class Deployment < ApplicationRecord
  belongs_to :environment # production, staging, development

  validate :staging_deployment_exists, if: :production?

  private

  def staging_deployment_exists
    unless Deployment.exists?(
      service_name: service_name,
      environment: Environment.staging
    )
      errors.add(:base, 'Must deploy to staging first')
    end
  end
end
```

### 3. Monitor Deployment Health

```ruby
# Check deployment health after deploy
class DeployApplicationJob < ApplicationJob
  def perform(deployment_id)
    deployment = Deployment.find(deployment_id)
    deployment.deploy!

    # Wait for health check
    sleep 10

    # Verify deployment is healthy
    unless deployment.healthy?
      deployment.rollback!
      raise "Deployment unhealthy, rolled back"
    end
  end
end
```

### 4. Retain Deployment History

Never delete deployment records, just mark as inactive:

```ruby
class Deployment < ApplicationRecord
  acts_as_paranoid # Soft deletes

  scope :active, -> { where(deleted_at: nil, status: 'deployed') }
end
```

---

## Future Enhancements

### 1. Multi-Region Deployments

Deploy to servers across different regions:

```yaml
servers:
  web:
    us-east:
      - server-01.us-east.example.com
      - server-02.us-east.example.com
    eu-west:
      - server-01.eu-west.example.com
```

### 2. Canary Deployments

Gradually roll out to servers:

```ruby
class CanaryDeploymentService
  def deploy(deployment, canary_percent: 10)
    servers = deployment.servers
    canary_servers = servers.sample(servers.size * canary_percent / 100)

    # Deploy to canary servers first
    deploy_to_servers(canary_servers)

    # Monitor metrics
    wait_and_monitor(duration: 10.minutes)

    # If healthy, deploy to remaining servers
    deploy_to_servers(servers - canary_servers)
  end
end
```

### 3. Blue-Green Deployments

Zero-downtime with instant rollback:

```yaml
# Deploy new version to "green" servers
# Switch traffic from "blue" to "green"
# Keep "blue" running for instant rollback
```

### 4. Scheduled Deployments

Deploy during maintenance windows:

```ruby
class ScheduledDeployment < ApplicationRecord
  belongs_to :deployment

  validates :scheduled_at, presence: true

  after_create :schedule_job

  private

  def schedule_job
    DeployApplicationJob.set(wait_until: scheduled_at)
                        .perform_later(deployment.id)
  end
end
```

---

## Troubleshooting

### SSH Connection Failed

**Symptom**: Kamal can't connect to server

**Solution**:
1. Verify SSH key is correct
2. Check server firewall allows SSH (port 22)
3. Verify SSH user has Docker permissions
4. Test manual SSH connection

### Image Pull Failed

**Symptom**: Can't pull Docker image

**Solution**:
1. Verify registry credentials
2. Check image URL is correct
3. Ensure server has internet access
4. Test manual `docker pull` on server

### Container Won't Start

**Symptom**: Container exits immediately

**Solution**:
1. Check container logs: `kamal app logs`
2. Verify environment variables are correct
3. Check health check endpoint is responding
4. Review resource limits

### Deployment Stuck

**Symptom**: Deployment hangs indefinitely

**Solution**:
1. Check Kamal process logs
2. Verify server is responsive
3. Cancel deployment: `kamal lock release`
4. Retry deployment

---

## References

- [Kamal Documentation](https://kamal-deploy.org/)
- [Kamal GitHub Repository](https://github.com/basecamp/kamal)
- [Docker Documentation](https://docs.docker.com/)
- [Admiral Deployment Strategy](./deployment-strategy.md)

---

## Next Steps

1. ✅ Kamal gem is already installed in Flagship
2. Create database migrations for deployment tables
3. Build Kamal config templates
4. Implement `KamalDeploymentService`
5. Create deployment UI in Flagship
6. Test on staging servers
7. Roll out to production
