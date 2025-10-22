class SettingsController < ApplicationController
  def index
    @settings = Setting.order(:key)
  end

  def update
    params[:settings].each do |key, value|
      Setting.set(key, value)
    end

    redirect_to settings_path, notice: "Settings updated successfully."
  end
end
