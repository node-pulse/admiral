module ApplicationHelper
  include Pagy::Frontend

  def nav_class(path)
    base = "block px-4 py-2 rounded transition-colors"
    active = "bg-gray-800 text-white"
    inactive = "text-gray-300 hover:bg-gray-800 hover:text-white"

    current_page?(path) ? "#{base} #{active}" : "#{base} #{inactive}"
  end

  def flash_class(type)
    case type.to_sym
    when :notice then "bg-blue-100 border border-blue-400 text-blue-700"
    when :success then "bg-green-100 border border-green-400 text-green-700"
    when :alert, :error then "bg-red-100 border border-red-400 text-red-700"
    when :warning then "bg-yellow-100 border border-yellow-400 text-yellow-700"
    else "bg-gray-100 border border-gray-400 text-gray-700"
    end
  end

  def status_badge(status)
    colors = {
      "active" => "bg-green-100 text-green-800",
      "inactive" => "bg-gray-100 text-gray-800",
      "error" => "bg-red-100 text-red-800"
    }

    content_tag :span, status.titleize, class: "px-2 py-1 text-xs font-semibold rounded-full #{colors[status]}"
  end

  def severity_badge(severity)
    colors = {
      "critical" => "bg-red-100 text-red-800",
      "warning" => "bg-yellow-100 text-yellow-800",
      "info" => "bg-blue-100 text-blue-800"
    }

    content_tag :span, severity.titleize, class: "px-2 py-1 text-xs font-semibold rounded-full #{colors[severity]}"
  end
end
