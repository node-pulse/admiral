import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { ServerData } from '@/types/servers';
import {
    Activity,
    ChevronDown,
    Plus,
    Search,
    Server,
    Terminal,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { AddServerDialog } from './add-server-dialog';
import { useTerminalWorkspace } from './terminal-workspace-context';

interface QuickConnectBarProps {
    className?: string;
}

export function QuickConnectBar({ className }: QuickConnectBarProps) {
    const { sessions, openSession } = useTerminalWorkspace();
    const [searchOpen, setSearchOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [servers, setServers] = useState<ServerData[]>([]);
    const [filteredServers, setFilteredServers] = useState<ServerData[]>([]);
    const [loading, setLoading] = useState(false);

    const [addServerOpen, setAddServerOpen] = useState(false);

    // Fetch servers when search opens
    useEffect(() => {
        if (searchOpen && servers.length === 0) {
            fetchServers();
        }
    }, [searchOpen]);

    // Filter servers based on search query
    useEffect(() => {
        // Ensure servers is an array before filtering
        if (!Array.isArray(servers)) {
            setFilteredServers([]);
            return;
        }

        if (searchQuery.trim() === '') {
            setFilteredServers(servers);
        } else {
            const query = searchQuery.toLowerCase();
            const filtered = servers.filter(
                (server) =>
                    server.display_name?.toLowerCase().includes(query) ||
                    server.hostname?.toLowerCase().includes(query) ||
                    server.ssh_host?.toLowerCase().includes(query) ||
                    server.description?.toLowerCase().includes(query),
            );
            setFilteredServers(filtered);
        }
    }, [searchQuery, servers]);

    // Get recent/active servers for quick access
    useEffect(() => {
        // Get servers from current sessions
        const sessionServers = sessions.map((s) => s.server);

        // Get recently connected servers from localStorage
        const recentIds = JSON.parse(
            localStorage.getItem('recentServers') || '[]',
        ) as string[];

        // Combine and deduplicate
        const recentMap = new Map<string, ServerData>();
        sessionServers.forEach((s) => recentMap.set(s.id, s));

        // We'll fetch full server data for recent IDs later when we have the servers list
        if (servers.length > 0) {
            recentIds.forEach((id) => {
                const server = servers.find((s) => s.id === id);
                if (server && !recentMap.has(id)) {
                    recentMap.set(id, server);
                }
            });
        }
    }, [sessions, servers]);

    const fetchServers = async () => {
        setLoading(true);
        try {
            const response = await fetch(
                '/dashboard/servers/list?per_page=100',
            );
            const data = await response.json();
            // Handle paginated response structure: data.servers.data
            const serverList = data?.servers?.data || [];
            setServers(serverList);
            setFilteredServers(serverList); // Initialize filtered servers immediately
        } catch (error) {
            console.error('Failed to fetch servers:', error);
            setServers([]);
            setFilteredServers([]);
        } finally {
            setLoading(false);
        }
    };

    const handleConnect = (server: ServerData) => {
        // Add to recent servers
        const recentIds = JSON.parse(
            localStorage.getItem('recentServers') || '[]',
        ) as string[];
        const updated = [
            server.id,
            ...recentIds.filter((id) => id !== server.id),
        ].slice(0, 10);
        localStorage.setItem('recentServers', JSON.stringify(updated));

        // Open session
        openSession(server);
        setSearchOpen(false);
        setSearchQuery('');
    };

    const connectedServerIds = new Set(sessions.map((s) => s.server.id));

    return (
        <div
            className={cn(
                'flex flex-1 items-center gap-2 overflow-x-auto px-2',
                className,
            )}
        >
            {/* Search and Connect */}
            <Popover open={searchOpen} onOpenChange={setSearchOpen}>
                <PopoverTrigger asChild>
                    <Button
                        variant="outline"
                        size="sm"
                        className="h-7 gap-1 px-2 text-xs"
                    >
                        <Search className="h-3 w-3" />
                        Search & Connect
                        <ChevronDown className="h-3 w-3" />
                    </Button>
                </PopoverTrigger>
                <PopoverContent
                    className="w-96 p-0"
                    align="start"
                    onOpenAutoFocus={(e) => e.preventDefault()}
                >
                    <div className="border-b p-3">
                        <div className="relative">
                            <Search className="absolute top-2.5 left-2 h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder="Search servers by name, hostname, or IP..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="pl-8"
                                autoFocus
                            />
                        </div>
                    </div>

                    <ScrollArea className="h-80">
                        {loading ? (
                            <div className="p-4 text-center text-sm text-muted-foreground">
                                Loading servers...
                            </div>
                        ) : !Array.isArray(filteredServers) ||
                          filteredServers.length === 0 ? (
                            <div className="p-4 text-center text-sm text-muted-foreground">
                                {searchQuery
                                    ? 'No servers found matching your search'
                                    : 'No servers available'}
                            </div>
                        ) : (
                            <div className="p-2">
                                {filteredServers.map((server) => {
                                    const isConnected = connectedServerIds.has(
                                        server.id,
                                    );
                                    return (
                                        <button
                                            key={server.id}
                                            onClick={() =>
                                                handleConnect(server)
                                            }
                                            className="flex w-full items-start rounded-md p-2 text-left transition-colors hover:bg-accent"
                                        >
                                            <Server className="mt-0.5 mr-3 h-4 w-4 text-muted-foreground" />
                                            <div className="flex-1">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-sm font-medium">
                                                        {server.display_name}
                                                    </span>
                                                    {isConnected && (
                                                        <Badge
                                                            variant="secondary"
                                                            className="h-5 px-1 text-xs"
                                                        >
                                                            Connected
                                                        </Badge>
                                                    )}
                                                    {server.is_online && (
                                                        <Activity className="h-3 w-3 text-green-500" />
                                                    )}
                                                </div>
                                                <div className="text-xs text-muted-foreground">
                                                    {server.ssh_username}@
                                                    {server.ssh_host ||
                                                        server.hostname}
                                                    {server.ssh_port !== 22 &&
                                                        `:${server.ssh_port}`}
                                                </div>
                                                {server.description && (
                                                    <div className="mt-1 text-xs text-muted-foreground">
                                                        {server.description}
                                                    </div>
                                                )}
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                    </ScrollArea>

                    {/* Quick Add Server Option */}
                    <div className="border-t p-2">
                        <Button
                            variant="ghost"
                            size="sm"
                            className="w-full justify-start text-xs"
                            onClick={() => {
                                setSearchOpen(false);
                                setAddServerOpen(true);
                            }}
                        >
                            <Plus className="mr-2 h-3 w-3" />
                            Add New Server
                        </Button>
                    </div>
                </PopoverContent>
            </Popover>

            {/* Active Sessions Count */}
            <div className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
                <Terminal className="h-3 w-3" />
                <span>
                    {sessions.length} session{sessions.length !== 1 && 's'}
                </span>
                {sessions.filter((s) => s.isConnected).length > 0 && (
                    <>
                        <span>•</span>
                        <Activity className="h-3 w-3 text-green-500" />
                        <span>
                            {sessions.filter((s) => s.isConnected).length}{' '}
                            connected
                        </span>
                    </>
                )}
            </div>

            {/* Add Server Dialog */}
            <AddServerDialog
                open={addServerOpen}
                onOpenChange={setAddServerOpen}
                onServerAdded={() => {
                    // Refresh servers list after adding
                    fetchServers();
                }}
            />
        </div>
    );
}
