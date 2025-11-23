import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem } from '@/types';
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

interface ServerData {
    id: string;
    hostname: string;
    name: string | null;
    display_name: string;
    ssh_host: string;
    ssh_username: string;
    distro: string | null;
    architecture: string | null;
    agent_installed: boolean;
}

interface ServersResponse {
    data: ServerData[];
}

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
    const [servers, setServers] = useState<ServerData[]>([]);
    const [selectedServers, setSelectedServers] = useState<Set<string>>(
        new Set(),
    );
    const [searchTerm, setSearchTerm] = useState('');
    const [playbooks, setPlaybooks] = useState<any[]>([]);
    const [communityPlaybooks, setCommunityPlaybooks] = useState<any[]>([]);
    const [loadingPlaybooks, setLoadingPlaybooks] = useState(true);
    const [selectedPlaybookData, setSelectedPlaybookData] = useState<any>(null);

    // Form state
    const [deploymentName, setDeploymentName] = useState('');
    const [deploymentDescription, setDeploymentDescription] = useState('');
    const [playbook, setPlaybook] = useState<string>('');
    const [deploymentVariables, setDeploymentVariables] = useState<
        Record<string, string>
    >({});

    console.log('deploymentVariables :>> ', deploymentVariables);

    // Wrapper for setPlaybook that also initializes deployment variables
    const handlePlaybookChange = (playbookPath: string) => {
        setPlaybook(playbookPath);

        // Check if it's a community playbook (path format: catalog/f/fail2ban/playbook.yml)
        let communityPlaybook: any = null;
        let playbookConfig: any = null;

        for (const pb of communityPlaybooks) {
            if (pb.structure?.playbooks) {
                for (const [, config] of Object.entries(pb.structure.playbooks)) {
                    const filename = (config as any).file;
                    if (`catalog/${pb.source_path}/${filename}` === playbookPath) {
                        communityPlaybook = pb;
                        playbookConfig = config;
                        break;
                    }
                }
            }
            if (communityPlaybook) break;
        }

        if (communityPlaybook) {
            // Get allowed variables from playbook config
            const allowedVariableNames = playbookConfig?.variables || [];

            // Filter variables based on what this specific playbook needs
            const variablesToShow = (communityPlaybook.variables || []).filter((v: any) =>
                allowedVariableNames.includes(v.name)
            );

            // Store filtered playbook data
            setSelectedPlaybookData({
                ...communityPlaybook,
                variables: variablesToShow
            });

            const defaultValues: Record<string, string> = {};
            variablesToShow.forEach((variable: any) => {
                if (variable.default !== undefined && variable.default !== null) {
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
        fetchPlaybooks();
        fetchCommunityPlaybooks();
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

            const data: ServersResponse = await response.json();
            setServers(data.data);
        } catch (error) {
            console.error('Error fetching servers:', error);
            toast.error('Failed to load servers');
        } finally {
            setLoading(false);
        }
    };

    const fetchPlaybooks = async () => {
        setLoadingPlaybooks(true);
        try {
            const response = await fetch(
                '/api/fleetops/ansible-playbooks/list',
                {
                    headers: {
                        'X-CSRF-TOKEN': csrfToken,
                        Accept: 'application/json',
                    },
                },
            );

            if (!response.ok) {
                throw new Error('Failed to fetch playbooks');
            }

            const data = await response.json();

            // Flatten the tree structure to get a list of playbooks (exclude templates)
            const flattenTree = (nodes: any[]): any[] => {
                const playbooks: any[] = [];

                const traverse = (nodes: any[]) => {
                    for (const node of nodes) {
                        if (node.type === 'file' && !node.isTemplate) {
                            // Only include .yml and .yaml files, not .j2 templates
                            playbooks.push({
                                name: node.path, // Use full path as display name
                                file_name: node.name,
                                path: node.path,
                                description: node.description,
                            });
                        } else if (node.type === 'directory' && node.children) {
                            traverse(node.children);
                        }
                    }
                };

                traverse(nodes);
                return playbooks;
            };

            const playbooksList = flattenTree(data.tree || []);

            // Filter out catalog playbooks from built-in list
            const builtInPlaybooks = playbooksList.filter(
                (pb) => !pb.path.startsWith('catalog/')
            );
            setPlaybooks(builtInPlaybooks);

            // Set default playbook to first built-in one if available and no URL param
            const urlParams = new URLSearchParams(window.location.search);
            const pbId = urlParams.get('pb_id');
            if (!pbId && builtInPlaybooks.length > 0 && !playbook) {
                handlePlaybookChange(builtInPlaybooks[0].path);
            }
        } catch (error) {
            console.error('Error fetching playbooks:', error);
            toast.error('Failed to load playbooks');
        } finally {
            setLoadingPlaybooks(false);
        }
    };

    const fetchCommunityPlaybooks = async () => {
        try {
            const response = await fetch('/api/playbooks', {
                headers: {
                    'X-CSRF-TOKEN': csrfToken,
                    Accept: 'application/json',
                },
            });

            if (!response.ok) {
                throw new Error('Failed to fetch community playbooks');
            }

            const data = await response.json();
            setCommunityPlaybooks(data.playbooks.data || []);
        } catch (error) {
            console.error('Error fetching community playbooks:', error);
            // Don't show error toast - community playbooks are optional
        }
    };

    // Handle pb_id URL parameter after community playbooks are loaded
    useEffect(() => {
        const urlParams = new URLSearchParams(window.location.search);
        const pbId = urlParams.get('pb_id');
        const pbType = urlParams.get('pb_type') || 'install'; // Default to 'install' if not specified

        console.log('URL pb_id:', pbId);
        console.log('URL pb_type:', pbType);
        console.log('Community playbooks:', communityPlaybooks);

        if (pbId && communityPlaybooks.length > 0) {
            // Find the community playbook by id (downloaded playbooks have 'id' field)
            const communityPlaybook = communityPlaybooks.find(
                (pb) => pb.id === pbId
            );

            console.log('Found community playbook:', communityPlaybook);

            if (communityPlaybook) {
                // Get playbook file from structure
                const playbookConfig = communityPlaybook.structure?.playbooks?.[pbType];
                const playbookFile = playbookConfig?.file || communityPlaybook.entry_point;

                const playbookPath = `catalog/${communityPlaybook.source_path}/${playbookFile}`;
                console.log('Setting playbook to:', playbookPath);
                handlePlaybookChange(playbookPath);
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
            server.ssh_host.toLowerCase().includes(searchLower)
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
            playbookVariableMap[playbook]?.filter((f) => f.isRequired) || [];
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
                    playbook: playbook,
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
                                <div className="space-y-2">
                                    <Label htmlFor="playbook">Playbook *</Label>
                                    <Select
                                        value={playbook}
                                        onValueChange={handlePlaybookChange}
                                        disabled={loadingPlaybooks}
                                    >
                                        <SelectTrigger id="playbook">
                                            <SelectValue
                                                placeholder={
                                                    loadingPlaybooks
                                                        ? 'Loading playbooks...'
                                                        : 'Select a playbook'
                                                }
                                            />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {/* Built-in playbooks */}
                                            {playbooks.length > 0 && (
                                                <>
                                                    <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
                                                        Built-in Playbooks
                                                    </div>
                                                    {playbooks.map((pb) => (
                                                        <SelectItem
                                                            key={pb.path}
                                                            value={pb.path}
                                                        >
                                                            {pb.name}
                                                        </SelectItem>
                                                    ))}
                                                </>
                                            )}

                                            {/* Community playbooks */}
                                            {communityPlaybooks.length > 0 && (
                                                <>
                                                    <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
                                                        Community Playbooks
                                                    </div>
                                                    {communityPlaybooks.flatMap((pb) => {
                                                        if (pb.structure?.playbooks) {
                                                            return Object.entries(pb.structure.playbooks).map(([type, playbookConfig]) => {
                                                                const filename = (playbookConfig as any).file;
                                                                return (
                                                                    <SelectItem
                                                                        key={`${pb.id}-${type}`}
                                                                        value={`catalog/${pb.source_path}/${filename}`}
                                                                    >
                                                                        {pb.name} - {type} (v{pb.version})
                                                                    </SelectItem>
                                                                );
                                                            });
                                                        }
                                                        return [];
                                                    })}
                                                </>
                                            )}
                                        </SelectContent>
                                    </Select>
                                    {playbook && selectedPlaybookData?.description && (
                                        <p className="text-sm text-muted-foreground">
                                            {selectedPlaybookData.description}
                                        </p>
                                    )}
                                    {playbook &&
                                        !selectedPlaybookData &&
                                        playbooks.find(
                                            (pb) => pb.path === playbook,
                                        )?.description && (
                                            <p className="text-sm text-muted-foreground">
                                                {
                                                    playbooks.find(
                                                        (pb) =>
                                                            pb.path ===
                                                            playbook,
                                                    )?.description
                                                }
                                            </p>
                                        )}
                                </div>
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

                            {/* Playbook-specific fields - Built-in playbooks */}
                            {playbookVariableMap[playbook]?.length > 0 && (
                                <div className="grid gap-4 md:grid-cols-2">
                                    {playbookVariableMap[playbook].map(
                                        (field) => (
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
                                                    placeholder={
                                                        field.placeholder
                                                    }
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
                                        ),
                                    )}
                                </div>
                            )}

                            {/* Playbook-specific fields - Community playbooks */}
                            {selectedPlaybookData?.variables?.length > 0 && (
                                <div className="grid gap-4 md:grid-cols-2">
                                    {selectedPlaybookData.variables.map(
                                        (variable: any) => (
                                            <div
                                                key={variable.name}
                                                className="space-y-2"
                                            >
                                                <Label htmlFor={variable.name}>
                                                    {variable.label}
                                                    {variable.required && (
                                                        <span className="ml-1 text-destructive">
                                                            *
                                                        </span>
                                                    )}
                                                </Label>
                                                {variable.type === 'select' ? (
                                                    <Select
                                                        value={deploymentVariables[variable.name] ?? String(variable.default ?? '')}
                                                        onValueChange={(value) =>
                                                            setDeploymentVariables({
                                                                ...deploymentVariables,
                                                                [variable.name]: value,
                                                            })
                                                        }
                                                    >
                                                        <SelectTrigger>
                                                            <SelectValue placeholder={`Select ${variable.label}`} />
                                                        </SelectTrigger>
                                                        <SelectContent>
                                                            {variable.options?.map((opt: string) => (
                                                                <SelectItem key={opt} value={opt}>
                                                                    {opt}
                                                                </SelectItem>
                                                            ))}
                                                        </SelectContent>
                                                    </Select>
                                                ) : variable.type === 'boolean' ? (
                                                    <div className="flex items-center space-x-2">
                                                        <Checkbox
                                                            id={variable.name}
                                                            checked={deploymentVariables[variable.name] === 'true'}
                                                            onCheckedChange={(checked) =>
                                                                setDeploymentVariables({
                                                                    ...deploymentVariables,
                                                                    [variable.name]: String(checked),
                                                                })
                                                            }
                                                        />
                                                        <label htmlFor={variable.name} className="text-sm">
                                                            {variable.description}
                                                        </label>
                                                    </div>
                                                ) : (
                                                    <Input
                                                        id={variable.name}
                                                        type={variable.type === 'integer' ? 'number' : variable.type === 'password' ? 'password' : 'text'}
                                                        placeholder={String(variable.default ?? '')}
                                                        value={deploymentVariables[variable.name] ?? String(variable.default ?? '')}
                                                        onChange={(e) =>
                                                            setDeploymentVariables({
                                                                ...deploymentVariables,
                                                                [variable.name]: e.target.value,
                                                            })
                                                        }
                                                        min={variable.min}
                                                        max={variable.max}
                                                        required={variable.required}
                                                    />
                                                )}
                                                {variable.description && (
                                                    <p className="text-sm text-muted-foreground">
                                                        {variable.description}
                                                    </p>
                                                )}
                                            </div>
                                        ),
                                    )}
                                </div>
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
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead className="w-12">
                                                    <Checkbox
                                                        checked={
                                                            selectedServers.size ===
                                                            filteredServers.length
                                                        }
                                                        onCheckedChange={
                                                            toggleSelectAll
                                                        }
                                                    />
                                                </TableHead>
                                                <TableHead>Server</TableHead>
                                                <TableHead>SSH Host</TableHead>
                                                <TableHead>OS</TableHead>
                                                <TableHead>
                                                    Architecture
                                                </TableHead>
                                                <TableHead>Status</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {filteredServers.map((server) => (
                                                <TableRow key={server.id}>
                                                    <TableCell>
                                                        <Checkbox
                                                            checked={selectedServers.has(
                                                                server.id,
                                                            )}
                                                            onCheckedChange={() =>
                                                                toggleServerSelection(
                                                                    server.id,
                                                                )
                                                            }
                                                        />
                                                    </TableCell>
                                                    <TableCell>
                                                        <div>
                                                            <div className="font-medium">
                                                                {
                                                                    server.display_name
                                                                }
                                                            </div>
                                                            <div className="text-sm text-muted-foreground">
                                                                {
                                                                    server.hostname
                                                                }
                                                            </div>
                                                        </div>
                                                    </TableCell>
                                                    <TableCell>
                                                        <code className="text-sm">
                                                            {
                                                                server.ssh_username
                                                            }
                                                            @{server.ssh_host}
                                                        </code>
                                                    </TableCell>
                                                    <TableCell>
                                                        {server.distro ? (
                                                            <Badge variant="outline">
                                                                {server.distro}
                                                            </Badge>
                                                        ) : (
                                                            <span className="text-muted-foreground">
                                                                Unknown
                                                            </span>
                                                        )}
                                                    </TableCell>
                                                    <TableCell>
                                                        {server.architecture ? (
                                                            <Badge variant="secondary">
                                                                {
                                                                    server.architecture
                                                                }
                                                            </Badge>
                                                        ) : (
                                                            <span className="text-muted-foreground">
                                                                Unknown
                                                            </span>
                                                        )}
                                                    </TableCell>
                                                    <TableCell>
                                                        {server.agent_installed ? (
                                                            <Badge variant="default">
                                                                Installed
                                                            </Badge>
                                                        ) : (
                                                            <Badge variant="secondary">
                                                                Not Installed
                                                            </Badge>
                                                        )}
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
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
