import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { Maximize2, Minimize2, Terminal, XIcon } from 'lucide-react';
import * as React from 'react';
import { ServerData } from '../../types/servers';
import { SSHTerminal } from './ssh-terminal';

interface SSHTerminalDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    server: ServerData | null;
    serverConnected: boolean;
    setServerConnected: (connected: boolean) => void;
}

export function SSHTerminalDialog({
    open,
    onOpenChange,
    server,
    serverConnected,
    setServerConnected,
}: SSHTerminalDialogProps) {
    const [isMinimized, setIsMinimized] = React.useState(false);
    const [wasConnected, setWasConnected] = React.useState(false);
    const isRestoringRef = React.useRef(false);

    // Track connection state to preserve it when minimizing
    React.useEffect(() => {
        if (serverConnected && !wasConnected) {
            setWasConnected(true);
        }
    }, [serverConnected, wasConnected]);

    // Handle custom close that confirms if connection is active
    const handleClose = React.useCallback(() => {
        if (serverConnected) {
            const shouldClose = window.confirm(
                'Are you sure you want to close the terminal? This will disconnect your SSH session.',
            );
            if (!shouldClose) {
                return;
            }
            setWasConnected(false);
        }
        setIsMinimized(false);
        onOpenChange(false);
    }, [serverConnected, onOpenChange]);

    // Toggle minimize/maximize
    const toggleMinimize = React.useCallback(() => {
        setIsMinimized((prev) => !prev);
    }, []);

    // Prevent ESC key from closing the dialog
    const handleEscapeKeyDown = React.useCallback((e: KeyboardEvent) => {
        e.preventDefault();
    }, []);

    if (!server) return null;

    return (
        <>
            {/* Main Dialog - Always open when terminal is active, but visually hidden when minimized */}
            <DialogPrimitive.Root
                open={open}
                onOpenChange={(newOpen) => {
                    // Prevent closing if we're just restoring from minimized
                    if (isRestoringRef.current) {
                        isRestoringRef.current = false;
                        return;
                    }
                    // Only allow closing through our custom close handler
                    if (!newOpen) {
                        handleClose();
                    } else {
                        onOpenChange(newOpen);
                    }
                }}
            >
                <DialogPrimitive.Portal>
                    <DialogPrimitive.Overlay
                        className={cn(
                            'fixed inset-0 z-50 bg-black/80 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0',
                            isMinimized && 'invisible pointer-events-none',
                        )}
                        // Prevent closing on overlay click when connected
                        onClick={(e) => {
                            if (serverConnected) {
                                e.preventDefault();
                                e.stopPropagation();
                            }
                        }}
                    />
                    <DialogPrimitive.Content
                        className={cn(
                            'fixed top-[50%] left-[50%] z-50 grid w-[90vw] max-w-[1400px] translate-x-[-50%] translate-y-[-50%] gap-4 rounded-lg border bg-background p-6 shadow-lg duration-200',
                            'data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95',
                            'flex max-h-[90vh] flex-col',
                            isMinimized && 'invisible pointer-events-none',
                        )}
                        onEscapeKeyDown={handleEscapeKeyDown}
                        onPointerDownOutside={(e) => {
                            // Prevent closing on click outside when connected
                            if (serverConnected) {
                                e.preventDefault();
                            }
                        }}
                        onInteractOutside={(e) => {
                            // Prevent any interaction outside from closing when connected
                            if (serverConnected) {
                                e.preventDefault();
                            }
                        }}
                    >
                        {/* Header */}
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <Terminal className="h-5 w-5" />
                                <h2 className="text-lg font-semibold">
                                    SSH Terminal - {server.display_name}
                                </h2>
                            </div>
                            <div className="flex items-center gap-2">
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8"
                                    onClick={toggleMinimize}
                                    title="Minimize terminal (keeps connection alive)"
                                >
                                    <Minimize2 className="h-4 w-4" />
                                </Button>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8"
                                    onClick={handleClose}
                                    title={
                                        serverConnected
                                            ? 'Close terminal (will disconnect SSH)'
                                            : 'Close terminal'
                                    }
                                >
                                    <XIcon className="h-4 w-4" />
                                </Button>
                            </div>
                        </div>

                        {/* Terminal Content */}
                        <div className="flex-1 overflow-hidden">
                            <SSHTerminal
                                serverId={server.id}
                                server={server}
                                serverConnected={serverConnected}
                                setServerConnected={setServerConnected}
                                onConnectionChange={(connected) => {
                                    console.log(
                                        'Connection status:',
                                        connected,
                                    );
                                }}
                            />
                        </div>

                        {/* Footer with tips */}
                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                            <div className="flex items-center gap-4">
                                <span>
                                    ESC key is passed to terminal (for vim/nano)
                                </span>
                                <span>•</span>
                                <span>
                                    Use minimize button to keep connection alive
                                </span>
                            </div>
                            {serverConnected && (
                                <span className="text-green-600">
                                    Connection active
                                </span>
                            )}
                        </div>
                    </DialogPrimitive.Content>
                </DialogPrimitive.Portal>
            </DialogPrimitive.Root>

            {/* Minimized State - Floating Button in top-right corner */}
            {open && (
                <div
                    className={cn(
                        'fixed top-4 right-4 z-50 transition-opacity duration-200',
                        isMinimized
                            ? 'pointer-events-auto opacity-100'
                            : 'pointer-events-none opacity-0',
                    )}
                >
                    <div className="relative">
                        {serverConnected && (
                            <span className="absolute -top-1 -right-1 z-10 h-3 w-3">
                                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75"></span>
                                <span className="relative inline-flex h-3 w-3 rounded-full bg-green-500"></span>
                            </span>
                        )}
                        <Button
                            onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                isRestoringRef.current = true;
                                setIsMinimized(false);
                            }}
                            className="bg-background shadow-lg hover:bg-accent"
                            size="lg"
                            variant="outline"
                            title={`Restore SSH Terminal - ${server.display_name}`}
                        >
                            <Terminal className="mr-2 h-5 w-5" />
                            <span className="mr-2">
                                SSH: {server.display_name}
                            </span>
                            <Maximize2 className="h-4 w-4" />
                        </Button>
                    </div>
                    <div className="mt-2 pr-2 text-right text-xs text-muted-foreground">
                        {serverConnected
                            ? 'Connection active'
                            : 'Click to restore'}
                    </div>
                </div>
            )}
        </>
    );
}
