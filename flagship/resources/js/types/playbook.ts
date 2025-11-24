/**
 * Community Playbook Manifest Types
 * Based on: /playbooks/schemas/node-pulse-admiral-playbook-manifest-v1.schema.json
 */

export interface PlaybookVariable {
    name: string;
    label: string;
    type: 'string' | 'integer' | 'boolean' | 'select' | 'password';
    description: string;
    required: boolean;
    default?: string | number | boolean;
    pattern?: string; // For string type only
    min?: number; // For integer type only
    max?: number; // For integer type only
    options?: string[]; // For select type only
}

export interface PlaybookConfig {
    file: string;
    variables: string[]; // Variable names required for this playbook
}

export interface PlaybookStructure {
    playbooks: {
        install: PlaybookConfig;
        uninstall: PlaybookConfig;
        update?: PlaybookConfig;
    };
    templates?: string[];
    files?: string[];
    roles?: string[];
}

export interface PlaybookAuthor {
    name: string;
    email?: string;
    url?: string;
    status?: 'community' | 'verified' | 'deprecated';
}

export interface PlaybookOsSupport {
    distro: 'ubuntu' | 'debian' | 'centos' | 'rhel' | 'rocky' | 'alma' | 'oracle' | 'amazon';
    version: string;
    arch: 'amd64' | 'arm64' | 'both';
}

export interface PlaybookHealthCheck {
    type: 'http' | 'tcp' | 'command';
    url?: string; // For http type
    expect_status?: number; // For http type
    port?: number; // For tcp type
    command?: string; // For command type
    timeout?: number;
}

export interface PlaybookManifest {
    $schema?: string;
    id: string; // Format: pb_[A-Za-z0-9]{10}
    name: string;
    version: string; // Semantic version
    description: string;
    author: PlaybookAuthor;
    homepage?: string;
    repository?: string;
    category: 'monitoring' | 'database' | 'search' | 'security' | 'proxy' | 'storage' | 'dev-tools' | 'automation';
    tags: string[];
    structure: PlaybookStructure;
    ansible_version: string;
    os_support: PlaybookOsSupport[];
    variables?: PlaybookVariable[];
    health_checks?: PlaybookHealthCheck[];
    dangerous_operations?: string[];
    license: string; // SPDX identifier
    created_at?: string; // ISO 8601
    updated_at?: string; // ISO 8601

    // Added by backend
    downloaded?: boolean;
    downloaded_at?: number;
    source_path?: string;
}
