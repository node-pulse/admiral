Rails.application.routes.draw do
  # Health check
  get "up" => "rails/health#show", as: :rails_health_check

  # Root path
  root "dashboard#index"

  # Dashboard
  get "dashboard", to: "dashboard#index", as: :dashboard

  # Servers
  resources :servers, only: [ :index, :show, :edit, :update, :destroy ] do
    member do
      get :metrics
    end
  end

  # Alerts
  resources :alerts, only: [ :index, :show ] do
    member do
      post :acknowledge
      post :resolve
    end
  end

  # Alert Rules
  resources :alert_rules do
    member do
      post :toggle
    end
  end

  # Settings
  get "settings", to: "settings#index"
  patch "settings", to: "settings#update"
end
