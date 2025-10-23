# Add builds directory to asset paths for Tailwind CSS
Rails.application.config.assets.paths << Rails.root.join("app/assets/builds")
