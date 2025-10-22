class Server < ApplicationRecord
  self.table_name = "submarines.servers"

  has_many :metrics, dependent: :destroy, foreign_key: :server_id
  has_many :alerts, dependent: :destroy, foreign_key: :server_id

  # Scopes
  scope :active, -> { where(status: "active") }
  scope :inactive, -> { where(status: "inactive") }
  scope :recently_seen, -> { where("last_seen_at > ?", 15.minutes.ago) }

  # Status helpers
  def online?
    last_seen_at && last_seen_at > 5.minutes.ago
  end

  def latest_metric
    metrics.order(timestamp: :desc).first
  end

  def cpu_usage
    latest_metric&.cpu_usage_percent || 0
  end

  def memory_usage
    latest_metric&.memory_usage_percent || 0
  end

  def disk_usage
    latest_metric&.disk_usage_percent || 0
  end
end
