import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
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
import { cn } from '@/lib/utils';
import { type BreadcrumbItem } from '@/types';
import { Head, router, usePage } from '@inertiajs/react';
import {
    CheckCircle2,
    Clock,
    Loader2,
    Plus,
    Rocket,
    Search,
    XCircle,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

interface DeploymentsTranslations {
    title: string;
    subtitle: string;
    actions: Record<string, string>;
    stats: Record<string, string>;
    filters: Record<string, string>;
    status: Record<string, string>;
    table: Record<string, string>;
    empty: Record<string, string>;
    pagination: Record<string, string>;
    messages: Record<string, string>;
}

interface DeploymentsProps {
    translations: {
        common: Record<string, string>;
        nav: Record<string, string>;
        deployments: DeploymentsTranslations;
    };
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
    success_rate: number;
    duration: number | null;
    started_at: string | null;
    completed_at: string | null;
    created_at: string;
}

interface DeploymentsResponse {
    deployments: {
        data: DeploymentData[];
    };
    meta: {
        current_page: number;
        per_page: number;
        total: number;
        last_page: number;
    };
}

export default function DeploymentsIndex({ translations }: DeploymentsProps) {
    const t = translations.deployments;
    const breadcrumbs: BreadcrumbItem[] = [
        {
            title: `${t.title} - ${t.subtitle}`,
            href: '/dashboard/deployments',
        },
    ];

    const { props } = usePage();
    const csrfToken =
        (props as any).csrf_token ||
        document
            .querySelector('meta[name="csrf-token"]')
            ?.getAttribute('content') ||
        '';

    const [deployments, setDeployments] = useState<DeploymentData[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState<string>('all');
    const [currentPage, setCurrentPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [total, setTotal] = useState(0);

    const fetchDeployments = async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams({
                page: currentPage.toString(),
                per_page: '20',
            });

            if (searchTerm) {
                params.append('search', searchTerm);
            }

            if (statusFilter !== 'all') {
                params.append('status', statusFilter);
            }

            const response = await fetch(
                `/api/deployments?${params.toString()}`,
                {
                    headers: {
                        'X-CSRF-TOKEN': csrfToken,
                        Accept: 'application/json',
                    },
                },
            );

            if (!response.ok) {
                throw new Error(t.messages.failed_to_fetch);
            }

            const data: DeploymentsResponse = await response.json();
            setDeployments(data.deployments.data);
            setTotalPages(data.meta.last_page);
            setTotal(data.meta.total);
        } catch (error) {
            console.error('Error fetching deployments:', error);
            toast.error(t.messages.failed_to_fetch);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchDeployments();
    }, [currentPage, searchTerm, statusFilter]); // eslint-disable-line react-hooks/exhaustive-deps

    const getStatusBadge = (status: DeploymentData['status']) => {
        const variants: Record<
            DeploymentData['status'],
            { variant: any; icon: any; label: string; className?: string }
        > = {
            pending: { variant: 'secondary', icon: Clock, label: t.status.pending },
            running: { variant: 'default', icon: Loader2, label: t.status.running },
            completed: {
                variant: 'outline',
                icon: CheckCircle2,
                label: t.status.completed,
                className:
                    'border-green-600 bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-400',
            },
            failed: { variant: 'destructive', icon: XCircle, label: t.status.failed },
            cancelled: {
                variant: 'secondary',
                icon: XCircle,
                label: t.status.cancelled,
            },
        };

        const { variant, icon: Icon, label, className } = variants[status];

        return (
            <Badge
                variant={variant}
                className={cn('flex w-fit items-center gap-1', className)}
            >
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

    const handleCreateDeployment = () => {
        router.visit('/dashboard/deployments/create');
    };

    const handleViewDeployment = (id: string) => {
        router.visit(`/dashboard/deployments/${id}/details`);
    };

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={t.title} />

            <div className="AdmiralDeployments flex h-full flex-1 flex-col gap-4 overflow-x-auto rounded-xl p-4">
                {/* Header */}
                <div className="flex items-center justify-between">
                    <Button onClick={handleCreateDeployment}>
                        <Plus className="mr-2 h-4 w-4" />
                        {t.actions.new_deployment}
                    </Button>
                </div>

                {/* Stats Cards */}
                <div className="grid gap-4 md:grid-cols-4">
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium">
                                {t.stats.total_deployments}
                            </CardTitle>
                            <Rocket className="h-4 w-4 text-muted-foreground" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold">{total}</div>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium">
                                {t.stats.running}
                            </CardTitle>
                            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold">
                                {
                                    deployments.filter(
                                        (d) => d.status === 'running',
                                    ).length
                                }
                            </div>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium">
                                {t.stats.completed}
                            </CardTitle>
                            <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold">
                                {
                                    deployments.filter(
                                        (d) => d.status === 'completed',
                                    ).length
                                }
                            </div>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium">
                                {t.stats.failed}
                            </CardTitle>
                            <XCircle className="h-4 w-4 text-muted-foreground" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold">
                                {
                                    deployments.filter(
                                        (d) => d.status === 'failed',
                                    ).length
                                }
                            </div>
                        </CardContent>
                    </Card>
                </div>

                {/* Filters */}
                <Card>
                    <CardHeader>
                        <div className="flex flex-col gap-4 sm:flex-row">
                            <div className="relative flex-1">
                                <Search className="absolute top-2.5 left-2.5 h-4 w-4 text-muted-foreground" />
                                <Input
                                    placeholder={t.filters.search_placeholder}
                                    className="pl-8"
                                    value={searchTerm}
                                    onChange={(e) =>
                                        setSearchTerm(e.target.value)
                                    }
                                />
                            </div>
                            <Select
                                value={statusFilter}
                                onValueChange={setStatusFilter}
                            >
                                <SelectTrigger className="w-full sm:w-[180px]">
                                    <SelectValue placeholder={t.filters.filter_by_status} />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">
                                        {t.filters.all_status}
                                    </SelectItem>
                                    <SelectItem value="pending">
                                        {t.status.pending}
                                    </SelectItem>
                                    <SelectItem value="running">
                                        {t.status.running}
                                    </SelectItem>
                                    <SelectItem value="completed">
                                        {t.status.completed}
                                    </SelectItem>
                                    <SelectItem value="failed">
                                        {t.status.failed}
                                    </SelectItem>
                                    <SelectItem value="cancelled">
                                        {t.status.cancelled}
                                    </SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </CardHeader>
                    <CardContent>
                        {loading ? (
                            <div className="flex items-center justify-center py-12">
                                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                            </div>
                        ) : deployments.length === 0 ? (
                            <div className="py-12 text-center">
                                <Rocket className="mx-auto h-12 w-12 text-muted-foreground" />
                                <h3 className="mt-4 text-lg font-semibold">
                                    {t.empty.no_deployments_found}
                                </h3>
                                <p className="mt-1 text-muted-foreground">
                                    {t.empty.get_started}
                                </p>
                                <Button
                                    onClick={handleCreateDeployment}
                                    className="mt-4"
                                >
                                    <Plus className="mr-2 h-4 w-4" />
                                    {t.actions.create_deployment}
                                </Button>
                            </div>
                        ) : (
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>{t.table.name}</TableHead>
                                        <TableHead>{t.table.playbook}</TableHead>
                                        <TableHead>{t.table.status}</TableHead>
                                        <TableHead>{t.table.servers}</TableHead>
                                        <TableHead>{t.table.success_rate}</TableHead>
                                        <TableHead>{t.table.duration}</TableHead>
                                        <TableHead>{t.table.created}</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {deployments.map((deployment) => (
                                        <TableRow
                                            key={deployment.id}
                                            className="cursor-pointer"
                                            onClick={() =>
                                                handleViewDeployment(
                                                    deployment.id,
                                                )
                                            }
                                        >
                                            <TableCell>
                                                <div>
                                                    <div className="font-medium">
                                                        {deployment.name}
                                                    </div>
                                                    {deployment.description && (
                                                        <div className="text-sm text-muted-foreground">
                                                            {
                                                                deployment.description
                                                            }
                                                        </div>
                                                    )}
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <Badge variant="outline">
                                                    {deployment.playbook}
                                                </Badge>
                                            </TableCell>
                                            <TableCell>
                                                {getStatusBadge(
                                                    deployment.status,
                                                )}
                                            </TableCell>
                                            <TableCell>
                                                <div className="text-sm">
                                                    <div>
                                                        {t.table.total}:{' '}
                                                        {
                                                            deployment.total_servers
                                                        }
                                                    </div>
                                                    <div className="text-green-600">
                                                        ✓{' '}
                                                        {
                                                            deployment.successful_servers
                                                        }
                                                    </div>
                                                    {deployment.failed_servers >
                                                        0 && (
                                                        <div className="text-red-600">
                                                            ✗{' '}
                                                            {
                                                                deployment.failed_servers
                                                            }
                                                        </div>
                                                    )}
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                {deployment.total_servers >
                                                0 ? (
                                                    <span
                                                        className={
                                                            deployment.success_rate ===
                                                            100
                                                                ? 'font-medium text-green-600'
                                                                : deployment.success_rate >
                                                                    50
                                                                  ? 'text-yellow-600'
                                                                  : 'text-red-600'
                                                        }
                                                    >
                                                        {deployment.success_rate.toFixed(
                                                            1,
                                                        )}
                                                        %
                                                    </span>
                                                ) : (
                                                    'N/A'
                                                )}
                                            </TableCell>
                                            <TableCell>
                                                {formatDuration(
                                                    deployment.duration,
                                                )}
                                            </TableCell>
                                            <TableCell className="text-sm text-muted-foreground">
                                                {formatDate(
                                                    deployment.created_at,
                                                )}
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        )}

                        {/* Pagination */}
                        {totalPages > 1 && (
                            <div className="mt-4 flex items-center justify-between">
                                <div className="text-sm text-muted-foreground">
                                    {t.pagination.page} {currentPage} {t.pagination.of} {totalPages}
                                </div>
                                <div className="flex gap-2">
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        disabled={currentPage === 1}
                                        onClick={() =>
                                            setCurrentPage(currentPage - 1)
                                        }
                                    >
                                        {t.pagination.previous}
                                    </Button>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        disabled={currentPage === totalPages}
                                        onClick={() =>
                                            setCurrentPage(currentPage + 1)
                                        }
                                    >
                                        {t.pagination.next}
                                    </Button>
                                </div>
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>
        </AppLayout>
    );
}
