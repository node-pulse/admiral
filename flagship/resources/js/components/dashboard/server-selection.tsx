import { ServerSelector } from '@/components/servers/server-selector';
import { ServerCog } from 'lucide-react';

interface ServerSelectionTranslations {
    select_server: string;
    viewing_metrics: string;
    server: string;
    servers: string;
}

interface ServerSelectionProps {
    selectedServers: string[];
    onSelectionChange: (servers: string[]) => void;
    translations: ServerSelectionTranslations;
}

export function ServerSelection({
    selectedServers,
    onSelectionChange,
    translations,
}: ServerSelectionProps) {
    return (
        <div className="flex flex-col gap-2">
            <div className="flex items-center gap-4">
                <ServerCog className="size-5 text-muted-foreground" />
                <div className="flex-1">
                    <ServerSelector
                        selectedServers={selectedServers}
                        onSelectionChange={onSelectionChange}
                        multiSelect={true}
                        placeholder={translations.select_server}
                    />
                </div>
            </div>
            {selectedServers.length > 0 && (
                <div className="text-sm text-muted-foreground">
                    {translations.viewing_metrics
                        .replace(':count', selectedServers.length.toString())
                        .replace(
                            ':type',
                            selectedServers.length === 1
                                ? translations.server
                                : translations.servers,
                        )}
                </div>
            )}
        </div>
    );
}
