/**
 * Deployment variable configurations for playbook deployment forms
 */

export interface PlaybookVariable {
    name: string;
    label: string;
    placeholder: string;
    helpText: string;
    defaultValue: string | null;
    isRequired: boolean;
}

/**
 * Deployment variables for Node Pulse playbooks
 */
export const playbookVariableList = {
    agent_version: {
        name: 'agent_version',
        label: 'Agent Version (Optional)',
        defaultValue: 'latest',
        isRequired: false,
        placeholder: 'latest',
        helpText: 'Leave blank for latest (e.g., v0.1.0 for specific version)',
    },
    ingest_endpoint: {
        name: 'ingest_endpoint',
        label: 'Ingest Endpoint',
        defaultValue: null,
        isRequired: true,
        placeholder: 'https://<FLAGSHIP_DOMAIN>/ingest/metrics/prometheus',
        helpText: 'Leave blank to use default ingest endpoint',
    },
    // Security playbook variables
    ssh_port: {
        name: 'ssh_port',
        label: 'SSH Port',
        defaultValue: '22',
        isRequired: true,
        placeholder: '22',
        helpText: 'SSH port to allow through firewall (default: 22)',
    },
    allow_http: {
        name: 'allow_http',
        label: 'Allow HTTP (Port 80)',
        defaultValue: 'true',
        isRequired: false,
        placeholder: 'true',
        helpText: 'Allow HTTP traffic on port 80',
    },
    allow_https: {
        name: 'allow_https',
        label: 'Allow HTTPS (Port 443)',
        defaultValue: 'true',
        isRequired: false,
        placeholder: 'true',
        helpText: 'Allow HTTPS traffic on port 443',
    },
    custom_tcp_ports: {
        name: 'custom_tcp_ports',
        label: 'Custom TCP Ports',
        defaultValue: '',
        isRequired: false,
        placeholder: '8080,3000,9000',
        helpText:
            'Comma-separated list of custom TCP ports to allow (e.g., 8080,3000)',
    },
    custom_udp_ports: {
        name: 'custom_udp_ports',
        label: 'Custom UDP Ports',
        defaultValue: '',
        isRequired: false,
        placeholder: '5353,1194',
        helpText:
            'Comma-separated list of custom UDP ports to allow (e.g., 5353,1194)',
    },
    disable_password_auth: {
        name: 'disable_password_auth',
        label: 'Disable Password Authentication',
        defaultValue: 'true',
        isRequired: false,
        placeholder: 'true',
        helpText: 'Disable password authentication (SSH key-only)',
    },
    disable_root_login: {
        name: 'disable_root_login',
        label: 'Disable Root Login',
        defaultValue: 'false',
        isRequired: false,
        placeholder: 'false',
        helpText: 'Disable root SSH login (ensure you have another sudo user!)',
    },
    // Docker playbook variables
    docker_primary_user: {
        name: 'docker_primary_user',
        label: 'Primary Docker User',
        defaultValue: 'root',
        isRequired: false,
        placeholder: 'root',
        helpText:
            'Main user for Docker operations (created if missing, added to docker group)',
    },
    docker_version: {
        name: 'docker_version',
        label: 'Docker Version',
        defaultValue: '',
        isRequired: false,
        placeholder: '25.0',
        helpText:
            'Specific Docker version (leave blank for latest, e.g., "25.0" or "24.0.7")',
    },
    docker_install_script_checksum: {
        name: 'docker_install_script_checksum',
        label: 'Install Script Checksum (SHA256)',
        defaultValue: '',
        isRequired: false,
        placeholder: 'abc123...',
        helpText:
            'SHA256 checksum for security (get: curl -sL https://get.docker.com | sha256sum)',
    },
    install_compose: {
        name: 'install_compose',
        label: 'Install Docker Compose',
        defaultValue: 'true',
        isRequired: false,
        placeholder: 'true',
        helpText: 'Install Docker Compose plugin alongside Docker',
    },
    docker_users: {
        name: 'docker_users',
        label: 'Additional Docker Users',
        defaultValue: '',
        isRequired: false,
        placeholder: 'ubuntu,developer,ops',
        helpText:
            'Comma-separated list of extra users to add to docker group (must exist)',
    },
    docker_daemon_merge_strategy: {
        name: 'docker_daemon_merge_strategy',
        label: 'daemon.json Merge Strategy',
        defaultValue: 'existing-wins',
        isRequired: false,
        placeholder: 'existing-wins',
        helpText:
            '"existing-wins" (preserve manual changes) or "playbook-wins" (enforce config)',
    },
    docker_service_enabled: {
        name: 'docker_service_enabled',
        label: 'Enable Docker Service',
        defaultValue: 'true',
        isRequired: false,
        placeholder: 'true',
        helpText: 'Start Docker automatically on boot',
    },
    docker_create_user_if_missing: {
        name: 'docker_create_user_if_missing',
        label: 'Auto-Create User',
        defaultValue: 'true',
        isRequired: false,
        placeholder: 'true',
        helpText: "Create primary user if it doesn't exist (non-root only)",
    },
    docker_user_shell: {
        name: 'docker_user_shell',
        label: 'User Shell',
        defaultValue: '/bin/bash',
        isRequired: false,
        placeholder: '/bin/bash',
        helpText: 'Default shell for created users (e.g., /bin/bash, /bin/zsh)',
    },
    docker_user_create_home: {
        name: 'docker_user_create_home',
        label: 'Create Home Directory',
        defaultValue: 'true',
        isRequired: false,
        placeholder: 'true',
        helpText: 'Create home directory for new users',
    },
} as const;

/**
 * Define required fields for each playbook
 * Maps playbook path to array of field configurations
 */
export const playbookVariableMap: Record<string, PlaybookVariable[]> = {
    'nodepulse/deploy.yml': [
        playbookVariableList.agent_version,
        playbookVariableList.ingest_endpoint,
    ],
    'security/configure-firewall.yml': [
        playbookVariableList.ssh_port,
        playbookVariableList.allow_http,
        playbookVariableList.allow_https,
        playbookVariableList.custom_tcp_ports,
        playbookVariableList.custom_udp_ports,
    ],
    'security/harden-ssh.yml': [
        playbookVariableList.ssh_port,
        playbookVariableList.disable_password_auth,
        playbookVariableList.disable_root_login,
    ],
    'infra/docker.yml': [
        playbookVariableList.docker_primary_user,
        playbookVariableList.docker_version,
        playbookVariableList.docker_install_script_checksum,
        playbookVariableList.install_compose,
        playbookVariableList.docker_users,
        playbookVariableList.docker_daemon_merge_strategy,
        playbookVariableList.docker_service_enabled,
        playbookVariableList.docker_create_user_if_missing,
        playbookVariableList.docker_user_shell,
        playbookVariableList.docker_user_create_home,
    ],
};
