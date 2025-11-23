import { BulkEditVariablesDialog } from '@/components/deployments/create/bulk-edit-variables-dialog';
import { CommunityPlaybookVariables } from '@/components/deployments/create/community-playbook-variables';
import { PlaybookSelector } from '@/components/deployments/create/playbook-selector';
import { ServerSelectionTable } from '@/components/deployments/create/server-selection-table';
import { VariableFileUploader } from '@/components/deployments/create/variable-file-uploader';
import { Button } from '@/components/ui/button';
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from '@/components/ui/card';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

import { Textarea } from '@/components/ui/textarea';
import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem } from '@/types';
import { type PlaybookConfig, type PlaybookManifest } from '@/types/playbook';
import { LeanServerData } from '@/types/servers';
import { playbookVariableMap } from '@/utils/playbook-variables';
import { Head, router, usePage } from '@inertiajs/react';
import { ArrowLeft, Loader2, Rocket, Search, Server } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

const breadcrumbs: BreadcrumbItem[] = [
    {
        title: 'Deployments',
        href: '/dashboard/deployments',
    },
    {
        title: 'Create',
        href: '/dashboard/deployments/create',
    },
];

export default function CreateDeployment() {
    const { props } = usePage();
    const csrfToken =
        (props as any).csrf_token ||
        document
            .querySelector('meta[name="csrf-token"]')
            ?.getAttribute('content') ||
        '';

    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [servers, setServers] = useState<LeanServerData[]>([]);
    const [selectedServers, setSelectedServers] = useState<Set<string>>(
        new Set(),
    );
    const [searchTerm, setSearchTerm] = useState('');
    const [communityPlaybooks, setCommunityPlaybooks] = useState<
        PlaybookManifest[]
    >([]);
    const [selectedPlaybookData, setSelectedPlaybookData] =
        useState<PlaybookManifest | null>(null);

    // Form state
    const [deploymentName, setDeploymentName] = useState('');
    const [deploymentDescription, setDeploymentDescription] = useState('');
    const [selectedPlaybook, setSelectedPlaybook] = useState<string>('');
    const [deploymentVariables, setDeploymentVariables] = useState<
        Record<string, string>
    >({});

    // Wrapper for setSelectedPlaybook that also initializes deployment variables
    const handlePlaybookChange = (playbookPath: string) => {
        setSelectedPlaybook(playbookPath);

        // Check if it's a community playbook (path format: catalog/f/fail2ban/playbook.yml)
        let communityPlaybook: PlaybookManifest | null = null;
        let playbookConfig: PlaybookConfig | null = null;

        for (const pb of communityPlaybooks) {
            if (pb.structure?.playbooks) {
                for (const [, config] of Object.entries(
                    pb.structure.playbooks,
                )) {
                    const filename = config.file;
                    if (
                        `catalog/${pb.source_path}/${filename}` === playbookPath
                    ) {
                        communityPlaybook = pb;
                        playbookConfig = config;
                        break;
                    }
                }
            }
            if (communityPlaybook) break;
        }

        if (communityPlaybook && playbookConfig) {
            // Get allowed variables from playbook config
            const allowedVariableNames = playbookConfig.variables || [];

            // Filter variables based on what this specific playbook needs
            const variablesToShow = (communityPlaybook.variables || []).filter(
                (v) => allowedVariableNames.includes(v.name),
            );

            // Store filtered playbook data
            setSelectedPlaybookData({
                ...communityPlaybook,
                variables: variablesToShow,
            });

            const defaultValues: Record<string, string> = {};
            variablesToShow.forEach((variable) => {
                if (
                    variable.default !== undefined &&
                    variable.default !== null
                ) {
                    defaultValues[variable.name] = String(variable.default);
                }
            });

            setDeploymentVariables(defaultValues);

            // Update URL with pb_id for community playbooks
            const url = new URL(window.location.href);
            url.searchParams.set('pb_id', communityPlaybook.id);
            window.history.pushState({}, '', url);
        } else if (playbookPath && playbookVariableMap[playbookPath]) {
            // Use hardcoded variables for built-in playbooks
            setSelectedPlaybookData(null);
            const defaultValues: Record<string, string> = {};

            playbookVariableMap[playbookPath].forEach((field) => {
                if (field.defaultValue) {
                    defaultValues[field.name] = field.defaultValue;
                }
            });

            setDeploymentVariables(defaultValues);

            // Remove pb_id from URL for built-in playbooks
            const url = new URL(window.location.href);
            url.searchParams.delete('pb_id');
            window.history.pushState({}, '', url);
        } else {
            setSelectedPlaybookData(null);
            setDeploymentVariables({});

            // Remove pb_id from URL
            const url = new URL(window.location.href);
            url.searchParams.delete('pb_id');
            window.history.pushState({}, '', url);
        }
    };

    useEffect(() => {
        fetchServers();
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const fetchServers = async () => {
        setLoading(true);
        try {
            const response = await fetch('/api/dashboard/servers', {
                headers: {
                    'X-CSRF-TOKEN': csrfToken,
                    Accept: 'application/json',
                },
            });

            if (!response.ok) {
                throw new Error('Failed to fetch servers');
            }

            const json: { data: LeanServerData[] } = await response.json();
            setServers(json.data);
        } catch (error) {
            console.error('Error fetching servers:', error);
            toast.error('Failed to load servers');
        } finally {
            setLoading(false);
        }
    };

    // Handle pb_id URL parameter after community playbooks are loaded
    useEffect(() => {
        const urlParams = new URLSearchParams(window.location.search);
        const pbId = urlParams.get('pb_id');

        if (pbId && communityPlaybooks.length > 0) {
            // Find the community playbook by id (downloaded playbooks have 'id' field)
            const communityPlaybook = communityPlaybooks.find(
                (pb) => pb.id === pbId,
            );

            if (communityPlaybook) {
                // Default to install playbook
                const playbookConfig =
                    communityPlaybook.structure?.playbooks?.install;
                const playbookFile = playbookConfig?.file;

                if (playbookFile) {
                    const playbookPath = `catalog/${communityPlaybook.source_path}/${playbookFile}`;
                    console.log('Setting playbook to:', playbookPath);
                    handlePlaybookChange(playbookPath);
                }
            } else {
                console.log('No matching playbook found for pb_id:', pbId);
            }
        }
    }, [communityPlaybooks]); // eslint-disable-line react-hooks/exhaustive-deps

    const filteredServers = (servers || []).filter((server) => {
        const searchLower = searchTerm.toLowerCase();
        return (
            server.hostname.toLowerCase().includes(searchLower) ||
            server.name?.toLowerCase().includes(searchLower) ||
            server.ssh_host?.toLowerCase().includes(searchLower)
        );
    });

    const toggleServerSelection = (serverId: string) => {
        const newSelection = new Set(selectedServers);
        if (newSelection.has(serverId)) {
            newSelection.delete(serverId);
        } else {
            newSelection.add(serverId);
        }
        setSelectedServers(newSelection);
    };

    const toggleSelectAll = () => {
        if (selectedServers.size === filteredServers.length) {
            setSelectedServers(new Set());
        } else {
            setSelectedServers(new Set(filteredServers.map((s) => s.id)));
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (selectedServers.size === 0) {
            toast.error('Please select at least one server');
            return;
        }

        if (!deploymentName.trim()) {
            toast.error('Please enter a deployment name');
            return;
        }

        // validate playbook variables
        const requiredFields =
            playbookVariableMap[selectedPlaybook]?.filter(
                (f) => f.isRequired,
            ) || [];
        const missedRequiredFields = requiredFields.filter(
            (field) => !deploymentVariables[field.name]?.trim(),
        );

        if (missedRequiredFields.length > 0) {
            const str = missedRequiredFields.map((f) => f.label).join(', ');
            toast.error(`Please fill in required fields: ${str}`);
            return;
        }

        setSubmitting(true);

        try {
            const response = await fetch('/api/deployments', {
                method: 'POST',
                headers: {
                    'X-CSRF-TOKEN': csrfToken,
                    'Content-Type': 'application/json',
                    Accept: 'application/json',
                },
                body: JSON.stringify({
                    name: deploymentName,
                    description: deploymentDescription || null,
                    playbook: selectedPlaybook,
                    server_ids: Array.from(selectedServers),
                    variables: deploymentVariables,
                }),
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(
                    errorData.message || 'Failed to create deployment',
                );
            }

            const data = await response.json();
            toast.success('Deployment queued successfully');
            router.visit(
                `/dashboard/deployments/${data.deployment.id}/details`,
            );
        } catch (error: any) {
            console.error('Error creating deployment:', error);
            toast.error(error.message || 'Failed to create deployment');
        } finally {
            setSubmitting(false);
        }
    };

    const handleCancel = () => {
        router.visit('/dashboard/deployments');
    };

    const builtInPlaybooksvariables =
        playbookVariableMap[selectedPlaybook] || [];
    const communityPlaybookVariables = selectedPlaybookData?.variables || [];

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Create Deployment" />

            <div className="AdmiralDeploymentsCreate flex h-full flex-1 flex-col gap-4 overflow-x-auto rounded-xl p-4">
                {/* Header */}
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-2xl font-bold tracking-tight">
                            Create Deployment
                        </h1>
                        <p className="mt-1 text-muted-foreground">
                            Deploy Node Pulse agent to selected servers
                        </p>
                    </div>
                    <Button variant="outline" onClick={handleCancel}>
                        <ArrowLeft className="mr-2 h-4 w-4" />
                        Back
                    </Button>
                </div>

                <form onSubmit={handleSubmit} className="space-y-6">
                    {/* Deployment Configuration */}
                    <Card>
                        <CardHeader>
                            <CardTitle>Deployment Configuration</CardTitle>
                            <CardDescription>
                                Configure your deployment settings
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="grid gap-4 md:grid-cols-2">
                                <div className="space-y-2">
                                    <Label htmlFor="name">
                                        Deployment Name *
                                    </Label>
                                    <Input
                                        id="name"
                                        placeholder="e.g., Production Agent Deployment"
                                        value={deploymentName}
                                        onChange={(e) =>
                                            setDeploymentName(e.target.value)
                                        }
                                        required
                                    />
                                </div>
                                <PlaybookSelector
                                    csrfToken={csrfToken}
                                    selectedPlaybook={selectedPlaybook}
                                    onPlaybookChange={handlePlaybookChange}
                                    onPlaybooksLoaded={(_, communityPbs) =>
                                        setCommunityPlaybooks(communityPbs)
                                    }
                                />
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="description">Description</Label>
                                <Textarea
                                    id="description"
                                    placeholder="Optional description of this deployment"
                                    value={deploymentDescription}
                                    onChange={(e) =>
                                        setDeploymentDescription(e.target.value)
                                    }
                                    rows={3}
                                />
                            </div>

                            <div className="flex items-center gap-4">
                                <h3 className="text-lg font-semibold">
                                    Playbook Variables
                                </h3>
                                {(builtInPlaybooksvariables.length > 0 ||
                                    communityPlaybookVariables.length > 0) && (
                                    <div className="flex gap-2">
                                        <VariableFileUploader
                                            onVariablesExtracted={(
                                                extractedVars,
                                            ) => {
                                                // Merge extracted variables with existing ones
                                                setDeploymentVariables({
                                                    ...deploymentVariables,
                                                    ...extractedVars,
                                                });
                                            }}
                                        />
                                        <BulkEditVariablesDialog
                                            variables={deploymentVariables}
                                            onSave={(vars) =>
                                                setDeploymentVariables(vars)
                                            }
                                        />
                                    </div>
                                )}
                            </div>
                            {/* Playbook-specific fields - Built-in playbooks */}
                            {builtInPlaybooksvariables.length > 0 && (
                                <div className="grid gap-4 md:grid-cols-2">
                                    {builtInPlaybooksvariables.map((field) => (
                                        <div
                                            key={field.name}
                                            className="space-y-2"
                                        >
                                            <Label htmlFor={field.name}>
                                                {field.label}
                                                {field.isRequired && (
                                                    <span className="ml-1 text-destructive">
                                                        *
                                                    </span>
                                                )}
                                            </Label>
                                            <Input
                                                id={field.name}
                                                placeholder={field.placeholder}
                                                value={
                                                    deploymentVariables[
                                                        field.name
                                                    ] ??
                                                    field.defaultValue ??
                                                    ''
                                                }
                                                onChange={(e) =>
                                                    setDeploymentVariables({
                                                        ...deploymentVariables,
                                                        [field.name]:
                                                            e.target.value,
                                                    })
                                                }
                                                required={field.isRequired}
                                            />
                                            <p className="text-sm text-muted-foreground">
                                                {field.helpText}
                                            </p>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* Playbook-specific fields - Community playbooks */}
                            {communityPlaybookVariables.length > 0 && (
                                <CommunityPlaybookVariables
                                    variables={communityPlaybookVariables}
                                    deploymentVariables={deploymentVariables}
                                    onVariableChange={(name, value) =>
                                        setDeploymentVariables({
                                            ...deploymentVariables,
                                            [name]: value,
                                        })
                                    }
                                />
                            )}
                        </CardContent>
                    </Card>

                    {/* Server Selection */}
                    <Card>
                        <CardHeader>
                            <CardTitle>Select Servers</CardTitle>
                            <CardDescription>
                                Choose which servers to deploy to (
                                {selectedServers.size} selected)
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-4">
                                {/* Search */}
                                <div className="relative">
                                    <Search className="absolute top-2.5 left-2.5 h-4 w-4 text-muted-foreground" />
                                    <Input
                                        placeholder="Search servers..."
                                        className="pl-8"
                                        value={searchTerm}
                                        onChange={(e) =>
                                            setSearchTerm(e.target.value)
                                        }
                                    />
                                </div>

                                {loading ? (
                                    <div className="flex items-center justify-center py-12">
                                        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                                    </div>
                                ) : filteredServers.length === 0 ? (
                                    <div className="py-12 text-center">
                                        <Server className="mx-auto h-12 w-12 text-muted-foreground" />
                                        <h3 className="mt-4 text-lg font-semibold">
                                            No servers found
                                        </h3>
                                        <p className="mt-1 text-muted-foreground">
                                            {searchTerm
                                                ? 'No servers match your search criteria.'
                                                : 'Add servers before creating a deployment.'}
                                        </p>
                                    </div>
                                ) : (
                                    <ServerSelectionTable
                                        selectedServers={selectedServers}
                                        toggleServerSelection={
                                            toggleServerSelection
                                        }
                                        toggleSelectAll={toggleSelectAll}
                                        filteredServers={filteredServers}
                                    />
                                )}
                            </div>
                        </CardContent>
                    </Card>

                    {/* Submit */}
                    <div className="flex items-center justify-end gap-4">
                        <Button
                            type="button"
                            variant="outline"
                            onClick={handleCancel}
                            disabled={submitting}
                        >
                            Cancel
                        </Button>
                        <Button
                            type="submit"
                            disabled={submitting || selectedServers.size === 0}
                        >
                            {submitting ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    Creating...
                                </>
                            ) : (
                                <>
                                    <Rocket className="mr-2 h-4 w-4" />
                                    Create Deployment ({
                                        selectedServers.size
                                    }{' '}
                                    {selectedServers.size === 1
                                        ? 'server'
                                        : 'servers'}
                                    )
                                </>
                            )}
                        </Button>
                    </div>
                </form>
            </div>
        </AppLayout>
    );
}
