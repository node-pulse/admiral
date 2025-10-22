class AlertRule < ApplicationRecord
  self.table_name = "submarines.alert_rules"

  # Validations
  validates :name, presence: true, uniqueness: true
  validates :metric_type, presence: true
  validates :condition, presence: true, inclusion: { in: %w[gt lt eq gte lte] }
  validates :threshold, presence: true, numericality: true
  validates :severity, presence: true, inclusion: { in: %w[info warning critical] }

  # Scopes
  scope :enabled, -> { where(enabled: true) }
  scope :disabled, -> { where(enabled: false) }

  # Toggle enabled status
  def toggle!
    update(enabled: !enabled)
  end

  # Human-readable condition
  def condition_text
    {
      "gt" => ">",
      "lt" => "<",
      "eq" => "=",
      "gte" => ">=",
      "lte" => "<="
    }[condition]
  end
end
