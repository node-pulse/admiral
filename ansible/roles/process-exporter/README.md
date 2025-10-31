# Process Exporter Ansible Role

Installs and configures [process-exporter](https://github.com/ncabatoff/process-exporter) for Prometheus-based process monitoring.

## Description

This role deploys process_exporter on target servers to collect per-process metrics:
- CPU usage per process group
- Memory usage (RSS) per process group
- Process count per group

Process groups are defined by command name (e.g., all "nginx" processes are grouped together).

## Requirements

- Linux system (Ubuntu, Debian, RHEL, CentOS)
- systemd for service management
- Internet access to download process_exporter binary from GitHub

## Role Variables

### Version and Download

```yaml
process_exporter_version: "0.8.3"
```

### Installation Paths

```yaml
process_exporter_install_dir: "/opt/process_exporter"
process_exporter_bin_path: "/usr/local/bin/process-exporter"
process_exporter_config_dir: "/etc/process_exporter"
```

### Network Configuration

```yaml
process_exporter_listen_address: "127.0.0.1"  # localhost only (security)
process_exporter_listen_port: 9256
```

### Process Monitoring

```yaml
process_exporter_track_all: true  # Track all processes
process_exporter_children: true   # Include child processes
process_exporter_threads: true    # Include threads
```

## Dependencies

None.

## Example Playbook

### Basic Usage (Track All Processes)

```yaml
- hosts: servers
  become: yes
  roles:
    - role: process-exporter
```

### Custom Process Groups

```yaml
- hosts: servers
  become: yes
  roles:
    - role: process-exporter
      vars:
        process_exporter_track_all: false
        process_exporter_process_names:
          - name: "postgres"
            cmdline:
              - "postgres.*"
          - name: "nginx"
            cmdline:
              - "nginx.*"
          - name: "python"
            cmdline:
              - "python.*"
```

## Deployment with NodePulse Agent

To enable process monitoring in NodePulse, deploy both exporters:

```yaml
- hosts: servers
  become: yes
  roles:
    - role: node-exporter          # System metrics
    - role: process-exporter       # Process metrics
    - role: nodepulse-agent
      vars:
        process_exporter_enabled: true  # Enable in agent config
```

## Verification

After deployment, verify the exporter is running:

```bash
# Check service status
sudo systemctl status process_exporter

# Test metrics endpoint
curl http://127.0.0.1:9256/metrics

# Check for process metrics
curl http://127.0.0.1:9256/metrics | grep namedprocess_namegroup
```

## Metrics Exposed

Key metrics:
- `namedprocess_namegroup_num_procs{groupname="..."}` - Number of processes
- `namedprocess_namegroup_cpu_seconds_total{groupname="..."}` - Total CPU time
- `namedprocess_namegroup_memory_bytes{groupname="...",memtype="resident"}` - RSS memory

## Security

- Listens on localhost only (127.0.0.1) by default
- Scraped by NodePulse Agent locally
- No external network exposure required

## License

MIT

## Author

NodePulse Team
