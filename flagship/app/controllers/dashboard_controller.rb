class DashboardController < ApplicationController
  def index
    @servers_count = Server.count
    @active_servers_count = Server.active.count
    @online_servers_count = Server.recently_seen.count

    @active_alerts_count = Alert.active.count
    @critical_alerts_count = Alert.active.by_severity("critical").count

    @recent_alerts = Alert.active.recent.limit(5).includes(:server)
    @servers = Server.order(last_seen_at: :desc).limit(10)
  end
end
