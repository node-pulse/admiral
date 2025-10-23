class PrivateKeysController < ApplicationController
  before_action :set_private_key, only: [:show, :destroy]

  # GET /private_keys
  def index
    @private_keys = PrivateKey.all.order(created_at: :desc)
  end

  # GET /private_keys/:id
  def show
    @servers = @private_key.servers
  end

  # GET /private_keys/new
  def new
    @private_key = PrivateKey.new
  end

  # POST /private_keys
  def create
    case params[:key_action]
    when 'generate'
      create_generated_key
    when 'import'
      create_imported_key
    else
      redirect_to new_private_key_path, alert: "Please select an action (generate or import)"
    end
  end

  # DELETE /private_keys/:id
  def destroy
    if @private_key.in_use?
      redirect_to private_keys_path,
        alert: "Cannot delete key '#{@private_key.name}' because it is used by #{@private_key.servers_count} server(s)"
    else
      @private_key.destroy!
      redirect_to private_keys_path, notice: "SSH key '#{@private_key.name}' was successfully deleted"
    end
  end

  private

  def set_private_key
    @private_key = PrivateKey.find(params[:id])
  end

  def create_generated_key
    @private_key = PrivateKey.generate!(
      name: params[:private_key][:name],
      description: params[:private_key][:description],
      key_type: params[:private_key][:key_type] || 'ED25519'
    )

    redirect_to private_key_path(@private_key),
      notice: "SSH key '#{@private_key.name}' was successfully generated. Copy the public key below to your servers."
  rescue ActiveRecord::RecordInvalid => e
    @private_key = PrivateKey.new(private_key_params)
    flash.now[:alert] = "Failed to generate key: #{e.message}"
    render :new, status: :unprocessable_entity
  end

  def create_imported_key
    @private_key = PrivateKey.import!(
      name: params[:private_key][:name],
      description: params[:private_key][:description],
      private_key_content: params[:private_key][:private_key_content]
    )

    redirect_to private_keys_path,
      notice: "SSH key '#{@private_key.name}' was successfully imported"
  rescue ArgumentError => e
    @private_key = PrivateKey.new(private_key_params)
    flash.now[:alert] = e.message
    render :new, status: :unprocessable_entity
  rescue ActiveRecord::RecordInvalid => e
    @private_key = PrivateKey.new(private_key_params)
    flash.now[:alert] = "Failed to import key: #{e.message}"
    render :new, status: :unprocessable_entity
  end

  def private_key_params
    params.require(:private_key).permit(:name, :description, :private_key_content, :key_type)
  end
end
