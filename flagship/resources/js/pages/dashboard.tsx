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

interface DashboardStats {
    total_servers: number;
    online_servers: number;
    offline_servers: number;
    active_alerts: number;
}

interface DashboardTranslations {
    title: string;
    subtitle: string;
    stats: {
        total_servers: string;
        total_servers_description: string;
        online_servers: string;
        online_servers_description: string;
        offline_servers: string;
        active_alerts: string;
        active_alerts_description: string;
    };
    metrics: {
        title: string;
        select_server: string;
        viewing_metrics: string;
        server: string;
        servers: string;
        no_data: string;
    };
}

interface DashboardProps {
    translations: {
        common: Record<string, string>;
        nav: Record<string, string>;
        dashboard: DashboardTranslations;
    };
}

export default function Dashboard({ translations }: DashboardProps) {
    const t = translations.dashboard;
    const breadcrumbs: BreadcrumbItem[] = [
        {
            title: t.title,
            href: dashboard().url,
        },
    ];
    const [stats, setStats] = useState<DashboardStats>({
        total_servers: 0,
        online_servers: 0,
        offline_servers: 0,
        active_alerts: 0,
    });
    const [selectedServers, setSelectedServers] = useState<string[]>([]);
    const [loading, setLoading] = useState(true);

    // Fetch stats on mount and auto-refresh every 30s
    useEffect(() => {
        // Initial fetch
        fetchStats();

        // Set up auto-refresh interval
        const interval = setInterval(() => {
            fetchStats();
        }, 30000); // 30 seconds

        // Cleanup interval on unmount
        return () => clearInterval(interval);
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
            <Head title={t.title} />
            <div className="AdmiralDashboard flex h-full flex-1 flex-col gap-4 overflow-x-auto rounded-xl p-4">
                {/* Stats Cards */}
                <div className="grid auto-rows-min gap-4 md:grid-cols-3">
                    <DashboardStatsCard
                        title={t.stats.total_servers}
                        value={loading ? '...' : stats.total_servers}
                        icon={Server}
                        description={
                            t.stats.total_servers_description
                        }
                    />
                    <DashboardStatsCard
                        title={t.stats.online_servers}
                        value={loading ? '...' : stats.online_servers}
                        icon={Activity}
                        description={
                            t.stats.online_servers_description
                        }
                        className="border-green-500/20"
                    />
                    <DashboardStatsCard
                        title={t.stats.active_alerts}
                        value={loading ? '...' : stats.active_alerts}
                        icon={AlertCircle}
                        description={
                            t.stats.active_alerts_description
                        }
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
                                    placeholder={
                                        t.metrics.select_server
                                    }
                                />
                            </div>
                        </div>
                        {selectedServers.length > 0 && (
                            <div className="text-sm text-muted-foreground">
                                {t.metrics.viewing_metrics
                                    .replace(
                                        ':count',
                                        selectedServers.length.toString(),
                                    )
                                    .replace(
                                        ':type',
                                        selectedServers.length === 1
                                            ? t.metrics.server
                                            : t.metrics.servers,
                                    )}
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
