import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import {
    DropdownMenu,
    DropdownMenuCheckboxItem,
    DropdownMenuContent,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ChevronDown, Filter } from 'lucide-react';
import { useEffect, useState } from 'react';

interface ProcessListProps {
    selectedServers: string[];
}

interface ProcessData {
    server_id: string;
    server_name: string;
    name: string;
    avg_cpu_percent: number | null;
    avg_memory_mb: number;
    peak_memory_mb: number;
    avg_num_procs: number;
}

const TIME_RANGES = [
    { label: '1 Hour', value: '1' },
    { label: '6 Hours', value: '6' },
    { label: '24 Hours', value: '24' },
    { label: '7 Days', value: '168' },
];

export function ProcessList({ selectedServers }: ProcessListProps) {
    const [timeRange, setTimeRange] = useState('1');
    const [metric, setMetric] = useState<'cpu' | 'memory'>('memory');
    const [processes, setProcesses] = useState<ProcessData[]>([]);
    const [loading, setLoading] = useState(false);
    const [visibleServers, setVisibleServers] = useState<Set<string>>(new Set());

    // Initialize visible servers from processes when they load
    useEffect(() => {
        if (processes.length > 0) {
            // Get unique server_ids from the actual process data
            const serverIds = Array.from(
                new Set(processes.map((p) => p.server_id))
            );
            // Only update if we don't have any visible servers yet, or if new servers appeared
            if (visibleServers.size === 0 || serverIds.some(id => !visibleServers.has(id))) {
                setVisibleServers(new Set(serverIds));
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [processes]);

    // Fetch processes on mount, when selection changes, and auto-refresh every 30s
    useEffect(() => {
        // Clear data if no servers selected
        if (selectedServers.length === 0) {
            setProcesses([]);
            return;
        }

        // Initial fetch
        fetchProcesses(true);

        // Set up auto-refresh interval
        const interval = setInterval(() => {
            fetchProcesses(false);
        }, 30000); // 30 seconds

        // Cleanup interval on unmount or dependency change
        return () => clearInterval(interval);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedServers, timeRange, metric]);

    const fetchProcesses = async (showLoading: boolean) => {
        if (showLoading) {
            setLoading(true);
        }
        try {
            const params = new URLSearchParams();
            selectedServers.forEach((id) => params.append('server_ids[]', id));
            params.append('hours', timeRange);
            params.append('metric', metric);
            params.append('limit', '10');

            const response = await fetch(`/api/processes/top?${params}`, {
                headers: {
                    'X-Requested-With': 'XMLHttpRequest',
                },
            });

            if (!response.ok) {
                throw new Error('Failed to fetch processes');
            }

            const data = await response.json();
            setProcesses(data.processes);
        } catch (error) {
            console.error('Failed to fetch processes:', error);
        } finally {
            if (showLoading) {
                setLoading(false);
            }
        }
    };

    const formatMemory = (mb: number) => {
        if (mb >= 1024) {
            return `${(mb / 1024).toFixed(2)} GB`;
        }
        return `${mb.toFixed(2)} MB`;
    };

    const formatCpu = (percent: number | null) => {
        if (percent === null) {
            return 'N/A';
        }
        return `${percent.toFixed(2)}%`;
    };

    const toggleServerVisibility = (serverId: string) => {
        setVisibleServers((prev) => {
            const newSet = new Set(prev);
            if (newSet.has(serverId)) {
                newSet.delete(serverId);
            } else {
                newSet.add(serverId);
            }
            return newSet;
        });
    };

    const toggleAllServers = () => {
        if (visibleServers.size === selectedServers.length) {
            // All selected, deselect all
            setVisibleServers(new Set());
        } else {
            // Some or none selected, select all
            setVisibleServers(new Set(selectedServers));
        }
    };

    // Get unique servers from processes with their names
    const uniqueServers = Array.from(
        new Map(
            processes.map((p) => [p.server_id, { id: p.server_id, name: p.server_name }])
        ).values()
    );

    // Filter processes by visible servers
    const filteredProcesses = processes.filter((p) =>
        visibleServers.has(p.server_id)
    );

    if (selectedServers.length === 0) {
        return (
            <Card>
                <CardContent className="flex h-96 items-center justify-center">
                    <p className="text-muted-foreground">
                        Select one or more servers to view top processes
                    </p>
                </CardContent>
            </Card>
        );
    }

    return (
        <Card>
            <CardHeader>
                <div className="flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                        <CardTitle>
                            Top 10 Processes by{' '}
                            {metric === 'cpu' ? 'CPU' : 'Memory'}
                        </CardTitle>
                        <div className="flex items-center gap-4">
                        <Tabs
                            value={metric}
                            onValueChange={(value) =>
                                setMetric(value as 'cpu' | 'memory')
                            }
                        >
                            <TabsList>
                                <TabsTrigger value="cpu">CPU</TabsTrigger>
                                <TabsTrigger value="memory">Memory</TabsTrigger>
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
                <p className="text-sm text-muted-foreground">
                    Note: Linux truncates process names to 15 characters
                </p>
            </div>
            </CardHeader>
            <CardContent>
                {loading ? (
                    <div className="flex h-64 items-center justify-center">
                        <p className="text-muted-foreground">
                            Loading processes...
                        </p>
                    </div>
                ) : processes.length === 0 ? (
                    <div className="flex h-64 items-center justify-center">
                        <p className="text-muted-foreground">
                            No process data available for the selected time
                            range
                        </p>
                    </div>
                ) : (
                    <>
                        {/* Server Filter Dropdown */}
                        <div className="mb-4 flex items-center gap-2">
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button variant="outline" size="sm">
                                        <Filter className="mr-2 h-4 w-4" />
                                        Filter Servers ({visibleServers.size}/{uniqueServers.length})
                                        <ChevronDown className="ml-2 h-4 w-4" />
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="start" className="w-56">
                                    <DropdownMenuLabel>Show/Hide Servers</DropdownMenuLabel>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuCheckboxItem
                                        checked={visibleServers.size === uniqueServers.length}
                                        onCheckedChange={toggleAllServers}
                                        className="font-medium"
                                    >
                                        All Servers
                                    </DropdownMenuCheckboxItem>
                                    <DropdownMenuSeparator />
                                    {uniqueServers.map((server) => (
                                        <DropdownMenuCheckboxItem
                                            key={server.id}
                                            checked={visibleServers.has(server.id)}
                                            onCheckedChange={() => toggleServerVisibility(server.id)}
                                        >
                                            {server.name}
                                        </DropdownMenuCheckboxItem>
                                    ))}
                                </DropdownMenuContent>
                            </DropdownMenu>
                            {visibleServers.size < uniqueServers.length && (
                                <span className="text-sm text-muted-foreground">
                                    {uniqueServers.length - visibleServers.size} server(s) hidden
                                </span>
                            )}
                        </div>

                        {filteredProcesses.length === 0 ? (
                            <div className="flex h-64 items-center justify-center">
                                <p className="text-muted-foreground">
                                    No processes shown. Select at least one server from the filter.
                                </p>
                            </div>
                        ) : (
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead className="w-[50px]">#</TableHead>
                                        <TableHead>Server</TableHead>
                                        <TableHead>Process Name</TableHead>
                                        <TableHead className="text-right">
                                            Count
                                        </TableHead>
                                        <TableHead className="text-right">
                                            Avg CPU
                                        </TableHead>
                                        <TableHead className="text-right">
                                            Avg Memory
                                        </TableHead>
                                        <TableHead className="text-right">
                                            Peak Memory
                                        </TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {filteredProcesses.map((process, index) => (
                                <TableRow key={`${process.server_id}-${process.name}`}>
                                    <TableCell className="font-medium">
                                        {index + 1}
                                    </TableCell>
                                    <TableCell className="text-muted-foreground">
                                        {process.server_name}
                                    </TableCell>
                                    <TableCell className="font-mono">
                                        {process.name}
                                    </TableCell>
                                    <TableCell className="text-right">
                                        {process.avg_num_procs}
                                    </TableCell>
                                    <TableCell className="text-right">
                                        {formatCpu(process.avg_cpu_percent)}
                                    </TableCell>
                                    <TableCell className="text-right">
                                        {formatMemory(process.avg_memory_mb)}
                                    </TableCell>
                                    <TableCell className="text-right">
                                        {formatMemory(process.peak_memory_mb)}
                                    </TableCell>
                                </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        )}
                    </>
                )}
            </CardContent>
        </Card>
    );
}
