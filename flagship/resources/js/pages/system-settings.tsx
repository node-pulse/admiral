import { Button } from '@/components/ui/button';
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from '@/components/ui/card';
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
import { useState } from 'react';
import { toast } from 'sonner';

interface Setting {
    key: string;
    value: any;
    description: string | null;
    tier: 'free' | 'pro' | 'growth';
}

interface Props {
    settings: Setting[];
}

export default function SystemSettings({ settings }: Props) {
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
