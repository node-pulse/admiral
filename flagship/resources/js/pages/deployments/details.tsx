import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import {
    ArrowLeft,
    CheckCircle2,
    Clock,
    Loader2,
    RefreshCw,
    Server,
    XCircle,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

interface ServerDeploymentData {
    id: string;
    hostname: string;
    name: string | null;
    status: 'pending' | 'running' | 'success' | 'failed' | 'skipped';
    changed: boolean;
    started_at: string | null;
    completed_at: string | null;
    output: string | null;
    error_message: string | null;
}

interface DeploymentData {
    id: string;
    name: string;
    description: string | null;
    playbook: string;
    status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
    total_servers: number;
    successful_servers: number;
    failed_servers: number;
    skipped_servers: number;
    success_rate: number;
    duration: number | null;
    started_at: string | null;
    completed_at: string | null;
    created_at: string;
    output: string | null;
    error_output: string | null;
    servers: ServerDeploymentData[];
}

interface DeploymentShowProps {
    deploymentId: string;
}

export default function DeploymentShow({ deploymentId }: DeploymentShowProps) {
    const { props } = usePage();
    const csrfToken =
        (props as any).csrf_token ||
        document
            .querySelector('meta[name="csrf-token"]')
            ?.getAttribute('content') ||
        '';

    const [deployment, setDeployment] = useState<DeploymentData | null>(null);
    const [loading, setLoading] = useState(true);
    const [cancelling, setCancelling] = useState(false);

    const breadcrumbs: BreadcrumbItem[] = [
        {
            title: 'Deployments',
            href: '/dashboard/deployments',
        },
        {
            title: deployment?.name || 'Loading...',
            href: `/dashboard/deployments/${deploymentId}/details`,
        },
    ];

    const fetchDeployment = async () => {
        try {
            const response = await fetch(`/api/deployments/${deploymentId}`, {
                headers: {
                    'X-CSRF-TOKEN': csrfToken,
                    Accept: 'application/json',
                },
            });

            if (!response.ok) {
                throw new Error('Failed to fetch deployment');
            }

            const data = await response.json();
            setDeployment(data.deployment);
        } catch (error) {
            console.error('Error fetching deployment:', error);
            toast.error('Failed to load deployment details');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchDeployment();

        // Auto-refresh if deployment is running
        const interval = setInterval(() => {
            if (deployment?.status === 'running') {
                fetchDeployment();
            }
        }, 5000); // Refresh every 5 seconds

        return () => clearInterval(interval);
    }, [deploymentId, deployment?.status]);

    const handleCancel = async () => {
        if (!deployment || deployment.status !== 'running') {
            return;
        }

        setCancelling(true);
        try {
            const response = await fetch(
                `/api/deployments/${deploymentId}/cancel`,
                {
                    method: 'POST',
                    headers: {
                        'X-CSRF-TOKEN': csrfToken,
                        Accept: 'application/json',
                    },
                },
            );

            if (!response.ok) {
                throw new Error('Failed to cancel deployment');
            }

            toast.success('Deployment cancelled');
            fetchDeployment();
        } catch (error) {
            console.error('Error cancelling deployment:', error);
            toast.error('Failed to cancel deployment');
        } finally {
            setCancelling(false);
        }
    };

    const handleBack = () => {
        router.visit('/dashboard/deployments');
    };

    const getStatusBadge = (status: DeploymentData['status']) => {
        const variants: Record<
            DeploymentData['status'],
            { variant: any; icon: any; label: string }
        > = {
            pending: { variant: 'secondary', icon: Clock, label: 'Pending' },
            running: { variant: 'default', icon: Loader2, label: 'Running' },
            completed: {
                variant: 'default',
                icon: CheckCircle2,
                label: 'Completed',
            },
            failed: { variant: 'destructive', icon: XCircle, label: 'Failed' },
            cancelled: {
                variant: 'secondary',
                icon: XCircle,
                label: 'Cancelled',
            },
        };

        const { variant, icon: Icon, label } = variants[status];

        return (
            <Badge variant={variant} className="flex w-fit items-center gap-1">
                <Icon
                    className={`h-3 w-3 ${status === 'running' ? 'animate-spin' : ''}`}
                />
                {label}
            </Badge>
        );
    };

    const getServerStatusBadge = (status: ServerDeploymentData['status']) => {
        const variants: Record<
            ServerDeploymentData['status'],
            { variant: any; icon: any; label: string }
        > = {
            pending: { variant: 'secondary', icon: Clock, label: 'Pending' },
            running: { variant: 'default', icon: Loader2, label: 'Running' },
            success: {
                variant: 'default',
                icon: CheckCircle2,
                label: 'Success',
            },
            failed: { variant: 'destructive', icon: XCircle, label: 'Failed' },
            skipped: { variant: 'secondary', icon: XCircle, label: 'Skipped' },
        };

        const { variant, icon: Icon, label } = variants[status];

        return (
            <Badge variant={variant} className="flex w-fit items-center gap-1">
                <Icon
                    className={`h-3 w-3 ${status === 'running' ? 'animate-spin' : ''}`}
                />
                {label}
            </Badge>
        );
    };

    const formatDuration = (seconds: number | null) => {
        if (!seconds) return 'N/A';

        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = seconds % 60;

        if (hours > 0) {
            return `${hours}h ${minutes}m ${secs}s`;
        } else if (minutes > 0) {
            return `${minutes}m ${secs}s`;
        } else {
            return `${secs}s`;
        }
    };

    const formatDate = (dateString: string | null) => {
        if (!dateString) return 'N/A';
        return new Date(dateString).toLocaleString();
    };

    if (loading) {
        return (
            <AppLayout breadcrumbs={breadcrumbs}>
                <Head title="Loading..." />
                <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
            </AppLayout>
        );
    }

    if (!deployment) {
        return (
            <AppLayout breadcrumbs={breadcrumbs}>
                <Head title="Deployment Not Found" />
                <div className="py-12 text-center">
                    <h3 className="text-lg font-semibold">
                        Deployment not found
                    </h3>
                    <Button onClick={handleBack} className="mt-4">
                        Back to Deployments
                    </Button>
                </div>
            </AppLayout>
        );
    }

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={deployment.name} />

            <div className="AdmiralDeploymentsShow flex h-full flex-1 flex-col gap-4 overflow-x-auto rounded-xl p-4">
                {/* Header */}
                <div className="flex items-center justify-between">
                    <div>
                        <div className="flex items-center gap-3">
                            <h1 className="text-3xl font-bold tracking-tight">
                                {deployment.name}
                            </h1>
                            {getStatusBadge(deployment.status)}
                        </div>
                        {deployment.description && (
                            <p className="mt-1 text-muted-foreground">
                                {deployment.description}
                            </p>
                        )}
                    </div>
                    <div className="flex gap-2">
                        {deployment.status === 'running' && (
                            <Button
                                variant="destructive"
                                onClick={handleCancel}
                                disabled={cancelling}
                            >
                                {cancelling ? (
                                    <>
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                        Cancelling...
                                    </>
                                ) : (
                                    'Cancel Deployment'
                                )}
                            </Button>
                        )}
                        <Button
                            variant="outline"
                            onClick={() => fetchDeployment()}
                        >
                            <RefreshCw className="mr-2 h-4 w-4" />
                            Refresh
                        </Button>
                        <Button variant="outline" onClick={handleBack}>
                            <ArrowLeft className="mr-2 h-4 w-4" />
                            Back
                        </Button>
                    </div>
                </div>

                {/* Stats */}
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
                                {deployment.total_servers}
                            </div>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium">
                                Successful
                            </CardTitle>
                            <CheckCircle2 className="h-4 w-4 text-green-600" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold text-green-600">
                                {deployment.successful_servers}
                            </div>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium">
                                Failed
                            </CardTitle>
                            <XCircle className="h-4 w-4 text-red-600" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold text-red-600">
                                {deployment.failed_servers}
                            </div>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium">
                                Success Rate
                            </CardTitle>
                            <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
                        </CardHeader>
                        <CardContent>
                            <div
                                className={`text-2xl font-bold ${
                                    deployment.success_rate === 100
                                        ? 'text-green-600'
                                        : deployment.success_rate > 50
                                          ? 'text-yellow-600'
                                          : 'text-red-600'
                                }`}
                            >
                                {deployment.success_rate.toFixed(1)}%
                            </div>
                        </CardContent>
                    </Card>
                </div>

                {/* Deployment Info */}
                <Card>
                    <CardHeader>
                        <CardTitle>Deployment Information</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="grid gap-4 md:grid-cols-2">
                            <div>
                                <div className="text-sm font-medium text-muted-foreground">
                                    Playbook
                                </div>
                                <div className="mt-1">
                                    <Badge variant="outline">
                                        {deployment.playbook}
                                    </Badge>
                                </div>
                            </div>
                            <div>
                                <div className="text-sm font-medium text-muted-foreground">
                                    Duration
                                </div>
                                <div className="mt-1">
                                    {formatDuration(deployment.duration)}
                                </div>
                            </div>
                            <div>
                                <div className="text-sm font-medium text-muted-foreground">
                                    Started At
                                </div>
                                <div className="mt-1">
                                    {formatDate(deployment.started_at)}
                                </div>
                            </div>
                            <div>
                                <div className="text-sm font-medium text-muted-foreground">
                                    Completed At
                                </div>
                                <div className="mt-1">
                                    {formatDate(deployment.completed_at)}
                                </div>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* Server Status */}
                <Card>
                    <CardHeader>
                        <CardTitle>Server Deployment Status</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Server</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead>Changed</TableHead>
                                    <TableHead>Started</TableHead>
                                    <TableHead>Completed</TableHead>
                                    <TableHead>Error</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {deployment.servers.map((server) => (
                                    <TableRow key={server.id}>
                                        <TableCell>
                                            <div className="font-medium">
                                                {server.name || server.hostname}
                                            </div>
                                            {server.name && (
                                                <div className="text-sm text-muted-foreground">
                                                    {server.hostname}
                                                </div>
                                            )}
                                        </TableCell>
                                        <TableCell>
                                            {getServerStatusBadge(
                                                server.status,
                                            )}
                                        </TableCell>
                                        <TableCell>
                                            {server.changed ? (
                                                <Badge variant="default">
                                                    Yes
                                                </Badge>
                                            ) : (
                                                <Badge variant="secondary">
                                                    No
                                                </Badge>
                                            )}
                                        </TableCell>
                                        <TableCell className="text-sm text-muted-foreground">
                                            {formatDate(server.started_at)}
                                        </TableCell>
                                        <TableCell className="text-sm text-muted-foreground">
                                            {formatDate(server.completed_at)}
                                        </TableCell>
                                        <TableCell>
                                            {server.error_message && (
                                                <span className="text-sm text-red-600">
                                                    {server.error_message}
                                                </span>
                                            )}
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>

                {/* Output Logs */}
                {deployment.output && (
                    <Card>
                        <CardHeader>
                            <CardTitle>Deployment Output</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <Textarea
                                value={deployment.output}
                                readOnly
                                className="h-64 font-mono text-sm"
                            />
                        </CardContent>
                    </Card>
                )}

                {/* Error Output */}
                {deployment.error_output && (
                    <Card>
                        <CardHeader>
                            <CardTitle>Error Output</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <Textarea
                                value={deployment.error_output}
                                readOnly
                                className="h-64 font-mono text-sm text-red-600"
                            />
                        </CardContent>
                    </Card>
                )}
            </div>
        </AppLayout>
    );
}
