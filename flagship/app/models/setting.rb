class Setting < ApplicationRecord
  self.table_name = "flagship.settings"
  self.primary_key = "key"

  # Helper to get setting value
  def self.get(key)
    find_by(key: key)&.value
  end

  # Helper to set setting value
  def self.set(key, value, description: nil, tier: "free")
    setting = find_or_initialize_by(key: key)
    setting.value = value
    setting.description = description if description
    setting.tier = tier
    setting.save
    setting
  end
end
