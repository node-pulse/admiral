import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
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
import { AlertCircle, CheckCircle, FileCode, FolderPlus, Loader2, Upload, X } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';

interface UploadPlaybookModalProps {
    open: boolean;
    onClose: () => void;
    onSuccess: () => void;
    csrfToken: string;
    directories?: string[]; // List of available directories
}

interface ValidationResult {
    valid: boolean;
    warnings?: string[];
    errors?: string[];
}

export function UploadPlaybookModal({
    open,
    onClose,
    onSuccess,
    csrfToken,
    directories: initialDirectories = ['custom'],
}: UploadPlaybookModalProps) {
    const [file, setFile] = useState<File | null>(null);
    const [customName, setCustomName] = useState('');
    const [uploading, setUploading] = useState(false);
    const [dragActive, setDragActive] = useState(false);
    const [validation, setValidation] = useState<ValidationResult | null>(null);
    const [selectedDirectory, setSelectedDirectory] = useState('custom');
    const [newFolderName, setNewFolderName] = useState('');
    const [creatingFolder, setCreatingFolder] = useState(false);
    const [showNewFolder, setShowNewFolder] = useState(false);
    const [directories, setDirectories] = useState<string[]>(initialDirectories);

    const resetForm = () => {
        setFile(null);
        setCustomName('');
        setValidation(null);
        setDragActive(false);
        setSelectedDirectory('custom');
        setNewFolderName('');
        setShowNewFolder(false);
    };

    useEffect(() => {
        if (open) {
            setSelectedDirectory('custom');
            fetchDirectories();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    const fetchDirectories = async () => {
        try {
            const response = await fetch('/api/fleetops/ansible-playbooks/list', {
                headers: {
                    'X-CSRF-TOKEN': csrfToken,
                },
            });

            if (!response.ok) {
                return;
            }

            const data = await response.json();

            // Extract all custom directories from the tree
            const customDirs: string[] = ['custom'];
            const extractDirs = (nodes: any[], parentPath: string = '') => {
                nodes.forEach(node => {
                    if (node.type === 'directory') {
                        const fullPath = parentPath ? `${parentPath}/${node.name}` : node.name;

                        // Only include directories under 'custom'
                        if (fullPath.startsWith('custom/') || fullPath === 'custom') {
                            customDirs.push(fullPath);
                        }

                        if (node.children) {
                            extractDirs(node.children, fullPath);
                        }
                    }
                });
            };

            extractDirs(data.tree || []);
            setDirectories([...new Set(customDirs)].sort());
        } catch (error) {
            console.error('Failed to fetch directories:', error);
        }
    };

    const handleClose = () => {
        if (!uploading) {
            resetForm();
            onClose();
        }
    };

    const handleDrag = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.type === 'dragenter' || e.type === 'dragover') {
            setDragActive(true);
        } else if (e.type === 'dragleave') {
            setDragActive(false);
        }
    }, []);

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setDragActive(false);

        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            handleFileSelect(e.dataTransfer.files[0]);
        }
    }, []);

    const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            handleFileSelect(e.target.files[0]);
        }
    };

    const handleFileSelect = (selectedFile: File) => {
        // Validate file size (100MB max)
        const maxSize = 100 * 1024 * 1024; // 100MB
        if (selectedFile.size > maxSize) {
            toast.error('File too large. Maximum size is 100MB.');
            return;
        }

        setFile(selectedFile);

        // Auto-fill name from filename (for ZIP files)
        if (selectedFile.name.endsWith('.zip')) {
            const name = selectedFile.name.replace(/\.zip$/i, '');
            setCustomName(name);
        }

        // Reset validation
        setValidation(null);
    };

    const handleCreateFolder = async () => {
        if (!newFolderName.trim()) {
            toast.error('Please enter a folder name');
            return;
        }

        try {
            setCreatingFolder(true);

            const response = await fetch('/api/custom-playbooks/create-directory', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRF-TOKEN': csrfToken,
                },
                body: JSON.stringify({
                    path: selectedDirectory,
                    name: newFolderName,
                }),
            });

            const data = await response.json();

            if (!response.ok) {
                toast.error(data.message || 'Failed to create folder');
                return;
            }

            toast.success('Folder created successfully');
            setSelectedDirectory(data.directory.path);
            setNewFolderName('');
            setShowNewFolder(false);
            onSuccess(); // Refresh tree
            fetchDirectories(); // Refresh directory list
        } catch (error) {
            console.error('Create folder error:', error);
            toast.error('Failed to create folder');
        } finally {
            setCreatingFolder(false);
        }
    };

    const handleUpload = async () => {
        if (!file) {
            toast.error('Please select a file');
            return;
        }

        try {
            setUploading(true);

            const formData = new FormData();
            formData.append('file', file);

            // Determine which endpoint to use based on file type
            const isZip = file.name.endsWith('.zip');
            const endpoint = isZip
                ? '/api/custom-playbooks/upload'
                : '/api/custom-playbooks/upload-to-directory';

            if (isZip && customName) {
                formData.append('name', customName);
            } else if (!isZip) {
                formData.append('path', selectedDirectory);
            }

            const response = await fetch(endpoint, {
                method: 'POST',
                headers: {
                    'X-CSRF-TOKEN': csrfToken,
                },
                body: formData,
            });

            const data = await response.json();

            if (!response.ok) {
                if (data.errors) {
                    // Validation errors
                    setValidation({
                        valid: false,
                        errors: Array.isArray(data.errors)
                            ? data.errors
                            : Object.values(data.errors).flat() as string[],
                    });
                    toast.error(data.message || 'Validation failed');
                } else {
                    throw new Error(data.message || 'Upload failed');
                }
                return;
            }

            // Success
            setValidation(data.validation || { valid: true, warnings: [] });
            toast.success(data.message || 'File uploaded successfully');

            // Close modal and refresh
            setTimeout(() => {
                resetForm();
                onSuccess();
                onClose();
            }, 500);
        } catch (error) {
            console.error('Upload error:', error);
            toast.error(error instanceof Error ? error.message : 'Upload failed');
        } finally {
            setUploading(false);
        }
    };

    const formatFileSize = (bytes: number): string => {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    };

    return (
        <Dialog open={open} onOpenChange={handleClose}>
            <DialogContent className="sm:max-w-[600px]">
                <DialogHeader>
                    <DialogTitle>Upload to Custom Playbooks</DialogTitle>
                    <DialogDescription>
                        Upload files to the custom playbooks directory. ZIP packages must include a manifest.json file.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-4">
                    {/* File Upload Area */}
                    <div>
                        <Label>Playbook File</Label>
                        <div
                            className={`mt-2 flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-8 transition-colors ${
                                dragActive
                                    ? 'border-primary bg-primary/5'
                                    : 'border-gray-300 hover:border-gray-400'
                            }`}
                            onDragEnter={handleDrag}
                            onDragLeave={handleDrag}
                            onDragOver={handleDrag}
                            onDrop={handleDrop}
                        >
                            {!file ? (
                                <>
                                    <Upload className="mb-3 h-10 w-10 text-gray-400" />
                                    <p className="mb-2 text-sm text-gray-600">
                                        <span className="font-semibold">
                                            Click to upload
                                        </span>{' '}
                                        or drag and drop
                                    </p>
                                    <p className="text-xs text-gray-500">
                                        Any file type supported (max 100MB)
                                    </p>
                                    <input
                                        type="file"
                                        onChange={handleFileInput}
                                        className="hidden"
                                        id="file-upload"
                                    />
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        className="mt-4"
                                        onClick={() => document.getElementById('file-upload')?.click()}
                                    >
                                        Select File
                                    </Button>
                                </>
                            ) : (
                                <div className="flex w-full items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <FileCode className="h-8 w-8 text-amber-500" />
                                        <div>
                                            <p className="text-sm font-medium">
                                                {file.name}
                                            </p>
                                            <p className="text-xs text-gray-500">
                                                {formatFileSize(file.size)}
                                            </p>
                                        </div>
                                    </div>
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => {
                                            setFile(null);
                                            setCustomName('');
                                            setValidation(null);
                                        }}
                                    >
                                        <X className="h-4 w-4" />
                                    </Button>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Directory Selection */}
                    <div>
                        <Label htmlFor="directory">Upload Destination</Label>
                        <Select value={selectedDirectory} onValueChange={setSelectedDirectory}>
                            <SelectTrigger className="mt-2">
                                <SelectValue placeholder="Select directory" />
                            </SelectTrigger>
                            <SelectContent>
                                {directories.map((dir) => (
                                    <SelectItem key={dir} value={dir}>
                                        {dir.replace('custom', 'Custom Playbooks')}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    {/* New Folder Creation */}
                    <div>
                        {!showNewFolder ? (
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => setShowNewFolder(true)}
                                className="w-full"
                            >
                                <FolderPlus className="mr-2 h-4 w-4" />
                                Create New Folder
                            </Button>
                        ) : (
                            <div className="space-y-2">
                                <Label htmlFor="new-folder">New Folder Name</Label>
                                <div className="flex gap-2">
                                    <Input
                                        id="new-folder"
                                        value={newFolderName}
                                        onChange={(e) => setNewFolderName(e.target.value)}
                                        placeholder="my-playbooks"
                                        disabled={creatingFolder}
                                    />
                                    <Button
                                        type="button"
                                        onClick={handleCreateFolder}
                                        disabled={!newFolderName.trim() || creatingFolder}
                                        size="sm"
                                    >
                                        {creatingFolder ? (
                                            <Loader2 className="h-4 w-4 animate-spin" />
                                        ) : (
                                            'Create'
                                        )}
                                    </Button>
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => {
                                            setShowNewFolder(false);
                                            setNewFolderName('');
                                        }}
                                        disabled={creatingFolder}
                                    >
                                        <X className="h-4 w-4" />
                                    </Button>
                                </div>
                                <p className="text-xs text-gray-500">
                                    Folder will be created in: {selectedDirectory.replace('custom', 'Custom Playbooks')}
                                </p>
                            </div>
                        )}
                    </div>

                    {/* Optional Name Override (only for ZIP files) */}
                    {file && file.name.endsWith('.zip') && (
                        <div>
                            <Label htmlFor="custom-name">
                                Name (optional, auto-filled from filename)
                            </Label>
                            <Input
                                id="custom-name"
                                value={customName}
                                onChange={(e) => setCustomName(e.target.value)}
                                placeholder="my-playbook"
                                className="mt-2"
                            />
                            <p className="mt-1 text-xs text-gray-500">
                                Special characters will be converted to hyphens
                            </p>
                        </div>
                    )}

                    {/* Validation Result */}
                    {validation && (
                        <div
                            className={`rounded-lg border p-4 ${
                                validation.valid
                                    ? 'border-green-200 bg-green-50'
                                    : 'border-red-200 bg-red-50'
                            }`}
                        >
                            <div className="flex items-start gap-3">
                                {validation.valid ? (
                                    <CheckCircle className="h-5 w-5 shrink-0 text-green-600" />
                                ) : (
                                    <AlertCircle className="h-5 w-5 shrink-0 text-red-600" />
                                )}
                                <div className="flex-1">
                                    <h4
                                        className={`text-sm font-semibold ${
                                            validation.valid
                                                ? 'text-green-900'
                                                : 'text-red-900'
                                        }`}
                                    >
                                        {validation.valid
                                            ? 'Validation Passed'
                                            : 'Validation Failed'}
                                    </h4>
                                    {validation.errors &&
                                        validation.errors.length > 0 && (
                                            <ul className="mt-2 list-inside list-disc space-y-1 text-sm text-red-800">
                                                {validation.errors.map((error, i) => (
                                                    <li key={i}>{error}</li>
                                                ))}
                                            </ul>
                                        )}
                                    {validation.warnings &&
                                        validation.warnings.length > 0 && (
                                            <div className="mt-2">
                                                <p className="text-xs font-medium text-amber-700">
                                                    Warnings:
                                                </p>
                                                <ul className="mt-1 list-inside list-disc space-y-1 text-xs text-amber-800">
                                                    {validation.warnings.map(
                                                        (warning, i) => (
                                                            <li key={i}>{warning}</li>
                                                        ),
                                                    )}
                                                </ul>
                                            </div>
                                        )}
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Actions */}
                <div className="flex justify-end gap-3">
                    <Button
                        type="button"
                        variant="outline"
                        onClick={handleClose}
                        disabled={uploading}
                    >
                        Cancel
                    </Button>
                    <Button
                        type="button"
                        onClick={handleUpload}
                        disabled={!file || uploading}
                    >
                        {uploading ? (
                            <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Uploading...
                            </>
                        ) : (
                            <>
                                <Upload className="mr-2 h-4 w-4" />
                                Upload
                            </>
                        )}
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
