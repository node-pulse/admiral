import { usePage, router } from '@inertiajs/react';
import { Globe } from 'lucide-react';
import { useState } from 'react';
import { Button } from './ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from './ui/dropdown-menu';

interface Locale {
    code: string;
    name: string;
    native: string;
}

const LOCALES: Locale[] = [
    { code: 'en', name: 'English', native: 'English' },
    { code: 'zh_CN', name: 'Chinese (Simplified)', native: '简体中文' },
];

export function LanguageSwitcher() {
    const page = usePage();
    const locale = (page.props.locale as string) || 'en';
    const [isChanging, setIsChanging] = useState(false);

    const handleLocaleChange = async (newLocale: string) => {
        if (newLocale === locale || isChanging) return;

        setIsChanging(true);

        try {
            // Call API to update locale
            const response = await fetch('/api/locale/update', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRF-TOKEN': document.querySelector<HTMLMetaElement>(
                        'meta[name="csrf-token"]',
                    )?.content || '',
                },
                body: JSON.stringify({ locale: newLocale }),
            });

            if (response.ok) {
                // Reload page to apply new locale
                router.reload();
            }
        } catch (error) {
            console.error('Failed to change locale:', error);
            setIsChanging(false);
        }
    };

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" disabled={isChanging}>
                    <Globe className="h-[1.2rem] w-[1.2rem]" />
                    <span className="sr-only">Change language</span>
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
                {LOCALES.map((loc) => (
                    <DropdownMenuItem
                        key={loc.code}
                        onClick={() => handleLocaleChange(loc.code)}
                        className={
                            loc.code === locale
                                ? 'bg-accent font-medium'
                                : ''
                        }
                    >
                        <span className="mr-2">{loc.native}</span>
                        {loc.code === locale && (
                            <span className="ml-auto text-xs">✓</span>
                        )}
                    </DropdownMenuItem>
                ))}
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
