import { PrivateKeyData, ServerData } from '@/types/servers';
import {
    createContext,
    ReactNode,
    useCallback,
    useContext,
    useEffect,
    useState,
} from 'react';
import { toast } from 'sonner';

interface ServerContextType {
    // Server data
    servers: ServerData[];
    totalServers: number;
    loading: boolean;

    // Private keys data
    privateKeys: PrivateKeyData[];
    privateKeysLoading: boolean;

    // Pagination
    page: number;
    setPage: (page: number) => void;

    // Search
    search: string;
    setSearch: (search: string) => void;

    // Actions
    fetchServers: () => Promise<void>;
    fetchPrivateKeys: () => Promise<void>;
    deleteServer: (serverId: string) => Promise<boolean>;
    updateServer: (serverId: string, data: any) => Promise<boolean>;
    createServer: (data: any) => Promise<any>;
    attachKeyToServer: (
        serverId: string,
        privateKeyId: string,
        isPrimary?: boolean,
    ) => Promise<boolean>;

    // CSRF token
    csrfToken: string;
}

const ServerContext = createContext<ServerContextType | undefined>(undefined);

interface ServerProviderProps {
    children: ReactNode;
}

export function ServerProvider({ children }: ServerProviderProps) {
    const [servers, setServers] = useState<ServerData[]>([]);
    const [totalServers, setTotalServers] = useState(0);
    const [loading, setLoading] = useState(true);
    const [privateKeys, setPrivateKeys] = useState<PrivateKeyData[]>([]);
    const [privateKeysLoading, setPrivateKeysLoading] = useState(false);
    const [page, setPage] = useState(1);
    const [search, setSearch] = useState('');

    // Get CSRF token
    const csrfToken =
        document
            .querySelector('meta[name="csrf-token"]')
            ?.getAttribute('content') || '';

    const fetchServers = useCallback(async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams({
                page: page.toString(),
                per_page: '20',
            });

            if (search) {
                params.append('search', search);
            }

            const response = await fetch(
                `/dashboard/servers/list?${params.toString()}`,
            );
            const data = await response.json();

            // Handle paginated response structure
            const serverList = data?.servers?.data || [];
            setServers(serverList);
            setTotalServers(data?.servers?.total || 0);
        } catch (error) {
            console.error('Failed to fetch servers:', error);
            toast.error('Failed to load servers', {
                description: 'Please try refreshing the page',
            });
            setServers([]);
            setTotalServers(0);
        } finally {
            setLoading(false);
        }
    }, [page, search]);

    const fetchPrivateKeys = useCallback(async () => {
        setPrivateKeysLoading(true);
        try {
            const response = await fetch('/dashboard/ssh-keys/list');
            const json = await response.json();
            setPrivateKeys(json.private_keys?.data || []);
        } catch (error) {
            console.error('Failed to fetch private keys:', error);
            setPrivateKeys([]);
        } finally {
            setPrivateKeysLoading(false);
        }
    }, []);

    const deleteServer = useCallback(
        async (serverId: string): Promise<boolean> => {
            try {
                const response = await fetch(`/dashboard/servers/${serverId}`, {
                    method: 'DELETE',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-CSRF-TOKEN': csrfToken,
                    },
                });

                if (response.ok) {
                    await fetchServers(); // Refresh the list
                    return true;
                } else {
                    const error = await response.json();
                    toast.error('Failed to delete server', {
                        description:
                            error.message ||
                            'An error occurred while deleting the server',
                    });
                    return false;
                }
            } catch (error) {
                console.error('Failed to delete server:', error);
                toast.error('Failed to delete server', {
                    description: 'An unexpected error occurred',
                });
                return false;
            }
        },
        [csrfToken, fetchServers],
    );

    const updateServer = useCallback(
        async (serverId: string, data: any): Promise<boolean> => {
            try {
                const response = await fetch(`/dashboard/servers/${serverId}`, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-CSRF-TOKEN': csrfToken,
                    },
                    body: JSON.stringify(data),
                });

                if (response.ok) {
                    await fetchServers(); // Refresh the list
                    return true;
                } else {
                    const error = await response.json();

                    // If validation errors, throw them for the component to handle
                    if (error.errors) {
                        throw { validation: true, errors: error.errors };
                    }

                    toast.error('Failed to update server', {
                        description:
                            error.message ||
                            'An error occurred while updating the server',
                    });
                    return false;
                }
            } catch (error: any) {
                // Re-throw validation errors
                if (error?.validation) {
                    throw error;
                }

                console.error('Failed to update server:', error);
                toast.error('Failed to update server', {
                    description: 'An unexpected error occurred',
                });
                return false;
            }
        },
        [csrfToken, fetchServers],
    );

    const createServer = useCallback(
        async (data: any): Promise<any> => {
            try {
                const response = await fetch('/dashboard/servers', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-CSRF-TOKEN': csrfToken,
                    },
                    body: JSON.stringify(data),
                });

                const responseData = await response.json();

                if (response.ok) {
                    await fetchServers(); // Refresh the list
                    return { success: true, server: responseData.server };
                } else {
                    // If validation errors, return them for the component to handle
                    if (responseData.errors) {
                        return { success: false, errors: responseData.errors };
                    }

                    toast.error('Failed to create server', {
                        description:
                            responseData.message ||
                            'An error occurred while creating the server',
                    });
                    return { success: false, message: responseData.message };
                }
            } catch (error) {
                console.error('Failed to create server:', error);
                toast.error('Failed to create server', {
                    description: 'An unexpected error occurred',
                });
                return { success: false };
            }
        },
        [csrfToken, fetchServers],
    );

    const attachKeyToServer = useCallback(
        async (
            serverId: string,
            privateKeyId: string,
            isPrimary: boolean = true,
        ): Promise<boolean> => {
            try {
                const response = await fetch(
                    `/dashboard/servers/${serverId}/keys`,
                    {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'X-CSRF-TOKEN': csrfToken,
                        },
                        body: JSON.stringify({
                            private_key_id: privateKeyId,
                            is_primary: isPrimary,
                        }),
                    },
                );

                if (response.ok) {
                    await fetchServers(); // Refresh to get updated key info
                    return true;
                } else {
                    console.error('Failed to attach SSH key to server');
                    return false;
                }
            } catch (error) {
                console.error('Failed to attach SSH key:', error);
                return false;
            }
        },
        [csrfToken, fetchServers],
    );

    // Auto-fetch servers when page or search changes
    useEffect(() => {
        fetchServers();
    }, [fetchServers]);

    // Fetch private keys once on mount
    useEffect(() => {
        fetchPrivateKeys();
    }, [fetchPrivateKeys]);

    const value: ServerContextType = {
        servers,
        totalServers,
        loading,
        privateKeys,
        privateKeysLoading,
        page,
        setPage,
        search,
        setSearch,
        fetchServers,
        fetchPrivateKeys,
        deleteServer,
        updateServer,
        createServer,
        attachKeyToServer,
        csrfToken,
    };

    return (
        <ServerContext.Provider value={value}>
            {children}
        </ServerContext.Provider>
    );
}

export function useServerContext() {
    const context = useContext(ServerContext);
    if (!context) {
        throw new Error(
            'useServerContext must be used within a ServerProvider',
        );
    }
    return context;
}
