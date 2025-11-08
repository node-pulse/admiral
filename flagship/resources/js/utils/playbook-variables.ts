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
};
