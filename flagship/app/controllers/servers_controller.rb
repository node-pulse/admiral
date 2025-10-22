class ServersController < ApplicationController
  before_action :set_server, only: [ :show, :edit, :update, :destroy, :metrics ]

  def index
    @servers = Server.order(last_seen_at: :desc)

    # Filter by status if provided
    @servers = @servers.where(status: params[:status]) if params[:status].present?

    @pagy, @servers = pagy(@servers, items: 20)
  end

  def show
    @latest_metric = @server.latest_metric
    @active_alerts = @server.alerts.active
  end

  def metrics
    # Time range filtering (default 24 hours)
    @time_range = params[:range]&.to_i&.hours || 24.hours

    @metrics = @server.metrics.where("timestamp > ?", @time_range.ago).order(:timestamp)

    # Prepare chart data
    @cpu_data = @metrics.pluck(:timestamp, :cpu_usage_percent)
    @memory_data = @metrics.pluck(:timestamp, :memory_usage_percent)
    @disk_data = @metrics.pluck(:timestamp, :disk_usage_percent)
  end

  def edit
  end

  def update
    if @server.update(server_params)
      redirect_to @server, notice: "Server was successfully updated."
    else
      render :edit, status: :unprocessable_entity
    end
  end

  def destroy
    @server.destroy
    redirect_to servers_url, notice: "Server was successfully deleted."
  end

  private

  def set_server
    @server = Server.find(params[:id])
  end

  def server_params
    params.require(:server).permit(:hostname, :status, :tags, :metadata)
  end
end
