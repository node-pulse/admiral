import { AddServerDialog } from '@/components/servers/add-server-dialog';
import { EditServerDialog } from '@/components/servers/edit-server-dialog';
import {
    ServerProvider,
    useServerContext,
} from '@/components/servers/server-context';
import { TerminalWorkspace } from '@/components/servers/terminal-workspace';
import {
    TerminalWorkspaceProvider,
    useTerminalWorkspace,
} from '@/components/servers/terminal-workspace-context';
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
import AppLayout from '@/layouts/app-layout';
import { servers as serversRoute, sshKeys as sshKeysRoute } from '@/routes';
import { type BreadcrumbItem } from '@/types';
import { Head, router } from '@inertiajs/react';
import {
    Activity,
    Edit,
    Key,
    Layers,
    MoreHorizontal,
    Plus,
    Search,
    Server,
    Terminal,
    Trash2,
} from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { ServerData } from '../types/servers';

interface ServersTranslations {
    title: string;
    subtitle: string;
    list: Record<string, string>;
    table: Record<string, string>;
    status: Record<string, string>;
    actions: Record<string, string>;
    dialog: Record<string, string>;
    terminal: Record<string, string>;
    messages: Record<string, string>;
    filters: Record<string, string>;
    metrics: Record<string, string>;
}

interface ServersProps {
    translations: {
        common: Record<string, string>;
        nav: Record<string, string>;
        servers: ServersTranslations;
    };
}

