import { Button } from '@/components/ui/button';
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
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { ServerData } from '@/types/servers';
import { Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

interface PrivateKeyData {
    id: number;
    name: string;
    fingerprint: string;
}

interface EditServerDialogProps {
    server: ServerData | null;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onServerUpdated?: () => void;
}

export function EditServerDialog({
    server,
    open,
    onOpenChange,
    onServerUpdated,
}: EditServerDialogProps) {
    const [loading, setLoading] = useState(false);
    const [privateKeys, setPrivateKeys] = useState<PrivateKeyData[]>([]);
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [editServerForm, setEditServerForm] = useState({
        name: '',
        hostname: '',
        description: '',
        ssh_host: '',
        ssh_port: '22',
        ssh_username: 'root',
        private_key_id: '',
    });

    // Get CSRF token
    const csrfToken = (
        document.querySelector('meta[name="csrf-token"]') as HTMLMetaElement
    )?.content;

    // Load server data when dialog opens or server changes
    useEffect(() => {
        if (open && server) {
            setEditServerForm({
                name: server.name || '',
                hostname: server.hostname || '',
                description: server.description || '',
                ssh_host: server.ssh_host || '',
                ssh_port: server.ssh_port?.toString() || '22',
                ssh_username: server.ssh_username || 'root',
                private_key_id: '', // Don't pre-select key for security
            });
            fetchPrivateKeys();
        }
    }, [open, server]);

    const fetchPrivateKeys = async () => {
        try {
            const response = await fetch('/dashboard/ssh-keys/list');
            const data = await response.json();
            setPrivateKeys(data.keys || []);
        } catch (error) {
            console.error('Failed to fetch private keys:', error);
        }
    };

    const validateForm = (): boolean => {
        const newErrors: Record<string, string> = {};

        // Simple validation - just check required fields
        if (!editServerForm.name.trim()) {
            newErrors.name = 'Server name is required';
        }

        if (!editServerForm.ssh_host.trim()) {
            newErrors.ssh_host = 'SSH host/IP address is required';
        }

        if (!editServerForm.ssh_username.trim()) {
            newErrors.ssh_username = 'SSH username is required';
        }

        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    const handleUpdateServer = async () => {
        if (!server) return;

        // Validate form
        if (!validateForm()) {
            toast.error('Please fix the validation errors');
            return;
        }

        setLoading(true);
        try {
            const response = await fetch(`/dashboard/servers/${server.id}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRF-TOKEN': csrfToken,
                },
                body: JSON.stringify(editServerForm),
            });

            if (response.ok) {
                const data = await response.json();

                // If a private key was selected and it's not "none", update it
                if (
                    editServerForm.private_key_id &&
                    editServerForm.private_key_id !== 'none'
                ) {
                    await attachKeyToServer(
                        server.id,
                        editServerForm.private_key_id,
                    );
                }

                toast.success('Server updated successfully', {
                    description: `Server "${data.server?.name || data.server?.hostname}" has been updated`,
                });

                setErrors({});
                onOpenChange(false);
                onServerUpdated?.();
            } else {
                const error = await response.json();

                // Handle validation errors from server
                if (error.errors) {
                    const serverErrors: Record<string, string> = {};
                    Object.keys(error.errors).forEach((field) => {
                        serverErrors[field] = Array.isArray(error.errors[field])
                            ? error.errors[field][0]
                            : error.errors[field];
                    });
                    setErrors(serverErrors);

                    toast.error('Validation failed', {
                        description: 'Please check the form for errors',
                    });
                } else {
                    toast.error('Failed to update server', {
                        description:
                            error.message ||
                            error.error ||
                            'An error occurred while updating the server',
                    });
                }
            }
        } catch (error) {
            console.error('Failed to update server:', error);
            toast.error('Failed to update server', {
                description: 'An unexpected error occurred',
            });
        } finally {
            setLoading(false);
        }
    };

    const attachKeyToServer = async (
        serverId: string,
        privateKeyId: string,
    ) => {
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
                        is_primary: true,
                    }),
                },
            );

            if (!response.ok) {
                console.error('Failed to attach SSH key to server');
            }
        } catch (error) {
            console.error('Failed to attach SSH key:', error);
        }
    };

    const handleInputChange = (field: string, value: string) => {
        setEditServerForm({
            ...editServerForm,
            [field]: value,
        });
        // Clear error for this field when user starts typing
        if (errors[field]) {
            setErrors({
                ...errors,
                [field]: '',
            });
        }
    };

    if (!server) return null;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-2xl">
                <DialogHeader>
                    <DialogTitle>Edit Server</DialogTitle>
                    <DialogDescription>
                        Update the server configuration and SSH access details.
                    </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="grid gap-2">
                            <Label htmlFor="edit-server-name">
                                Server Name{' '}
                                <span className="text-destructive">*</span>
                            </Label>
                            <Input
                                id="edit-server-name"
                                placeholder="Production Web Server"
                                value={editServerForm.name}
                                onChange={(e) =>
                                    handleInputChange('name', e.target.value)
                                }
                                className={
                                    errors.name ? 'border-destructive' : ''
                                }
                            />
                            {errors.name && (
                                <span className="text-sm text-destructive">
                                    {errors.name}
                                </span>
                            )}
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="edit-hostname">
                                Hostname{' '}
                                <span className="text-destructive">*</span>
                            </Label>
                            <Input
                                id="edit-hostname"
                                placeholder="web-server-01"
                                value={editServerForm.hostname}
                                onChange={(e) =>
                                    handleInputChange(
                                        'hostname',
                                        e.target.value,
                                    )
                                }
                                className={
                                    errors.hostname ? 'border-destructive' : ''
                                }
                            />
                            {errors.hostname && (
                                <span className="text-sm text-destructive">
                                    {errors.hostname}
                                </span>
                            )}
                        </div>
                    </div>

                    <div className="grid gap-2">
                        <Label htmlFor="edit-description">Description</Label>
                        <Textarea
                            id="edit-description"
                            placeholder="Main production web server running nginx..."
                            value={editServerForm.description}
                            onChange={(e) =>
                                handleInputChange('description', e.target.value)
                            }
                            rows={3}
                        />
                    </div>

                    <div className="space-y-4 rounded-lg border p-4">
                        <h4 className="text-sm font-medium">
                            SSH Configuration
                        </h4>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="grid gap-2">
                                <Label htmlFor="edit-ssh-host">
                                    SSH Host/IP{' '}
                                    <span className="text-destructive">*</span>
                                </Label>
                                <Input
                                    id="edit-ssh-host"
                                    placeholder="192.168.1.100 or server.example.com"
                                    value={editServerForm.ssh_host}
                                    onChange={(e) =>
                                        handleInputChange(
                                            'ssh_host',
                                            e.target.value,
                                        )
                                    }
                                    className={
                                        errors.ssh_host
                                            ? 'border-destructive'
                                            : ''
                                    }
                                />
                                {errors.ssh_host && (
                                    <span className="text-sm text-destructive">
                                        {errors.ssh_host}
                                    </span>
                                )}
                            </div>
                            <div className="grid gap-2">
                                <Label htmlFor="edit-ssh-port">
                                    SSH Port{' '}
                                    <span className="text-destructive">*</span>
                                </Label>
                                <Input
                                    id="edit-ssh-port"
                                    type="number"
                                    placeholder="22"
                                    value={editServerForm.ssh_port}
                                    onChange={(e) =>
                                        handleInputChange(
                                            'ssh_port',
                                            e.target.value,
                                        )
                                    }
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="grid gap-2">
                                <Label htmlFor="edit-ssh-username">
                                    SSH Username{' '}
                                    <span className="text-destructive">*</span>
                                </Label>
                                <Input
                                    id="edit-ssh-username"
                                    placeholder="root"
                                    value={editServerForm.ssh_username}
                                    onChange={(e) =>
                                        handleInputChange(
                                            'ssh_username',
                                            e.target.value,
                                        )
                                    }
                                    className={
                                        errors.ssh_username
                                            ? 'border-destructive'
                                            : ''
                                    }
                                />
                                {errors.ssh_username && (
                                    <span className="text-sm text-destructive">
                                        {errors.ssh_username}
                                    </span>
                                )}
                            </div>
                            <div className="grid gap-2">
                                <Label htmlFor="edit-ssh-key">
                                    Update SSH Key (Optional)
                                </Label>
                                <Select
                                    value={editServerForm.private_key_id}
                                    onValueChange={(value) =>
                                        handleInputChange(
                                            'private_key_id',
                                            value,
                                        )
                                    }
                                >
                                    <SelectTrigger id="edit-ssh-key">
                                        <SelectValue placeholder="Keep current key" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="none">
                                            Keep current key
                                        </SelectItem>
                                        {privateKeys.map((key) => (
                                            <SelectItem
                                                key={key.id}
                                                value={key.id.toString()}
                                            >
                                                <div className="flex flex-col">
                                                    <span>{key.name}</span>
                                                    <span className="text-xs text-muted-foreground">
                                                        {key.fingerprint}
                                                    </span>
                                                </div>
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                {server.ssh_key_name && (
                                    <p className="text-xs text-muted-foreground">
                                        Current key: {server.ssh_key_name}
                                    </p>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
                <DialogFooter>
                    <Button
                        variant="outline"
                        onClick={() => onOpenChange(false)}
                        disabled={loading}
                    >
                        Cancel
                    </Button>
                    <Button onClick={handleUpdateServer} disabled={loading}>
                        {loading ? (
                            <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Updating Server...
                            </>
                        ) : (
                            'Update Server'
                        )}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
