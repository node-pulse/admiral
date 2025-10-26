import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import { ServerData } from '../types/servers';

export interface TerminalSession {
    id: string;
    server: ServerData;
    isConnected: boolean;
    isActive: boolean;
    lastActivity: Date;
    outputBuffer: string[]; // Last 10 lines for mini preview
    title: string;
}

interface TerminalWorkspaceContextType {
    sessions: TerminalSession[];
    activeSessionId: string | null;
    sidebarOpen: boolean;
    pipSessionId: string | null; // Picture-in-Picture session

    // Session management
    openSession: (server: ServerData) => string;
    closeSession: (sessionId: string) => void;
    setActiveSession: (sessionId: string) => void;
    updateSessionStatus: (sessionId: string, isConnected: boolean) => void;
    updateSessionOutput: (sessionId: string, output: string) => void;

    // UI controls
    toggleSidebar: () => void;
    setPipSession: (sessionId: string | null) => void;

    // Navigation
    nextSession: () => void;
    previousSession: () => void;
    switchToSession: (index: number) => void;
}

const TerminalWorkspaceContext = createContext<TerminalWorkspaceContextType | undefined>(undefined);

export function TerminalWorkspaceProvider({ children }: { children: React.ReactNode }) {
    const [sessions, setSessions] = useState<TerminalSession[]>([]);
    const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
    const [sidebarOpen, setSidebarOpen] = useState(true);
    const [pipSessionId, setPipSessionId] = useState<string | null>(null);
    const sessionIdCounter = useRef(0);

    const openSession = useCallback((server: ServerData) => {
        // Check if session already exists for this server
        const existingSession = sessions.find(s => s.server.id === server.id);
        if (existingSession) {
            setActiveSessionId(existingSession.id);
            return existingSession.id;
        }

        const sessionId = `session-${++sessionIdCounter.current}`;
        const newSession: TerminalSession = {
            id: sessionId,
            server,
            isConnected: false,
            isActive: true,
            lastActivity: new Date(),
            outputBuffer: [],
            title: server.display_name || server.hostname || 'Terminal'
        };

        setSessions(prev => [...prev, newSession]);
        setActiveSessionId(sessionId);
        return sessionId;
    }, [sessions]);

    const closeSession = useCallback((sessionId: string) => {
        setSessions(prev => {
            const filtered = prev.filter(s => s.id !== sessionId);

            // If closing active session, switch to another
            if (activeSessionId === sessionId && filtered.length > 0) {
                setActiveSessionId(filtered[filtered.length - 1].id);
            } else if (filtered.length === 0) {
                setActiveSessionId(null);
            }

            // Clear PiP if it was this session
            if (pipSessionId === sessionId) {
                setPipSessionId(null);
            }

            return filtered;
        });
    }, [activeSessionId, pipSessionId]);

    const updateSessionStatus = useCallback((sessionId: string, isConnected: boolean) => {
        setSessions(prev => prev.map(s =>
            s.id === sessionId
                ? { ...s, isConnected, lastActivity: new Date() }
                : s
        ));
    }, []);

    const updateSessionOutput = useCallback((sessionId: string, output: string) => {
        setSessions(prev => prev.map(s => {
            if (s.id !== sessionId) return s;

            // Keep last 10 lines for preview
            const lines = output.split('\n').filter(line => line.trim());
            const newBuffer = [...s.outputBuffer, ...lines].slice(-10);

            return {
                ...s,
                outputBuffer: newBuffer,
                lastActivity: new Date()
            };
        }));
    }, []);

    const toggleSidebar = useCallback(() => {
        setSidebarOpen(prev => !prev);
    }, []);

    const nextSession = useCallback(() => {
        if (sessions.length <= 1) return;

        const currentIndex = sessions.findIndex(s => s.id === activeSessionId);
        const nextIndex = (currentIndex + 1) % sessions.length;
        setActiveSessionId(sessions[nextIndex].id);
    }, [sessions, activeSessionId]);

    const previousSession = useCallback(() => {
        if (sessions.length <= 1) return;

        const currentIndex = sessions.findIndex(s => s.id === activeSessionId);
        const prevIndex = currentIndex === 0 ? sessions.length - 1 : currentIndex - 1;
        setActiveSessionId(sessions[prevIndex].id);
    }, [sessions, activeSessionId]);

    const switchToSession = useCallback((index: number) => {
        if (index >= 0 && index < sessions.length) {
            setActiveSessionId(sessions[index].id);
        }
    }, [sessions]);

    const value: TerminalWorkspaceContextType = {
        sessions,
        activeSessionId,
        sidebarOpen,
        pipSessionId,
        openSession,
        closeSession,
        setActiveSession: setActiveSessionId,
        updateSessionStatus,
        updateSessionOutput,
        toggleSidebar,
        setPipSession: setPipSessionId,
        nextSession,
        previousSession,
        switchToSession
    };

    return (
        <TerminalWorkspaceContext.Provider value={value}>
            {children}
        </TerminalWorkspaceContext.Provider>
    );
}

export function useTerminalWorkspace() {
    const context = useContext(TerminalWorkspaceContext);
    if (!context) {
        throw new Error('useTerminalWorkspace must be used within TerminalWorkspaceProvider');
    }
    return context;
}