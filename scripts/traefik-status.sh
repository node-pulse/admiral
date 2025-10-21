#!/bin/bash
# Traefik Status - Query Traefik API for dashboard data
# Usage: ./traefik-status.sh [overview|routers|services|middlewares|entrypoints]

set -e

TRAEFIK_CONTAINER="node-pulse-traefik"
API_BASE="http://localhost:8080/api"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Helper function to query API
query_api() {
    docker exec "$TRAEFIK_CONTAINER" wget -qO- "$1" 2>/dev/null || echo "{\"error\":\"Failed to query API\"}"
}

# Parse JSON with basic tools (no jq dependency)
parse_json() {
    python3 -c "import sys, json; data=json.load(sys.stdin); $1"
}

show_overview() {
    echo -e "${BLUE}=== Traefik Overview ===${NC}\n"

    # Get version
    VERSION=$(query_api "$API_BASE/version" | parse_json "print(data.get('Version', 'unknown'))")
    echo -e "${GREEN}Version:${NC} $VERSION\n"

    # Get overview
    OVERVIEW=$(query_api "$API_BASE/overview")

    echo -e "${YELLOW}HTTP:${NC}"
    echo "$OVERVIEW" | parse_json "
http = data.get('http', {});
print(f\"  Routers: {len(http.get('routers', {}))}\");
print(f\"  Services: {len(http.get('services', {}))}\");
print(f\"  Middlewares: {len(http.get('middlewares', {}))}\")
"
}

show_routers() {
    echo -e "${BLUE}=== HTTP Routers ===${NC}\n"

    ROUTERS=$(query_api "$API_BASE/http/routers")

    echo "$ROUTERS" | parse_json "
for name, router in data.items():
    status = router.get('status', 'unknown')
    rule = router.get('rule', 'N/A')
    service = router.get('service', 'N/A')

    # Color based on status
    if status == 'enabled':
        color = '\033[0;32m'  # Green
    else:
        color = '\033[0;31m'  # Red

    print(f\"{color}● {name}\033[0m\")
    print(f\"  Rule: {rule}\")
    print(f\"  Service: {service}\")
    print(f\"  Status: {status}\")
    print()
"
}

show_services() {
    echo -e "${BLUE}=== HTTP Services ===${NC}\n"

    SERVICES=$(query_api "$API_BASE/http/services")

    echo "$SERVICES" | parse_json "
for name, service in data.items():
    if '@internal' in name:
        continue

    status = service.get('status', 'unknown')
    lb = service.get('loadBalancer', {})
    servers = lb.get('servers', [])

    # Color based on status
    if status == 'enabled':
        color = '\033[0;32m'  # Green
    else:
        color = '\033[0;31m'  # Red

    print(f\"{color}● {name}\033[0m\")
    print(f\"  Status: {status}\")
    print(f\"  Servers: {len(servers)}\")

    for server in servers:
        url = server.get('url', 'N/A')
        print(f\"    - {url}\")

    # Health check info
    health = lb.get('healthCheck', {})
    if health:
        print(f\"  Health Check: {health.get('path', 'N/A')}\")

    print()
"
}

show_middlewares() {
    echo -e "${BLUE}=== HTTP Middlewares ===${NC}\n"

    MIDDLEWARES=$(query_api "$API_BASE/http/middlewares")

    echo "$MIDDLEWARES" | parse_json "
for name, middleware in data.items():
    if '@internal' in name:
        continue

    status = middleware.get('status', 'unknown')
    mw_type = list(middleware.keys())[0] if middleware else 'unknown'

    print(f\"\033[0;32m● {name}\033[0m\")
    print(f\"  Type: {mw_type}\")
    print(f\"  Status: {status}\")
    print()
"
}

show_entrypoints() {
    echo -e "${BLUE}=== Entry Points ===${NC}\n"

    ENTRYPOINTS=$(query_api "$API_BASE/entrypoints")

    echo "$ENTRYPOINTS" | parse_json "
for name, ep in data.items():
    address = ep.get('address', 'N/A')
    print(f\"\033[0;32m● {name}\033[0m\")
    print(f\"  Address: {address}\")
    print()
"
}

show_help() {
    echo "Traefik Status - Query Traefik API"
    echo ""
    echo "Usage: $0 [COMMAND]"
    echo ""
    echo "Commands:"
    echo "  overview      Show overview (default)"
    echo "  routers       Show HTTP routers"
    echo "  services      Show HTTP services"
    echo "  middlewares   Show HTTP middlewares"
    echo "  entrypoints   Show entry points"
    echo "  help          Show this help"
    echo ""
    echo "Examples:"
    echo "  $0                # Show overview"
    echo "  $0 routers        # Show all routers"
    echo "  $0 services       # Show all services with health checks"
}

# Main
case "${1:-overview}" in
    overview)
        show_overview
        ;;
    routers)
        show_routers
        ;;
    services)
        show_services
        ;;
    middlewares)
        show_middlewares
        ;;
    entrypoints)
        show_entrypoints
        ;;
    help|--help|-h)
        show_help
        ;;
    *)
        echo "Unknown command: $1"
        echo ""
        show_help
        exit 1
        ;;
esac
