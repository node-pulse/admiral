import { Button } from '@/components/ui/button';
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from '@/components/ui/command';
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { Check, ChevronsUpDown, Server as ServerIcon } from 'lucide-react';
import { useEffect, useState } from 'react';

interface Server {
    id: string;
    hostname: string;
    display_name: string;
    is_online: boolean;
}

interface ServerSelectorProps {
    selectedServers: string[];
    onSelectionChange: (serverIds: string[]) => void;
    multiSelect?: boolean;
    placeholder?: string;
}

export function ServerSelector({
    selectedServers,
    onSelectionChange,
    multiSelect = false,
    placeholder = 'Select server...',
}: ServerSelectorProps) {
    const [open, setOpen] = useState(false);
    const [servers, setServers] = useState<Server[]>([]);
    const [loading, setLoading] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');

    useEffect(() => {
        fetchServers();
    }, [searchQuery]);

    const fetchServers = async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams();
            if (searchQuery) {
                params.append('search', searchQuery);
            }
            params.append('limit', '50');

            const response = await fetch(`/api/dashboard/servers?${params}`);
            const data = await response.json();
            setServers(data.servers);
        } catch (error) {
            console.error('Failed to fetch servers:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleSelect = (serverId: string) => {
        if (multiSelect) {
            if (selectedServers.includes(serverId)) {
                onSelectionChange(
                    selectedServers.filter((id) => id !== serverId)
                );
            } else {
                onSelectionChange([...selectedServers, serverId]);
            }
        } else {
            onSelectionChange([serverId]);
            setOpen(false);
        }
    };

    const getButtonLabel = () => {
        if (selectedServers.length === 0) {
            return placeholder;
        }

        if (selectedServers.length === 1) {
            const server = servers.find((s) => s.id === selectedServers[0]);
            return server?.display_name || 'Selected';
        }

        return `${selectedServers.length} servers selected`;
    };

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={open}
                    className="w-full justify-between"
                >
                    <span className="flex items-center gap-2">
                        <ServerIcon className="size-4" />
                        {getButtonLabel()}
                    </span>
                    <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[400px] p-0">
                <Command>
                    <CommandInput
                        placeholder="Search servers..."
                        value={searchQuery}
                        onValueChange={setSearchQuery}
                    />
                    <CommandList>
                        {loading ? (
                            <CommandEmpty>Loading...</CommandEmpty>
                        ) : servers.length === 0 ? (
                            <CommandEmpty>No servers found.</CommandEmpty>
                        ) : (
                            <CommandGroup>
                                {servers.map((server) => (
                                    <CommandItem
                                        key={server.id}
                                        value={server.id}
                                        onSelect={() => handleSelect(server.id)}
                                    >
                                        <Check
                                            className={cn(
                                                'mr-2 size-4',
                                                selectedServers.includes(
                                                    server.id
                                                )
                                                    ? 'opacity-100'
                                                    : 'opacity-0'
                                            )}
                                        />
                                        <div className="flex flex-1 items-center justify-between">
                                            <span>{server.display_name}</span>
                                            <span
                                                className={cn(
                                                    'ml-2 size-2 rounded-full',
                                                    server.is_online
                                                        ? 'bg-green-500'
                                                        : 'bg-red-500'
                                                )}
                                            />
                                        </div>
                                    </CommandItem>
                                ))}
                            </CommandGroup>
                        )}
                    </CommandList>
                </Command>
            </PopoverContent>
        </Popover>
    );
}
