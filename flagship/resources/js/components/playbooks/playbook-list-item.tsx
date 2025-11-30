import { Badge } from '@/components/ui/badge';
import { ArrowUpCircle, CheckCircle2, Download, Loader2, Trash2 } from 'lucide-react';

interface OsSupport {
    distro: string;
    version: string;
    arch: string;
}

interface PlaybookAuthor {
    name: string;
    email?: string;
    url?: string;
    status?: 'community' | 'verified' | 'deprecated';
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

interface Playbook {
    id?: string;
    playbook_id: string;
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
    source_path?: string;
    downloaded?: boolean;
    downloaded_at?: string | number;
    update_available?: boolean;
    latest_version?: string;
}

interface PlaybookListItemProps {
    playbook: Playbook;
    onDownload?: (playbook: Playbook) => void;
    onRemove?: (playbookId: string, name: string) => void;
    onUpdate?: (playbookId: string, name: string) => void;
    downloadingId?: string | null;
}

export function PlaybookListItem({
    playbook,
    onDownload,
    onRemove,
    onUpdate,
    downloadingId,
}: PlaybookListItemProps) {
    const isDownloading = downloadingId === playbook.playbook_id;
    const downloadDisabled = downloadingId !== null && !isDownloading;
    return (
        <div className="flex items-center justify-between gap-2 px-4 pb-2 hover:bg-muted/75">
            <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 py-2">
                    <h3 className="truncate text-base font-semibold">
                        {playbook.name}
                    </h3>
                    <Badge variant="outline" className="shrink-0 text-xs">
                        v{playbook.version}
                    </Badge>
                    <Badge variant="outline" className="shrink-0 text-xs">
                        {playbook.category}
                    </Badge>
                    {playbook.downloaded ? (
                        <>
                            <Badge
                                variant="default"
                                className="shrink-0 bg-green-500 text-xs"
                            >
                                <CheckCircle2 className="mr-1 h-3 w-3" />
                                Downloaded
                            </Badge>
                            {playbook.update_available && playbook.latest_version && (
                                <Badge
                                    variant="default"
                                    className="shrink-0 cursor-pointer bg-orange-500 text-xs hover:bg-orange-600"
                                    onClick={() =>
                                        onUpdate?.(
                                            playbook.playbook_id,
                                            playbook.name,
                                        )
                                    }
                                    title={`Update to v${playbook.latest_version}`}
                                >
                                    <ArrowUpCircle className="mr-1 h-3 w-3" />
                                    Update to v{playbook.latest_version}
                                </Badge>
                            )}
                            <Badge
                                variant="default"
                                className="shrink-0 cursor-pointer bg-blue-500 text-xs"
                                onClick={() =>
                                    window.open(
                                        `/dashboard/deployments/create?pb_id=${playbook.playbook_id}`,
                                    )
                                }
                            >
                                Deploy
                            </Badge>
                            {onRemove && (
                                <span className="shrink-0 cursor-pointer px-2">
                                    <Trash2
                                        className="h-4 w-4 text-destructive"
                                        onClick={() =>
                                            onRemove(
                                                playbook.playbook_id,
                                                playbook.name,
                                            )
                                        }
                                    />
                                </span>
                            )}
                        </>
                    ) : (
                        <Badge
                            variant="default"
                            className={`shrink-0 text-xs ${isDownloading ? 'cursor-wait' : downloadDisabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'} bg-blue-500`}
                            onClick={() => !isDownloading && !downloadDisabled && onDownload?.(playbook)}
                        >
                            {isDownloading ? (
                                <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                            ) : (
                                <Download className="mr-1 h-3 w-3" />
                            )}
                            {isDownloading ? 'Downloading...' : 'Download'}
                        </Badge>
                    )}
                </div>
                <p className="mt-1 line-clamp-1 text-sm text-muted-foreground">
                    {playbook.description}
                </p>
                <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                    <span>{playbook.author.name}</span>
                    {playbook.os_support.length > 0 && (
                        <>
                            <span>•</span>
                            <span className="flex flex-wrap items-center gap-1">
                                {playbook.os_support.map((os, idx) => (
                                    <span key={idx}>
                                        {os.distro} {os.version}
                                        {idx < playbook.os_support.length - 1 &&
                                            ','}
                                    </span>
                                ))}
                            </span>
                        </>
                    )}
                    {playbook.downloaded && playbook.downloaded_at && (
                        <>
                            <span>•</span>
                            <span>
                                {new Date(
                                    typeof playbook.downloaded_at === 'number'
                                        ? playbook.downloaded_at * 1000
                                        : playbook.downloaded_at,
                                ).toLocaleDateString()}
                            </span>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
