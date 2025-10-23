class ServersController < ApplicationController
  before_action :set_server, only: [ :show, :edit, :update, :destroy, :metrics, :test_connection ]

  def index
    @servers = Server.includes(:private_key).order(last_seen_at: :desc)

    # Filter by status if provided
    @servers = @servers.where(status: params[:status]) if params[:status].present?

    @pagy, @servers = pagy(@servers, items: 20)
  end

  def show
    @latest_metric = @server.latest_metric
    @active_alerts = @server.alerts.active
  end

  def new
    @server = Server.new
    @private_keys = PrivateKey.all
  end

  def create
    @server = Server.new(server_params)

    if @server.save
      redirect_to server_path(@server), notice: "Server '#{@server.name}' was successfully created"
    else
      @private_keys = PrivateKey.all
      render :new, status: :unprocessable_entity
    end
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
    @private_keys = PrivateKey.all
  end

  def update
    if @server.update(server_params)
      redirect_to @server, notice: "Server was successfully updated."
    else
      @private_keys = PrivateKey.all
      render :edit, status: :unprocessable_entity
    end
  end

  def destroy
    @server.destroy
    redirect_to servers_url, notice: "Server was successfully deleted."
  end

  # POST /servers/:id/test_connection
  def test_connection
    result = @server.test_connection!

    if result[:success]
      redirect_to server_path(@server), notice: result[:message]
    else
      redirect_to server_path(@server), alert: result[:message]
    end
  rescue => e
    redirect_to server_path(@server), alert: "Connection test failed: #{e.message}"
  end

  private

  def set_server
    @server = Server.find(params[:id])
  end

  def server_params
    params.require(:server).permit(
      :name,
      :hostname,
      :description,
      :status,
      :tags,
      :metadata,
      :ssh_host,
      :ssh_port,
      :ssh_username,
      :private_key_id
    )
  end
end
