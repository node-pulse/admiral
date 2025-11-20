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
import { systemSettings } from '@/routes';
import { BreadcrumbItem } from '@/types';
import { Head, router } from '@inertiajs/react';
import { AlertCircle, CheckCircle2, Info, XCircle } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

interface SettingsTranslations {
    title: string;
    subtitle: string;
    security: Record<string, string>;
    categories: Record<string, string>;
    table: Record<string, string>;
    actions: Record<string, string>;
    messages: Record<string, string>;
    mtls: Record<string, string>;
    search: Record<string, string>;
}

interface Setting {
    key: string;
    value: any;
    description: string | null;
    tier: 'free' | 'pro' | 'growth';
    category?: string;
}

interface MtlsStatus {
    enabled: boolean;
    status: string;
    reachable: boolean;
}

interface Props {
    translations: SettingsTranslations;
    settings: Setting[];
    mtls: MtlsStatus;
}

export default function SystemSettings({ translations, settings, mtls }: Props) {
    const breadcrumbs: BreadcrumbItem[] = [
        {
            title: `${translations.title} - ${translations.subtitle}`,
            href: systemSettings().url,
        },
    ];

    const [updating, setUpdating] = useState<string | null>(null);
    const [editingValues, setEditingValues] = useState<Record<string, any>>({});
    const [searchQuery, setSearchQuery] = useState('');
    const [enablingMtls, setEnablingMtls] = useState(false);

    const handleEnableMtls = () => {
        if (!confirm(translations.mtls.confirm_enable)) {
            return;
        }

        setEnablingMtls(true);

        router.post('/dashboard/system-settings/mtls/enable', {}, {
            preserveScroll: true,
            onSuccess: () => {
                toast.success(translations.messages.mtls_enabled);
                // Reload page to show updated status
                router.reload();
            },
            onError: (errors: any) => {
                const errorMessage = errors.error || errors.detail || translations.messages.mtls_enable_failed;
                toast.error(errorMessage);
            },
            onFinish: () => {
                setEnablingMtls(false);
            },
        });
    };

    const handleToggle = (key: string) => {
        setUpdating(key);

        router.post(
            `/dashboard/system-settings/${key}/toggle`,
            {},
            {
                preserveScroll: true,
                onSuccess: () => {
                    toast.success(translations.messages.updated);
                },
                onError: (errors) => {
                    toast.error(errors[key] || translations.messages.update_failed);
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
                    toast.success(translations.messages.updated);
                    setEditingValues((prev) => {
                        const next = { ...prev };
                        delete next[key];
                        return next;
                    });
                },
                onError: (errors) => {
                    toast.error(errors[key] || translations.messages.update_failed);
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

    const getCategoryForSetting = (setting: Setting): string => {
        if (
            setting.key.includes('registration') ||
            setting.key.includes('auth')
        ) {
            return translations.categories.authentication;
        } else if (setting.key.includes('retention')) {
            return translations.categories.data_retention;
        } else if (setting.key.includes('alert')) {
            return translations.categories.alerting;
        } else if (setting.tier === 'pro' || setting.tier === 'growth') {
            return translations.categories.pro_features;
        } else {
            return translations.categories.system;
        }
    };

    const getCategoryBadgeClass = (category: string): string => {
        // Match against translated values
        if (category === translations.categories.authentication) {
            return 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300';
        } else if (category === translations.categories.data_retention) {
            return 'bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300';
        } else if (category === translations.categories.alerting) {
            return 'bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300';
        } else if (category === translations.categories.pro_features) {
            return 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300';
        } else if (category === translations.categories.system) {
            return 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300';
        } else {
            return 'bg-muted text-muted-foreground';
        }
    };

    const enrichedSettings = settings
        .map((setting) => ({
            ...setting,
            category: getCategoryForSetting(setting),
        }))
        .filter(
            (setting) =>
                setting.key !== 'tier' &&
                setting.tier !== 'pro' &&
                setting.tier !== 'growth',
        );

    const filteredSettings = enrichedSettings.filter((setting) => {
        if (!searchQuery) return true;

        const query = searchQuery.toLowerCase();
        const keyMatch = setting.key.toLowerCase().includes(query);
        const descriptionMatch =
            setting.description?.toLowerCase().includes(query) || false;
        const categoryMatch =
            setting.category?.toLowerCase().includes(query) || false;
        const valueMatch = String(setting.value).toLowerCase().includes(query);

        return keyMatch || descriptionMatch || categoryMatch || valueMatch;
    });

    const renderSetting = (setting: Setting) => {
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
                    <div className="inline-flex items-center gap-2">
                        <span
                            className={`rounded px-2 py-0.5 text-xs font-medium ${getCategoryBadgeClass(setting.category || '')}`}
                        >
                            {setting.category}
                        </span>
                        <span>
                            {setting.key
                                .replace(/_/g, ' ')
                                .replace(/\b\w/g, (l) => l.toUpperCase())}
                        </span>
                    </div>
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
                            {setting.value ? translations.table.enabled : translations.table.disabled}
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
                                {translations.actions.update}
                            </Button>
                        </div>
                    )}
                </TableCell>
            </TableRow>
        );
    };

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={translations.title} />

            <div className="AdmiralSystemSettings flex h-full flex-1 flex-col gap-4 overflow-x-auto rounded-xl p-4">
                {/* Security Settings - mTLS Status */}
                <Card>
                    <CardHeader>
                        <CardTitle>{translations.security.title}</CardTitle>
                        <CardDescription>
                            {translations.security.description}
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
                                        {translations.mtls.title}
                                    </div>
                                    <div className="text-sm text-muted-foreground">
                                        {translations.mtls.status_label}: {mtls.status}
                                    </div>
                                    {!mtls.reachable && (
                                        <div className="mt-1 text-xs text-red-500">
                                            {translations.mtls.unreachable_warning}
                                        </div>
                                    )}
                                </div>
                            </div>
                            <div className="flex gap-2">
                                {!mtls.enabled && mtls.reachable && (
                                    <Button
                                        onClick={handleEnableMtls}
                                        disabled={enablingMtls}
                                    >
                                        {enablingMtls ? translations.mtls.enabling : translations.mtls.enable}
                                    </Button>
                                )}
                                <Dialog>
                                    <DialogTrigger asChild>
                                        <Button variant="outline" size="sm">
                                            <Info className="mr-2 h-4 w-4" />
                                            {mtls.enabled ? translations.mtls.about : translations.mtls.manual_setup}
                                        </Button>
                                    </DialogTrigger>
                                <DialogContent className="max-w-4xl!">
                                    <DialogHeader>
                                        <DialogTitle>
                                            {translations.mtls.dialog_title}
                                        </DialogTitle>
                                        <DialogDescription>
                                            {translations.mtls.dialog_description}
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
                        </div>
                    </CardContent>
                </Card>

                {/* All Settings in One Table */}
                <Card>
                    <CardHeader>
                        <CardTitle>{translations.table.title}</CardTitle>
                        <CardDescription>
                            {translations.table.description}
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {/* Search Input */}
                        <div className="flex items-center gap-2">
                            <Input
                                type="text"
                                placeholder={translations.search.placeholder}
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="max-w-md"
                            />
                            {searchQuery && (
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setSearchQuery('')}
                                >
                                    {translations.search.clear}
                                </Button>
                            )}
                        </div>

                        {/* Results count */}
                        {searchQuery && (
                            <p className="text-sm text-muted-foreground">
                                {translations.search.found} {filteredSettings.length} {filteredSettings.length !== 1 ? translations.search.settings : translations.search.setting}
                            </p>
                        )}

                        {/* Settings Table */}
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>{translations.table.setting}</TableHead>
                                    <TableHead>{translations.table.description}</TableHead>
                                    <TableHead>{translations.table.current_value}</TableHead>
                                    <TableHead className="text-right">
                                        {translations.table.actions}
                                    </TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {filteredSettings.length > 0 ? (
                                    filteredSettings.map(renderSetting)
                                ) : (
                                    <TableRow>
                                        <TableCell
                                            colSpan={4}
                                            className="text-center text-muted-foreground"
                                        >
                                            {translations.search.no_results} "{searchQuery}"
                                        </TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>
            </div>
        </AppLayout>
    );
}
