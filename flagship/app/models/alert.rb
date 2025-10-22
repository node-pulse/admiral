class Alert < ApplicationRecord
  self.table_name = "submarines.alerts"

  belongs_to :server, foreign_key: :server_id

  # Scopes
  scope :active, -> { where(status: "active") }
  scope :acknowledged, -> { where(status: "acknowledged") }
  scope :resolved, -> { where(status: "resolved") }
  scope :by_severity, ->(severity) { where(severity: severity) }
  scope :recent, -> { order(created_at: :desc) }

  # Status methods
  def acknowledge!
    update(status: "acknowledged", acknowledged_at: Time.current)
  end

  def resolve!
    update(status: "resolved", resolved_at: Time.current)
  end

  # Severity badge color helpers
  def severity_color
    case severity
    when "critical" then "red"
    when "warning" then "yellow"
    when "info" then "blue"
    else "gray"
    end
  end
end
