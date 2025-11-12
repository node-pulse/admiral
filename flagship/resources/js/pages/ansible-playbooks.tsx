import { UploadPlaybookModal } from '@/components/ansible/upload-playbook-modal';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import AppLayout from '@/layouts/app-layout';
import { cn } from '@/lib/utils';
import { type BreadcrumbItem } from '@/types';
import { Head, usePage } from '@inertiajs/react';
import {
    AlertCircle,
    ChevronDown,
    ChevronRight,
    Copy,
    Download,
    File,
    FileCode,
    Folder,
    FolderOpen,
    Loader2,
    Upload,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { toast } from 'sonner';
import * as YAML from 'yaml';

const breadcrumbs: BreadcrumbItem[] = [
    {
        title: 'Ansible Playbooks - Browse and view Ansible playbooks used for server deployments and configuration management',
        href: '/dashboard/ansible-playbooks',
    },
];

interface TreeNode {
    type: 'directory' | 'file';
    name: string;
    path: string;
    title?: string;
    description?: string;
    size?: number;
    modified?: number;
    isTemplate?: boolean;
    children?: TreeNode[];
}

interface FileContent {
    path: string;
    content: string | null;
    size: number;
    modified: number;
    isTemplate?: boolean;
    isBinary?: boolean;
    message?: string;
}

export default function AnsiblePlaybooks() {
    const { props } = usePage();
    const csrfToken =
        (props as any).csrf_token ||
        document
            .querySelector('meta[name="csrf-token"]')
            ?.getAttribute('content') ||
        '';

    const [tree, setTree] = useState<TreeNode[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedFile, setSelectedFile] = useState<FileContent | null>(null);
    const [loadingFile, setLoadingFile] = useState(false);
    const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set());
    const [yamlError, setYamlError] = useState<string | null>(null);
    const [uploadModalOpen, setUploadModalOpen] = useState(false);

    useEffect(() => {
        fetchTree();
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const fetchTree = async () => {
        try {
            setLoading(true);
            const response = await fetch(
                '/api/fleetops/ansible-playbooks/list',
                {
                    headers: {
                        'X-CSRF-TOKEN': csrfToken,
                    },
                },
            );

            if (!response.ok) {
                throw new Error('Failed to fetch playbooks');
            }

            const data = await response.json();
            setTree(data.tree || []);

            // Auto-expand root level directories
            const rootDirs = (data.tree || [])
                .filter((node: TreeNode) => node.type === 'directory')
                .map((node: TreeNode) => node.path);
            setExpandedDirs(new Set(rootDirs));
        } catch (error) {
            toast.error('Failed to load playbooks');
            console.error('Error fetching playbooks:', error);
        } finally {
            setLoading(false);
        }
    };

    const fetchFileContent = async (path: string) => {
        try {
            setLoadingFile(true);
            const response = await fetch(
                `/api/fleetops/ansible-playbooks/details/${encodeURIComponent(path)}`,
                {
                    headers: {
                        'X-CSRF-TOKEN': csrfToken,
                    },
                },
            );

            if (!response.ok) {
                throw new Error('Failed to fetch file content');
            }

            const data = await response.json();
            setSelectedFile(data);

            // Always clear YAML errors first
            setYamlError(null);

            // Skip YAML parsing for binary files
            if (data.isBinary) {
                return;
            }

            // Only try to parse YAML for .yml and .yaml files (not .j2 templates or other files)
            const isYamlFile = data.path && data.path.match(/\.(yml|yaml)$/i);

            if (isYamlFile && data.content) {
                try {
                    YAML.parse(data.content);
                } catch (yamlError: any) {
                    const errorMessage =
                        yamlError?.message || 'Unknown YAML parsing error';
                    setYamlError(errorMessage);
                    console.warn('Failed to parse YAML:', yamlError);
                }
            }
        } catch (error) {
            toast.error('Failed to load file content');
            console.error('Error fetching file:', error);
        } finally {
            setLoadingFile(false);
        }
    };

    const toggleDirectory = (path: string) => {
        setExpandedDirs((prev) => {
            const next = new Set(prev);
            if (next.has(path)) {
                next.delete(path);
            } else {
                next.add(path);
            }
            return next;
        });
    };

    const handleFileClick = (node: TreeNode) => {
        if (node.type === 'file') {
            fetchFileContent(node.path);
        }
    };

    const renderTree = (nodes: TreeNode[], depth = 0) => {
        return nodes.map((node) => {
            const isExpanded = expandedDirs.has(node.path);
            const isSelected = selectedFile?.path === node.path;

            if (node.type === 'directory') {
                return (
                    <div key={node.path}>
                        <div
                            className={cn(
                                'flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 hover:bg-accent',
                                'transition-colors',
                            )}
                            style={{ paddingLeft: `${depth * 16 + 8}px` }}
                            onClick={() => toggleDirectory(node.path)}
                        >
                            {isExpanded ? (
                                <ChevronDown className="h-4 w-4 shrink-0" />
                            ) : (
                                <ChevronRight className="h-4 w-4 shrink-0" />
                            )}
                            {isExpanded ? (
                                <FolderOpen className="h-4 w-4 shrink-0 text-blue-500" />
                            ) : (
                                <Folder className="h-4 w-4 shrink-0 text-blue-500" />
                            )}
                            <span className="text-sm font-medium">
                                {node.name}
                            </span>
                        </div>
                        {isExpanded &&
                            node.children &&
                            renderTree(node.children, depth + 1)}
                    </div>
                );
            }

            return (
                <div
                    key={node.path}
                    className={cn(
                        'flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5',
                        'transition-colors hover:bg-accent',
                        isSelected && 'bg-accent',
                    )}
                    style={{ paddingLeft: `${depth * 16 + 32}px` }}
                    onClick={() => handleFileClick(node)}
                >
                    <FileCode className="h-4 w-4 shrink-0 text-amber-500" />
                    <div className="min-w-0 flex-1">
                        <div className="truncate text-sm">{node.name}</div>
                        {node.title && node.title !== node.name && (
                            <div className="truncate text-xs text-muted-foreground">
                                {node.title}
                            </div>
                        )}
                    </div>
                </div>
            );
        });
    };

    const copyToClipboard = async (content: string) => {
        try {
            await navigator.clipboard.writeText(content);
            toast.success('Copied to clipboard');
        } catch {
            toast.error('Failed to copy to clipboard');
        }
    };

    const downloadFile = (content: string, filename: string) => {
        const blob = new Blob([content], { type: 'text/yaml' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        toast.success('File downloaded');
    };

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Ansible Playbooks" />
            <div className="AnsiblePlaybooks flex h-full flex-1 flex-col gap-4 overflow-x-auto rounded-xl p-4">
                {/* Header with Upload Button */}
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-2xl font-bold">
                            Ansible Playbooks
                        </h1>
                        <p className="text-sm text-muted-foreground">
                            Browse and view Ansible playbooks for server
                            deployments
                        </p>
                    </div>
                    <Button onClick={() => setUploadModalOpen(true)}>
                        <Upload className="mr-2 h-4 w-4" />
                        Upload Custom Playbooks
                    </Button>
                </div>

                <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
                    {/* Left: Directory Tree */}
                    <Card className="lg:col-span-1">
                        <CardContent className="p-0">
                            <ScrollArea className="h-[600px]">
                                {loading ? (
                                    <div className="flex items-center justify-center py-8">
                                        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                                    </div>
                                ) : tree.length === 0 ? (
                                    <div className="py-8 text-center text-muted-foreground">
                                        No playbooks found
                                    </div>
                                ) : (
                                    <div className="p-2">
                                        {renderTree(tree)}
                                    </div>
                                )}
                            </ScrollArea>
                        </CardContent>
                    </Card>

                    {/* Right: File Content Viewer */}
                    <Card className="lg:col-span-2">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <File className="h-5 w-5" />
                                {selectedFile
                                    ? selectedFile.path
                                    : 'Select a file'}
                                {selectedFile?.isTemplate && (
                                    <Badge variant="secondary" className="ml-2">
                                        Jinja2 Template
                                    </Badge>
                                )}
                                {yamlError && (
                                    <Badge
                                        variant="destructive"
                                        className="ml-2"
                                    >
                                        Invalid YAML
                                    </Badge>
                                )}
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            {loadingFile ? (
                                <div className="flex items-center justify-center py-12">
                                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                                </div>
                            ) : selectedFile ? (
                                <div className="space-y-4">
                                    {/* Binary File Notice */}
                                    {selectedFile.isBinary && (
                                        <div className="flex items-start gap-3 rounded-lg border border-muted bg-muted/10 p-4">
                                            <AlertCircle className="h-5 w-5 shrink-0 text-muted-foreground" />
                                            <div className="flex-1">
                                                <h3 className="text-sm font-semibold">
                                                    Binary File
                                                </h3>
                                                <p className="mt-1 text-sm text-muted-foreground">
                                                    {selectedFile.message ||
                                                        'This file cannot be displayed as it is a binary file.'}
                                                </p>
                                                <p className="mt-2 text-xs text-muted-foreground">
                                                    File type:{' '}
                                                    {selectedFile.path
                                                        .split('.')
                                                        .pop()
                                                        ?.toUpperCase()}{' '}
                                                    | Size:{' '}
                                                    {(
                                                        selectedFile.size / 1024
                                                    ).toFixed(2)}{' '}
                                                    KB
                                                </p>
                                            </div>
                                        </div>
                                    )}

                                    {/* YAML Parse Error Alert */}
                                    {yamlError && !selectedFile.isBinary && (
                                        <div className="flex items-start gap-3 rounded-lg border border-destructive/50 bg-destructive/10 p-4">
                                            <AlertCircle className="h-5 w-5 shrink-0 text-destructive" />
                                            <div className="flex-1">
                                                <h3 className="text-sm font-semibold text-destructive">
                                                    YAML Parsing Error
                                                </h3>
                                                <p className="mt-1 text-sm text-destructive/90">
                                                    This file contains invalid
                                                    YAML syntax and may not work
                                                    correctly with Ansible.
                                                </p>
                                                <pre className="mt-2 overflow-x-auto rounded-md bg-destructive/20 p-2 text-xs text-destructive">
                                                    {yamlError}
                                                </pre>
                                            </div>
                                        </div>
                                    )}

                                    {/* File Content with Syntax Highlighting */}
                                    {!selectedFile.isBinary &&
                                        selectedFile.content && (
                                            <div>
                                                <div className="mb-2 flex items-center justify-between">
                                                    <h3 className="text-sm font-semibold">
                                                        YAML Content
                                                    </h3>
                                                    <div className="flex items-center gap-2">
                                                        <Badge variant="outline">
                                                            {
                                                                selectedFile.content.split(
                                                                    '\n',
                                                                ).length
                                                            }{' '}
                                                            lines
                                                        </Badge>
                                                        <Button
                                                            size="sm"
                                                            variant="outline"
                                                            onClick={() =>
                                                                copyToClipboard(
                                                                    selectedFile.content ||
                                                                        '',
                                                                )
                                                            }
                                                        >
                                                            <Copy className="h-3 w-3" />
                                                            Copy
                                                        </Button>
                                                        <Button
                                                            size="sm"
                                                            variant="outline"
                                                            onClick={() =>
                                                                downloadFile(
                                                                    selectedFile.content ||
                                                                        '',
                                                                    selectedFile.path
                                                                        .split(
                                                                            '/',
                                                                        )
                                                                        .pop() ||
                                                                        'playbook.yml',
                                                                )
                                                            }
                                                        >
                                                            <Download className="h-3 w-3" />
                                                            Download
                                                        </Button>
                                                    </div>
                                                </div>
                                                <ScrollArea className="h-[600px] w-full rounded-md border">
                                                    <SyntaxHighlighter
                                                        language={
                                                            selectedFile.isTemplate
                                                                ? 'jinja2'
                                                                : 'yaml'
                                                        }
                                                        style={vscDarkPlus}
                                                        showLineNumbers
                                                        customStyle={{
                                                            margin: 0,
                                                            borderRadius: 0,
                                                            fontSize: '12px',
                                                        }}
                                                    >
                                                        {selectedFile.content}
                                                    </SyntaxHighlighter>
                                                </ScrollArea>
                                            </div>
                                        )}
                                </div>
                            ) : (
                                <div className="flex flex-col items-center justify-center py-12 text-center">
                                    <FileCode className="mb-4 h-12 w-12 text-muted-foreground" />
                                    <p className="text-muted-foreground">
                                        Select a playbook file from the tree to
                                        view its contents
                                    </p>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </div>

                {/* Upload Playbook Modal */}
                <UploadPlaybookModal
                    open={uploadModalOpen}
                    onClose={() => setUploadModalOpen(false)}
                    onSuccess={() => fetchTree()}
                    csrfToken={csrfToken}
                />
            </div>
        </AppLayout>
    );
}
