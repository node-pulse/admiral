import { PlaybookListItem } from '@/components/playbooks/playbook-list-item';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import AppLayout from '@/layouts/app-layout';

import { type BreadcrumbItem } from '@/types';
import { Head } from '@inertiajs/react';
import axios from 'axios';
import { ArrowUpCircle, Loader2, Package, RefreshCw, Search } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

const breadcrumbs: BreadcrumbItem[] = [
    {
        title: 'Community Playbooks - Browse and download Ansible playbooks',
        href: '/dashboard/playbooks',
    },
];

interface OsSupport {
    distro: string;
    version: string;
    arch: string;
}

interface PlaybookVariable {
    name: string;
    label: string;
    type: string;
    description: string;
    required: boolean;
    default?: any;
    min?: number;
    max?: number;
    options?: string[];
    pattern?: string;
}

interface PlaybookAuthor {
    name: string;
    email?: string;
    url?: string;
    status?: 'community' | 'verified' | 'deprecated';
}

interface Playbook {
    id?: string; // UUID (for downloaded playbooks)
    playbook_id: string; // pb_xxx format
    name: string;
    version: string;
    description: string;
    author: PlaybookAuthor;
    category: string;
    tags: string[];
    homepage?: string;
    repository?: string;
    os_support: OsSupport[];
    variables: PlaybookVariable[];
    source_path?: string; // For browse
    downloaded?: boolean; // For browse
    downloaded_at?: string | number; // For downloaded
    update_available?: boolean;
    latest_version?: string;
}

interface UpdateInfo {
    id: string;
    name: string;
    current_version: string;
    latest_version: string;
    source_path: string;
    update_available: boolean;
}

const CACHE_KEY_PLAYBOOKS = 'nodepulse_playbooks';

