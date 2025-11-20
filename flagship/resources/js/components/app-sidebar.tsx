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
    ansiblePlaybooks,
    dashboard,
    deployments,
    playbooks,
    servers,
    sshKeys,
    sshSessions,
    users,
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
    Package,
    Play,
    Rocket,
    Server,
    Settings as SettingsIcon,
    Shield,
    ShieldAlert,
    Terminal,
    Users,
} from 'lucide-react';
import AppLogo from './app-logo';

const getMainNavSections = (
    isAdmin: boolean,
    t: Record<string, string>,
): NavSection[] => {
    const sections: NavSection[] = [
        {
            label: t.overview || 'Overview',
            items: [
                {
                    title: t.dashboard || 'Dashboard',
                    href: dashboard(),
                    icon: LayoutGrid,
                    display: true,
                },
                {
                    title: t.users || 'Users',
                    href: users(),
                    icon: Users,
                    display: isAdmin,
                },
                {
                    title: t.system_settings || 'System Settings',
                    href: '/dashboard/system-settings',
                    icon: SettingsIcon,
                    display: isAdmin,
                },
            ],
        },
        {
            label: t.fleet_management || 'Fleet Management',
            items: [
                {
                    title: t.servers || 'Servers',
                    href: servers(),
                    icon: Server,
                    display: true,
                },
                {
                    title: t.ssh_keys || 'SSH Keys',
                    href: sshKeys(),
                    icon: Key,
                    display: true,
                },
                {
                    title: t.ssh_sessions || 'SSH Sessions',
                    href: sshSessions(),
                    icon: Terminal,
                    display: true,
                },
                {
                    title: t.networks || 'Networks',
                    href: '/dashboard/networks',
                    icon: Network,
                    display: false, // Not implemented yet
                },
            ],
        },
        {
            label: t.monitoring_security || 'Monitoring & Security',
            items: [
                {
                    title: t.metrics || 'Metrics',
                    href: '/dashboard/metrics',
                    icon: LineChart,
                    display: false, // Not implemented yet
                },
                {
                    title: t.alerts || 'Alerts',
                    href: '/dashboard/alerts',
                    icon: AlertTriangle,
                    display: false, // Not implemented yet
                },
                {
                    title: t.uptime || 'Uptime',
                    href: '/dashboard/uptime',
                    icon: Activity,
                    display: false, // Not implemented yet
                },
                {
                    title: t.security_overview || 'Security Overview',
                    href: '/dashboard/security',
                    icon: Shield,
                    display: false, // Not implemented yet
                },
                {
                    title: t.vulnerabilities || 'Vulnerabilities',
                    href: '/dashboard/vulnerabilities',
                    icon: ShieldAlert,
                    display: false, // Not implemented yet
                },
                {
                    title: t.access_control || 'Access Control',
                    href: '/dashboard/access-control',
                    icon: Lock,
                    display: false, // Not implemented yet
                },
            ],
        },
        {
            label: t.one_click_deployments || 'One Click Deployments',
            items: [
                {
                    title: t.ansible_playbooks || 'Ansible Playbooks',
                    href: ansiblePlaybooks(),
                    icon: FileCode,
                    display: true,
                },
                {
                    title: t.community_playbooks || 'Community Playbooks',
                    href: playbooks(),
                    icon: Package,
                    display: isAdmin,
                },
                {
                    title: t.deployments || 'Deployments',
                    href: deployments(),
                    icon: Rocket,
                    display: isAdmin,
                },
                {
                    title: t.scheduled_tasks || 'Scheduled Tasks',
                    href: '/dashboard/scheduled-tasks',
                    icon: Calendar,
                    display: false, // Not implemented yet
                },
                {
                    title: t.run_commands || 'Run Commands',
                    href: '/dashboard/run-commands',
                    icon: Play,
                    display: false, // Not implemented yet
                },
            ],
        },
    ];

    return sections;
};

const getFooterNavItems = (t: Record<string, string>): NavItem[] => [
    {
        title: t.repository || 'Repository',
        href: 'https://github.com/node-pulse/admiral',
        icon: Folder,
        display: true,
    },
    {
        title: t.documentation || 'Documentation',
        href: 'https://docs.nodepulse.sh',
        icon: BookOpen,
        display: true,
    },
];

export function AppSidebar() {
    const { auth, nav } = usePage().props as any;
    const isAdmin = auth?.user?.role === 'admin';
    const t = nav || {};

    const mainNavSections = getMainNavSections(isAdmin, t);
    const footerNavItems = getFooterNavItems(t);

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
