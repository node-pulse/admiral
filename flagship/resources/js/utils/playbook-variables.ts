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
        placeholder: 'http://ingest.localhost/metrics/prometheus',
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
        helpText: 'Comma-separated list of custom TCP ports to allow (e.g., 8080,3000)',
    },
    custom_udp_ports: {
        name: 'custom_udp_ports',
        label: 'Custom UDP Ports',
        defaultValue: '',
        isRequired: false,
        placeholder: '5353,1194',
        helpText: 'Comma-separated list of custom UDP ports to allow (e.g., 5353,1194)',
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
};
