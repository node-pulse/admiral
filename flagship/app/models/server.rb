class Server < ApplicationRecord
  self.table_name = "admiral.servers"

  belongs_to :private_key, optional: true
  has_many :metrics, dependent: :destroy, foreign_key: :server_id
  has_many :alerts, dependent: :destroy, foreign_key: :server_id

  validates :ssh_host, presence: true, if: :ssh_enabled?
  validates :ssh_port, presence: true, numericality: { only_integer: true, greater_than: 0 }, if: :ssh_enabled?
  validates :ssh_username, presence: true, if: :ssh_enabled?
  validates :private_key_id, presence: true, if: :ssh_enabled?

  # Scopes
  scope :active, -> { where(status: "active") }
  scope :inactive, -> { where(status: "inactive") }
  scope :recently_seen, -> { where("last_seen_at > ?", 15.minutes.ago) }
  scope :reachable, -> { where(is_reachable: true) }
  scope :unreachable, -> { where(is_reachable: false) }

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

  # SSH connection helpers
  def ssh_enabled?
    ssh_host.present? || private_key_id.present?
  end

  # Test SSH connection
  def test_connection!
    raise "SSH not configured for this server" unless ssh_enabled?
    raise "Private key not found" unless private_key

    require 'net/ssh'

    result = nil
    Net::SSH.start(
      ssh_host,
      ssh_username,
      port: ssh_port,
      keys_only: true,
      key_data: [private_key.private_key_content],
      timeout: 10,
      verify_host_key: :never # In production, consider using :always with known_hosts
    ) do |ssh|
      result = ssh.exec!('whoami').strip
      raise "Authentication succeeded but command failed" unless result == ssh_username
    end

    update!(
      is_reachable: true,
      last_validated_at: Time.current
    )

    { success: true, message: "Successfully connected as #{result}" }
  rescue Net::SSH::AuthenticationFailed => e
    update!(is_reachable: false)
    { success: false, message: "Authentication failed: #{e.message}" }
  rescue Net::SSH::ConnectionTimeout, Errno::ETIMEDOUT => e
    update!(is_reachable: false)
    { success: false, message: "Connection timeout: #{e.message}" }
  rescue => e
    update!(is_reachable: false)
    { success: false, message: "Connection failed: #{e.message}" }
  end

  # Execute SSH command (use with caution)
  def ssh_exec(command)
    raise "SSH not configured for this server" unless ssh_enabled?
    raise "Private key not found" unless private_key
    raise "Server is not reachable" unless is_reachable

    require 'net/ssh'

    output = nil
    Net::SSH.start(
      ssh_host,
      ssh_username,
      port: ssh_port,
      keys_only: true,
      key_data: [private_key.private_key_content],
      timeout: 10,
      verify_host_key: :never
    ) do |ssh|
      output = ssh.exec!(command)
    end

    output
  rescue => e
    raise "SSH command failed: #{e.message}"
  end

  # Connection status badge
  def connection_status_badge
    return "not_configured" unless ssh_enabled?
    return "unknown" if last_validated_at.nil?
    return "stale" if last_validated_at < 1.hour.ago

    is_reachable ? "connected" : "failed"
  end
end
