import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { LeanServerData } from '@/types/servers';

type Props = {
    selectedServers: Set<string>;
    toggleServerSelection: (serverId: string) => void;
    toggleSelectAll: () => void;
    filteredServers: Array<LeanServerData>;
};

export const ServerSelectionTable = (props: Props) => {
    const {
        selectedServers,
        toggleServerSelection,
        toggleSelectAll,
        filteredServers,
    } = props;
    return (
        <Table>
            <TableHeader>
                <TableRow>
                    <TableHead className="w-12">
                        <Checkbox
                            checked={
                                selectedServers.size === filteredServers.length
                            }
                            onCheckedChange={toggleSelectAll}
                        />
                    </TableHead>
                    <TableHead>Server</TableHead>
                    <TableHead>SSH Host</TableHead>
                    <TableHead>OS</TableHead>
                    <TableHead>Architecture</TableHead>
                </TableRow>
            </TableHeader>
            <TableBody>
                {filteredServers.map((server) => (
                    <TableRow key={server.id}>
                        <TableCell>
                            <Checkbox
                                checked={selectedServers.has(server.id)}
                                onCheckedChange={() =>
                                    toggleServerSelection(server.id)
                                }
                            />
                        </TableCell>
                        <TableCell>
                            <div>
                                <div className="font-medium">
                                    {server.display_name}
                                </div>
                                <div className="text-sm text-muted-foreground">
                                    {server.hostname}
                                </div>
                            </div>
                        </TableCell>
                        <TableCell>
                            <code className="text-sm">
                                {server.ssh_username}@{server.ssh_host}
                            </code>
                        </TableCell>
                        <TableCell>
                            {server.distro ? (
                                <Badge variant="outline">{server.distro}</Badge>
                            ) : (
                                <span className="text-muted-foreground">
                                    Unknown
                                </span>
                            )}
                        </TableCell>
                        <TableCell>
                            {server.architecture ? (
                                <Badge variant="secondary">
                                    {server.architecture}
                                </Badge>
                            ) : (
                                <span className="text-muted-foreground">
                                    Unknown
                                </span>
                            )}
                        </TableCell>
                    </TableRow>
                ))}
            </TableBody>
        </Table>
    );
};
