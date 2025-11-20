import { usePage } from '@inertiajs/react';
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
    const currentlocaleCode = (page.props.locale as string) || 'en';
    const currentLocale = LOCALES.find((loc) => loc.code === currentlocaleCode);
    const [isChanging, setIsChanging] = useState(false);
    const csrfToken =
        (page.props as any).csrf_token ||
        document.querySelector<HTMLMetaElement>('meta[name="csrf-token"]')
            ?.content ||
        '';

    const handleLocaleChange = async (newLocale: string) => {
        if (newLocale === currentlocaleCode || isChanging) return;
        setIsChanging(true);

        try {
            // Call API to update locale
            const response = await fetch('/api/locale/update', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRF-TOKEN': csrfToken,
                    Accept: 'application/json',
                },
                body: JSON.stringify({ locale: newLocale }),
            });

            const data = await response.json();

            if (response.ok && data.success) {
                // Force full page reload to apply new locale
                window.location.reload();
            } else {
                setIsChanging(false);
            }
        } catch (error) {
            console.error('Failed to change locale:', error);
            setIsChanging(false);
        }
    };

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button
                    variant="ghost"
                    className="w-full justify-start gap-2 !p-2"
                    disabled={isChanging}
                >
                    <Globe className="h-[1.2rem] w-[1.2rem]" />
                    <span>{currentLocale?.native || 'English'}</span>
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
                {LOCALES.map((loc) => (
                    <DropdownMenuItem
                        key={loc.code}
                        onClick={() => handleLocaleChange(loc.code)}
                        className={
                            loc.code === currentlocaleCode
                                ? 'bg-accent font-medium'
                                : ''
                        }
                    >
                        <span className="mr-2">{loc.native}</span>
                        {loc.code === currentlocaleCode && (
                            <span className="ml-auto text-xs">✓</span>
                        )}
                    </DropdownMenuItem>
                ))}
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
