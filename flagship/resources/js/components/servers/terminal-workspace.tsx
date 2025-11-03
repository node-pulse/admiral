import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import {
    Activity,
    Maximize2,
    Minimize2,
    PanelRightClose,
    PanelRightOpen,
    Terminal,
    X,
    XCircle,
} from 'lucide-react';
import { useEffect, useRef } from 'react';
import { QuickConnectBar } from './quick-connect-bar';
import { SSHTerminal } from './ssh-terminal';
import { useTerminalWorkspace } from './terminal-workspace-context';

interface TerminalWorkspaceProps {
    isOpen: boolean;
    visible: boolean;
    onClose: () => void;
    onMinimize: () => void;
}

export function TerminalWorkspace({
    isOpen,
    visible,
    onClose,
    onMinimize,
}: TerminalWorkspaceProps) {
    const {
        sessions,
        activeSessionId,
        sidebarOpen,
        pipSessionId,
        closeSession,
        setActiveSession,
        toggleSidebar,
        setPipSession,
        nextSession,
        previousSession,
        switchToSession,
        updateSessionStatus,
    } = useTerminalWorkspace();

    const workspaceRef = useRef<HTMLDivElement>(null);

    // Keyboard shortcuts
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // Only handle shortcuts when workspace is open and visible
            if (!isOpen || !visible) return;

            // Cmd/Ctrl + number to switch tabs
            if ((e.metaKey || e.ctrlKey) && e.key >= '1' && e.key <= '9') {
                e.preventDefault();
                const index = parseInt(e.key) - 1;
                switchToSession(index);
            }

            // Cmd/Ctrl + [ or ] to navigate tabs
            if (e.metaKey || e.ctrlKey) {
                if (e.key === '[') {
                    e.preventDefault();
                    previousSession();
                } else if (e.key === ']') {
                    e.preventDefault();
                    nextSession();
                }
            }

            // Cmd/Ctrl + \ to toggle sidebar
            if ((e.metaKey || e.ctrlKey) && e.key === '\\') {
                e.preventDefault();
                toggleSidebar();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [
        isOpen,
        visible,
        nextSession,
        previousSession,
        switchToSession,
        toggleSidebar,
    ]);

    // Handle closing workspace
    const handleClose = () => {
        if (sessions.some((s) => s.isConnected)) {
            const shouldClose = window.confirm(
                `You have ${sessions.filter((s) => s.isConnected).length} active SSH connection(s). Are you sure you want to close all terminals?`,
            );
            if (!shouldClose) return;
        }

        // Close all sessions
        sessions.forEach((session) => {
            closeSession(session.id);
        });

        onClose();
    };

    const pipSession = sessions.find((s) => s.id === pipSessionId);

    if (!isOpen) return null;

    return (
        <>
            {/* Main Workspace */}
            <div
                ref={workspaceRef}
                className={cn(
                    'fixed inset-0 z-50 flex flex-col bg-background',
                    !visible && 'hidden',
                )}
            >
                {/* Top Bar */}
                <div className="flex items-center justify-between border-b bg-muted/50 px-2 py-1">
                    {/* Quick Connect Bar - Replaces redundant session tabs */}
                    <QuickConnectBar className="flex-1" />

                    {/* Workspace Controls */}
                    <div className="flex items-center gap-2">
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={toggleSidebar}
                            title={
                                sidebarOpen
                                    ? 'Hide sidebar (⌘\\)'
                                    : 'Show sidebar (⌘\\)'
                            }
                            className="h-8 w-8"
                        >
                            {sidebarOpen ? (
                                <PanelRightClose className="h-4 w-4" />
                            ) : (
                                <PanelRightOpen className="h-4 w-4" />
                            )}
                        </Button>
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={onMinimize}
                            title="Minimize workspace (keeps connections alive)"
                            className="h-8 w-8"
                        >
                            <Minimize2 className="h-4 w-4" />
                        </Button>
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={handleClose}
                            title="Close workspace"
                            className="h-8 w-8 hover:text-destructive"
                        >
                            <XCircle className="h-4 w-4" />
                        </Button>
                    </div>
                </div>

                {/* Main Content Area */}
                <div className="flex flex-1 overflow-hidden">
                    {/* Sidebar */}
                    {sidebarOpen && (
                        <div className="flex w-80 flex-col border-r border-l border-slate-400/50 bg-muted/30">
                            <div className="border-b p-3">
                                <h3 className="text-sm font-semibold">
                                    Active Sessions
                                </h3>
                                <p className="mt-1 text-xs text-muted-foreground">
                                    {sessions.length} session(s) •{' '}
                                    {
                                        sessions.filter((s) => s.isConnected)
                                            .length
                                    }{' '}
                                    connected
                                </p>
                            </div>
                            <ScrollArea className="flex-1">
                                <div className="space-y-2 p-3">
                                    {sessions.map((session) => (
                                        <div
                                            key={session.id}
                                            className={cn(
                                                'cursor-pointer rounded-lg border p-3 transition-colors hover:bg-accent',
                                                activeSessionId ===
                                                    session.id && 'bg-accent',
                                            )}
                                            onClick={() =>
                                                setActiveSession(session.id)
                                            }
                                        >
                                            <div className="flex items-start justify-between">
                                                <div className="flex-1">
                                                    <div className="flex items-center gap-2">
                                                        <Terminal className="h-3 w-3" />
                                                        <span className="text-sm font-medium">
                                                            {session.title}
                                                        </span>
                                                        {session.isConnected && (
                                                            <Activity className="h-3 w-3 text-green-500" />
                                                        )}
                                                    </div>
                                                    <div className="mt-1 text-xs text-muted-foreground">
                                                        {
                                                            session.server
                                                                .ssh_username
                                                        }
                                                        @
                                                        {
                                                            session.server
                                                                .ssh_host
                                                        }
                                                    </div>
                                                </div>
                                                <div className="flex gap-1">
                                                    {session.id !==
                                                        pipSessionId && (
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                setPipSession(
                                                                    session.id,
                                                                );
                                                            }}
                                                            title="Open in Picture-in-Picture"
                                                            className="h-6 w-6"
                                                        >
                                                            <Maximize2 className="h-3 w-3" />
                                                        </Button>
                                                    )}
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            closeSession(
                                                                session.id,
                                                            );
                                                        }}
                                                        className="h-6 w-6 hover:text-destructive"
                                                    >
                                                        <X className="h-3 w-3" />
                                                    </Button>
                                                </div>
                                            </div>

                                            {/* Mini Terminal Preview */}
                                            {session.outputBuffer.length >
                                                0 && (
                                                <div className="mt-2 max-h-20 overflow-hidden rounded bg-black/50 p-2 font-mono text-xs text-green-400">
                                                    {session.outputBuffer
                                                        .slice(-3)
                                                        .map((line, i) => (
                                                            <div
                                                                key={i}
                                                                className="truncate"
                                                            >
                                                                {line}
                                                            </div>
                                                        ))}
                                                </div>
                                            )}

                                            <div className="mt-2 text-xs text-muted-foreground">
                                                Last activity:{' '}
                                                {new Date(
                                                    session.lastActivity,
                                                ).toLocaleTimeString()}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </ScrollArea>

                            {/* Sidebar Footer */}
                            <div className="border-t p-3">
                                <div className="space-y-1 text-xs text-muted-foreground">
                                    <div>⌘1-9: Switch tabs</div>
                                    <div>⌘[/]: Previous/Next tab</div>
                                    <div>⌘\\: Toggle sidebar</div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Terminal Area */}
                    <div className="TerminalArea relative flex flex-1 flex-col">
                        {sessions.length > 0 ? (
                            <>
                                {sessions.map((session) => (
                                    <div
                                        key={session.id}
                                        className={cn(
                                            'SSHTerminal flex-1 overflow-y-auto p-4',
                                            session.id !== activeSessionId &&
                                                'hidden',
                                        )}
                                    >
                                        <SSHTerminal
                                            serverId={session.server.id}
                                            server={session.server}
                                            serverConnected={
                                                session.isConnected
                                            }
                                            setServerConnected={(connected) =>
                                                updateSessionStatus(
                                                    session.id,
                                                    connected,
                                                )
                                            }
                                            onConnectionChange={(connected) =>
                                                updateSessionStatus(
                                                    session.id,
                                                    connected,
                                                )
                                            }
                                        />
                                    </div>
                                ))}
                            </>
                        ) : (
                            <div className="flex flex-1 items-center justify-center text-muted-foreground">
                                <div className="text-center">
                                    <Terminal className="mx-auto mb-4 h-12 w-12" />
                                    <p>No terminal sessions open</p>
                                    <p className="mt-2 text-sm">
                                        Open a terminal from the Servers page
                                    </p>
                                </div>
                            </div>
                        )}

                        {/* Picture-in-Picture */}
                        {pipSession && pipSession.id !== activeSessionId && (
                            <div className="absolute right-4 bottom-4 h-64 w-96 rounded-lg border bg-background shadow-lg">
                                <div className="flex items-center justify-between border-b p-2">
                                    <span className="text-xs font-medium">
                                        PiP: {pipSession.title}
                                    </span>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={() => setPipSession(null)}
                                        className="h-6 w-6"
                                    >
                                        <X className="h-3 w-3" />
                                    </Button>
                                </div>
                                <div className="h-[calc(100%-40px)] p-2">
                                    <SSHTerminal
                                        key={`pip-${pipSession.id}`}
                                        serverId={pipSession.server.id}
                                        server={pipSession.server}
                                        serverConnected={pipSession.isConnected}
                                        setServerConnected={(connected) =>
                                            updateSessionStatus(
                                                pipSession.id,
                                                connected,
                                            )
                                        }
                                        onConnectionChange={(connected) =>
                                            updateSessionStatus(
                                                pipSession.id,
                                                connected,
                                            )
                                        }
                                    />
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </>
    );
}
