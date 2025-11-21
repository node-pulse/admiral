import { Activity, AlertCircle, Server } from 'lucide-react';
import { useEffect, useState } from 'react';
import { DashboardStatsCard } from './dashboard-stats-card';

interface DashboardStats {
    total_servers: number;
    online_servers: number;
    offline_servers: number;
    active_alerts: number;
}

interface DashboardStatsTranslations {
    total_servers: string;
    total_servers_description: string;
    online_servers: string;
    online_servers_description: string;
    offline_servers: string;
    active_alerts: string;
    active_alerts_description: string;
}

interface DashboardStatsProps {
    translations: DashboardStatsTranslations;
}

export function DashboardStats({ translations }: DashboardStatsProps) {
    const [stats, setStats] = useState<DashboardStats>({
        total_servers: 0,
        online_servers: 0,
        offline_servers: 0,
        active_alerts: 0,
    });
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        // Initial fetch
        fetchStats();

        // Set up auto-refresh interval (30 seconds)
        const interval = setInterval(() => {
            fetchStats();
        }, 30000);

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
        <div className="grid auto-rows-min gap-4 md:grid-cols-3">
            <DashboardStatsCard
                title={translations.total_servers}
                value={loading ? '...' : stats.total_servers}
                icon={Server}
                description={translations.total_servers_description}
            />
            <DashboardStatsCard
                title={translations.online_servers}
                value={loading ? '...' : stats.online_servers}
                icon={Activity}
                description={translations.online_servers_description}
                className="border-green-500/20"
            />
            <DashboardStatsCard
                title={translations.active_alerts}
                value={loading ? '...' : stats.active_alerts}
                icon={AlertCircle}
                description={translations.active_alerts_description}
                className={stats.active_alerts > 0 ? 'border-red-500/20' : ''}
            />
        </div>
    );
}
