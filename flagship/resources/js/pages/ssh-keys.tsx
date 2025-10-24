import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
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
import { Textarea } from '@/components/ui/textarea';
import AppLayout from '@/layouts/app-layout';
import { sshKeys as sshKeysRoute } from '@/routes';
import { type BreadcrumbItem } from '@/types';
import { Head, usePage } from '@inertiajs/react';
import { Copy, Key, Link2, Plus, Search, Server, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

const breadcrumbs: BreadcrumbItem[] = [
    {
        title: 'SSH Keys',
        href: sshKeysRoute().url,
    },
];

interface ServerData {
    id: string;
    hostname: string;
    name: string | null;
    display_name: string;
    ssh_host: string | null;
    ssh_port: number;
    ssh_username: string;
}

interface PrivateKeyData {
    id: string;
    name: string;
    description: string | null;
    fingerprint: string;
    public_key: string;
    servers_count: number;
    servers: ServerData[];
    created_at: string;
    updated_at: string;
}

interface PrivateKeysResponse {
    private_keys: {
        data: PrivateKeyData[];
    };
    meta: {
        current_page: number;
        per_page: number;
        total: number;
        last_page: number;
    };
}

export default function PrivateKeys() {
    const { props } = usePage();
    const csrfToken =
        (props as any).csrf_token ||
        document
            .querySelector('meta[name="csrf-token"]')
            ?.getAttribute('content') ||
        '';

    const [privateKeys, setPrivateKeys] = useState<PrivateKeyData[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [page, setPage] = useState(1);
    const [totalKeys, setTotalKeys] = useState(0);
    const [generateDialogOpen, setGenerateDialogOpen] = useState(false);
    const [importDialogOpen, setImportDialogOpen] = useState(false);
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
    const [selectedKey, setSelectedKey] = useState<PrivateKeyData | null>(null);
    const [manageServersOpen, setManageServersOpen] = useState(false);
    const [keyToManage, setKeyToManage] = useState<PrivateKeyData | null>(null);
    const [availableServers, setAvailableServers] = useState<ServerData[]>([]);
    const [selectedServerId, setSelectedServerId] = useState<string>('');

    // Generate form state
    const [generateForm, setGenerateForm] = useState({
        name: '',
        description: '',
        key_type: 'rsa',
        key_size: '4096',
    });

    // Import form state
    const [importForm, setImportForm] = useState({
        name: '',
        description: '',
        private_key: '',
        public_key: '',
    });

    useEffect(() => {
        fetchPrivateKeys();
    }, [page, search]);

    const fetchPrivateKeys = async () => {
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
                `/ssh-keys/list?${params.toString()}`,
                {
                    headers: {
                        Accept: 'application/json',
                        'X-Requested-With': 'XMLHttpRequest',
                    },
                },
            );
            const data: PrivateKeysResponse = await response.json();

            setPrivateKeys(data.private_keys.data);
            setTotalKeys(data.meta.total);
        } catch (error) {
            console.error('Failed to fetch private keys:', error);
        } finally {
            setLoading(false);
        }
    };

    const fetchServers = async () => {
        try {
            const response = await fetch('/servers/list');
            const data = await response.json();
            setAvailableServers(data.servers.data || []);
        } catch (error) {
            console.error('Failed to fetch servers:', error);
        }
    };

    const openManageServers = (key: PrivateKeyData) => {
        setKeyToManage(key);
        setSelectedServerId('');
        setManageServersOpen(true);
        fetchServers();
    };

    const handleAttachToServer = async () => {
        if (!keyToManage || !selectedServerId) return;

        try {
            const response = await fetch(`/servers/${selectedServerId}/keys`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRF-TOKEN': csrfToken,
                },
                body: JSON.stringify({
                    private_key_id: keyToManage.id,
                    is_primary: true,
                    purpose: 'default',
                }),
            });

            if (response.ok) {
                setManageServersOpen(false);
                fetchPrivateKeys();
                toast.success('SSH key attached successfully', {
                    description: `Key "${keyToManage.name}" has been attached to the server`,
                });
            } else {
                const error = await response.json();
                toast.error('Failed to attach SSH key', {
                    description: error.message || 'An error occurred',
                });
            }
        } catch (error) {
            console.error('Failed to attach key:', error);
            toast.error('Failed to attach SSH key', {
                description: 'An unexpected error occurred',
            });
        }
    };

    const handleGenerate = async () => {
        try {
            const response = await fetch('/ssh-keys/generate', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRF-TOKEN': csrfToken,
                },
                body: JSON.stringify(generateForm),
            });

            if (response.ok) {
                const data = await response.json();
                setGenerateDialogOpen(false);
                setGenerateForm({
                    name: '',
                    description: '',
                    key_type: 'rsa',
                    key_size: '4096',
                });
                fetchPrivateKeys();
                toast.success('SSH key generated successfully', {
                    description: `Key "${data.private_key?.name}" has been created`,
                });
            } else {
                const error = await response.json();
                toast.error('Failed to generate key', {
                    description:
                        error.message ||
                        'An error occurred while generating the key',
                });
            }
        } catch (error) {
            console.error('Failed to generate key:', error);
            toast.error('Failed to generate key', {
                description: 'An unexpected error occurred',
            });
        }
    };

    const handleImport = async () => {
        try {
            const response = await fetch('/ssh-keys/import', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRF-TOKEN': csrfToken,
                },
                body: JSON.stringify(importForm),
            });

            if (response.ok) {
                const data = await response.json();
                setImportDialogOpen(false);
                setImportForm({
                    name: '',
                    description: '',
                    private_key: '',
                    public_key: '',
                });
                fetchPrivateKeys();
                toast.success('SSH key imported successfully', {
                    description: `Key "${data.private_key?.name}" has been imported`,
                });
            } else {
                const error = await response.json();
                toast.error('Failed to import key', {
                    description:
                        error.message ||
                        'An error occurred while importing the key',
                });
            }
        } catch (error) {
            console.error('Failed to import key:', error);
            toast.error('Failed to import key', {
                description: 'An unexpected error occurred',
            });
        }
    };

    const handleDelete = async () => {
        if (!selectedKey) return;

        try {
            const response = await fetch(`/ssh-keys/${selectedKey.id}`, {
                method: 'DELETE',
                headers: {
                    'X-CSRF-TOKEN': csrfToken,
                },
            });

            if (response.ok) {
                const keyName = selectedKey.name;
                setDeleteDialogOpen(false);
                setSelectedKey(null);
                fetchPrivateKeys();
                toast.success('SSH key deleted successfully', {
                    description: `Key "${keyName}" has been removed`,
                });
            } else {
                const error = await response.json();
                toast.error('Failed to delete key', {
                    description:
                        error.message ||
                        'An error occurred while deleting the key',
                });
            }
        } catch (error) {
            console.error('Failed to delete key:', error);
            toast.error('Failed to delete key', {
                description: 'An unexpected error occurred',
            });
        }
    };

    const copyToClipboard = (
        text: string,
        type: 'fingerprint' | 'public_key' = 'fingerprint',
    ) => {
        navigator.clipboard.writeText(text);
        toast.success('Copied to clipboard', {
            description:
                type === 'fingerprint'
                    ? 'Fingerprint copied successfully'
                    : 'Public key copied successfully',
        });
    };

    const formatDate = (dateString: string) => {
        return new Date(dateString).toLocaleString();
    };

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="SSH Keys" />

            <div className="AdmiralSSHKeys flex h-full flex-1 flex-col gap-4 overflow-x-auto rounded-xl p-4">
                {/* Header */}
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-3xl font-bold tracking-tight">
                            SSH Keys
                        </h1>
                        <p className="text-muted-foreground">
                            Manage SSH private keys for server authentication
                        </p>
                    </div>
                    <div className="flex gap-2">
                        <Button
                            variant="outline"
                            onClick={() => setImportDialogOpen(true)}
                        >
                            <Key className="mr-2 h-4 w-4" />
                            Import Key
                        </Button>
                        <Button onClick={() => setGenerateDialogOpen(true)}>
                            <Plus className="mr-2 h-4 w-4" />
                            Generate Key
                        </Button>
                    </div>
                </div>

                {/* Stats Cards */}
                <div className="grid gap-4 md:grid-cols-3">
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium">
                                Total Keys
                            </CardTitle>
                            <Key className="h-4 w-4 text-muted-foreground" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold">
                                {totalKeys}
                            </div>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium">
                                Keys in Use
                            </CardTitle>
                            <Server className="h-4 w-4 text-green-500" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold">
                                {
                                    privateKeys.filter(
                                        (k) => k.servers_count > 0,
                                    ).length
                                }
                            </div>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium">
                                Unused Keys
                            </CardTitle>
                            <Key className="h-4 w-4 text-muted-foreground" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold">
                                {
                                    privateKeys.filter(
                                        (k) => k.servers_count === 0,
                                    ).length
                                }
                            </div>
                        </CardContent>
                    </Card>
                </div>

                {/* Search and Filters */}
                <Card>
                    <CardHeader>
                        <div className="flex items-center gap-4">
                            <div className="relative flex-1">
                                <Search className="absolute top-2.5 left-2.5 h-4 w-4 text-muted-foreground" />
                                <Input
                                    placeholder="Search keys by name, description, or fingerprint..."
                                    value={search}
                                    onChange={(e) => {
                                        setSearch(e.target.value);
                                        setPage(1);
                                    }}
                                    className="pl-8"
                                />
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent>
                        {loading ? (
                            <div className="py-8 text-center text-muted-foreground">
                                Loading SSH keys...
                            </div>
                        ) : privateKeys.length === 0 ? (
                            <div className="py-8 text-center">
                                <Key className="mx-auto h-12 w-12 text-muted-foreground" />
                                <h3 className="mt-2 text-sm font-semibold">
                                    No SSH keys found
                                </h3>
                                <p className="mt-1 text-sm text-muted-foreground">
                                    {search
                                        ? 'Try adjusting your search'
                                        : 'Get started by generating or importing an SSH key'}
                                </p>
                                {!search && (
                                    <div className="mt-4 flex justify-center gap-2">
                                        <Button
                                            variant="outline"
                                            onClick={() =>
                                                setImportDialogOpen(true)
                                            }
                                        >
                                            <Key className="mr-2 h-4 w-4" />
                                            Import Key
                                        </Button>
                                        <Button
                                            onClick={() =>
                                                setGenerateDialogOpen(true)
                                            }
                                        >
                                            <Plus className="mr-2 h-4 w-4" />
                                            Generate Key
                                        </Button>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Name</TableHead>
                                        <TableHead>Fingerprint</TableHead>
                                        <TableHead>Servers</TableHead>
                                        <TableHead>Created</TableHead>
                                        <TableHead className="text-right">
                                            Actions
                                        </TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {privateKeys.map((key) => (
                                        <TableRow key={key.id}>
                                            <TableCell>
                                                <div className="flex flex-col">
                                                    <span className="font-medium">
                                                        {key.name}
                                                    </span>
                                                    {key.description && (
                                                        <span className="text-sm text-muted-foreground">
                                                            {key.description}
                                                        </span>
                                                    )}
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex items-center gap-2">
                                                    <code className="text-xs">
                                                        {key.fingerprint}
                                                    </code>
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="h-6 w-6"
                                                        onClick={() =>
                                                            copyToClipboard(
                                                                key.fingerprint,
                                                            )
                                                        }
                                                    >
                                                        <Copy className="h-3 w-3" />
                                                    </Button>
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                {key.servers_count > 0 ? (
                                                    <div className="flex flex-col gap-1">
                                                        {key.servers
                                                            .slice(0, 3)
                                                            .map((server) => (
                                                                <div
                                                                    key={
                                                                        server.id
                                                                    }
                                                                    className="flex items-center gap-1 text-sm"
                                                                >
                                                                    <Server className="h-3 w-3 text-muted-foreground" />
                                                                    <span>
                                                                        {
                                                                            server.display_name
                                                                        }
                                                                    </span>
                                                                </div>
                                                            ))}
                                                        {key.servers_count >
                                                            3 && (
                                                            <span className="text-xs text-muted-foreground">
                                                                {`+${key.servers_count - 3} more`}
                                                            </span>
                                                        )}
                                                    </div>
                                                ) : (
                                                    <Badge variant="secondary">
                                                        Unused
                                                    </Badge>
                                                )}
                                            </TableCell>
                                            <TableCell className="text-sm">
                                                {formatDate(key.created_at)}
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <div className="flex items-center justify-end gap-2">
                                                    <Button
                                                        variant="outline"
                                                        size="sm"
                                                        onClick={() =>
                                                            openManageServers(
                                                                key,
                                                            )
                                                        }
                                                    >
                                                        <Link2 className="mr-1 h-4 w-4" />
                                                        Attach to Server
                                                    </Button>
                                                    <Button
                                                        variant="outline"
                                                        size="sm"
                                                        onClick={() =>
                                                            copyToClipboard(
                                                                key.public_key,
                                                                'public_key',
                                                            )
                                                        }
                                                        className="cursor-pointer"
                                                    >
                                                        <Copy className="mr-1 h-4 w-4" />
                                                        Copy
                                                    </Button>
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        onClick={() => {
                                                            setSelectedKey(key);
                                                            setDeleteDialogOpen(
                                                                true,
                                                            );
                                                        }}
                                                        disabled={
                                                            key.servers_count >
                                                            0
                                                        }
                                                    >
                                                        <Trash2 className="h-4 w-4" />
                                                    </Button>
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        )}
                    </CardContent>
                </Card>

                {/* Pagination */}
                {totalKeys > 20 && (
                    <div className="flex items-center justify-between">
                        <p className="text-sm text-muted-foreground">
                            Showing {(page - 1) * 20 + 1} to{' '}
                            {Math.min(page * 20, totalKeys)} of {totalKeys} keys
                        </p>
                        <div className="flex gap-2">
                            <Button
                                variant="outline"
                                size="sm"
                                disabled={page === 1}
                                onClick={() => setPage(page - 1)}
                            >
                                Previous
                            </Button>
                            <Button
                                variant="outline"
                                size="sm"
                                disabled={page * 20 >= totalKeys}
                                onClick={() => setPage(page + 1)}
                            >
                                Next
                            </Button>
                        </div>
                    </div>
                )}
            </div>

            {/* Manage Servers Dialog */}
            <Dialog
                open={manageServersOpen}
                onOpenChange={setManageServersOpen}
            >
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Attach SSH Key to Server</DialogTitle>
                        <DialogDescription>
                            Attach "{keyToManage?.name}" to a server for SSH
                            access
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="grid gap-2">
                            <Label htmlFor="select-server">Select Server</Label>
                            <Select
                                value={selectedServerId}
                                onValueChange={setSelectedServerId}
                            >
                                <SelectTrigger id="select-server">
                                    <SelectValue placeholder="Select a server" />
                                </SelectTrigger>
                                <SelectContent>
                                    {availableServers
                                        .filter((server) => server.ssh_host)
                                        .map((server) => (
                                            <SelectItem
                                                key={server.id}
                                                value={server.id}
                                            >
                                                <div className="flex flex-col">
                                                    <span>
                                                        {server.display_name}
                                                    </span>
                                                    <span className="text-xs text-muted-foreground">
                                                        {server.ssh_username}@
                                                        {server.ssh_host}:
                                                        {server.ssh_port}
                                                    </span>
                                                </div>
                                            </SelectItem>
                                        ))}
                                </SelectContent>
                            </Select>
                            <p className="text-xs text-muted-foreground">
                                Only servers with SSH configured are shown
                            </p>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => setManageServersOpen(false)}
                        >
                            Cancel
                        </Button>
                        <Button
                            onClick={handleAttachToServer}
                            disabled={!selectedServerId}
                        >
                            Attach Key
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Generate Key Dialog */}
            <Dialog
                open={generateDialogOpen}
                onOpenChange={setGenerateDialogOpen}
            >
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Generate SSH Key</DialogTitle>
                        <DialogDescription>
                            Generate a new SSH key pair for server
                            authentication
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="grid gap-2">
                            <Label htmlFor="name">Key Name</Label>
                            <Input
                                id="name"
                                placeholder="production-servers"
                                value={generateForm.name}
                                onChange={(e) =>
                                    setGenerateForm({
                                        ...generateForm,
                                        name: e.target.value,
                                    })
                                }
                            />
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="description">
                                Description (Optional)
                            </Label>
                            <Input
                                id="description"
                                placeholder="Key for production environment"
                                value={generateForm.description}
                                onChange={(e) =>
                                    setGenerateForm({
                                        ...generateForm,
                                        description: e.target.value,
                                    })
                                }
                            />
                        </div>
                        <div className="grid gap-2">
                            <Label>Key Type</Label>
                            <RadioGroup
                                value={generateForm.key_type}
                                onValueChange={(value) =>
                                    setGenerateForm({
                                        ...generateForm,
                                        key_type: value,
                                    })
                                }
                            >
                                <div className="flex items-center space-x-2">
                                    <RadioGroupItem value="rsa" id="rsa" />
                                    <Label htmlFor="rsa">RSA</Label>
                                </div>
                                <div className="flex items-center space-x-2">
                                    <RadioGroupItem
                                        value="ed25519"
                                        id="ed25519"
                                    />
                                    <Label htmlFor="ed25519">Ed25519</Label>
                                </div>
                            </RadioGroup>
                        </div>
                        {generateForm.key_type === 'rsa' && (
                            <div className="grid gap-2">
                                <Label>Key Size</Label>
                                <RadioGroup
                                    value={generateForm.key_size}
                                    onValueChange={(value) =>
                                        setGenerateForm({
                                            ...generateForm,
                                            key_size: value,
                                        })
                                    }
                                >
                                    <div className="flex items-center space-x-2">
                                        <RadioGroupItem
                                            value="2048"
                                            id="2048"
                                        />
                                        <Label htmlFor="2048">
                                            2048 bits (faster)
                                        </Label>
                                    </div>
                                    <div className="flex items-center space-x-2">
                                        <RadioGroupItem
                                            value="4096"
                                            id="4096"
                                        />
                                        <Label htmlFor="4096">
                                            4096 bits (more secure)
                                        </Label>
                                    </div>
                                </RadioGroup>
                            </div>
                        )}
                    </div>
                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => setGenerateDialogOpen(false)}
                        >
                            Cancel
                        </Button>
                        <Button onClick={handleGenerate}>Generate Key</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Import Key Dialog */}
            <Dialog open={importDialogOpen} onOpenChange={setImportDialogOpen}>
                <DialogContent className="max-w-2xl">
                    <DialogHeader>
                        <DialogTitle>Import SSH Key</DialogTitle>
                        <DialogDescription>
                            Import an existing SSH private key
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="grid gap-2">
                            <Label htmlFor="import-name">Key Name</Label>
                            <Input
                                id="import-name"
                                placeholder="my-existing-key"
                                value={importForm.name}
                                onChange={(e) =>
                                    setImportForm({
                                        ...importForm,
                                        name: e.target.value,
                                    })
                                }
                            />
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="import-description">
                                Description (Optional)
                            </Label>
                            <Input
                                id="import-description"
                                placeholder="Existing key from..."
                                value={importForm.description}
                                onChange={(e) =>
                                    setImportForm({
                                        ...importForm,
                                        description: e.target.value,
                                    })
                                }
                            />
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="import-private-key">
                                Private Key
                            </Label>
                            <Textarea
                                id="import-private-key"
                                placeholder="-----BEGIN OPENSSH PRIVATE KEY-----&#10;...&#10;-----END OPENSSH PRIVATE KEY-----"
                                value={importForm.private_key}
                                onChange={(e) =>
                                    setImportForm({
                                        ...importForm,
                                        private_key: e.target.value,
                                    })
                                }
                                rows={10}
                                className="font-mono text-xs"
                            />
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="import-public-key">
                                Public Key (Optional)
                            </Label>
                            <Textarea
                                id="import-public-key"
                                placeholder="ssh-rsa AAAAB3NzaC1yc2EA..."
                                value={importForm.public_key}
                                onChange={(e) =>
                                    setImportForm({
                                        ...importForm,
                                        public_key: e.target.value,
                                    })
                                }
                                rows={3}
                                className="font-mono text-xs"
                            />
                            <p className="text-xs text-muted-foreground">
                                If not provided, the public key will be derived
                                from the private key
                            </p>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => setImportDialogOpen(false)}
                        >
                            Cancel
                        </Button>
                        <Button onClick={handleImport}>Import Key</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Delete Confirmation Dialog */}
            <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Delete SSH Key</DialogTitle>
                        <DialogDescription>
                            Are you sure you want to delete the key "
                            {selectedKey?.name}"? This action cannot be undone.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => setDeleteDialogOpen(false)}
                        >
                            Cancel
                        </Button>
                        <Button variant="destructive" onClick={handleDelete}>
                            Delete Key
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </AppLayout>
    );
}
