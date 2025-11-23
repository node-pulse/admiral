import { Label } from '@/components/ui/label';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { type PlaybookManifest } from '@/types/playbook';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

interface PlaybookSelectorProps {
    csrfToken: string;
    selectedPlaybook: string;
    onPlaybookChange: (playbookPath: string) => void;
    onPlaybooksLoaded?: (
        playbooks: any[],
        communityPlaybooks: PlaybookManifest[],
    ) => void;
}

export function PlaybookSelector({
    csrfToken,
    selectedPlaybook,
    onPlaybookChange,
    onPlaybooksLoaded,
}: PlaybookSelectorProps) {
    const [playbooks, setPlaybooks] = useState<any[]>([]);
    const [communityPlaybooks, setCommunityPlaybooks] = useState<
        PlaybookManifest[]
    >([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchPlaybooks();
        fetchCommunityPlaybooks();
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const fetchPlaybooks = async () => {
        setLoading(true);
        try {
            const response = await fetch(
                '/api/fleetops/ansible-playbooks/list',
                {
                    headers: {
                        'X-CSRF-TOKEN': csrfToken,
                        Accept: 'application/json',
                    },
                },
            );

            if (!response.ok) {
                throw new Error('Failed to fetch playbooks');
            }

            const data = await response.json();

            // Flatten the tree structure to get a list of playbooks (exclude templates)
            const flattenTree = (nodes: any[]): any[] => {
                const playbooks: any[] = [];

                const traverse = (nodes: any[]) => {
                    for (const node of nodes) {
                        if (node.type === 'file' && !node.isTemplate) {
                            // Only include .yml and .yaml files, not .j2 templates
                            playbooks.push({
                                name: node.path, // Use full path as display name
                                file_name: node.name,
                                path: node.path,
                                description: node.description,
                            });
                        } else if (node.type === 'directory' && node.children) {
                            traverse(node.children);
                        }
                    }
                };

                traverse(nodes);
                return playbooks;
            };

            const playbooksList = flattenTree(data.tree || []);

            // Filter out catalog playbooks from built-in list
            const builtInPlaybooks = playbooksList.filter(
                (pb) => !pb.path.startsWith('catalog/'),
            );
            setPlaybooks(builtInPlaybooks);

            // Notify parent component
            if (onPlaybooksLoaded) {
                onPlaybooksLoaded(builtInPlaybooks, communityPlaybooks);
            }

            // Set default playbook to first built-in one if available and no URL param
            const urlParams = new URLSearchParams(window.location.search);
            const pbId = urlParams.get('pb_id');
            if (!pbId && builtInPlaybooks.length > 0 && !selectedPlaybook) {
                onPlaybookChange(builtInPlaybooks[0].path);
            }
        } catch (error) {
            console.error('Error fetching playbooks:', error);
            toast.error('Failed to load playbooks');
        } finally {
            setLoading(false);
        }
    };

    const fetchCommunityPlaybooks = async () => {
        try {
            const response = await fetch('/api/playbooks', {
                headers: {
                    'X-CSRF-TOKEN': csrfToken,
                    Accept: 'application/json',
                },
            });

            if (!response.ok) {
                throw new Error('Failed to fetch community playbooks');
            }

            const data = await response.json();
            const communityPbs = data.playbooks.data || [];
            setCommunityPlaybooks(communityPbs);

            // Notify parent component
            if (onPlaybooksLoaded) {
                onPlaybooksLoaded(playbooks, communityPbs);
            }
        } catch (error) {
            console.error('Error fetching community playbooks:', error);
            // Don't show error toast - community playbooks are optional
        }
    };

    return (
        <div className="space-y-2">
            <Label htmlFor="playbook">Playbook *</Label>
            <Select
                value={selectedPlaybook}
                onValueChange={onPlaybookChange}
                disabled={loading}
            >
                <SelectTrigger id="playbook">
                    <SelectValue
                        placeholder={
                            loading
                                ? 'Loading playbooks...'
                                : 'Select a playbook'
                        }
                    />
                </SelectTrigger>
                <SelectContent>
                    {/* Built-in playbooks */}
                    {playbooks.length > 0 && (
                        <>
                            <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
                                Built-in Playbooks
                            </div>
                            {playbooks.map((pb) => (
                                <SelectItem key={pb.path} value={pb.path}>
                                    {pb.name}
                                </SelectItem>
                            ))}
                        </>
                    )}

                    {/* Community playbooks */}
                    {communityPlaybooks.length > 0 && (
                        <>
                            <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
                                Community Playbooks
                            </div>
                            {communityPlaybooks.flatMap((pb) => {
                                if (pb.structure?.playbooks) {
                                    return Object.entries(
                                        pb.structure.playbooks,
                                    ).map(([type, playbookConfig]) => {
                                        const filename = playbookConfig.file;
                                        return (
                                            <SelectItem
                                                key={`${pb.id}-${type}`}
                                                value={`catalog/${pb.source_path}/${filename}`}
                                            >
                                                {pb.name} - {type} (v
                                                {pb.version})
                                            </SelectItem>
                                        );
                                    });
                                }
                                return [];
                            })}
                        </>
                    )}
                </SelectContent>
            </Select>
        </div>
    );
}