export default function PlaybooksIndex() {
    const [playbooks, setPlaybooks] = useState<Playbook[]>([]);
    const [initialLoading, setInitialLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedCategory, setSelectedCategory] = useState<string>('all');
    const [updatesAvailable, setUpdatesAvailable] = useState<UpdateInfo[]>([]);
    const [checkingUpdates, setCheckingUpdates] = useState(false);
    const [updatingAll, setUpdatingAll] = useState(false);

    // Load from localStorage
    const loadFromCache = () => {
        try {
            const cached = localStorage.getItem(CACHE_KEY_PLAYBOOKS);
            if (cached) {
                setPlaybooks(JSON.parse(cached));
                setInitialLoading(false);
            }
        } catch (error) {
            console.error('Failed to load from cache:', error);
        }
    };

    // Fetch all playbooks from registry
    const fetchPlaybooks = async (showRefreshing = true) => {
        if (showRefreshing) setRefreshing(true);
        try {
            const response = await axios.get('/api/playbooks/browse');
            // Map 'id' from registry to 'playbook_id' for our interface
            const allPlaybooks = response.data.playbooks.map((pb: any) => ({
                ...pb,
                playbook_id: pb.id,
            }));
            setPlaybooks(allPlaybooks);
            localStorage.setItem(
                CACHE_KEY_PLAYBOOKS,
                JSON.stringify(allPlaybooks),
            );
        } catch (error: any) {
            toast.error(
                error.response?.data?.error ||
                    'Failed to fetch playbooks from registry',
            );
        } finally {
            if (showRefreshing) setRefreshing(false);
            setInitialLoading(false);
        }
    };

    // Check for updates
    const checkForUpdates = async () => {
        setCheckingUpdates(true);
        try {
            const response = await axios.get('/api/playbooks/updates');
            const updates: UpdateInfo[] = response.data.updates;
            setUpdatesAvailable(updates);

            // Create a map for faster lookup
            const updateMap = new Map(updates.map((u) => [u.id, u]));

            // Merge update info into playbooks, clearing stale flags
            setPlaybooks((prev) =>
                prev.map((pb) => {
                    const updateInfo = updateMap.get(pb.playbook_id);
                    if (updateInfo) {
                        // Update available
                        return {
                            ...pb,
                            update_available: true,
                            latest_version: updateInfo.latest_version,
                        };
                    } else {
                        // No update available - clear any stale flags
                        return {
                            ...pb,
                            update_available: false,
                            latest_version: undefined,
                        };
                    }
                }),
            );
        } catch (error: any) {
            console.error('Failed to check for updates:', error);
        } finally {
            setCheckingUpdates(false);
        }
    };

    // Initial load: Load from cache first, then fetch latest, then check updates
    useEffect(() => {
        const loadData = async () => {
            loadFromCache();
            await fetchPlaybooks(false);
            await checkForUpdates();
        };
        loadData();
    }, []);

    // Download playbook
    const handleDownload = async (playbook: Playbook) => {
        if (!playbook.source_path) {
            toast.error('Invalid playbook source path');
            console.error('Missing source_path:', playbook);
            return;
        }

        console.log('Downloading playbook:', {
            playbook_id: playbook.playbook_id,
            source_path: playbook.source_path,
        });

        try {
            await axios.post('/api/playbooks/download', {
                playbook_id: playbook.playbook_id,
                source_path: playbook.source_path,
            });

            toast.success(`${playbook.name} downloaded successfully`);

            // Refresh playbook list
            fetchPlaybooks(false);
        } catch (error: any) {
            console.error('Download error:', error.response?.data);
            toast.error(
                error.response?.data?.message ||
                    error.response?.data?.error ||
                    'Failed to download playbook',
            );
        }
    };

    // Remove playbook
    const handleRemove = async (playbookId: string, name: string) => {
        if (!confirm(`Are you sure you want to remove "${name}"?`)) {
            return;
        }

        try {
            await axios.delete(`/api/playbooks/${playbookId}`);
            toast.success(`${name} removed successfully`);

            // Refresh playbook list, then check for updates
            await fetchPlaybooks(false);
            await checkForUpdates();
        } catch (error: any) {
            toast.error(
                error.response?.data?.error || 'Failed to remove playbook',
            );
        }
    };

    // Update a single playbook
    const handleUpdate = async (playbookId: string, name: string) => {
        if (!confirm(`Update "${name}" to the latest version?`)) {
            return;
        }

        try {
            const response = await axios.post(`/api/playbooks/${playbookId}/update`);
            toast.success(
                `${name} updated to v${response.data.playbook.version}`,
            );

            // Refresh playbook list and check for updates
            await fetchPlaybooks(false);
            await checkForUpdates();
        } catch (error: any) {
            toast.error(
                error.response?.data?.message ||
                    error.response?.data?.error ||
                    'Failed to update playbook',
            );
        }
    };

    // Update all playbooks
    const handleUpdateAll = async () => {
        if (updatesAvailable.length === 0) {
            toast.info('No updates available');
            return;
        }

        if (
            !confirm(
                `Update ${updatesAvailable.length} playbook(s) to the latest version?`,
            )
        ) {
            return;
        }

        setUpdatingAll(true);
        try {
            const response = await axios.post('/api/playbooks/update-all');
            const results = response.data.results;

            if (results.success.length > 0) {
                toast.success(
                    `Successfully updated ${results.success.length} playbook(s)`,
                );
            }

            if (results.failed.length > 0) {
                toast.error(`Failed to update ${results.failed.length} playbook(s)`);
            }

            // Refresh playbook list and check for updates
            await fetchPlaybooks(false);
            await checkForUpdates();
        } catch (error: any) {
            toast.error(
                error.response?.data?.message ||
                    error.response?.data?.error ||
                    'Failed to update playbooks',
            );
        } finally {
            setUpdatingAll(false);
        }
    };

    // Filter playbooks
    const filterPlaybooks = (playbooks: Playbook[]) => {
        return playbooks.filter((pb) => {
            const matchesSearch =
                searchQuery === '' ||
                pb.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                pb.description
                    .toLowerCase()
                    .includes(searchQuery.toLowerCase()) ||
                pb.tags.some((tag) =>
                    tag.toLowerCase().includes(searchQuery.toLowerCase()),
                );

            const matchesCategory =
                selectedCategory === 'all' || pb.category === selectedCategory;

            return matchesSearch && matchesCategory;
        });
    };

    const filteredPlaybooks = filterPlaybooks(playbooks);

    // Get unique categories
    const categories = Array.from(
        new Set(playbooks.map((pb) => pb.category)),
    ).sort();

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Community Playbooks" />

            <div className="AdmiralCommunityPlaybooks flex h-full flex-1 flex-col gap-4 overflow-x-auto rounded-xl p-4">
                {/* Header */}
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-3xl font-bold tracking-tight">
                            Community Playbooks
                            {refreshing && (
                                <Loader2 className="ml-3 inline h-5 w-5 animate-spin text-muted-foreground" />
                            )}
                        </h1>
                        <p className="mt-2 text-muted-foreground">
                            Browse and download Ansible playbooks from the
                            community catalog
                        </p>
                    </div>
                    <div className="flex gap-2">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={checkForUpdates}
                            disabled={checkingUpdates}
                        >
                            {checkingUpdates ? (
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            ) : (
                                <RefreshCw className="mr-2 h-4 w-4" />
                            )}
                            Check Updates
                        </Button>
                        {updatesAvailable.length > 0 && (
                            <Button
                                variant="default"
                                size="sm"
                                onClick={handleUpdateAll}
                                disabled={updatingAll}
                                className="bg-orange-500 hover:bg-orange-600"
                            >
                                {updatingAll ? (
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                ) : (
                                    <ArrowUpCircle className="mr-2 h-4 w-4" />
                                )}
                                Update All ({updatesAvailable.length})
                            </Button>
                        )}
                    </div>
                </div>

                {/* Search and Filters */}
                <Card>
                    <CardContent className="pt-6">
                        <div className="flex flex-col gap-4 sm:flex-row">
                            <div className="relative flex-1">
                                <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                                <Input
                                    placeholder="Search playbooks..."
                                    value={searchQuery}
                                    onChange={(e) =>
                                        setSearchQuery(e.target.value)
                                    }
                                    className="pl-10"
                                />
                            </div>
                            <select
                                value={selectedCategory}
                                onChange={(e) =>
                                    setSelectedCategory(e.target.value)
                                }
                                className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                            >
                                <option value="all">Categories</option>
                                {categories.map((cat) => (
                                    <option key={cat} value={cat}>
                                        {cat.charAt(0).toUpperCase() +
                                            cat.slice(1)}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </CardContent>
                </Card>

                {/* Playbooks List */}
                {initialLoading ? (
                    <Card>
                        <CardContent className="flex items-center justify-center py-12">
                            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                        </CardContent>
                    </Card>
                ) : filteredPlaybooks.length === 0 ? (
                    <Card>
                        <CardContent className="py-12 text-center text-muted-foreground">
                            <Package className="mx-auto mb-4 h-12 w-12 opacity-50" />
                            <p>No playbooks found</p>
                        </CardContent>
                    </Card>
                ) : (
                    <div className="flex flex-col gap-2 divide-y">
                        {filteredPlaybooks.map((playbook) => (
                            <PlaybookListItem
                                key={playbook.playbook_id}
                                playbook={playbook}
                                onDownload={handleDownload}
                                onRemove={handleRemove}
                                onUpdate={handleUpdate}
                            />
                        ))}
                    </div>
                )}
            </div>
        </AppLayout>
    );
}
