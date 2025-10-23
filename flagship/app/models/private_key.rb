class PrivateKey < ApplicationRecord
  self.table_name = "admiral.private_keys"

  has_many :servers, dependent: :restrict_with_error, foreign_key: :private_key_id

  # Encrypt the private key content using Rails encryption
  encrypts :private_key_content

  validates :name, presence: true, uniqueness: true
  validates :private_key_content, presence: true
  validates :public_key, presence: true

  # Generate a new SSH keypair
  def self.generate!(name:, description: nil, key_type: 'ED25519')
    require 'sshkey'

    keypair = SSHKey.generate(
      type: key_type,
      comment: "nodepulse-dashboard-#{name.parameterize}"
    )

    create!(
      name: name,
      description: description,
      private_key_content: keypair.private_key,
      public_key: keypair.ssh_public_key,
      fingerprint: keypair.sha256_fingerprint
    )
  end

  # Import an existing private key
  def self.import!(name:, private_key_content:, description: nil)
    require 'sshkey'

    # Parse the private key to get public key and fingerprint
    keypair = SSHKey.new(private_key_content)

    create!(
      name: name,
      description: description,
      private_key_content: private_key_content,
      public_key: keypair.ssh_public_key,
      fingerprint: keypair.sha256_fingerprint
    )
  rescue => e
    raise ArgumentError, "Invalid private key: #{e.message}"
  end

  # Human-friendly display name
  def display_name
    name
  end

  # Masked fingerprint for display
  def short_fingerprint
    fingerprint&.split(':')&.last(4)&.join(':') || 'N/A'
  end

  # Check if key is in use by any servers
  def in_use?
    servers.exists?
  end

  # Count of servers using this key
  def servers_count
    servers.count
  end
end
