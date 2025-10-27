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

    // Form state
    const [deploymentName, setDeploymentName] = useState('');
    const [deploymentDescription, setDeploymentDescription] = useState('');
    const [playbook, setPlaybook] = useState<string>('deploy-agent.yml');
    const [agentVersion, setAgentVersion] = useState('latest');

    useEffect(() => {
        fetchServers();
    }, []);

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
                    variables: {
                        agent_version: agentVersion,
                    },
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
            router.visit(`/dashboard/deployments/${data.deployment.id}/details`);
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
                        <h1 className="text-3xl font-bold tracking-tight">
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
                                        onValueChange={setPlaybook}
                                    >
                                        <SelectTrigger id="playbook">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="deploy-agent.yml">
                                                Deploy Agent (New Installation)
                                            </SelectItem>
                                            <SelectItem value="update-agent.yml">
                                                Update Agent
                                            </SelectItem>
                                            <SelectItem value="remove-agent.yml">
                                                Remove Agent
                                            </SelectItem>
                                            <SelectItem value="rollback-agent.yml">
                                                Rollback Agent
                                            </SelectItem>
                                        </SelectContent>
                                    </Select>
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

                            <div className="space-y-2">
                                <Label htmlFor="agent_version">
                                    Agent Version
                                </Label>
                                <Input
                                    id="agent_version"
                                    placeholder="latest"
                                    value={agentVersion}
                                    onChange={(e) =>
                                        setAgentVersion(e.target.value)
                                    }
                                />
                                <p className="text-sm text-muted-foreground">
                                    Enter a specific version (e.g., v1.2.3) or
                                    "latest"
                                </p>
                            </div>
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
