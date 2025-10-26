import { NavFooter } from '@/components/nav-footer';
import { NavMain } from '@/components/nav-main';
import { NavUser } from '@/components/nav-user';
import {
    Sidebar,
    SidebarContent,
    SidebarFooter,
    SidebarHeader,
    SidebarMenu,
    SidebarMenuButton,
    SidebarMenuItem,
} from '@/components/ui/sidebar';
import { dashboard, sshKeys, servers, sshSessions } from '@/routes';
import { type NavItem } from '@/types';
import { Link, usePage } from '@inertiajs/react';
import { BookOpen, Folder, Key, LayoutGrid, Server, Settings as SettingsIcon, Terminal } from 'lucide-react';
import AppLogo from './app-logo';

const getMainNavItems = (isAdmin: boolean): NavItem[] => {
    const items: NavItem[] = [
        {
            title: 'Dashboard',
            href: dashboard(),
            icon: LayoutGrid,
        },
        {
            title: 'Servers',
            href: servers(),
            icon: Server,
        },
        {
            title: 'SSH Keys',
            href: sshKeys(),
            icon: Key,
        },
        {
            title: 'SSH Sessions',
            href: sshSessions(),
            icon: Terminal,
        },
    ];

    // Add Settings link for admin users only
    if (isAdmin) {
        items.push({
            title: 'Settings',
            href: '/dashboard/settings',
            icon: SettingsIcon,
        });
    }

    return items;
};

const footerNavItems: NavItem[] = [
    {
        title: 'Repository',
        href: 'https://github.com/node-pulse/admiral',
        icon: Folder,
    },
    {
        title: 'Documentation',
        href: 'https://docs.nodepulse.sh',
        icon: BookOpen,
    },
];

export function AppSidebar() {
    const { auth } = usePage().props as any;
    const isAdmin = auth?.user?.role === 'admin';
    const mainNavItems = getMainNavItems(isAdmin);

    return (
        <Sidebar collapsible="icon" variant="inset">
            <SidebarHeader>
                <SidebarMenu>
                    <SidebarMenuItem>
                        <SidebarMenuButton size="lg" asChild>
                            <Link href={dashboard()} prefetch>
                                <AppLogo />
                            </Link>
                        </SidebarMenuButton>
                    </SidebarMenuItem>
                </SidebarMenu>
            </SidebarHeader>

            <SidebarContent>
                <NavMain items={mainNavItems} />
            </SidebarContent>

            <SidebarFooter>
                <NavFooter items={footerNavItems} className="mt-auto" />
                <NavUser />
            </SidebarFooter>
        </Sidebar>
    );
}
