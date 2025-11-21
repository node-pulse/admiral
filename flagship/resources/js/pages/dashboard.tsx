import { DashboardStats } from '@/components/dashboard/dashboard-stats';
import { ServerSelection } from '@/components/dashboard/server-selection';
import { MetricsChart } from '@/components/servers/metrics-chart';
import { ProcessList } from '@/components/servers/process-list';
import AppLayout from '@/layouts/app-layout';
import { dashboard } from '@/routes';
import { type BreadcrumbItem } from '@/types';
import { Head } from '@inertiajs/react';
import { useState } from 'react';

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
    const [selectedServers, setSelectedServers] = useState<string[]>([]);

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={t.title} />
            <div className="AdmiralDashboard flex h-full flex-1 flex-col gap-4 overflow-x-auto rounded-xl p-4">
                {/* Stats Cards */}
                <DashboardStats translations={t.stats} />

                {/* Server Selection and Charts */}
                <div className="flex flex-col gap-4">
                    <ServerSelection
                        selectedServers={selectedServers}
                        onSelectionChange={setSelectedServers}
                        translations={t.metrics}
                    />

                    {/* Metrics Chart */}
                    <MetricsChart selectedServers={selectedServers} />

                    {/* Top Processes */}
                    <ProcessList selectedServers={selectedServers} />
                </div>
            </div>
        </AppLayout>
    );
}
