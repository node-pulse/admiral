import { Button } from '@/components/ui/button';
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from '@/components/ui/card';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import AppLayout from '@/layouts/app-layout';
import { Head, router } from '@inertiajs/react';
import { AlertCircle, CheckCircle2, Info, XCircle } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

interface Setting {
    key: string;
    value: any;
    description: string | null;
    tier: 'free' | 'pro' | 'growth';
}

interface MtlsStatus {
    enabled: boolean;
    status: string;
    reachable: boolean;
}

interface Props {
    settings: Setting[];
    mtls: MtlsStatus;
}

export default function SystemSettings({ settings, mtls }: Props) {
    const [updating, setUpdating] = useState<string | null>(null);
    const [editingValues, setEditingValues] = useState<Record<string, any>>({});

    const handleToggle = (key: string) => {
        setUpdating(key);

        router.post(
            `/dashboard/system-settings/${key}/toggle`,
            {},
            {
                preserveScroll: true,
                onSuccess: () => {
                    toast.success('Setting updated successfully');
                },
                onError: (errors) => {
                    toast.error(errors[key] || 'Failed to update setting');
                },
                onFinish: () => {
                    setUpdating(null);
                },
            },
        );
    };

    const handleUpdate = (key: string, value: any) => {
        setUpdating(key);

        router.put(
            `/dashboard/system-settings/${key}`,
            { value },
            {
                preserveScroll: true,
                onSuccess: () => {
                    toast.success('Setting updated successfully');
                    setEditingValues((prev) => {
                        const next = { ...prev };
                        delete next[key];
                        return next;
                    });
                },
                onError: (errors) => {
                    toast.error(errors[key] || 'Failed to update setting');
                },
                onFinish: () => {
                    setUpdating(null);
                },
            },
        );
    };

    const handleInputChange = (key: string, value: any) => {
        setEditingValues((prev) => ({ ...prev, [key]: value }));
    };

    const handleInputBlur = (key: string, originalValue: any) => {
        const editedValue = editingValues[key];
        if (editedValue !== undefined && editedValue !== originalValue) {
            handleUpdate(key, editedValue);
        }
    };

    const groupSettingsByCategory = () => {
        const groups: Record<string, Setting[]> = {
            authentication: [],
            data_retention: [],
            alerting: [],
            pro_features: [],
            system: [],
        };

        settings.forEach((setting) => {
            if (
                setting.key.includes('registration') ||
                setting.key.includes('auth')
            ) {
                groups.authentication.push(setting);
            } else if (setting.key.includes('retention')) {
                groups.data_retention.push(setting);
            } else if (setting.key.includes('alert')) {
                groups.alerting.push(setting);
            } else if (setting.tier === 'pro' || setting.tier === 'growth') {
                groups.pro_features.push(setting);
            } else {
                groups.system.push(setting);
            }
        });

        return groups;
    };

    const groups = groupSettingsByCategory();

    const renderSetting = (setting: Setting) => {
        if (setting.key === 'tier') return null;
        if (setting.tier === 'pro' || setting.tier === 'growth') return null;

        const isBoolean = typeof setting.value === 'boolean';
        const isNumber = typeof setting.value === 'number' && !isBoolean;
        const isDisabled = updating === setting.key;
        const currentValue =
            editingValues[setting.key] !== undefined
                ? editingValues[setting.key]
                : setting.value;

        return (
            <TableRow key={setting.key}>
                <TableCell className="font-medium">
                    {setting.key
                        .replace(/_/g, ' ')
                        .replace(/\b\w/g, (l) => l.toUpperCase())}
                </TableCell>
                <TableCell className="max-w-md">
                    {setting.description && (
                        <span className="text-sm text-muted-foreground">
                            {setting.description}
                        </span>
                    )}
                </TableCell>
                <TableCell>
                    {isBoolean ? (
                        <span className="text-sm">
                            {setting.value ? 'Enabled' : 'Disabled'}
                        </span>
                    ) : (
                        <span className="font-mono text-sm">
                            {String(setting.value)}
                        </span>
                    )}
                </TableCell>
                <TableCell className="text-right">
                    {isBoolean ? (
                        <Switch
                            id={setting.key}
                            checked={setting.value}
                            onCheckedChange={() => handleToggle(setting.key)}
                            disabled={isDisabled}
                        />
                    ) : (
                        <div className="flex items-center justify-end gap-2">
                            {isNumber ? (
                                <Input
                                    id={setting.key}
                                    type="number"
                                    value={currentValue ?? ''}
                                    disabled={isDisabled}
                                    className="w-32"
                                    onChange={(e) =>
                                        handleInputChange(
                                            setting.key,
                                            Number(e.target.value),
                                        )
                                    }
                                    onBlur={() =>
                                        handleInputBlur(
                                            setting.key,
                                            setting.value,
                                        )
                                    }
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                            e.currentTarget.blur();
                                        }
                                    }}
                                />
                            ) : (
                                <Input
                                    id={setting.key}
                                    value={currentValue ?? ''}
                                    disabled={isDisabled}
                                    className="w-48"
                                    onChange={(e) =>
                                        handleInputChange(
                                            setting.key,
                                            e.target.value,
                                        )
                                    }
                                    onBlur={() =>
                                        handleInputBlur(
                                            setting.key,
                                            setting.value,
                                        )
                                    }
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                            e.currentTarget.blur();
                                        }
                                    }}
                                />
                            )}
                            <Button
                                size="sm"
                                disabled={
                                    isDisabled ||
                                    editingValues[setting.key] === undefined ||
                                    editingValues[setting.key] === setting.value
                                }
                                onClick={() =>
                                    handleUpdate(
                                        setting.key,
                                        editingValues[setting.key],
                                    )
                                }
                            >
                                Update
                            </Button>
                        </div>
                    )}
                </TableCell>
            </TableRow>
        );
    };

    return (
        <AppLayout>
            <Head title="System Settings" />

            <div className="AdmiralSystemSettings flex h-full flex-1 flex-col gap-4 overflow-x-auto rounded-xl p-4">
                <div>
                    <h2 className="text-3xl font-bold tracking-tight">
                        System Settings
                    </h2>
                    <p className="text-muted-foreground">
                        Manage system-wide configuration and preferences. (Admin
                        only)
                    </p>
                </div>

                {/* Security Settings - mTLS Status */}
                <Card>
                    <CardHeader>
                        <CardTitle>Security</CardTitle>
                        <CardDescription>
                            Mutual TLS (mTLS) authentication status for agent
                            connections
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="flex items-center justify-between rounded-lg border p-4">
                            <div className="flex items-center gap-4">
                                <div>
                                    {mtls.reachable ? (
                                        mtls.enabled ? (
                                            <CheckCircle2 className="h-8 w-8 text-green-500" />
                                        ) : (
                                            <AlertCircle className="h-8 w-8 text-yellow-500" />
                                        )
                                    ) : (
                                        <XCircle className="h-8 w-8 text-red-500" />
                                    )}
                                </div>
                                <div>
                                    <div className="font-medium">
                                        mTLS Authentication
                                    </div>
                                    <div className="text-sm text-muted-foreground">
                                        Status: {mtls.status}
                                    </div>
                                    {!mtls.reachable && (
                                        <div className="mt-1 text-xs text-red-500">
                                            Warning: Unable to reach submarines
                                            ingest service
                                        </div>
                                    )}
                                </div>
                            </div>
                            <Dialog>
                                <DialogTrigger asChild>
                                    <Button variant="outline" size="sm">
                                        <Info className="mr-2 h-4 w-4" />
                                        How to Change
                                    </Button>
                                </DialogTrigger>
                                <DialogContent className="max-w-2xl">
                                    <DialogHeader>
                                        <DialogTitle>
                                            Changing mTLS Configuration
                                        </DialogTitle>
                                        <DialogDescription>
                                            mTLS is a build-time decision and
                                            requires rebuilding the Docker
                                            images
                                        </DialogDescription>
                                    </DialogHeader>
                                    <div className="space-y-4">
                                        <div>
                                            <h4 className="mb-2 font-semibold">
                                                To Enable mTLS (Production):
                                            </h4>
                                            <ol className="list-inside list-decimal space-y-2 text-sm">
                                                <li>
                                                    Run the mTLS setup script
                                                    (generates CA, rebuilds, and
                                                    restarts):
                                                    <pre className="mt-2 rounded bg-muted p-2 font-mono text-xs">
                                                        ./scripts/setup-mtls.sh
                                                    </pre>
                                                    <div className="mt-1 text-xs text-muted-foreground">
                                                        The script will
                                                        automatically rebuild
                                                        submarines with mTLS
                                                        enabled and restart
                                                        services.
                                                    </div>
                                                </li>
                                                <li>
                                                    Deploy agent certificates
                                                    using Ansible:
                                                    <pre className="mt-2 rounded bg-muted p-2 font-mono text-xs">
                                                        ansible-playbook
                                                        flagship/ansible/playbooks/nodepulse/deploy-agent.yml
                                                    </pre>
                                                </li>
                                                <li>
                                                    Verify mTLS status in this
                                                    page (reload to see updated
                                                    status)
                                                </li>
                                            </ol>
                                        </div>
                                        <div>
                                            <h4 className="mb-2 font-semibold">
                                                To Disable mTLS (Development):
                                            </h4>
                                            <ol className="list-inside list-decimal space-y-2 text-sm">
                                                <li>
                                                    Rebuild submarines with
                                                    development Dockerfile:
                                                    <pre className="mt-2 rounded bg-muted p-2 font-mono text-xs">
                                                        docker compose -f
                                                        compose.development.yml
                                                        build submarines-ingest
                                                    </pre>
                                                </li>
                                                <li>
                                                    Restart the services:
                                                    <pre className="mt-2 rounded bg-muted p-2 font-mono text-xs">
                                                        docker compose up -d
                                                    </pre>
                                                </li>
                                            </ol>
                                        </div>
                                        <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-3 text-sm dark:border-yellow-800 dark:bg-yellow-950">
                                            <p className="font-semibold text-yellow-800 dark:text-yellow-200">
                                                Note:
                                            </p>
                                            <p className="text-yellow-700 dark:text-yellow-300">
                                                Production builds always enforce
                                                mTLS in strict mode (no
                                                exceptions). Development builds
                                                validate server_id but do not
                                                require client certificates.
                                            </p>
                                        </div>
                                    </div>
                                </DialogContent>
                            </Dialog>
                        </div>
                    </CardContent>
                </Card>

                {/* Authentication Settings */}
                {groups.authentication.length > 0 && (
                    <Card>
                        <CardHeader>
                            <CardTitle>Authentication & Registration</CardTitle>
                            <CardDescription>
                                Control user authentication and registration
                                settings
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Setting</TableHead>
                                        <TableHead>Description</TableHead>
                                        <TableHead>Current Value</TableHead>
                                        <TableHead className="text-right">
                                            Actions
                                        </TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {groups.authentication.map(renderSetting)}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                )}

                {/* Data Retention Settings */}
                {groups.data_retention.length > 0 && (
                    <Card>
                        <CardHeader>
                            <CardTitle>Data Retention</CardTitle>
                            <CardDescription>
                                Configure how long metrics data is stored
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Setting</TableHead>
                                        <TableHead>Description</TableHead>
                                        <TableHead>Current Value</TableHead>
                                        <TableHead className="text-right">
                                            Actions
                                        </TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {groups.data_retention.map(renderSetting)}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                )}

                {/* Alerting Settings */}
                {groups.alerting.length > 0 && (
                    <Card>
                        <CardHeader>
                            <CardTitle>Alerting</CardTitle>
                            <CardDescription>
                                Configure alerting and notification settings
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Setting</TableHead>
                                        <TableHead>Description</TableHead>
                                        <TableHead>Current Value</TableHead>
                                        <TableHead className="text-right">
                                            Actions
                                        </TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {groups.alerting.map(renderSetting)}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                )}

                {/* Pro Features */}
                {/* {groups.pro_features.length > 0 && (
                    <Card>
                        <CardHeader>
                            <CardTitle>Pro Features</CardTitle>
                            <CardDescription>
                                Advanced features available in Pro and
                                Growth tiers
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="divide-y">
                            {groups.pro_features.map(renderSetting)}
                        </CardContent>
                    </Card>
                )} */}

                {/* System Settings */}
                {groups.system.length > 0 && (
                    <Card>
                        <CardHeader>
                            <CardTitle>System</CardTitle>
                            <CardDescription>
                                System-level configuration
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Setting</TableHead>
                                        <TableHead>Description</TableHead>
                                        <TableHead>Current Value</TableHead>
                                        <TableHead className="text-right">
                                            Actions
                                        </TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {groups.system.map(renderSetting)}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                )}
            </div>
        </AppLayout>
    );
}
