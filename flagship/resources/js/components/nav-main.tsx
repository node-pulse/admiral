import {
    SidebarGroup,
    SidebarGroupLabel,
    SidebarMenu,
    SidebarMenuButton,
    SidebarMenuItem,
} from '@/components/ui/sidebar';
import { resolveUrl } from '@/lib/utils';
import { type NavSection } from '@/types';
import { type InertiaLinkProps, Link, usePage } from '@inertiajs/react';

export function NavMain({ sections = [] }: { sections: NavSection[] }) {
    const page = usePage();

    const isActive = (href: NonNullable<InertiaLinkProps['href']>) => {
        const resolvedUrl = resolveUrl(href);
        const currentUrl = page.url;

        // Exact match for root dashboard
        if (resolvedUrl === '/dashboard') {
            return currentUrl === '/dashboard';
        }

        // For other routes, use startsWith
        return currentUrl.startsWith(resolvedUrl);
    };

    return (
        <>
            {sections
                .filter((section) => section.items.some((item) => item.display))
                .map((section) => (
                    <SidebarGroup key={section.label} className="px-2 py-0">
                        <SidebarGroupLabel>{section.label}</SidebarGroupLabel>
                        <SidebarMenu>
                            {section.items
                                .filter((item) => item.display)
                                .map((item) => (
                                    <SidebarMenuItem key={item.title}>
                                        <SidebarMenuButton
                                            asChild
                                            isActive={isActive(item.href)}
                                            tooltip={{ children: item.title }}
                                        >
                                            <Link href={item.href} prefetch>
                                                {item.icon && <item.icon />}
                                                <span>{item.title}</span>
                                            </Link>
                                        </SidebarMenuButton>
                                    </SidebarMenuItem>
                                ))}
                        </SidebarMenu>
                    </SidebarGroup>
                ))}
        </>
    );
}
