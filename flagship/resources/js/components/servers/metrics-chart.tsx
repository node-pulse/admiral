import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useEffect, useState } from 'react';
import {
    CartesianGrid,
    Legend,
    Line,
    LineChart,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from 'recharts';

interface MetricsChartProps {
    selectedServers: string[];
}

interface MetricDataPoint {
    timestamp: string;
    cpu_usage_percent?: number;
    memory_usage_percent?: number;
    disk_usage_percent?: number;
    network_upload_bytes?: number;
    network_download_bytes?: number;
}

interface ServerMetrics {
    server_id: string;
    hostname: string;
    display_name: string;
    data_points: MetricDataPoint[];
}

const TIME_RANGES = [
    { label: '24 Hours', value: '24' },
    { label: '48 Hours', value: '48' },
    { label: '72 Hours', value: '72' },
    { label: '7 Days', value: '168' },
];

const METRIC_TYPES = [
    { label: 'CPU', value: 'cpu' },
    { label: 'Memory', value: 'memory' },
    { label: 'Disk', value: 'disk' },
    { label: 'Network', value: 'network' },
];

const COLORS = [
    '#8884d8',
    '#82ca9d',
    '#ffc658',
    '#ff7c7c',
    '#a78bfa',
    '#f472b6',
    '#fb923c',
    '#34d399',
];

export function MetricsChart({ selectedServers }: MetricsChartProps) {
    const [timeRange, setTimeRange] = useState('24');
    const [metricType, setMetricType] = useState<
        'cpu' | 'memory' | 'disk' | 'network'
    >('cpu');
    const [metricsData, setMetricsData] = useState<ServerMetrics[]>([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (selectedServers.length > 0) {
            fetchMetrics();
        } else {
            setMetricsData([]);
        }
    }, [selectedServers, timeRange, metricType]);

    const fetchMetrics = async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams();
            selectedServers.forEach((id) => params.append('server_ids[]', id));
            params.append('hours', timeRange);
            params.append('metric_types[]', metricType);

            const response = await fetch(`/api/dashboard/metrics?${params}`, {
                headers: {
                    'X-Requested-With': 'XMLHttpRequest',
                },
            });

            if (!response.ok) {
                throw new Error('Failed to fetch metrics');
            }

            const data = await response.json();
            setMetricsData(data.metrics);
        } catch (error) {
            console.error('Failed to fetch metrics:', error);
        } finally {
            setLoading(false);
        }
    };

    // Transform data for Recharts
    const transformDataForChart = () => {
        if (metricsData.length === 0) {
            return [];
        }

        // Create a map of all timestamps
        const timestampMap = new Map<string, Record<string, number | string>>();

        metricsData.forEach((serverMetric) => {
            serverMetric.data_points.forEach((point) => {
                if (!timestampMap.has(point.timestamp)) {
                    timestampMap.set(point.timestamp, {
                        timestamp: new Date(
                            point.timestamp,
                        ).toLocaleTimeString(),
                    });
                }

                const dataPoint = timestampMap.get(point.timestamp);
                if (!dataPoint) return;

                // Add metric value for this server
                if (
                    metricType === 'cpu' &&
                    point.cpu_usage_percent !== undefined
                ) {
                    dataPoint[serverMetric.display_name] =
                        point.cpu_usage_percent;
                } else if (
                    metricType === 'memory' &&
                    point.memory_usage_percent !== undefined
                ) {
                    dataPoint[serverMetric.display_name] =
                        point.memory_usage_percent;
                } else if (
                    metricType === 'disk' &&
                    point.disk_usage_percent !== undefined
                ) {
                    dataPoint[serverMetric.display_name] =
                        point.disk_usage_percent;
                } else if (metricType === 'network') {
                    // For network, we'll show upload + download in MB
                    const upload = point.network_upload_bytes || 0;
                    const download = point.network_download_bytes || 0;
                    dataPoint[serverMetric.display_name] = parseFloat(
                        ((upload + download) / 1024 / 1024).toFixed(2),
                    );
                }
            });
        });

        return Array.from(timestampMap.values()).reverse();
    };

    const chartData = transformDataForChart();

    const getYAxisLabel = () => {
        if (metricType === 'network') {
            return 'MB/s';
        }
        return '%';
    };

    const getChartTitle = () => {
        const typeLabel = METRIC_TYPES.find(
            (t) => t.value === metricType,
        )?.label;
        return `${typeLabel} Usage`;
    };

    if (selectedServers.length === 0) {
        return (
            <Card>
                <CardContent className="flex h-96 items-center justify-center">
                    <p className="text-muted-foreground">
                        Select one or more servers to view metrics
                    </p>
                </CardContent>
            </Card>
        );
    }

    return (
        <Card>
            <CardHeader>
                <div className="flex items-center justify-between">
                    <CardTitle>{getChartTitle()}</CardTitle>
                    <div className="flex items-center gap-4">
                        <Tabs
                            value={metricType}
                            onValueChange={(value) =>
                                setMetricType(value as typeof metricType)
                            }
                        >
                            <TabsList>
                                {METRIC_TYPES.map((type) => (
                                    <TabsTrigger
                                        key={type.value}
                                        value={type.value}
                                    >
                                        {type.label}
                                    </TabsTrigger>
                                ))}
                            </TabsList>
                        </Tabs>
                        <Select value={timeRange} onValueChange={setTimeRange}>
                            <SelectTrigger className="w-32">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {TIME_RANGES.map((range) => (
                                    <SelectItem
                                        key={range.value}
                                        value={range.value}
                                    >
                                        {range.label}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                </div>
            </CardHeader>
            <CardContent>
                {loading ? (
                    <div className="flex h-96 items-center justify-center">
                        <p className="text-muted-foreground">
                            Loading metrics...
                        </p>
                    </div>
                ) : chartData.length === 0 ? (
                    <div className="flex h-96 items-center justify-center">
                        <p className="text-muted-foreground">
                            No metrics data available for the selected time
                            range
                        </p>
                    </div>
                ) : (
                    <ResponsiveContainer width="100%" height={400}>
                        <LineChart data={chartData}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis
                                dataKey="timestamp"
                                tick={{ fontSize: 12 }}
                                interval="preserveStartEnd"
                            />
                            <YAxis
                                label={{
                                    value: getYAxisLabel(),
                                    angle: -90,
                                    position: 'insideLeft',
                                }}
                            />
                            <Tooltip />
                            <Legend />
                            {metricsData.map((serverMetric, index) => (
                                <Line
                                    key={serverMetric.server_id}
                                    type="monotone"
                                    dataKey={serverMetric.display_name}
                                    stroke={COLORS[index % COLORS.length]}
                                    strokeWidth={2}
                                    dot={false}
                                />
                            ))}
                        </LineChart>
                    </ResponsiveContainer>
                )}
            </CardContent>
        </Card>
    );
}
