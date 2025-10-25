/* eslint-disable @typescript-eslint/no-explicit-any */
import { SSHTerminal } from '@/components/servers/ssh-terminal';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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
import { servers as serversRoute, sshKeys as sshKeysRoute } from '@/routes';
import { type BreadcrumbItem } from '@/types';
import { Head, router, usePage } from '@inertiajs/react';
import {
    Activity,
    Edit,
    Key,
    MoreHorizontal,
    Plus,
    Search,
    Server,
    Terminal,
    Trash2,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { PrivateKeyData, ServerData, ServersResponse } from '../types/servers';

const breadcrumbs: BreadcrumbItem[] = [
    {
        title: 'Servers',
        href: serversRoute().url,
    },
];

export default function Servers() {
    const { props } = usePage();
    const csrfToken =
        (props as any).csrf_token ||
        document
            .querySelector('meta[name="csrf-token"]')
            ?.getAttribute('content') ||
        '';

    const [servers, setServers] = useState<ServerData[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [page, setPage] = useState(1);
    const [totalServers, setTotalServers] = useState(0);
    const [terminalOpen, setTerminalOpen] = useState(false);
    const [selectedServer, setSelectedServer] = useState<ServerData | null>(
        null,
    );
    const [serverConnected, setServerConnected] = useState(false);
    const [addServerOpen, setAddServerOpen] = useState(false);
    const [addServerForm, setAddServerForm] = useState({
        name: '',
        hostname: '',
        description: '',
        ssh_host: '',
        ssh_port: '22',
        ssh_username: 'root',
        private_key_id: '',
    });

    // SSH Key Management
    const [privateKeys, setPrivateKeys] = useState<PrivateKeyData[]>([]);
    const [manageKeysOpen, setManageKeysOpen] = useState(false);
    const [serverToManage, setServerToManage] = useState<ServerData | null>(
        null,
    );
    const [selectedKeyId, setSelectedKeyId] = useState<string>('');

    useEffect(() => {
        fetchServers();
        fetchPrivateKeys();
    }, [page, search]);

    const fetchServers = async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams({
                page: page.toString(),
                per_page: '20',
            });

            if (search) {
                params.append('search', search);
            }

            const response = await fetch(`/dashboard/servers/list?${params.toString()}`);
            const data: ServersResponse = await response.json();

            setServers(data.servers.data);
            setTotalServers(data.meta.total);
        } catch (error) {
            console.error('Failed to fetch servers:', error);
        } finally {
            setLoading(false);
        }
    };

    const fetchPrivateKeys = async () => {
        try {
            const response = await fetch('/dashboard/ssh-keys/list');
            const data = await response.json();
            setPrivateKeys(data.private_keys.data || []);
        } catch (error) {
            console.error('Failed to fetch private keys:', error);
        }
    };

    const formatDate = (dateString: string | null) => {
        if (!dateString) return 'Never';
        return new Date(dateString).toLocaleString();
    };

    const getStatusBadge = (isOnline: boolean, status: string) => {
        if (isOnline) {
            return (
                <Badge variant="default" className="bg-green-500">
                    <Activity className="mr-1 h-3 w-3" />
                    Online
                </Badge>
            );
        }

        if (status === 'inactive') {
            return <Badge variant="secondary">Inactive</Badge>;
        }

        return (
            <Badge variant="destructive">
                <Activity className="mr-1 h-3 w-3" />
                Offline
            </Badge>
        );
    };

    const openTerminal = (server: ServerData) => {
        setSelectedServer(server);
        setTerminalOpen(true);
    };

    const handleTerminalOpenChange = (open: boolean) => {
        setTerminalOpen(open);
    };

    const handleAddServer = async () => {
        try {
            const response = await fetch('/dashboard/servers', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRF-TOKEN': csrfToken,
                },
                body: JSON.stringify(addServerForm),
            });

            if (response.ok) {
                const data = await response.json();
                const serverId = data.server?.id;

                // If a private key was selected, attach it to the server
                if (addServerForm.private_key_id && serverId) {
                    await attachKeyToServer(
                        serverId,
                        addServerForm.private_key_id,
                    );
                }

                setAddServerOpen(false);
                setAddServerForm({
                    name: '',
                    hostname: '',
                    description: '',
                    ssh_host: '',
                    ssh_port: '22',
                    ssh_username: 'root',
                    private_key_id: '',
                });
                fetchServers();
                toast.success('Server added successfully', {
                    description: `Server "${data.server?.name || data.server?.hostname}" has been added`,
                });
            } else {
                const error = await response.json();
                toast.error('Failed to add server', {
                    description:
                        error.message ||
                        'An error occurred while adding the server',
                });
            }
        } catch (error) {
            console.error('Failed to add server:', error);
            toast.error('Failed to add server', {
                description: 'An unexpected error occurred',
            });
        }
    };

    const attachKeyToServer = async (
        serverId: string,
        privateKeyId: string,
    ) => {
        try {
            const response = await fetch(`/dashboard/servers/${serverId}/keys`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRF-TOKEN': csrfToken,
                },
                body: JSON.stringify({
                    private_key_id: privateKeyId,
                    is_primary: true,
                    purpose: 'default',
                }),
            });

            if (!response.ok) {
                throw new Error('Failed to attach key');
            }
        } catch (error) {
            console.error('Failed to attach key:', error);
            toast.error('Failed to attach SSH key', {
                description:
                    'The server was created but the SSH key was not attached',
            });
        }
    };

    const openManageKeys = (server: ServerData) => {
        setServerToManage(server);
        setSelectedKeyId('');
        setManageKeysOpen(true);
    };

    const handleAttachKey = async () => {
        if (!serverToManage || !selectedKeyId) return;

        try {
            const response = await fetch(`/dashboard/servers/${serverToManage.id}/keys`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRF-TOKEN': csrfToken,
                },
                body: JSON.stringify({
                    private_key_id: selectedKeyId,
                    is_primary: true,
                    purpose: 'default',
                }),
            });

            if (response.ok) {
                setManageKeysOpen(false);
                fetchServers();
                toast.success('SSH key attached successfully', {
                    description: `Key has been attached to ${serverToManage.display_name}`,
                });
            } else {
                const error = await response.json();
                toast.error('Failed to attach SSH key', {
                    description: error.message || 'An error occurred',
                });
            }
        } catch (error) {
            console.error('Failed to attach key:', error);
            toast.error('Failed to attach SSH key', {
                description: 'An unexpected error occurred',
            });
        }
    };

    const navigateToSSHKeys = () => {
        router.visit(sshKeysRoute().url);
    };

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Servers" />

            <div className="AdmiralServers flex h-full flex-1 flex-col gap-4 overflow-x-auto rounded-xl p-4">
                {/* Header */}
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-3xl font-bold tracking-tight">
                            Servers
                        </h1>
                        <p className="text-muted-foreground">
                            Manage your server fleet and SSH connections
                        </p>
                    </div>
                    <div className="flex gap-2">
                        <Button variant="outline" onClick={navigateToSSHKeys}>
                            <Key className="mr-2 h-4 w-4" />
                            SSH Keys
                        </Button>
                        <Button onClick={() => setAddServerOpen(true)}>
                            <Plus className="mr-2 h-4 w-4" />
                            Add Server
                        </Button>
                    </div>
                </div>

                {/* Stats Cards */}
                <div className="grid gap-4 md:grid-cols-4">
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium">
                                Total Servers
                            </CardTitle>
                            <Server className="h-4 w-4 text-muted-foreground" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold">
                                {totalServers}
                            </div>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium">
                                Online
                            </CardTitle>
                            <Activity className="h-4 w-4 text-green-500" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold">
                                {servers.filter((s) => s.is_online).length}
                            </div>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium">
                                SSH Configured
                            </CardTitle>
                            <Terminal className="h-4 w-4 text-muted-foreground" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold">
                                {servers.filter((s) => s.ssh_host).length}
                            </div>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium">
                                SSH Keys
                            </CardTitle>
                            <Key className="h-4 w-4 text-muted-foreground" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold">
                                {servers.filter((s) => s.has_ssh_key).length}
                            </div>
                        </CardContent>
                    </Card>
                </div>

                {/* Search and Filters */}
                <Card>
                    <CardHeader>
                        <div className="flex items-center gap-4">
                            <div className="relative flex-1">
                                <Search className="absolute top-2.5 left-2.5 h-4 w-4 text-muted-foreground" />
                                <Input
                                    placeholder="Search servers by hostname, name, or SSH host..."
                                    value={search}
                                    onChange={(e) => {
                                        setSearch(e.target.value);
                                        setPage(1);
                                    }}
                                    className="pl-8"
                                />
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent>
                        {loading ? (
                            <div className="py-8 text-center text-muted-foreground">
                                Loading servers...
                            </div>
                        ) : servers.length === 0 ? (
                            <div className="py-8 text-center">
                                <Server className="mx-auto h-12 w-12 text-muted-foreground" />
                                <h3 className="mt-2 text-sm font-semibold">
                                    No servers found
                                </h3>
                                <p className="mt-1 text-sm text-muted-foreground">
                                    {search
                                        ? 'Try adjusting your search'
                                        : 'Get started by adding your first server'}
                                </p>
                                {!search && (
                                    <Button
                                        className="mt-4"
                                        onClick={() => setAddServerOpen(true)}
                                    >
                                        <Plus className="mr-2 h-4 w-4" />
                                        Add Server
                                    </Button>
                                )}
                            </div>
                        ) : (
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Server</TableHead>
                                        <TableHead>Status</TableHead>
                                        <TableHead>SSH Configuration</TableHead>
                                        <TableHead>System Info</TableHead>
                                        <TableHead>Last Seen</TableHead>
                                        <TableHead className="text-right">
                                            Actions
                                        </TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {servers.map((server) => (
                                        <TableRow key={server.id}>
                                            <TableCell>
                                                <div className="flex flex-col">
                                                    <span className="font-medium">
                                                        {server.display_name}
                                                    </span>
                                                    <span className="text-sm text-muted-foreground">
                                                        {server.hostname}
                                                    </span>
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                {getStatusBadge(
                                                    server.is_online,
                                                    server.status,
                                                )}
                                            </TableCell>
                                            <TableCell>
                                                {server.ssh_host ? (
                                                    <div className="flex flex-col text-sm">
                                                        <span>
                                                            {
                                                                server.ssh_username
                                                            }
                                                            @{server.ssh_host}:
                                                            {server.ssh_port}
                                                        </span>
                                                        {server.has_ssh_key && (
                                                            <span className="flex items-center gap-1 text-muted-foreground">
                                                                <Key className="h-3 w-3" />
                                                                {
                                                                    server.ssh_key_name
                                                                }
                                                            </span>
                                                        )}
                                                    </div>
                                                ) : (
                                                    <span className="text-muted-foreground">
                                                        Not configured
                                                    </span>
                                                )}
                                            </TableCell>
                                            <TableCell>
                                                <div className="text-sm">
                                                    {server.distro && (
                                                        <div>
                                                            {server.distro}{' '}
                                                            {
                                                                server.architecture
                                                            }
                                                        </div>
                                                    )}
                                                    {server.cpu_cores && (
                                                        <div className="text-muted-foreground">
                                                            {server.cpu_cores}{' '}
                                                            cores
                                                        </div>
                                                    )}
                                                </div>
                                            </TableCell>
                                            <TableCell className="text-sm">
                                                {formatDate(
                                                    server.last_seen_at,
                                                )}
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <DropdownMenu>
                                                    <DropdownMenuTrigger
                                                        asChild
                                                    >
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                        >
                                                            <MoreHorizontal className="h-4 w-4" />
                                                        </Button>
                                                    </DropdownMenuTrigger>
                                                    <DropdownMenuContent align="end">
                                                        <DropdownMenuLabel>
                                                            Actions
                                                        </DropdownMenuLabel>
                                                        {server.ssh_host && (
                                                            <>
                                                                <DropdownMenuItem
                                                                    onClick={() =>
                                                                        openTerminal(
                                                                            server,
                                                                        )
                                                                    }
                                                                >
                                                                    <Terminal className="mr-2 h-4 w-4" />
                                                                    Open
                                                                    Terminal
                                                                </DropdownMenuItem>
                                                                <DropdownMenuItem
                                                                    onClick={() =>
                                                                        openManageKeys(
                                                                            server,
                                                                        )
                                                                    }
                                                                >
                                                                    <Key className="mr-2 h-4 w-4" />
                                                                    {server.has_ssh_key
                                                                        ? 'Change SSH Key'
                                                                        : 'Add SSH Key'}
                                                                </DropdownMenuItem>
                                                                <DropdownMenuSeparator />
                                                            </>
                                                        )}
                                                        <DropdownMenuItem>
                                                            <Edit className="mr-2 h-4 w-4" />
                                                            Edit Server
                                                        </DropdownMenuItem>
                                                        <DropdownMenuItem className="text-destructive">
                                                            <Trash2 className="mr-2 h-4 w-4" />
                                                            Delete Server
                                                        </DropdownMenuItem>
                                                    </DropdownMenuContent>
                                                </DropdownMenu>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        )}
                    </CardContent>
                </Card>

                {/* Pagination */}
                {totalServers > 20 && (
                    <div className="flex items-center justify-between">
                        <p className="text-sm text-muted-foreground">
                            Showing {(page - 1) * 20 + 1} to{' '}
                            {Math.min(page * 20, totalServers)} of{' '}
                            {totalServers} servers
                        </p>
                        <div className="flex gap-2">
                            <Button
                                variant="outline"
                                size="sm"
                                disabled={page === 1}
                                onClick={() => setPage(page - 1)}
                            >
                                Previous
                            </Button>
                            <Button
                                variant="outline"
                                size="sm"
                                disabled={page * 20 >= totalServers}
                                onClick={() => setPage(page + 1)}
                            >
                                Next
                            </Button>
                        </div>
                    </div>
                )}
            </div>

            {/* SSH Terminal Dialog */}
            <Dialog open={terminalOpen} onOpenChange={handleTerminalOpenChange}>
                <DialogContent className="flex max-h-[90vh] w-[80vw] !max-w-none flex-col">
                    <DialogHeader>
                        <DialogTitle>
                            {`SSH Terminal - ${selectedServer?.display_name}`}
                        </DialogTitle>
                    </DialogHeader>
                    <div className="w-full flex-1 overflow-hidden">
                        {selectedServer && (
                            <SSHTerminal
                                serverId={selectedServer.id}
                                server={selectedServer}
                                serverConnected={serverConnected}
                                setServerConnected={setServerConnected}
                                onConnectionChange={(connected) => {
                                    console.log(
                                        'Connection status:',
                                        connected,
                                    );
                                }}
                            />
                        )}
                    </div>
                </DialogContent>
            </Dialog>

            {/* Manage SSH Key Dialog */}
            <Dialog open={manageKeysOpen} onOpenChange={setManageKeysOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Manage SSH Key</DialogTitle>
                        <DialogDescription>
                            {serverToManage?.has_ssh_key
                                ? `Current key: ${serverToManage.ssh_key_name}`
                                : 'No SSH key attached to this server'}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="grid gap-2">
                            <Label htmlFor="select-key">Select SSH Key</Label>
                            <Select
                                value={selectedKeyId}
                                onValueChange={setSelectedKeyId}
                            >
                                <SelectTrigger id="select-key">
                                    <SelectValue placeholder="Select an SSH key" />
                                </SelectTrigger>
                                <SelectContent>
                                    {privateKeys.map((key) => (
                                        <SelectItem
                                            key={key.id}
                                            value={key.id.toString()}
                                        >
                                            <div className="flex flex-col">
                                                <span>{key.name}</span>
                                                <span className="text-xs text-muted-foreground">
                                                    {key.fingerprint}
                                                </span>
                                            </div>
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => setManageKeysOpen(false)}
                        >
                            Cancel
                        </Button>
                        <Button
                            onClick={handleAttachKey}
                            disabled={!selectedKeyId}
                        >
                            {serverToManage?.has_ssh_key
                                ? 'Change Key'
                                : 'Attach Key'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Add Server Dialog */}
            <Dialog open={addServerOpen} onOpenChange={setAddServerOpen}>
                <DialogContent className="max-w-2xl">
                    <DialogHeader>
                        <DialogTitle>Add Server</DialogTitle>
                        <DialogDescription>
                            Add a new server to your fleet. The server will be
                            automatically discovered when the agent starts
                            reporting metrics.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="grid gap-2">
                            <Label htmlFor="server-name">
                                Server Name (Optional)
                            </Label>
                            <Input
                                id="server-name"
                                placeholder="Production Web Server 1"
                                value={addServerForm.name}
                                onChange={(e) =>
                                    setAddServerForm({
                                        ...addServerForm,
                                        name: e.target.value,
                                    })
                                }
                            />
                            <p className="text-xs text-muted-foreground">
                                A friendly name for this server
                            </p>
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="server-hostname">
                                Hostname (Optional)
                            </Label>
                            <Input
                                id="server-hostname"
                                placeholder="web-01.example.com"
                                value={addServerForm.hostname}
                                onChange={(e) =>
                                    setAddServerForm({
                                        ...addServerForm,
                                        hostname: e.target.value,
                                    })
                                }
                            />
                            <p className="text-xs text-muted-foreground">
                                The hostname will be auto-detected by the agent
                            </p>
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="server-description">
                                Description (Optional)
                            </Label>
                            <Textarea
                                id="server-description"
                                placeholder="Production web server in US-EAST datacenter"
                                value={addServerForm.description}
                                onChange={(e) =>
                                    setAddServerForm({
                                        ...addServerForm,
                                        description: e.target.value,
                                    })
                                }
                                rows={3}
                            />
                        </div>
                        <div className="border-t pt-4">
                            <h4 className="mb-3 text-sm font-semibold">
                                SSH Configuration (Optional)
                            </h4>
                            <div className="grid gap-4">
                                <div className="grid gap-2">
                                    <Label htmlFor="ssh-host">SSH Host</Label>
                                    <Input
                                        id="ssh-host"
                                        placeholder="192.168.1.100"
                                        value={addServerForm.ssh_host}
                                        onChange={(e) =>
                                            setAddServerForm({
                                                ...addServerForm,
                                                ssh_host: e.target.value,
                                            })
                                        }
                                    />
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="grid gap-2">
                                        <Label htmlFor="ssh-port">
                                            SSH Port
                                        </Label>
                                        <Input
                                            id="ssh-port"
                                            type="number"
                                            placeholder="22"
                                            value={addServerForm.ssh_port}
                                            onChange={(e) =>
                                                setAddServerForm({
                                                    ...addServerForm,
                                                    ssh_port: e.target.value,
                                                })
                                            }
                                        />
                                    </div>
                                    <div className="grid gap-2">
                                        <Label htmlFor="ssh-username">
                                            SSH Username
                                        </Label>
                                        <Input
                                            id="ssh-username"
                                            placeholder="root"
                                            value={addServerForm.ssh_username}
                                            onChange={(e) =>
                                                setAddServerForm({
                                                    ...addServerForm,
                                                    ssh_username:
                                                        e.target.value,
                                                })
                                            }
                                        />
                                    </div>
                                </div>
                                <div className="grid gap-2">
                                    <Label htmlFor="ssh-key">
                                        SSH Key (Optional)
                                    </Label>
                                    <Select
                                        value={addServerForm.private_key_id}
                                        onValueChange={(value) =>
                                            setAddServerForm({
                                                ...addServerForm,
                                                private_key_id: value,
                                            })
                                        }
                                    >
                                        <SelectTrigger id="ssh-key">
                                            <SelectValue placeholder="Select an SSH key" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {privateKeys.map((key) => (
                                                <SelectItem
                                                    key={key.id}
                                                    value={key.id.toString()}
                                                >
                                                    {key.name}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                    <p className="text-xs text-muted-foreground">
                                        Select an SSH key to use for terminal
                                        access
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => setAddServerOpen(false)}
                        >
                            Cancel
                        </Button>
                        <Button onClick={handleAddServer}>Add Server</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </AppLayout>
    );
}
