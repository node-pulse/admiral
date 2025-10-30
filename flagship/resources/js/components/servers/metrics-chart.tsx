/* eslint-disable @typescript-eslint/no-unused-vars */
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
    memory_used_mb?: number;
    memory_available_mb?: number;
    memory_total_mb?: number;
    disk_used_gb?: number;
    disk_available_gb?: number;
    disk_total_gb?: number;
    network_download_mbps?: number;
    network_upload_mbps?: number;
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
        // eslint-disable-next-line react-hooks/exhaustive-deps
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

    // Align timestamp to 15-second boundary for consistent chart display
    const alignTimestampTo15Seconds = (timestamp: string): string => {
        const date = new Date(timestamp);
        const seconds = date.getSeconds();
        const alignedSeconds = Math.floor(seconds / 15) * 15;

        date.setSeconds(alignedSeconds);
        date.setMilliseconds(0);

        return date.toISOString();
    };

    // Transform data for Recharts
    const transformDataForChart = () => {
        if (metricsData.length === 0) {
            return [];
        }

        // Align timestamps to 15-second boundaries for consistent display
        // This groups data points from slightly different timestamps together
        const timestampMap = new Map<
            string,
            Record<string, number | string | null>
        >();

        // First pass: Create entries for all timestamps and initialize server values to null
        metricsData.forEach((serverMetric) => {
            serverMetric.data_points.forEach((point) => {
                // Align timestamp to 15-second boundary
                const alignedTimestamp = alignTimestampTo15Seconds(
                    point.timestamp,
                );

                if (!timestampMap.has(alignedTimestamp)) {
                    const date = new Date(alignedTimestamp);
                    const newEntry: Record<string, number | string | null> = {
                        timestamp: date.toLocaleTimeString('en-US', {
                            hour: '2-digit',
                            minute: '2-digit',
                            hour12: false,
                        }),
                        rawTime: alignedTimestamp,
                    };
                    // Initialize all servers to null for this timestamp
                    metricsData.forEach((sm) => {
                        if (metricType === 'network') {
                            // Network has 2 lines per server (upload & download)
                            newEntry[`${sm.display_name} (Download)`] = null;
                            newEntry[`${sm.display_name} (Upload)`] = null;
                        } else {
                            newEntry[sm.display_name] = null;
                        }
                    });
                    timestampMap.set(alignedTimestamp, newEntry);
                }
            });
        });

        // Second pass: Fill in actual metric values where they exist
        metricsData.forEach((serverMetric) => {
            serverMetric.data_points.forEach((point) => {
                // Align timestamp to match first pass
                const alignedTimestamp = alignTimestampTo15Seconds(
                    point.timestamp,
                );
                const dataPoint = timestampMap.get(alignedTimestamp);
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
                    point.memory_used_mb !== undefined
                ) {
                    // Show memory used in MB (absolute value)
                    dataPoint[serverMetric.display_name] = point.memory_used_mb;
                } else if (
                    metricType === 'disk' &&
                    point.disk_used_gb !== undefined
                ) {
                    // Show disk used in GB (absolute value)
                    dataPoint[serverMetric.display_name] = point.disk_used_gb;
                } else if (metricType === 'network') {
                    // Show upload and download separately
                    const uploadMbps = point.network_upload_mbps || 0;
                    const downloadMbps = point.network_download_mbps || 0;
                    dataPoint[`${serverMetric.display_name} (Download)`] =
                        downloadMbps;
                    dataPoint[`${serverMetric.display_name} (Upload)`] =
                        uploadMbps;
                }
            });
        });

        // Sort by timestamp (oldest to newest for proper line chart display)
        return Array.from(timestampMap.entries())
            .sort((a, b) => new Date(a[0]).getTime() - new Date(b[0]).getTime())
            .map(([_, value]) => value);
    };

    const chartData = transformDataForChart();

    const getYAxisLabel = () => {
        switch (metricType) {
            case 'cpu':
                return '%';
            case 'memory':
                return 'MB';
            case 'disk':
                return 'GB';
            case 'network':
                return 'MB/s';
            default:
                return '';
        }
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
                                interval="equidistantPreserveStart"
                                minTickGap={50}
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
                            {metricType === 'network'
                                ? // Network: Show 2 lines per server (upload & download)
                                  metricsData.flatMap((serverMetric, index) => [
                                      <Line
                                          key={`${serverMetric.server_id}-download`}
                                          type="monotone"
                                          dataKey={`${serverMetric.display_name} (Download)`}
                                          stroke={COLORS[(index * 2) % COLORS.length]}
                                          strokeWidth={2}
                                          dot={false}
                                          connectNulls={false}
                                      />,
                                      <Line
                                          key={`${serverMetric.server_id}-upload`}
                                          type="monotone"
                                          dataKey={`${serverMetric.display_name} (Upload)`}
                                          stroke={COLORS[(index * 2 + 1) % COLORS.length]}
                                          strokeWidth={2}
                                          strokeDasharray="5 5"
                                          dot={false}
                                          connectNulls={false}
                                      />,
                                  ])
                                : // Other metrics: 1 line per server
                                  metricsData.map((serverMetric, index) => (
                                      <Line
                                          key={serverMetric.server_id}
                                          type="monotone"
                                          dataKey={serverMetric.display_name}
                                          stroke={COLORS[index % COLORS.length]}
                                          strokeWidth={2}
                                          dot={false}
                                          connectNulls={false}
                                      />
                                  ))}
                        </LineChart>
                    </ResponsiveContainer>
                )}
            </CardContent>
        </Card>
    );
}
