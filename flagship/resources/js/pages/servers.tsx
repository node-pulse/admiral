import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import AppLayout from '@/layouts/app-layout';
import { servers as serversRoute } from '@/routes';
import { type BreadcrumbItem } from '@/types';
import { Head } from '@inertiajs/react';
import {
    Activity,
    Key,
    MoreHorizontal,
    Plus,
    Search,
    Server,
    Terminal,
} from 'lucide-react';
import { useEffect, useState } from 'react';

const breadcrumbs: BreadcrumbItem[] = [
    {
        title: 'Servers',
        href: serversRoute().url,
    },
];

interface ServerData {
    id: string;
    hostname: string;
    name: string | null;
    display_name: string;
    description: string | null;
    ssh_host: string | null;
    ssh_port: number;
    ssh_username: string;
    has_ssh_key: boolean;
    ssh_key_name: string | null;
    is_reachable: boolean;
    status: string;
    is_online: boolean;
    last_seen_at: string | null;
    distro: string | null;
    architecture: string | null;
    cpu_cores: number | null;
}

interface ServersResponse {
    servers: {
        data: ServerData[];
    };
    meta: {
        current_page: number;
        per_page: number;
        total: number;
        last_page: number;
    };
}

export default function Servers() {
    const [servers, setServers] = useState<ServerData[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [page, setPage] = useState(1);
    const [totalServers, setTotalServers] = useState(0);

    useEffect(() => {
        fetchServers();
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

            const response = await fetch(`/servers/list?${params.toString()}`);
            const data: ServersResponse = await response.json();

            setServers(data.servers.data);
            setTotalServers(data.meta.total);
        } catch (error) {
            console.error('Failed to fetch servers:', error);
        } finally {
            setLoading(false);
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
                    <Activity className="w-3 h-3 mr-1" />
                    Online
                </Badge>
            );
        }

        if (status === 'inactive') {
            return <Badge variant="secondary">Inactive</Badge>;
        }

        return (
            <Badge variant="destructive">
                <Activity className="w-3 h-3 mr-1" />
                Offline
            </Badge>
        );
    };

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Servers" />

            <div className="space-y-6">
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
                        <Button variant="outline">
                            <Key className="w-4 h-4 mr-2" />
                            SSH Keys
                        </Button>
                        <Button>
                            <Plus className="w-4 h-4 mr-2" />
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
                                {
                                    servers.filter((s) => s.is_online).length
                                }
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
                                {
                                    servers.filter((s) => s.ssh_host).length
                                }
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
                                {
                                    servers.filter((s) => s.has_ssh_key).length
                                }
                            </div>
                        </CardContent>
                    </Card>
                </div>

                {/* Search and Filters */}
                <Card>
                    <CardHeader>
                        <div className="flex items-center gap-4">
                            <div className="relative flex-1">
                                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
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
                            <div className="text-center py-8 text-muted-foreground">
                                Loading servers...
                            </div>
                        ) : servers.length === 0 ? (
                            <div className="text-center py-8">
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
                                    <Button className="mt-4">
                                        <Plus className="w-4 h-4 mr-2" />
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
                                                    server.status
                                                )}
                                            </TableCell>
                                            <TableCell>
                                                {server.ssh_host ? (
                                                    <div className="flex flex-col text-sm">
                                                        <span>
                                                            {server.ssh_username}@
                                                            {server.ssh_host}:{server.ssh_port}
                                                        </span>
                                                        {server.has_ssh_key && (
                                                            <span className="text-muted-foreground flex items-center gap-1">
                                                                <Key className="w-3 h-3" />
                                                                {server.ssh_key_name}
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
                                                            {server.distro} {server.architecture}
                                                        </div>
                                                    )}
                                                    {server.cpu_cores && (
                                                        <div className="text-muted-foreground">
                                                            {server.cpu_cores} cores
                                                        </div>
                                                    )}
                                                </div>
                                            </TableCell>
                                            <TableCell className="text-sm">
                                                {formatDate(server.last_seen_at)}
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                >
                                                    <MoreHorizontal className="w-4 h-4" />
                                                </Button>
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
        </AppLayout>
    );
}
