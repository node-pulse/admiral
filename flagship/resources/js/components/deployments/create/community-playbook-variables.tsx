import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { type PlaybookVariable } from '@/types/playbook';

interface PlaybookVariablesProps {
    variables: PlaybookVariable[];
    deploymentVariables: Record<string, string>;
    onVariableChange: (name: string, value: string) => void;
}

export function CommunityPlaybookVariables({
    variables,
    deploymentVariables,
    onVariableChange,
}: PlaybookVariablesProps) {
    return (
        <div className="grid gap-4 md:grid-cols-2">
            {variables.map((variable) => (
                <div key={variable.name} className="space-y-2">
                    <Label htmlFor={variable.name}>
                        {variable.label}
                        {variable.required && (
                            <span className="ml-1 text-destructive">*</span>
                        )}
                    </Label>
                    {variable.type === 'select' ? (
                        <Select
                            value={
                                deploymentVariables[variable.name] ??
                                String(variable.default ?? '')
                            }
                            onValueChange={(value) =>
                                onVariableChange(variable.name, value)
                            }
                        >
                            <SelectTrigger>
                                <SelectValue
                                    placeholder={`Select ${variable.label}`}
                                />
                            </SelectTrigger>
                            <SelectContent>
                                {variable.options?.map((opt: string) => (
                                    <SelectItem key={opt} value={opt}>
                                        {opt}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    ) : variable.type === 'boolean' ? (
                        <div className="flex items-center space-x-2">
                            <Checkbox
                                id={variable.name}
                                checked={
                                    deploymentVariables[variable.name] ===
                                    'true'
                                }
                                onCheckedChange={(checked) =>
                                    onVariableChange(
                                        variable.name,
                                        String(checked),
                                    )
                                }
                            />
                            <label htmlFor={variable.name} className="text-sm">
                                {variable.description}
                            </label>
                        </div>
                    ) : (
                        <Input
                            id={variable.name}
                            type={
                                variable.type === 'integer'
                                    ? 'number'
                                    : variable.type === 'password'
                                      ? 'password'
                                      : 'text'
                            }
                            placeholder={String(variable.default ?? '')}
                            value={
                                deploymentVariables[variable.name] ??
                                String(variable.default ?? '')
                            }
                            onChange={(e) =>
                                onVariableChange(variable.name, e.target.value)
                            }
                            min={variable.min}
                            max={variable.max}
                            required={variable.required}
                        />
                    )}
                    {variable.description && variable.type !== 'boolean' && (
                        <p className="text-sm text-muted-foreground">
                            {variable.description}
                        </p>
                    )}
                </div>
            ))}
        </div>
    );
}
