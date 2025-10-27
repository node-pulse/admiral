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
import { Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useServerContext } from './server-context';

interface AddServerDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onServerAdded?: () => void;
}

export function AddServerDialog({
    open,
    onOpenChange,
    onServerAdded,
}: AddServerDialogProps) {
    const [loading, setLoading] = useState(false);
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [addServerForm, setAddServerForm] = useState({
        name: '',
        hostname: '',
        description: '',
        ssh_host: '',
        ssh_port: '22',
        ssh_username: 'root',
        private_key_id: '',
    });

    const { privateKeys, fetchServers, csrfToken } = useServerContext();

    // Reset form when dialog opens
    useEffect(() => {
        if (open) {
            setAddServerForm({
                name: '',
                hostname: '',
                description: '',
                ssh_host: '',
                ssh_port: '22',
                ssh_username: 'root',
                private_key_id: '',
            });
            setErrors({});
        }
    }, [open]);

    const validateForm = (): boolean => {
        const newErrors: Record<string, string> = {};

        // Name validation (required) - friendly label for the server
        if (!addServerForm.name.trim()) {
            newErrors.name = 'Server name is required';
        }

        // SSH Host validation (required) - IP address or domain to connect to
        if (!addServerForm.ssh_host.trim()) {
            newErrors.ssh_host = 'SSH host is required';
        } else {
            // Basic IPv4, IPv6, or domain validation
            const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
            const ipv6Regex = /^([0-9a-fA-F]{0,4}:){2,7}[0-9a-fA-F]{0,4}$/;
            const domainRegex = /^[a-zA-Z0-9][a-zA-Z0-9-_.]*[a-zA-Z0-9]$/;

            if (
                !ipv4Regex.test(addServerForm.ssh_host) &&
                !ipv6Regex.test(addServerForm.ssh_host) &&
                !domainRegex.test(addServerForm.ssh_host)
            ) {
                newErrors.ssh_host =
                    'Please enter a valid IP address or domain';
            }
        }

        // SSH Port validation (required)
        const port = parseInt(addServerForm.ssh_port);
        if (isNaN(port) || port < 1 || port > 65535) {
            newErrors.ssh_port = 'Port must be between 1 and 65535';
        }

        // SSH Username validation (required)
        if (!addServerForm.ssh_username.trim()) {
            newErrors.ssh_username = 'SSH username is required';
        }

        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    const handleAddServer = async () => {
        // Validate form
        if (!validateForm()) {
            toast.error('Please fix the validation errors');
            return;
        }

        setLoading(true);
        try {
            const response = await fetch('/dashboard/servers', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRF-TOKEN': csrfToken,
                },
                body: JSON.stringify(addServerForm),
            });

            if (response.ok) {
                const data = await response.json();
                const serverId = data.server?.id;

                // If a private key was selected and it's not "none", attach it to the server
                if (
                    addServerForm.private_key_id &&
                    addServerForm.private_key_id !== 'none' &&
                    serverId
                ) {
                    await attachKeyToServer(
                        serverId,
                        addServerForm.private_key_id,
                    );
                }

                // Reset form
                setAddServerForm({
                    name: '',
                    hostname: '',
                    description: '',
                    ssh_host: '',
                    ssh_port: '22',
                    ssh_username: 'root',
                    private_key_id: '',
                });
                setErrors({});

                toast.success('Server added successfully', {
                    description: `Server "${data.server?.name || data.server?.hostname}" has been added`,
                });

                onOpenChange(false);
                fetchServers();
                onServerAdded?.();
            } else {
                const error = await response.json();

                // Handle validation errors from server
                if (error.errors) {
                    const serverErrors: Record<string, string> = {};
                    Object.keys(error.errors).forEach((field) => {
                        // Laravel returns errors as arrays, take the first message
                        serverErrors[field] = Array.isArray(error.errors[field])
                            ? error.errors[field][0]
                            : error.errors[field];
                    });
                    setErrors(serverErrors);

                    toast.error('Validation failed', {
                        description: 'Please check the form for errors',
                    });
                } else {
                    toast.error('Failed to add server', {
                        description:
                            error.message ||
                            error.error ||
                            'An error occurred while adding the server',
                    });
                }
            }
        } catch (error) {
            console.error('Failed to add server:', error);
            toast.error('Failed to add server', {
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
                        purpose: 'default',
                    }),
                },
            );

            if (!response.ok) {
                console.error('Failed to attach SSH key to server');
                toast.error('Failed to attach SSH key', {
                    description:
                        'The server was created but the SSH key was not attached',
                });
            }
        } catch (error) {
            console.error('Failed to attach SSH key:', error);
            toast.error('Failed to attach SSH key', {
                description:
                    'The server was created but the SSH key was not attached',
            });
        }
    };

    const handleInputChange = (field: string, value: string) => {
        setAddServerForm({
            ...addServerForm,
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

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="w-[calc(100vw-4rem)] max-w-5xl! px-8">
                <DialogHeader>
                    <DialogTitle>Add Server</DialogTitle>
                    <DialogDescription>
                        Add a new server to your fleet. Configure SSH access to
                        enable terminal connections and management.
                    </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                    {/* Server Name (Required) */}
                    <div className="grid gap-2">
                        <Label htmlFor="server-name">
                            Server Name{' '}
                            <span className="text-destructive">*</span>
                        </Label>
                        <Input
                            id="server-name"
                            placeholder="Production Web Server 1"
                            value={addServerForm.name}
                            onChange={(e) =>
                                handleInputChange('name', e.target.value)
                            }
                            className={errors.name ? 'border-destructive' : ''}
                        />
                        {errors.name && (
                            <span className="text-sm text-destructive">
                                {errors.name}
                            </span>
                        )}
                        <p className="text-xs text-muted-foreground">
                            A friendly label for this server in the dashboard
                        </p>
                    </div>

                    {/* SSH Configuration (Required Section) */}
                    <div className="space-y-4 rounded-lg border p-4">
                        <h4 className="text-sm font-medium">
                            SSH Configuration{' '}
                            <span className="text-destructive">*</span>
                        </h4>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="grid gap-2">
                                <Label htmlFor="ssh-host">
                                    SSH Host{' '}
                                    <span className="text-destructive">*</span>
                                </Label>
                                <Input
                                    id="ssh-host"
                                    placeholder="192.168.1.100 or server.example.com"
                                    value={addServerForm.ssh_host}
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
                                <Label htmlFor="ssh-port">
                                    SSH Port{' '}
                                    <span className="text-destructive">*</span>
                                </Label>
                                <Input
                                    id="ssh-port"
                                    type="number"
                                    placeholder="22"
                                    value={addServerForm.ssh_port}
                                    onChange={(e) =>
                                        handleInputChange(
                                            'ssh_port',
                                            e.target.value,
                                        )
                                    }
                                    className={
                                        errors.ssh_port
                                            ? 'border-destructive'
                                            : ''
                                    }
                                />
                                {errors.ssh_port && (
                                    <span className="text-sm text-destructive">
                                        {errors.ssh_port}
                                    </span>
                                )}
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="grid gap-2">
                                <Label htmlFor="ssh-username">
                                    SSH Username{' '}
                                    <span className="text-destructive">*</span>
                                </Label>
                                <Input
                                    id="ssh-username"
                                    placeholder="root"
                                    value={addServerForm.ssh_username}
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
                                <Label htmlFor="ssh-key">
                                    SSH Key (Optional)
                                </Label>
                                <Select
                                    value={addServerForm.private_key_id}
                                    onValueChange={(value) =>
                                        handleInputChange(
                                            'private_key_id',
                                            value,
                                        )
                                    }
                                >
                                    <SelectTrigger id="ssh-key">
                                        <SelectValue placeholder="Select an SSH key" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="none">
                                            No key
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
                            </div>
                        </div>
                    </div>

                    {/* Optional Fields */}
                    <div className="grid grid-cols-2 gap-4">
                        <div className="grid gap-2">
                            <Label htmlFor="hostname">
                                Hostname (Optional)
                            </Label>
                            <Textarea
                                id="hostname"
                                placeholder="web-server-01, System hostname (shown in terminal prompt)"
                                value={addServerForm.hostname}
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
                        <div className="grid gap-2">
                            <Label htmlFor="description">
                                Description (Optional)
                            </Label>
                            <Textarea
                                id="description"
                                placeholder="Production web server running nginx..."
                                value={addServerForm.description}
                                onChange={(e) =>
                                    handleInputChange(
                                        'description',
                                        e.target.value,
                                    )
                                }
                                rows={3}
                            />
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
                    <Button onClick={handleAddServer} disabled={loading}>
                        {loading ? (
                            <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Adding Server...
                            </>
                        ) : (
                            'Add Server'
                        )}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
