# Flagship Rails Dashboard - Implementation Plan

**Date:** 2025-10-22
**Goal:** Build a web dashboard in Flagship (Ruby on Rails 8) to display metrics from `admiral.metrics` with authentication, CRUD operations, and charts.

---

## Implementation Phases

### Phase 1: Foundation

- **Authentication** - Simple session-based auth (Kratos integration later)
- **Gems** - Add chartkick, pagy (pagination)
- **Base Layout** - Sidebar navigation, topbar with user info

### Phase 2: Models

- Create ActiveRecord models for:
  - `Server` (reads from `admiral.servers`)
  - `Metric` (reads from `admiral.metrics`)
  - `Alert` (reads from `admiral.alerts`)
  - `AlertRule` (reads/writes to `admiral.alert_rules`)
  - `Setting` (reads/writes to `flagship.settings`)
- Configure `self.table_name = "admiral.servers"` to read from submarines schema

### Phase 3: Core Features

- **Dashboard** - Overview stats, server list, recent alerts
- **Servers** - List, detail view with metrics
- **Metrics/Charts** - Time-series charts (CPU, Memory, Disk, Network)
- **Alerts** - List, acknowledge, resolve
- **Alert Rules** - CRUD operations, enable/disable
- **Settings** - System configuration

### Phase 4: Polish

- **UI Components** - Tailwind-based cards, tables, badges
- **Real-time** - Optional ActionCable for live updates
- **Search/Filter** - Filter servers by status, alerts by severity
- **Pagination** - Use pagy for all lists

---

## Key Routes

```ruby
root "dashboard#index"

resources :servers, only: [:index, :show, :edit, :update] do
  member do
    get :metrics
  end
end

resources :alerts, only: [:index, :show] do
  member do
    post :acknowledge
    post :resolve
  end
end

resources :alert_rules

get "settings", to: "settings#index"
patch "settings", to: "settings#update"
```

---

## Tech Stack

- **Rails 8.0** with Hotwire (Turbo + Stimulus)
- **Tailwind CSS** for styling
- **Chartkick** + Chart.js for metrics charts
- **Pagy** for pagination
- **PostgreSQL** with multiple schemas

---

## MVP Features (Priority 1)

1. Basic layout with navigation
2. Dashboard homepage with stats
3. Servers list and detail pages
4. Charts for CPU/Memory/Disk metrics
5. Simple authentication

## Phase 2 Features

6. Alerts list and management
7. Alert rules CRUD
8. Time range filtering for charts
9. Search and filtering

## Future Enhancements

10. Real-time updates via ActionCable
11. Kratos integration
12. Background jobs
13. Email notifications
14. Advanced analytics

---

## Notes

- **Read-only from submarines schema** - Flagship only writes to `flagship.settings` and `admiral.alert_rules`
- **No migrations needed** - All tables created by Submarines migrations
- **Schema isolation** - Each service has its own schema in shared PostgreSQL database
- **Simple first, polish later** - Focus on functionality before perfection

---

**Status:** Ready to implement
**Next Step:** Start with Phase 1 (Foundation) or Phase 2 (Models)
