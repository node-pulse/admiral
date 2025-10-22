class AlertRulesController < ApplicationController
  before_action :set_alert_rule, only: [ :show, :edit, :update, :destroy, :toggle ]

  def index
    @alert_rules = AlertRule.order(created_at: :desc)
    @alert_rules = @alert_rules.where(enabled: true) if params[:enabled] == "true"
  end

  def show
  end

  def new
    @alert_rule = AlertRule.new
  end

  def create
    @alert_rule = AlertRule.new(alert_rule_params)

    if @alert_rule.save
      redirect_to alert_rules_path, notice: "Alert rule was successfully created."
    else
      render :new, status: :unprocessable_entity
    end
  end

  def edit
  end

  def update
    if @alert_rule.update(alert_rule_params)
      redirect_to alert_rules_path, notice: "Alert rule was successfully updated."
    else
      render :edit, status: :unprocessable_entity
    end
  end

  def destroy
    @alert_rule.destroy
    redirect_to alert_rules_url, notice: "Alert rule was successfully deleted."
  end

  def toggle
    @alert_rule.toggle!
    redirect_to alert_rules_path, notice: "Alert rule #{@alert_rule.enabled? ? 'enabled' : 'disabled'}."
  end

  private

  def set_alert_rule
    @alert_rule = AlertRule.find(params[:id])
  end

  def alert_rule_params
    params.require(:alert_rule).permit(
      :name, :description, :metric_type, :condition, :threshold,
      :duration_seconds, :severity, :enabled, :server_ids, :server_tags
    )
  end
end
