import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { Terminal } from '@xterm/xterm';
import '@xterm/xterm/css/xterm.css';
import { AlertCircle } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
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

    const [error, setError] = useState<string | null>(null);
    const [password, setPassword] = useState('');
    const [showPasswordPrompt, setShowPasswordPrompt] = useState(true);
    const [connecting, setConnecting] = useState(false);

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
        setError(null);

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
                privateKey: server?.primary_private_key?.private_key_content,
                password: password || undefined,
                rows: terminal.rows,
                cols: terminal.cols,
            };

            // Remove undefined values
            Object.keys(authMessage).forEach((key) => {
                if (authMessage[key] === undefined) {
                    delete authMessage[key];
                }
            });

            ws.send(JSON.stringify(authMessage));
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
                        onConnectionChange?.(true);
                        terminal.focus(); // Focus terminal after successful auth
                        // Clear the terminal and prepare for fresh output
                        terminal.clear();

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

                    case 'error':
                        terminal.writeln(
                            `\r\n\x1b[31m✗ Error: ${data.message}\x1b[0m\r\n`,
                        );
                        setError(data.message);
                        setConnecting(false);
                        break;

                    case 'disconnected':
                        terminal.writeln(
                            `\r\n\x1b[33m${data.message}\x1b[0m\r\n`,
                        );
                        setServerConnected(false);
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
            setError('WebSocket connection failed. Is the SSH server running?');
            setConnecting(false);
            onConnectionChange?.(false);
        };

        ws.onclose = () => {
            terminal.writeln(
                '\r\n\x1b[33m✗ WebSocket connection closed\x1b[0m\r\n',
            );
            setServerConnected(false);
            setConnecting(false);
            onConnectionChange?.(false);
        };
    };

    return (
        <div className="flex flex-col gap-2">
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

            {error && !serverConnected && (
                <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>
                        {error}
                        <Button
                            variant="outline"
                            size="sm"
                            className="ml-4"
                            onClick={() => {
                                setError(null);
                                setShowPasswordPrompt(true);
                            }}
                        >
                            Try Again
                        </Button>
                    </AlertDescription>
                </Alert>
            )}

            <div
                ref={terminalRef}
                className="overflow-hidden rounded-lg border border-gray-700"
                style={{ height: '600px' }}
            />

            {!serverConnected && !showPasswordPrompt && (
                <div className="text-center">
                    <Button
                        variant="outline"
                        onClick={() => {
                            setShowPasswordPrompt(true);
                            setError(null);
                        }}
                    >
                        Reconnect
                    </Button>
                </div>
            )}
        </div>
    );
}
