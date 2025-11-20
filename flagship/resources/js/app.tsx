import '../css/app.css';

import { createInertiaApp, router } from '@inertiajs/react';
import { resolvePageComponent } from 'laravel-vite-plugin/inertia-helpers';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Toaster } from 'sonner';
import { initializeTheme } from './hooks/use-appearance';
import { initializeLocale } from './lib/i18n';

const appName = import.meta.env.VITE_APP_NAME || 'Laravel';

const syncCsrfTokenFromCookie = () => {
    const match = document.cookie.match(/XSRF-TOKEN=([^;]+)/);
    if (!match) return;

    const token = decodeURIComponent(match[1]);
    const meta = document.querySelector<HTMLMetaElement>(
        'meta[name="csrf-token"]',
    );

    if (meta && meta.content !== token) {
        meta.content = token;
    }
};

router.on('finish', syncCsrfTokenFromCookie);
syncCsrfTokenFromCookie();

createInertiaApp({
    title: (title) => (title ? `${title} - ${appName}` : appName),
    resolve: (name) =>
        resolvePageComponent(
            `./pages/${name}.tsx`,
            import.meta.glob('./pages/**/*.tsx'),
        ),
    setup({ el, App, props }) {
        const root = createRoot(el);

        // Initialize locale for client-side formatting
        const locale = (props.initialPage.props as any).locale || 'en';
        initializeLocale(locale);

        root.render(
            <StrictMode>
                <App {...props} />
                <Toaster richColors position="top-center" />
            </StrictMode>,
        );
    },
    progress: {
        color: '#4B5563',
    },
});

// This will set light / dark mode on load...
initializeTheme();