function ServersContent({ translations }: ServersProps) {
    const t = translations.servers;
    const breadcrumbs: BreadcrumbItem[] = [
        {
            title: `${t.title} - ${t.subtitle}`,
            href: serversRoute().url,
        },
    ];
    // Use server context
    const {
        servers,
        totalServers,
        loading,
        privateKeys,
        page,
        setPage,
        search,
        setSearch,
        fetchServers,
        deleteServer: contextDeleteServer,
        csrfToken,
    } = useServerContext();

    // Terminal workspace context
    const { openSession, sessions } = useTerminalWorkspace();

    // Local UI states
    const [workspaceOpen, setWorkspaceOpen] = useState(false);
    const [workspaceVisible, setWorkspaceVisible] = useState(false);
    const [addServerOpen, setAddServerOpen] = useState(false);

    // SSH Key Management
    const [manageKeysOpen, setManageKeysOpen] = useState(false);
    const [serverToManage, setServerToManage] = useState<ServerData | null>(
        null,
    );
    const [selectedKeyId, setSelectedKeyId] = useState<string>('');

    // Edit and Delete server states
    const [editServerOpen, setEditServerOpen] = useState(false);
    const [serverToEdit, setServerToEdit] = useState<ServerData | null>(null);
    const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
    const [serverToDelete, setServerToDelete] = useState<ServerData | null>(
        null,
    );
    const [deleteLoading, setDeleteLoading] = useState(false);

    const formatDate = (dateString: string | null) => {
        if (!dateString) return t.status.unknown;
        return new Date(dateString).toLocaleString();
    };

    const getStatusBadge = (isOnline: boolean, status: string) => {
        if (isOnline) {
            return (
                <Badge variant="default" className="bg-green-500">
                    <Activity className="mr-1 h-3 w-3" />
                    {t.status.online}
                </Badge>
            );
        }

        if (status === 'inactive') {
            return <Badge variant="secondary">{t.status.offline}</Badge>;
        }

        return (
            <Badge variant="destructive">
                <Activity className="mr-1 h-3 w-3" />
                {t.status.offline}
            </Badge>
        );
    };

    const openTerminal = (server: ServerData) => {
        openSession(server);
        setWorkspaceOpen(true);
        setWorkspaceVisible(true);
    };

    const openManageKeys = (server: ServerData) => {
        setServerToManage(server);
        setSelectedKeyId('');
        setManageKeysOpen(true);
    };

    const handleEditServer = (server: ServerData) => {
        setServerToEdit(server);
        setEditServerOpen(true);
    };

    const handleDeleteServer = (server: ServerData) => {
        setServerToDelete(server);
        setDeleteConfirmOpen(true);
    };

    const confirmDeleteServer = async () => {
        if (!serverToDelete) return;

        setDeleteLoading(true);
        const success = await contextDeleteServer(serverToDelete.id);

        if (success) {
            toast.success('Server deleted successfully', {
                description: `Server "${serverToDelete.display_name}" has been deleted`,
            });
            setDeleteConfirmOpen(false);
            setServerToDelete(null);
        }

        setDeleteLoading(false);
    };

    const handleAttachKey = async () => {
        if (!serverToManage || !selectedKeyId) return;

        try {
            const response = await fetch(
                `/dashboard/servers/${serverToManage.id}/keys`,
                {
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
                },
            );

            if (response.ok) {
                setManageKeysOpen(false);
                fetchServers();
                toast.success(t.messages.key_attached, {
                    description: `Key has been attached to ${serverToManage.display_name}`,
                });
            } else {
                const error = await response.json();
                toast.error(t.messages.update_failed, {
                    description: error.message || 'An error occurred',
                });
            }
        } catch (error) {
            console.error('Failed to attach key:', error);
            toast.error(t.messages.update_failed, {
                description: 'An unexpected error occurred',
            });
        }
    };

    const navigateToSSHKeys = () => {
        router.visit(sshKeysRoute().url);
    };

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={t.title} />

            <div className="AdmiralServers flex h-full flex-1 flex-col gap-4 overflow-x-auto rounded-xl p-4">
                {/* Header */}
                <div className="flex items-center justify-between">
                    <div className="flex gap-2">
                        <Button
                            variant="outline"
                            onClick={() => {
                                if (!workspaceOpen) {
                                    setWorkspaceOpen(true);
                                    setWorkspaceVisible(true);
                                } else {
                                    setWorkspaceVisible(true);
                                }
                            }}
                            className="relative cursor-pointer"
                        >
                            <Layers className="mr-2 h-4 w-4" />
                            {t.terminal.workspace}
                            {sessions.length > 0 && (
                                <Badge
                                    className="ml-2"
                                    variant={
                                        sessions.filter((s) => s.isConnected)
                                            .length > 0
                                            ? 'default'
                                            : 'secondary'
                                    }
                                >
                                    {sessions.length}
                                </Badge>
                            )}
                            {sessions.filter((s) => s.isConnected).length >
                                0 && (
                                <span className="absolute -top-1 -right-1 h-3 w-3">
                                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75"></span>
                                    <span className="relative inline-flex h-3 w-3 rounded-full bg-green-500"></span>
                                </span>
                            )}
                        </Button>
                        <Button variant="outline" onClick={navigateToSSHKeys}>
                            <Key className="mr-2 h-4 w-4" />
                            {t.actions.manage_keys}
                        </Button>
                        <Button onClick={() => setAddServerOpen(true)}>
                            <Plus className="mr-2 h-4 w-4" />
                            {t.list.add_server}
                        </Button>
                    </div>
                </div>

                {/* Stats Cards */}
                <div className="grid gap-4 md:grid-cols-4">
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium">
                                {t.list.total_servers}
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
                                {t.list.online_servers}
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
                                {t.terminal.workspace}
                            </CardTitle>
                            <Terminal className="h-4 w-4 text-muted-foreground" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold">
                                {sessions.filter((s) => s.isConnected).length}
                            </div>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium">
                                {t.actions.manage_keys}
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

                {/* Search and Table */}
                <Card>
                    <CardHeader>
                        <div className="flex items-center gap-4">
                            <div className="relative flex-1">
                                <Search className="absolute top-2.5 left-2.5 h-4 w-4 text-muted-foreground" />
                                <Input
                                    placeholder={t.list.search_placeholder}
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
                                Loading...
                            </div>
                        ) : servers.length === 0 ? (
                            <div className="py-8 text-center">
                                <Server className="mx-auto h-12 w-12 text-muted-foreground" />
                                <h3 className="mt-2 text-sm font-semibold">
                                    {t.list.no_servers}
                                </h3>
                                <p className="mt-1 text-sm text-muted-foreground">
                                    {search
                                        ? 'Try adjusting your search'
                                        : t.list.no_servers_description}
                                </p>
                                {!search && (
                                    <Button
                                        className="mt-4"
                                        onClick={() => setAddServerOpen(true)}
                                    >
                                        <Plus className="mr-2 h-4 w-4" />
                                        {t.list.add_server}
                                    </Button>
                                )}
                            </div>
                        ) : (
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>{t.table.hostname}</TableHead>
                                        <TableHead>{t.table.status}</TableHead>
                                        <TableHead>SSH</TableHead>
                                        <TableHead>System</TableHead>
                                        <TableHead>{t.table.last_seen}</TableHead>
                                        <TableHead className="text-right">
                                            {t.table.actions}
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
                                                            {t.table.actions}
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
                                                                    {t.actions.open_terminal}
                                                                </DropdownMenuItem>
                                                                <DropdownMenuItem
                                                                    onClick={() =>
                                                                        openManageKeys(
                                                                            server,
                                                                        )
                                                                    }
                                                                >
                                                                    <Key className="mr-2 h-4 w-4" />
                                                                    {t.actions.manage_keys}
                                                                </DropdownMenuItem>
                                                                <DropdownMenuSeparator />
                                                            </>
                                                        )}
                                                        <DropdownMenuItem
                                                            onClick={() =>
                                                                handleEditServer(
                                                                    server,
                                                                )
                                                            }
                                                        >
                                                            <Edit className="mr-2 h-4 w-4" />
                                                            {t.actions.edit}
                                                        </DropdownMenuItem>
                                                        <DropdownMenuItem
                                                            className="text-destructive"
                                                            onClick={() =>
                                                                handleDeleteServer(
                                                                    server,
                                                                )
                                                            }
                                                        >
                                                            <Trash2 className="mr-2 h-4 w-4" />
                                                            {t.actions.delete}
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

            {/* Terminal Workspace */}
            <TerminalWorkspace
                isOpen={workspaceOpen}
                visible={workspaceVisible}
                onClose={() => {
                    setWorkspaceOpen(false);
                    setWorkspaceVisible(false);
                }}
                onMinimize={() => setWorkspaceVisible(false)}
            />

            {/* Manage SSH Key Dialog */}
            <Dialog open={manageKeysOpen} onOpenChange={setManageKeysOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{t.dialog.manage_keys_title}</DialogTitle>
                        <DialogDescription>
                            {t.dialog.manage_keys_description}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="grid gap-2">
                            <Label htmlFor="select-key">{t.dialog.primary_key_label}</Label>
                            <Select
                                value={selectedKeyId}
                                onValueChange={setSelectedKeyId}
                            >
                                <SelectTrigger id="select-key">
                                    <SelectValue placeholder={t.dialog.primary_key_placeholder} />
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
                            {t.dialog.cancel}
                        </Button>
                        <Button
                            onClick={handleAttachKey}
                            disabled={!selectedKeyId}
                        >
                            {t.dialog.attach}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Add Server Dialog */}
            <AddServerDialog
                open={addServerOpen}
                onOpenChange={setAddServerOpen}
                onServerAdded={fetchServers}
            />

            {/* Edit Server Dialog */}
            <EditServerDialog
                server={serverToEdit}
                open={editServerOpen}
                onOpenChange={setEditServerOpen}
                onServerUpdated={() => {
                    fetchServers();
                    setServerToEdit(null);
                }}
            />

            {/* Delete Confirmation Dialog */}
            <Dialog
                open={deleteConfirmOpen}
                onOpenChange={setDeleteConfirmOpen}
            >
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{t.dialog.delete_title}</DialogTitle>
                        <DialogDescription>
                            {t.dialog.delete_description}
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => {
                                setDeleteConfirmOpen(false);
                                setServerToDelete(null);
                            }}
                            disabled={deleteLoading}
                        >
                            {t.dialog.cancel}
                        </Button>
                        <Button
                            variant="destructive"
                            onClick={confirmDeleteServer}
                            disabled={deleteLoading}
                        >
                            {deleteLoading ? 'Deleting...' : t.dialog.delete}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </AppLayout>
    );
}

export default function Servers({ translations }: ServersProps) {
    return (
        <ServerProvider>
            <TerminalWorkspaceProvider>
                <ServersContent translations={translations} />
            </TerminalWorkspaceProvider>
        </ServerProvider>
    );
}
