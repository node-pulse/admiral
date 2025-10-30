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
import {
    dashboard,
    deployments,
    servers,
    sshKeys,
    sshSessions,
} from '@/routes';
import { type NavItem, type NavSection } from '@/types';
import { Link, usePage } from '@inertiajs/react';
import {
    Activity,
    AlertTriangle,
    BookOpen,
    Calendar,
    FileCode,
    Folder,
    Key,
    LayoutGrid,
    LineChart,
    Lock,
    Network,
    Play,
    Rocket,
    Server,
    Settings as SettingsIcon,
    Shield,
    ShieldAlert,
    Terminal,
} from 'lucide-react';
import AppLogo from './app-logo';

const getMainNavSections = (isAdmin: boolean): NavSection[] => {
    const sections: NavSection[] = [
        {
            label: 'Overview',
            items: [
                {
                    title: 'Dashboard',
                    href: dashboard(),
                    icon: LayoutGrid,
                    display: true,
                },
                {
                    title: 'System Settings',
                    href: '/dashboard/system-settings',
                    icon: SettingsIcon,
                    display: isAdmin,
                },
            ],
        },
        {
            label: 'Fleet Management',
            items: [
                {
                    title: 'Servers',
                    href: servers(),
                    icon: Server,
                    display: true,
                },
                {
                    title: 'SSH Keys',
                    href: sshKeys(),
                    icon: Key,
                    display: true,
                },
                {
                    title: 'SSH Sessions',
                    href: sshSessions(),
                    icon: Terminal,
                    display: true,
                },
                {
                    title: 'Networks',
                    href: '/dashboard/networks',
                    icon: Network,
                    display: false, // Not implemented yet
                },
            ],
        },
        {
            label: 'Monitoring & Security',
            items: [
                {
                    title: 'Metrics',
                    href: '/dashboard/metrics',
                    icon: LineChart,
                    display: false, // Not implemented yet
                },
                {
                    title: 'Alerts',
                    href: '/dashboard/alerts',
                    icon: AlertTriangle,
                    display: false, // Not implemented yet
                },
                {
                    title: 'Uptime',
                    href: '/dashboard/uptime',
                    icon: Activity,
                    display: false, // Not implemented yet
                },
                {
                    title: 'Security Overview',
                    href: '/dashboard/security',
                    icon: Shield,
                    display: false, // Not implemented yet
                },
                {
                    title: 'Vulnerabilities',
                    href: '/dashboard/vulnerabilities',
                    icon: ShieldAlert,
                    display: false, // Not implemented yet
                },
                {
                    title: 'Access Control',
                    href: '/dashboard/access-control',
                    icon: Lock,
                    display: false, // Not implemented yet
                },
            ],
        },
        {
            label: 'Fleet Operations',
            items: [
                {
                    title: 'Ansible Playbooks',
                    href: '/dashboard/ansible-playbooks',
                    icon: FileCode,
                    display: false, // Not implemented yet
                },
                {
                    title: 'Deployments',
                    href: deployments(),
                    icon: Rocket,
                    display: isAdmin,
                },
                {
                    title: 'Scheduled Tasks',
                    href: '/dashboard/scheduled-tasks',
                    icon: Calendar,
                    display: false, // Not implemented yet
                },
                {
                    title: 'Run Commands',
                    href: '/dashboard/run-commands',
                    icon: Play,
                    display: false, // Not implemented yet
                },
            ],
        },
    ];

    return sections;
};

const footerNavItems: NavItem[] = [
    {
        title: 'Repository',
        href: 'https://github.com/node-pulse/admiral',
        icon: Folder,
        display: true,
    },
    {
        title: 'Documentation',
        href: 'https://docs.nodepulse.sh',
        icon: BookOpen,
        display: true,
    },
];

export function AppSidebar() {
    const { auth } = usePage().props as any;
    const isAdmin = auth?.user?.role === 'admin';
    const mainNavSections = getMainNavSections(isAdmin);

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
                <NavMain sections={mainNavSections} />
            </SidebarContent>

            <SidebarFooter>
                <NavFooter items={footerNavItems} className="mt-auto" />
                <NavUser />
            </SidebarFooter>
        </Sidebar>
    );
}
