import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Edit } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

interface BulkEditVariablesDialogProps {
    variables: Record<string, string>;
    onSave: (variables: Record<string, string>) => void;
}

export function BulkEditVariablesDialog({
    variables,
    onSave,
}: BulkEditVariablesDialogProps) {
    const [open, setOpen] = useState(false);
    const [textContent, setTextContent] = useState('');

    // Convert variables object to .env format
    const variablesToText = (vars: Record<string, string>): string => {
        return Object.entries(vars)
            .map(([key, value]) => {
                // Add quotes if value contains spaces or special characters
                const needsQuotes = /[\s#]/.test(value);
                const quotedValue = needsQuotes ? `"${value}"` : value;
                return `${key}=${quotedValue}`;
            })
            .join('\n');
    };

    // Parse .env format text back to variables object
    const textToVariables = (text: string): Record<string, string> => {
        const vars: Record<string, string> = {};
        const lines = text.split('\n');

        for (const line of lines) {
            const trimmed = line.trim();

            // Skip comments and empty lines
            if (!trimmed || trimmed.startsWith('#')) {
                continue;
            }

            // Parse KEY=VALUE format
            const match = trimmed.match(
                /^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/,
            );
            if (match) {
                const [, key, value] = match;
                // Remove quotes if present
                const cleanValue = value.replace(/^["']|["']$/g, '').trim();
                vars[key] = cleanValue;
            }
        }

        return vars;
    };

    const handleOpenChange = (newOpen: boolean) => {
        setOpen(newOpen);
        // Load current variables when opening the dialog
        if (newOpen) {
            setTextContent(variablesToText(variables));
        }
    };

    const handleSave = () => {
        try {
            const parsedVariables = textToVariables(textContent);
            const count = Object.keys(parsedVariables).length;

            if (count === 0) {
                toast.warning('No valid variables found');
                return;
            }

            onSave(parsedVariables);
            setOpen(false);
            toast.success(`Updated ${count} variable${count > 1 ? 's' : ''}`);
        } catch (error) {
            console.error('Error parsing variables:', error);
            toast.error('Failed to parse variables');
        }
    };

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogTrigger asChild>
                <Button type="button" variant="default" size="sm">
                    <Edit className="mr-2 h-4 w-4" />
                    Bulk Edit
                </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
                <DialogHeader>
                    <DialogTitle>Bulk Edit Variables</DialogTitle>
                    <DialogDescription>
                        Edit all variables in .env format. Use KEY=VALUE format,
                        one per line. Comments start with #.
                    </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                    <Textarea
                        value={textContent}
                        onChange={(e) => setTextContent(e.target.value)}
                        placeholder="DB_HOST=localhost&#10;DB_PORT=5432&#10;# This is a comment&#10;API_KEY=your_key_here"
                        className="min-h-[400px] font-mono text-sm"
                    />
                    <p className="text-sm text-muted-foreground">
                        Tip: You can add comments using # at the start of a line
                    </p>
                </div>
                <DialogFooter>
                    <Button
                        type="button"
                        variant="outline"
                        onClick={() => setOpen(false)}
                    >
                        Cancel
                    </Button>
                    <Button type="button" onClick={handleSave}>
                        Save Changes
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
