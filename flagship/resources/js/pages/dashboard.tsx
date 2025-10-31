import { DashboardStatsCard } from '@/components/dashboard/dashboard-stats-card';
import { MetricsChart } from '@/components/servers/metrics-chart';
import { ProcessList } from '@/components/servers/process-list';
import { ServerSelector } from '@/components/servers/server-selector';
import AppLayout from '@/layouts/app-layout';
import { dashboard } from '@/routes';
import { type BreadcrumbItem } from '@/types';
import { Head } from '@inertiajs/react';
import { Activity, AlertCircle, Server, ServerCog } from 'lucide-react';
import { useEffect, useState } from 'react';

const breadcrumbs: BreadcrumbItem[] = [
    {
        title: 'Admiral Dashboard',
        href: dashboard().url,
    },
];

interface DashboardStats {
    total_servers: number;
    online_servers: number;
    offline_servers: number;
    active_alerts: number;
}

export default function Dashboard() {
    const [stats, setStats] = useState<DashboardStats>({
        total_servers: 0,
        online_servers: 0,
        offline_servers: 0,
        active_alerts: 0,
    });
    const [selectedServers, setSelectedServers] = useState<string[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchStats();
    }, []);

    const fetchStats = async () => {
        setLoading(true);
        try {
            const response = await fetch('/api/dashboard/stats');
            const data = await response.json();
            setStats(data);
        } catch (error) {
            console.error('Failed to fetch dashboard stats:', error);
        } finally {
            setLoading(false);
        }
    };

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Admiral Dashboard" />
            <div className="AdmiralDashboard flex h-full flex-1 flex-col gap-4 overflow-x-auto rounded-xl p-4">
                {/* Stats Cards */}
                <div className="grid auto-rows-min gap-4 md:grid-cols-3">
                    <DashboardStatsCard
                        title="Total Servers"
                        value={loading ? '...' : stats.total_servers}
                        icon={Server}
                        description="Registered servers in fleet"
                    />
                    <DashboardStatsCard
                        title="Online Servers"
                        value={loading ? '...' : stats.online_servers}
                        icon={Activity}
                        description="Active in last 5 minutes"
                        className="border-green-500/20"
                    />
                    <DashboardStatsCard
                        title="Active Alerts"
                        value={loading ? '...' : stats.active_alerts}
                        icon={AlertCircle}
                        description="Unresolved alerts"
                        className={
                            stats.active_alerts > 0 ? 'border-red-500/20' : ''
                        }
                    />
                </div>

                {/* Server Selection and Charts */}
                <div className="flex flex-col gap-4">
                    <div className="flex flex-col gap-2">
                        <div className="flex items-center gap-4">
                            <ServerCog className="size-5 text-muted-foreground" />
                            <div className="flex-1">
                                <ServerSelector
                                    selectedServers={selectedServers}
                                    onSelectionChange={setSelectedServers}
                                    multiSelect={true}
                                    placeholder="Select servers to view metrics..."
                                />
                            </div>
                        </div>
                        {selectedServers.length > 0 && (
                            <div className="text-sm text-muted-foreground">
                                Viewing metrics for {selectedServers.length}{' '}
                                {selectedServers.length === 1
                                    ? 'server'
                                    : 'servers'}
                            </div>
                        )}
                    </div>

                    {/* Metrics Chart */}
                    <MetricsChart selectedServers={selectedServers} />

                    {/* Top Processes */}
                    <ProcessList selectedServers={selectedServers} />
                </div>
            </div>
        </AppLayout>
    );
}
