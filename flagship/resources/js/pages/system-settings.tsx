import { Badge } from '@/components/ui/badge';
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import AppLayout from '@/layouts/app-layout';
import { Head, router } from '@inertiajs/react';
import { useState } from 'react';
import { toast } from 'sonner';

interface Setting {
    key: string;
    value: any;
    description: string | null;
    tier: 'free' | 'pro' | 'enterprise';
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

    const getTierBadgeVariant = (tier: string) => {
        switch (tier) {
            case 'pro':
                return 'default';
            case 'enterprise':
                return 'secondary';
            default:
                return 'outline';
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
            } else if (
                setting.tier === 'pro' ||
                setting.tier === 'enterprise'
            ) {
                groups.pro_features.push(setting);
            } else {
                groups.system.push(setting);
            }
        });

        return groups;
    };

    const groups = groupSettingsByCategory();

    const renderSetting = (setting: Setting) => {
        const isBoolean = typeof setting.value === 'boolean';
        const isNumber = typeof setting.value === 'number' && !isBoolean;
        const isDisabled = updating === setting.key;
        const currentValue =
            editingValues[setting.key] !== undefined
                ? editingValues[setting.key]
                : setting.value;

        return (
            <div
                key={setting.key}
                className="flex items-center justify-between space-x-4 py-4"
            >
                <div className="flex-1 space-y-1">
                    <div className="flex items-center gap-2">
                        <Label htmlFor={setting.key} className="font-medium">
                            {setting.key
                                .replace(/_/g, ' ')
                                .replace(/\b\w/g, (l) => l.toUpperCase())}
                        </Label>
                        {setting.tier !== 'free' && (
                            <Badge variant={getTierBadgeVariant(setting.tier)}>
                                {setting.tier}
                            </Badge>
                        )}
                    </div>
                    {setting.description && (
                        <p className="text-sm text-muted-foreground">
                            {setting.description}
                        </p>
                    )}
                </div>

                {isBoolean ? (
                    <Switch
                        id={setting.key}
                        checked={setting.value}
                        onCheckedChange={() => handleToggle(setting.key)}
                        disabled={isDisabled}
                    />
                ) : isNumber ? (
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
                            handleInputBlur(setting.key, setting.value)
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
                        className="w-64"
                        onChange={(e) =>
                            handleInputChange(setting.key, e.target.value)
                        }
                        onBlur={() =>
                            handleInputBlur(setting.key, setting.value)
                        }
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                                e.currentTarget.blur();
                            }
                        }}
                    />
                )}
            </div>
        );
    };

    return (
        <AppLayout>
            <Head title="System Settings" />

            <div className="AdmiralDashboard flex h-full flex-1 flex-col gap-4 overflow-x-auto rounded-xl p-4">
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
                        <CardContent className="divide-y">
                            {groups.authentication.map(renderSetting)}
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
                        <CardContent className="divide-y">
                            {groups.data_retention.map(renderSetting)}
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
                        <CardContent className="divide-y">
                            {groups.alerting.map(renderSetting)}
                        </CardContent>
                    </Card>
                )}

                {/* Pro Features */}
                {groups.pro_features.length > 0 && (
                    <Card>
                        <CardHeader>
                            <CardTitle>Pro Features</CardTitle>
                            <CardDescription>
                                Advanced features available in Pro and
                                Enterprise tiers
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="divide-y">
                            {groups.pro_features.map(renderSetting)}
                        </CardContent>
                    </Card>
                )}

                {/* System Settings */}
                {groups.system.length > 0 && (
                    <Card>
                        <CardHeader>
                            <CardTitle>System</CardTitle>
                            <CardDescription>
                                System-level configuration
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="divide-y">
                            {groups.system.map(renderSetting)}
                        </CardContent>
                    </Card>
                )}
            </div>
        </AppLayout>
    );
}
