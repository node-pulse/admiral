export interface ServerData {
    id: string;
    hostname: string;
    name: string | null;
    display_name: string;
    description: string | null;
    ssh_host: string | null;
    ssh_port: number;
    ssh_username: string;
    has_ssh_key: boolean;
    ssh_key_name: string | null;
    is_reachable: boolean;
    status: string;
    is_online: boolean;
    last_seen_at: string | null;
    distro: string | null;
    architecture: string | null;
    cpu_cores: number | null;
}

export type LeanServerData = Pick<
    ServerData,
    | 'id'
    | 'hostname'
    | 'name'
    | 'display_name'
    | 'ssh_host'
    | 'ssh_username'
    | 'distro'
    | 'architecture'
>;

export interface ServersResponse {
    servers: {
        data: ServerData[];
    };
    meta: {
        current_page: number;
        per_page: number;
        total: number;
        last_page: number;
    };
}

export interface PrivateKeyData {
    id: number;
    name: string;
    fingerprint: string;
}
