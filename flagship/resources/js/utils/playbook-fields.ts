/**
 * Playbook field configurations for deployment forms
 */

export interface FieldConfig {
    name: string;
    label: string;
    placeholder: string;
    helpText: string;
}

/**
 * Common extra variables used across multiple playbooks
 */
export const extraVariables = {
    agent_version: {
        name: 'agent_version',
        label: 'Agent Version (Optional)',
        placeholder: 'latest',
        helpText: 'Leave blank for latest (e.g., v0.1.0 for specific version)',
    },
    ingest_endpoint: {
        name: 'ingest_endpoint',
        label: 'Ingest Endpoint (Optional)',
        placeholder: 'http://ingest.localhost/metrics/prometheus',
        helpText: 'Leave blank to use default ingest endpoint',
    },
} as const;

/**
 * Define required fields for each playbook
 * Maps playbook path to array of field configurations
 */
export const playbookFields: Record<string, FieldConfig[]> = {
    'nodepulse/deploy-agent-mtls.yml': [
        extraVariables.agent_version,
        extraVariables.ingest_endpoint,
    ],
    'nodepulse/deploy-agent-no-mtls.yml': [
        extraVariables.agent_version,
        extraVariables.ingest_endpoint,
    ],
    'nodepulse/retry-failed.yml': [
        extraVariables.agent_version,
        extraVariables.ingest_endpoint,
    ],
};
