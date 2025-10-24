/* eslint-disable @typescript-eslint/no-unused-vars */
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { Terminal } from '@xterm/xterm';
import '@xterm/xterm/css/xterm.css';
import { CheckCircle, Loader2, WifiOff } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { ServerData } from '../../types/servers';

interface SSHTerminalProps {
    serverId: string;
    server?: ServerData;
    serverConnected: boolean;
    setServerConnected: (connected: boolean) => void;
    onConnectionChange?: (connected: boolean) => void;
}

export function SSHTerminal({
    serverId,
    server,
    onConnectionChange,
    serverConnected,
    setServerConnected,
}: SSHTerminalProps) {
    const terminalRef = useRef<HTMLDivElement>(null);
    const xtermRef = useRef<Terminal | null>(null);
    const wsRef = useRef<WebSocket | null>(null);
    const fitAddonRef = useRef<FitAddon | null>(null);

    const [errorType, setErrorType] = useState<
        'websocket' | 'auth' | 'network' | 'server' | null
    >(null);
    const [password, setPassword] = useState('');
    const [showPasswordPrompt, setShowPasswordPrompt] = useState(true);
    const [connecting, setConnecting] = useState(false);
    const [connectionStatus, setConnectionStatus] = useState<
        'disconnected' | 'connecting' | 'connected' | 'error'
    >('disconnected');

    useEffect(() => {
        if (!terminalRef.current) return;

        // Initialize xterm.js
        const terminal = new Terminal({
            cursorBlink: true,
            fontSize: 14,
            fontFamily: 'Menlo, Monaco, "Courier New", monospace',
            theme: {
                background: '#1e1e1e',
                foreground: '#d4d4d4',
                cursor: '#d4d4d4',
                black: '#000000',
                red: '#cd3131',
                green: '#0dbc79',
                yellow: '#e5e510',
                blue: '#2472c8',
                magenta: '#bc3fbc',
                cyan: '#11a8cd',
                white: '#e5e5e5',
                brightBlack: '#666666',
                brightRed: '#f14c4c',
                brightGreen: '#23d18b',
                brightYellow: '#f5f543',
                brightBlue: '#3b8eea',
                brightMagenta: '#d670d6',
                brightCyan: '#29b8db',
                brightWhite: '#e5e5e5',
            },
            rows: 30,
            cols: 80,
        });

        // Add addons
        const fitAddon = new FitAddon();
        terminal.loadAddon(fitAddon);
        terminal.loadAddon(new WebLinksAddon());

        // Open terminal
        terminal.open(terminalRef.current);

        xtermRef.current = terminal;
        fitAddonRef.current = fitAddon;

        // Fit terminal after a small delay to ensure DOM is ready
        setTimeout(() => {
            try {
                fitAddon.fit();
                terminal.focus(); // Focus the terminal so it can receive input
            } catch (e) {
                console.error('Failed to fit terminal:', e);
            }
        }, 100);

        // Show welcome message
        terminal.writeln('\x1b[1;32mNodePulse SSH Terminal\x1b[0m');
        terminal.writeln('WebSocket-based interactive terminal');
        terminal.writeln(
            'Supports: vim, nano, top, and all interactive programs\r\n',
        );

        // Set up input handler that uses the WebSocket ref
        const inputHandler = terminal.onData((data) => {
            const socket = wsRef.current;

            if (!socket) {
                return;
            }

            if (socket.readyState !== WebSocket.OPEN) {
                return;
            }

            const message = JSON.stringify({
                type: 'input',
                data: data,
            });

            try {
                socket.send(message);
            } catch (error) {
                console.error('[SSH Terminal] Error sending message:', error);
            }
        });

        console.log('[SSH Terminal] Input handler registered:', inputHandler);

        // Handle window resize
        const handleResize = () => {
            fitAddon.fit();
            if (wsRef.current?.readyState === WebSocket.OPEN) {
                wsRef.current.send(
                    JSON.stringify({
                        type: 'resize',
                        rows: terminal.rows,
                        cols: terminal.cols,
                    }),
                );
            }
        };

        window.addEventListener('resize', handleResize);

        // Cleanup
        return () => {
            window.removeEventListener('resize', handleResize);
            if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
                wsRef.current.close();
            }
            wsRef.current = null;
            xtermRef.current = null;
            fitAddonRef.current = null;
            terminal.dispose();
        };
    }, []);

    const connect = () => {
        if (!xtermRef.current) {
            console.error('[SSH Terminal] No terminal instance available');
            return;
        }

        setConnecting(true);
        setErrorType(null);
        setConnectionStatus('connecting');

        const terminal = xtermRef.current;
        console.log('[SSH Terminal] Using terminal instance:', terminal);
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
            wsRef.current.close();
        }
        terminal.writeln('\r\n\x1b[33mConnecting via WebSocket...\x1b[0m\r\n');

        // Connect to WebSocket server
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.hostname}:6001/ssh/${serverId}`;

        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
            terminal.writeln('\x1b[32m✓ WebSocket connected\x1b[0m\r\n');

            // Send authentication with server details
            const authMessage = {
                type: 'auth',
                host: server?.ssh_host,
                port: server?.ssh_port || 22,
                username: server?.ssh_username,
                password: password || undefined,
                rows: terminal.rows,
                cols: terminal.cols,
            };

            // Remove undefined values
            const cleanedMessage = Object.fromEntries(
                Object.entries(authMessage).filter(
                    ([_, value]) => value !== undefined,
                ),
            );

            ws.send(JSON.stringify(cleanedMessage));
        };

        ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);

                switch (data.type) {
                    case 'connected':
                        terminal.writeln(`\x1b[36m${data.message}\x1b[0m\r\n`);
                        break;

                    case 'auth_success':
                        terminal.writeln(
                            `\x1b[32m✓ ${data.message}\x1b[0m\r\n`,
                        );
                        setServerConnected(true);
                        setShowPasswordPrompt(false);
                        setConnecting(false);
                        setConnectionStatus('connected');
                        onConnectionChange?.(true);
                        terminal.focus(); // Focus terminal after successful auth

                        try {
                            ws.send(JSON.stringify({ type: 'ping' }));
                        } catch (error) {
                            console.error(
                                '[SSH Terminal] Failed to send ping after auth:',
                                error,
                            );
                        }
                        break;

                    case 'output':
                        console.log(
                            '[SSH Terminal] Received output:',
                            data.data,
                            'Length:',
                            data.data.length,
                        );
                        terminal.write(data.data);
                        console.log(
                            '[SSH Terminal] Output written to terminal',
                        );
                        break;

                    case 'error': {
                        terminal.writeln(
                            `\r\n\x1b[31m✗ Error: ${data.message}\x1b[0m\r\n`,
                        );

                        const { helpMessage, errorType } = getErrorDetails(
                            data.message,
                        );

                        toast.error('SSH Connection Failed', {
                            description: `${data.message}\n\n${helpMessage}`,
                            duration: 6000,
                        });

                        setErrorType(errorType);
                        setConnectionStatus('error');
                        setConnecting(false);
                        break;
                    }

                    case 'disconnected':
                        terminal.writeln(
                            `\r\n\x1b[33m${data.message}\x1b[0m\r\n`,
                        );
                        setServerConnected(false);
                        setConnectionStatus('disconnected');
                        onConnectionChange?.(false);
                        break;
                }
            } catch (e) {
                console.error('Failed to parse WebSocket message:', e);
            }
        };

        ws.onerror = () => {
            terminal.writeln(
                '\r\n\x1b[31m✗ WebSocket connection error\x1b[0m\r\n',
            );

            const errorMsg =
                'Failed to establish WebSocket connection to SSH service.';
            const helpMsg =
                'The SSH WebSocket service (submarines-sshws) may not be running. Contact your administrator.';

            toast.error('WebSocket Connection Failed', {
                description: `${errorMsg}\n\n${helpMsg}`,
                duration: 6000,
            });

            setErrorType('websocket');
            setConnectionStatus('error');
            setConnecting(false);
            onConnectionChange?.(false);
        };

        ws.onclose = (event) => {
            const wasConnected = connectionStatus === 'connected';
            terminal.writeln('\r\n\x1b[33m✗ Connection closed\x1b[0m\r\n');

            if (wasConnected) {
                // Connection was established and then closed
                terminal.writeln(
                    '\x1b[33mYour SSH session has ended.\x1b[0m\r\n',
                );
                terminal.writeln(
                    '\x1b[90mClick "Reconnect" below to start a new session.\x1b[0m\r\n',
                );
            }

            setServerConnected(false);
            setConnectionStatus('disconnected');
            setConnecting(false);
            onConnectionChange?.(false);
        };
    };

    const getErrorDetails = (
        errorMessage: string,
    ): {
        helpMessage: string;
        errorType: 'websocket' | 'auth' | 'network' | 'server';
    } => {
        if (
            errorMessage.includes('authentication') ||
            errorMessage.includes('password') ||
            errorMessage.includes('key')
        ) {
            return {
                helpMessage:
                    'Check that your SSH key is correct or try entering the password.',
                errorType: 'auth',
            };
        }

        if (
            errorMessage.includes('network') ||
            errorMessage.includes('timeout') ||
            errorMessage.includes('unreachable')
        ) {
            return {
                helpMessage:
                    'Check that the server is reachable and the SSH port is accessible.',
                errorType: 'network',
            };
        }

        if (
            errorMessage.includes('fingerprint') ||
            errorMessage.includes('MITM')
        ) {
            return {
                helpMessage:
                    'SSH host key verification failed. The server may have been rebuilt or compromised.',
                errorType: 'server',
            };
        }

        return {
            helpMessage:
                'Please verify your connection settings and try again.',
            errorType: 'server',
        };
    };

    const getStatusBadge = () => {
        switch (connectionStatus) {
            case 'disconnected':
                return (
                    <Badge variant="secondary" className="flex w-fit gap-1.5">
                        <WifiOff className="h-3 w-3" />
                        Disconnected
                    </Badge>
                );
            case 'connecting':
                return (
                    <Badge variant="secondary" className="flex w-fit gap-1.5">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        Connecting...
                    </Badge>
                );
            case 'connected':
                return (
                    <Badge
                        variant="default"
                        className="flex w-fit gap-1.5 bg-green-600"
                    >
                        <CheckCircle className="h-3 w-3" />
                        Connected
                    </Badge>
                );
            case 'error':
                return (
                    <Badge variant="destructive" className="flex w-fit gap-1.5">
                        <WifiOff className="h-3 w-3" />
                        Connection Failed
                    </Badge>
                );
        }
    };

    return (
        <div className="flex flex-col gap-2">
            {/* Connection Status Indicator */}
            <div className="flex items-center justify-between rounded-lg border bg-muted/30 p-3">
                <div className="flex items-center gap-3">
                    {getStatusBadge()}
                    {server && (
                        <>
                            <span className="text-sm text-muted-foreground">
                                {server.ssh_username}@{server.ssh_host}:
                                {server.ssh_port || 22}
                            </span>
                            <span className="text-sm text-muted-foreground">
                                -
                            </span>

                            <span className="text-sm text-muted-foreground">
                                {server.id}
                            </span>
                        </>
                    )}
                </div>
            </div>

            {showPasswordPrompt && (
                <div className="space-y-4 rounded-lg border bg-muted/50 p-4">
                    <div className="space-y-2">
                        <Label htmlFor="password">
                            SSH Password (optional)
                        </Label>
                        <Input
                            id="password"
                            type="password"
                            placeholder="Leave empty to use SSH key"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                    connect();
                                }
                            }}
                        />
                        <p className="text-sm text-muted-foreground">
                            If the server has an SSH key configured, leave this
                            empty. Otherwise, enter the password for SSH
                            authentication.
                        </p>
                    </div>
                    <Button
                        onClick={connect}
                        disabled={connecting}
                        className="w-full"
                    >
                        {connecting
                            ? 'Connecting...'
                            : 'Connect to SSH Terminal'}
                    </Button>
                </div>
            )}

            <div
                ref={terminalRef}
                className="overflow-hidden rounded-lg border border-gray-700"
                style={{ height: '600px' }}
            />

            {!serverConnected && !showPasswordPrompt && (
                <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950/30">
                    <p className="text-sm font-medium text-amber-900 dark:text-amber-100">
                        Connection closed
                    </p>
                    <p className="text-sm text-amber-700 dark:text-amber-300">
                        Your SSH session has ended. Click the button below to
                        start a new session.
                    </p>
                    <Button
                        onClick={() => {
                            setShowPasswordPrompt(true);
                            setErrorType(null);
                            setConnectionStatus('disconnected');
                        }}
                        className="w-full"
                        variant="default"
                    >
                        Reconnect to Server
                    </Button>
                </div>
            )}
        </div>
    );
}
