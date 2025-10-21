# Traefik API Integration

Traefik exposes a REST API that provides all dashboard data. This can be consumed by Flagship to show routing status.

## API Endpoints

All endpoints are accessible at `http://traefik:8080/api` from within the Docker network.

### Available Endpoints

```
GET /api/version              - Traefik version
GET /api/overview             - Overview of all resources
GET /api/entrypoints          - All entry points
GET /api/http/routers         - All HTTP routers
GET /api/http/services        - All HTTP services
GET /api/http/middlewares     - All HTTP middlewares
GET /api/tcp/routers          - All TCP routers
GET /api/tcp/services         - All TCP services
```

## Flagship Integration

Add this to Flagship to fetch Traefik data:

### 1. Create Traefik Service (Rails)

```ruby
# app/services/traefik_service.rb
class TraefikService
  TRAEFIK_API_BASE = ENV.fetch('TRAEFIK_API_URL', 'http://traefik:8080/api')

  def self.overview
    fetch('/overview')
  end

  def self.routers
    fetch('/http/routers')
  end

  def self.services
    fetch('/http/services')
  end

  def self.middlewares
    fetch('/http/middlewares')
  end

  def self.entrypoints
    fetch('/entrypoints')
  end

  private

  def self.fetch(path)
    uri = URI("#{TRAEFIK_API_BASE}#{path}")
    response = Net::HTTP.get_response(uri)

    if response.is_a?(Net::HTTPSuccess)
      JSON.parse(response.body)
    else
      Rails.logger.error("Traefik API error: #{response.code} #{response.message}")
      {}
    end
  rescue => e
    Rails.logger.error("Failed to fetch Traefik data: #{e.message}")
    {}
  end
end
```

### 2. Create Controller

```ruby
# app/controllers/admin/traefik_controller.rb
module Admin
  class TraefikController < ApplicationController
    def overview
      @overview = TraefikService.overview
      @routers = TraefikService.routers
      @services = TraefikService.services
    end

    def routers
      @routers = TraefikService.routers
      render json: @routers
    end

    def services
      @services = TraefikService.services
      render json: @services
    end
  end
end
```

### 3. Add Routes

```ruby
# config/routes.rb
namespace :admin do
  resource :traefik, only: [] do
    get :overview, on: :collection
    get :routers, on: :collection
    get :services, on: :collection
  end
end
```

### 4. Create View (Optional)

```erb
<!-- app/views/admin/traefik/overview.html.erb -->
<h1>Traefik Status</h1>

<div class="traefik-overview">
  <h2>Overview</h2>
  <pre><%= JSON.pretty_generate(@overview) %></pre>

  <h2>Routers</h2>
  <table>
    <thead>
      <tr>
        <th>Name</th>
        <th>Rule</th>
        <th>Service</th>
        <th>Status</th>
      </tr>
    </thead>
    <tbody>
      <% @routers.each do |name, router| %>
        <tr class="<%= router['status'] %>">
          <td><%= name %></td>
          <td><%= router['rule'] %></td>
          <td><%= router['service'] %></td>
          <td>
            <span class="badge <%= router['status'] == 'enabled' ? 'success' : 'danger' %>">
              <%= router['status'] %>
            </span>
          </td>
        </tr>
      <% end %>
    </tbody>
  </table>

  <h2>Services</h2>
  <table>
    <thead>
      <tr>
        <th>Name</th>
        <th>Servers</th>
        <th>Health Check</th>
        <th>Status</th>
      </tr>
    </thead>
    <tbody>
      <% @services.each do |name, service| %>
        <% next if name.include?('@internal') %>
        <% lb = service['loadBalancer'] || {} %>
        <% servers = lb['servers'] || [] %>
        <% health = lb['healthCheck'] || {} %>

        <tr class="<%= service['status'] %>">
          <td><%= name %></td>
          <td>
            <% servers.each do |server| %>
              <div><%= server['url'] %></div>
            <% end %>
          </td>
          <td><%= health['path'] %></td>
          <td>
            <span class="badge <%= service['status'] == 'enabled' ? 'success' : 'danger' %>">
              <%= service['status'] %>
            </span>
          </td>
        </tr>
      <% end %>
    </tbody>
  </table>
</div>
```

## Example Response Format

### Routers

```json
{
  "ingest@file": {
    "entryPoints": ["websecure"],
    "service": "submarines-ingest@file",
    "rule": "Host(`ingest.yourdomain.com`)",
    "status": "enabled",
    "using": ["websecure"],
    "tls": {
      "certResolver": "letsencrypt"
    }
  }
}
```

### Services

```json
{
  "submarines-ingest@file": {
    "loadBalancer": {
      "servers": [
        {
          "url": "http://submarines-ingest:8080"
        }
      ],
      "healthCheck": {
        "path": "/health",
        "interval": "10s",
        "timeout": "3s"
      },
      "passHostHeader": true
    },
    "status": "enabled",
    "serverStatus": {
      "http://submarines-ingest:8080": "UP"
    }
  }
}
```

## Environment Variables

Add to Flagship's environment:

```yaml
# compose.yml
flagship:
  environment:
    TRAEFIK_API_URL: http://traefik:8080/api
```

## Security Note

The Traefik API is only accessible from within the Docker network. It's not exposed externally, so Flagship can safely query it without authentication.

## Use Cases in Flagship

1. **Dashboard Widget** - Show routing health on admin dashboard
2. **Health Monitoring** - Alert when services go down
3. **SSL Certificate Status** - Show cert expiry dates
4. **Service Discovery** - Auto-detect available services
5. **Debugging Tool** - Help admins diagnose routing issues

## CLI Access

For quick debugging, use the CLI script:

```bash
make traefik-status
make traefik-routers
make traefik-services
```
