import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Upload } from 'lucide-react';
import { useRef } from 'react';
import { toast } from 'sonner';

interface VariableFileUploaderProps {
    onVariablesExtracted: (variables: Record<string, string>) => void;
}

export function VariableFileUploader({
    onVariablesExtracted,
}: VariableFileUploaderProps) {
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFileClick = () => {
        fileInputRef.current?.click();
    };

    const parseEnvFile = (content: string): Record<string, string> => {
        const variables: Record<string, string> = {};
        const lines = content.split('\n');

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
                variables[key.toLowerCase()] = cleanValue;
            }
        }

        return variables;
    };

    const parseJsonFile = (content: string): Record<string, string> => {
        const json = JSON.parse(content);
        const variables: Record<string, string> = {};

        // Flatten nested objects
        const flatten = (obj: any, prefix = ''): void => {
            for (const [key, value] of Object.entries(obj)) {
                const fullKey = prefix ? `${prefix}_${key}` : key;

                if (
                    typeof value === 'object' &&
                    value !== null &&
                    !Array.isArray(value)
                ) {
                    flatten(value, fullKey);
                } else {
                    variables[fullKey.toLowerCase()] = String(value);
                }
            }
        };

        flatten(json);
        return variables;
    };

    const parseYamlFile = (content: string): Record<string, string> => {
        const variables: Record<string, string> = {};
        const lines = content.split('\n');

        for (const line of lines) {
            const trimmed = line.trim();

            // Skip comments and empty lines
            if (!trimmed || trimmed.startsWith('#')) {
                continue;
            }

            // Parse simple YAML key: value format (doesn't support complex nested structures)
            const match = trimmed.match(
                /^([A-Za-z_][A-Za-z0-9_]*)\s*:\s*(.*)$/,
            );
            if (match) {
                const [, key, value] = match;
                // Remove quotes if present
                const cleanValue = value.replace(/^["']|["']$/g, '').trim();
                if (cleanValue && cleanValue !== '{}' && cleanValue !== '[]') {
                    variables[key.toLowerCase()] = cleanValue;
                }
            }
        }

        return variables;
    };

    const handleFileChange = async (
        event: React.ChangeEvent<HTMLInputElement>,
    ) => {
        const file = event.target.files?.[0];
        if (!file) return;

        const fileName = file.name.toLowerCase();
        const isEnv = fileName.endsWith('.env') || fileName === '.env';
        const isJson = fileName.endsWith('.json');
        const isYaml = fileName.endsWith('.yml') || fileName.endsWith('.yaml');

        if (!isEnv && !isJson && !isYaml) {
            toast.error('Please upload a .env, .json, .yml, or .yaml file');
            return;
        }

        try {
            const content = await file.text();
            let extractedVariables: Record<string, string> = {};

            if (isEnv) {
                extractedVariables = parseEnvFile(content);
            } else if (isJson) {
                extractedVariables = parseJsonFile(content);
            } else if (isYaml) {
                extractedVariables = parseYamlFile(content);
            }

            const count = Object.keys(extractedVariables).length;
            if (count === 0) {
                toast.warning('No variables found in the file');
                return;
            }

            onVariablesExtracted(extractedVariables);
            toast.success(
                `Extracted ${count} variable${count > 1 ? 's' : ''} from file`,
            );
        } catch (error) {
            console.error('Error parsing file:', error);
            toast.error(
                error instanceof Error ? error.message : 'Failed to parse file',
            );
        } finally {
            // Reset file input
            if (fileInputRef.current) {
                fileInputRef.current.value = '';
            }
        }
    };

    return (
        <>
            <Input
                ref={fileInputRef}
                type="file"
                accept=".env,.json,.yml,.yaml"
                onChange={handleFileChange}
                className="hidden"
            />
            <Button
                type="button"
                variant="default"
                size="sm"
                onClick={handleFileClick}
            >
                <Upload className="mr-2 h-4 w-4" />
                Upload Variables (.env, .json, .yml, .yaml)
            </Button>
        </>
    );
}
