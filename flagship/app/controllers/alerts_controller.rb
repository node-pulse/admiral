class AlertsController < ApplicationController
  before_action :set_alert, only: [ :show, :acknowledge, :resolve ]

  def index
    @alerts = Alert.includes(:server).order(created_at: :desc)

    # Filtering
    @alerts = @alerts.where(status: params[:status]) if params[:status].present?
    @alerts = @alerts.where(severity: params[:severity]) if params[:severity].present?
    @alerts = @alerts.where(server_id: params[:server_id]) if params[:server_id].present?

    @pagy, @alerts = pagy(@alerts, items: 25)
  end

  def show
  end

  def acknowledge
    if @alert.acknowledge!
      redirect_to @alert, notice: "Alert acknowledged."
    else
      redirect_to @alert, alert: "Failed to acknowledge alert."
    end
  end

  def resolve
    if @alert.resolve!
      redirect_to alerts_path, notice: "Alert resolved."
    else
      redirect_to @alert, alert: "Failed to resolve alert."
    end
  end

  private

  def set_alert
    @alert = Alert.find(params[:id])
  end
end
