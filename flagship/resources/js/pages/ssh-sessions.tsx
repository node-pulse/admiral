import { ServerSelector } from '@/components/servers/server-selector';
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
import { sshSessions as sshSessionsRoute } from '@/routes';
import { type BreadcrumbItem } from '@/types';
import { Head, usePage } from '@inertiajs/react';
import {
    Activity,
    CheckCircle2,
    Clock,
    Search,
    Server,
    Terminal,
    XCircle,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

interface SshSessionsTranslations {
    title: string;
    subtitle: string;
    list: Record<string, string>;
    table: Record<string, string>;
    status: Record<string, string>;
    actions: Record<string, string>;
    dialog: Record<string, string>;
    messages: Record<string, string>;
}

interface SshSessionsProps {
    translations: {
        common: Record<string, string>;
        nav: Record<string, string>;
        ssh_sessions: SshSessionsTranslations;
    };
}

interface ServerData {
    id: string;
    hostname: string;
    name: string | null;
    display_name: string;
}

interface SshSessionData {
    id: string;
    session_id: string;
    server_id: string;
    server: ServerData | null;
    user_id: number | null;
    started_at: string;
    ended_at: string | null;
    duration_seconds: number | null;
    duration_formatted: string | null;
    ip_address: string | null;
    user_agent: string | null;
    status: string;
    disconnect_reason: string | null;
    auth_method: string;
    ssh_username: string;
    ssh_host: string;
    ssh_port: number;
    host_key_fingerprint: string;
}

interface SshSessionsResponse {
    ssh_sessions: {
        data: SshSessionData[];
    };
    meta: {
        current_page: number;
        per_page: number;
        total: number;
        last_page: number;
    };
}

export default function SshSessions({ translations }: SshSessionsProps) {
    const t = translations.ssh_sessions;
    const breadcrumbs: BreadcrumbItem[] = [
        {
            title: `${t.title} - ${t.subtitle}`,
            href: sshSessionsRoute().url,
        },
    ];

    const { props } = usePage();
    const csrfToken =
        (props as any).csrf_token ||
        document
            .querySelector('meta[name="csrf-token"]')
            ?.getAttribute('content') ||
        '';

    const [sessions, setSessions] = useState<SshSessionData[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState<string>('all');
    const [serverFilter, setServerFilter] = useState<string[]>([]);
    const [page, setPage] = useState(1);
    const [totalSessions, setTotalSessions] = useState(0);
    const [lastPage, setLastPage] = useState(1);
    const [detailsDialogOpen, setDetailsDialogOpen] = useState(false);
    const [selectedSession, setSelectedSession] =
        useState<SshSessionData | null>(null);
    const [terminateDialogOpen, setTerminateDialogOpen] = useState(false);
    const [sessionToTerminate, setSessionToTerminate] =
        useState<SshSessionData | null>(null);

    const fetchSessions = async () => {
        try {
            setLoading(true);
            const params = new URLSearchParams({
                page: page.toString(),
                per_page: '20',
            });

            if (search) {
                params.append('search', search);
            }

            if (statusFilter && statusFilter !== 'all') {
                params.append('status', statusFilter);
            }

            if (serverFilter.length > 0) {
                serverFilter.forEach((serverId) => {
                    params.append('server_ids[]', serverId);
                });
            }

            const response = await fetch(
                `/dashboard/ssh-sessions/list?${params.toString()}`,
            );
            const data: SshSessionsResponse = await response.json();

            setSessions(data.ssh_sessions.data);
            setTotalSessions(data.meta.total);
            setLastPage(data.meta.last_page);
        } catch (error) {
            console.error('Failed to fetch SSH sessions:', error);
            toast.error('Failed to load SSH sessions');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        const timeoutId = setTimeout(() => {
            fetchSessions();
        }, 300); // 300ms debounce for search

        return () => clearTimeout(timeoutId);
    }, [page, search, statusFilter, serverFilter]); // eslint-disable-line react-hooks/exhaustive-deps

    const handleViewDetails = async (sessionId: string) => {
        try {
            const response = await fetch(
                `/dashboard/ssh-sessions/${sessionId}`,
            );
            const data = await response.json();
            setSelectedSession(data.ssh_session);
            setDetailsDialogOpen(true);
        } catch (error) {
            console.error('Failed to fetch session details:', error);
            toast.error('Failed to load session details');
        }
    };

    const handleTerminateSession = async () => {
        if (!sessionToTerminate) return;

        try {
            const response = await fetch(
                `/dashboard/ssh-sessions/${sessionToTerminate.id}/terminate`,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-CSRF-TOKEN': csrfToken,
                    },
                },
            );

            if (response.ok) {
                toast.success(t.messages.session_terminated);
                setTerminateDialogOpen(false);
                setSessionToTerminate(null);
                fetchSessions();
            } else {
                const data = await response.json();
                toast.error(data.message || t.messages.terminate_failed);
            }
        } catch (error) {
            console.error('Failed to terminate session:', error);
            toast.error(t.messages.terminate_failed);
        }
    };

    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'active':
                return (
                    <Badge variant="default" className="bg-green-500">
                        <Activity className="mr-1 h-3 w-3" />
                        {t.status.active}
                    </Badge>
                );
            case 'completed':
                return (
                    <Badge variant="secondary">
                        <CheckCircle2 className="mr-1 h-3 w-3" />
                        {t.status.completed}
                    </Badge>
                );
            case 'failed':
                return (
                    <Badge variant="destructive">
                        <XCircle className="mr-1 h-3 w-3" />
                        {t.status.failed}
                    </Badge>
                );
            case 'terminated':
                return (
                    <Badge variant="outline">
                        <XCircle className="mr-1 h-3 w-3" />
                        {t.status.terminated}
                    </Badge>
                );
            default:
                return <Badge variant="outline">{status}</Badge>;
        }
    };

    const getAuthMethodBadge = (method: string) => {
        return method === 'private_key' ? (
            <Badge variant="outline" className="text-xs">
                🔑 Key
            </Badge>
        ) : (
            <Badge variant="outline" className="text-xs">
                🔒 Password
            </Badge>
        );
    };

    const formatDateTime = (dateString: string) => {
        return new Date(dateString).toLocaleString();
    };

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={t.title} />

            <div className="AdmiralSSHSessions flex h-full flex-1 flex-col gap-4 overflow-x-auto rounded-xl p-4">
                {/* Stats Cards */}
                <div className="grid gap-4 md:grid-cols-4">
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium">
                                {t.list.total_sessions}
                            </CardTitle>
                            <Terminal className="h-4 w-4 text-muted-foreground" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold">
                                {totalSessions}
                            </div>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium">
                                {t.list.active_sessions}
                            </CardTitle>
                            <Activity className="h-4 w-4 text-green-500" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold">
                                {
                                    sessions.filter(
                                        (s) => s.status === 'active',
                                    ).length
                                }
                            </div>
                        </CardContent>
                    </Card>
                </div>

                {/* Filters */}
                <Card>
                    <CardHeader>
                        <div className="flex flex-col gap-4 md:flex-row">
                            <div className="flex-1">
                                <Label>Search</Label>
                                <div className="relative">
                                    <Search className="absolute top-2.5 left-2 h-4 w-4 text-muted-foreground" />
                                    <Input
                                        placeholder="Search by session ID, username, IP, or SSH host..."
                                        value={search}
                                        onChange={(e) => {
                                            setSearch(e.target.value);
                                            setPage(1);
                                        }}
                                        className="pl-8"
                                    />
                                </div>
                            </div>

                            <div className="w-full md:w-64">
                                <Label>Servers</Label>
                                <ServerSelector
                                    selectedServers={serverFilter}
                                    onSelectionChange={(selected) => {
                                        setServerFilter(selected);
                                        setPage(1);
                                    }}
                                    multiSelect={true}
                                    placeholder="All servers"
                                    endpoint="/api/dashboard/servers"
                                />
                            </div>

                            <div className="w-full md:w-48">
                                <Label>Status</Label>
                                <Select
                                    value={statusFilter}
                                    onValueChange={setStatusFilter}
                                >
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">
                                            All Statuses
                                        </SelectItem>
                                        <SelectItem value="active">
                                            Active
                                        </SelectItem>
                                        <SelectItem value="completed">
                                            Completed
                                        </SelectItem>
                                        <SelectItem value="failed">
                                            Failed
                                        </SelectItem>
                                        <SelectItem value="terminated">
                                            Terminated
                                        </SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent>
                        {/* Sessions Table */}
                        {loading ? (
                            <div className="flex items-center justify-center py-8">
                                <div className="text-muted-foreground">
                                    Loading...
                                </div>
                            </div>
                        ) : sessions.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-8 text-center">
                                <Terminal className="mb-4 h-12 w-12 text-muted-foreground" />
                                <h3 className="text-lg font-medium">
                                    {t.list.no_sessions}
                                </h3>
                                <p className="text-sm text-muted-foreground">
                                    {t.list.no_sessions_description}
                                </p>
                            </div>
                        ) : (
                            <>
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>{t.table.server}</TableHead>
                                            <TableHead>{t.table.user}</TableHead>
                                            <TableHead>{t.table.started}</TableHead>
                                            <TableHead>{t.table.duration}</TableHead>
                                            <TableHead>{t.table.status}</TableHead>
                                            <TableHead>Auth</TableHead>
                                            <TableHead>{t.table.ip_address}</TableHead>
                                            <TableHead>{t.table.actions}</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {sessions.map((session) => (
                                            <TableRow key={session.id}>
                                                <TableCell>
                                                    <div className="flex items-center gap-2">
                                                        <Server className="h-4 w-4 text-muted-foreground" />
                                                        <div>
                                                            <div className="font-medium">
                                                                {session.server
                                                                    ?.display_name ||
                                                                    'Unknown'}
                                                            </div>
                                                            <div className="text-xs text-muted-foreground">
                                                                {
                                                                    session.ssh_username
                                                                }
                                                                @
                                                                {
                                                                    session.ssh_host
                                                                }
                                                            </div>
                                                        </div>
                                                    </div>
                                                </TableCell>
                                                <TableCell>
                                                    <div className="text-sm">
                                                        {session.user_id
                                                            ? `User #${session.user_id}`
                                                            : 'Anonymous'}
                                                    </div>
                                                </TableCell>
                                                <TableCell>
                                                    <div className="flex items-center gap-1 text-sm">
                                                        <Clock className="h-3 w-3 text-muted-foreground" />
                                                        {formatDateTime(
                                                            session.started_at,
                                                        )}
                                                    </div>
                                                </TableCell>
                                                <TableCell>
                                                    <div className="text-sm">
                                                        {session.duration_formatted ||
                                                            'In progress'}
                                                    </div>
                                                </TableCell>
                                                <TableCell>
                                                    {getStatusBadge(
                                                        session.status,
                                                    )}
                                                </TableCell>
                                                <TableCell>
                                                    {getAuthMethodBadge(
                                                        session.auth_method,
                                                    )}
                                                </TableCell>
                                                <TableCell>
                                                    <div className="text-sm">
                                                        {session.ip_address ||
                                                            'N/A'}
                                                    </div>
                                                </TableCell>
                                                <TableCell>
                                                    <div className="flex gap-2">
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            onClick={() =>
                                                                handleViewDetails(
                                                                    session.id,
                                                                )
                                                            }
                                                        >
                                                            Details
                                                        </Button>
                                                        {session.status ===
                                                            'active' && (
                                                            <Button
                                                                variant="ghost"
                                                                size="sm"
                                                                onClick={() => {
                                                                    setSessionToTerminate(
                                                                        session,
                                                                    );
                                                                    setTerminateDialogOpen(
                                                                        true,
                                                                    );
                                                                }}
                                                                className="text-destructive hover:text-destructive"
                                                            >
                                                                Terminate
                                                            </Button>
                                                        )}
                                                    </div>
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>

                                {/* Pagination */}
                                {lastPage > 1 && (
                                    <div className="mt-4 flex items-center justify-between">
                                        <div className="text-sm text-muted-foreground">
                                            Page {page} of {lastPage}
                                        </div>
                                        <div className="flex gap-2">
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={() =>
                                                    setPage(page - 1)
                                                }
                                                disabled={page === 1}
                                            >
                                                Previous
                                            </Button>
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={() =>
                                                    setPage(page + 1)
                                                }
                                                disabled={page === lastPage}
                                            >
                                                Next
                                            </Button>
                                        </div>
                                    </div>
                                )}
                            </>
                        )}
                    </CardContent>
                </Card>
            </div>

            {/* Session Details Dialog */}
            <Dialog
                open={detailsDialogOpen}
                onOpenChange={setDetailsDialogOpen}
            >
                <DialogContent className="max-w-2xl">
                    <DialogHeader>
                        <DialogTitle>Session Details</DialogTitle>
                        <DialogDescription>
                            Detailed information about this SSH session
                        </DialogDescription>
                    </DialogHeader>

                    {selectedSession && (
                        <div className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <Label className="text-muted-foreground">
                                        Session ID
                                    </Label>
                                    <div className="mt-1 font-mono text-sm">
                                        {selectedSession.session_id}
                                    </div>
                                </div>
                                <div>
                                    <Label className="text-muted-foreground">
                                        Status
                                    </Label>
                                    <div className="mt-1">
                                        {getStatusBadge(selectedSession.status)}
                                    </div>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <Label className="text-muted-foreground">
                                        Server
                                    </Label>
                                    <div className="mt-1">
                                        {selectedSession.server?.display_name ||
                                            'Unknown'}
                                    </div>
                                </div>
                                <div>
                                    <Label className="text-muted-foreground">
                                        SSH User
                                    </Label>
                                    <div className="mt-1">
                                        {selectedSession.ssh_username}
                                    </div>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <Label className="text-muted-foreground">
                                        Started At
                                    </Label>
                                    <div className="mt-1">
                                        {formatDateTime(
                                            selectedSession.started_at,
                                        )}
                                    </div>
                                </div>
                                <div>
                                    <Label className="text-muted-foreground">
                                        Ended At
                                    </Label>
                                    <div className="mt-1">
                                        {selectedSession.ended_at
                                            ? formatDateTime(
                                                  selectedSession.ended_at,
                                              )
                                            : 'Still active'}
                                    </div>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <Label className="text-muted-foreground">
                                        Duration
                                    </Label>
                                    <div className="mt-1">
                                        {selectedSession.duration_formatted ||
                                            'In progress'}
                                    </div>
                                </div>
                                <div>
                                    <Label className="text-muted-foreground">
                                        Auth Method
                                    </Label>
                                    <div className="mt-1">
                                        {getAuthMethodBadge(
                                            selectedSession.auth_method,
                                        )}
                                    </div>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <Label className="text-muted-foreground">
                                        IP Address
                                    </Label>
                                    <div className="mt-1">
                                        {selectedSession.ip_address || 'N/A'}
                                    </div>
                                </div>
                                <div>
                                    <Label className="text-muted-foreground">
                                        SSH Port
                                    </Label>
                                    <div className="mt-1">
                                        {selectedSession.ssh_port}
                                    </div>
                                </div>
                            </div>

                            {selectedSession.user_agent && (
                                <div>
                                    <Label className="text-muted-foreground">
                                        User Agent
                                    </Label>
                                    <div className="mt-1 text-sm">
                                        {selectedSession.user_agent}
                                    </div>
                                </div>
                            )}

                            {selectedSession.disconnect_reason && (
                                <div>
                                    <Label className="text-muted-foreground">
                                        Disconnect Reason
                                    </Label>
                                    <div className="mt-1 text-sm">
                                        {selectedSession.disconnect_reason}
                                    </div>
                                </div>
                            )}

                            {selectedSession.host_key_fingerprint && (
                                <div>
                                    <Label className="text-muted-foreground">
                                        Host Key Fingerprint
                                    </Label>
                                    <div className="mt-1 font-mono text-xs break-all">
                                        {selectedSession.host_key_fingerprint}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => setDetailsDialogOpen(false)}
                        >
                            Close
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Terminate Session Dialog */}
            <Dialog
                open={terminateDialogOpen}
                onOpenChange={setTerminateDialogOpen}
            >
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Terminate SSH Session</DialogTitle>
                        <DialogDescription>
                            Are you sure you want to terminate this active SSH
                            session? This action cannot be undone.
                        </DialogDescription>
                    </DialogHeader>

                    {sessionToTerminate && (
                        <div className="rounded-lg bg-muted p-4">
                            <div className="text-sm">
                                <strong>Server:</strong>{' '}
                                {sessionToTerminate.server?.display_name ||
                                    'Unknown'}
                            </div>
                            <div className="text-sm">
                                <strong>User:</strong>{' '}
                                {sessionToTerminate.ssh_username}
                            </div>
                            <div className="text-sm">
                                <strong>Started:</strong>{' '}
                                {formatDateTime(sessionToTerminate.started_at)}
                            </div>
                        </div>
                    )}

                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => {
                                setTerminateDialogOpen(false);
                                setSessionToTerminate(null);
                            }}
                        >
                            Cancel
                        </Button>
                        <Button
                            variant="destructive"
                            onClick={handleTerminateSession}
                        >
                            Terminate Session
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </AppLayout>
    );
}
