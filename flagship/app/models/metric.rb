class Metric < ApplicationRecord
  self.table_name = "submarines.metrics"

  belongs_to :server, foreign_key: :server_id

  # Scopes for time ranges
  scope :last_hour, -> { where("timestamp > ?", 1.hour.ago) }
  scope :last_24_hours, -> { where("timestamp > ?", 24.hours.ago) }
  scope :last_7_days, -> { where("timestamp > ?", 7.days.ago) }
  scope :last_30_days, -> { where("timestamp > ?", 30.days.ago) }

  # Chart data helpers
  def self.chart_data(metric_field, time_range = 24.hours)
    where("timestamp > ?", time_range.ago)
      .order(:timestamp)
      .pluck(:timestamp, metric_field)
  end
end


